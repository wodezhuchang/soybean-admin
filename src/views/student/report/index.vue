<script setup lang="ts">
/**
 * 学生端 · 试讲报告页（接真实 AgentReport 字段）
 * 数据源当前为 mock（./mock.ts）；接入后端后替换为：
 *   const res = await fetch(`/proxy-default/api/try/${tryId}`); report = await res.json();
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import EvidenceTimeline from '@/components/EvidenceTimeline/index.vue';
import PipelineFlow, { type PipelineStage } from '@/components/PipelineFlow/index.vue';
import ChatPanel, { type ChatMessage } from '@/components/ChatPanel/index.vue';
import { feedbackToMarkers, type TimelineMarker } from '@/components/EvidenceTimeline/timeline';
import type { ReviewStatus } from '@/shared/types/agent';
import { useAuthStore } from '@/store/modules/auth';

const route = useRoute();
const authStore = useAuthStore();
/** 本次试讲：从路由 query 取 try_id；无参时自动加载最近一次 */
const tryId = ref((route.query.try_id as string) || '');

const report = ref<any>({});
const videoUrl = ref('');
const radarRef = ref<HTMLDivElement | null>(null);
const expertRef = ref<HTMLElement | null>(null);
const highlighted = ref(false);

/** 试讲状态（决定顶部标签 / PipelineFlow 着色 / 是否展示专家复核意见） */
const reviewStatus = ref<ReviewStatus>('ai_reviewed');
const autoPass = ref(false);

/** 专家复核意见 */
const expertOpinions = ref<any[]>([]);

/** 分段评语 → 时间轴标记 */
const markers = computed<TimelineMarker[]>(() =>
  feedbackToMarkers(report.value.timeline_feedback),
);

function statusTag(): { text: string; kind: 'info' | 'success' | 'warning' } {
  switch (reviewStatus.value) {
    case 'uploaded': return { text: '已上传', kind: 'info' };
    case 'ai_reviewing': return { text: 'AI 初评中', kind: 'warning' };
    case 'ai_reviewed': return autoPass.value
      ? { text: 'AI初评·已自动通过', kind: 'success' }
      : { text: 'AI初评·待专家复核', kind: 'warning' };
    case 'expert_reviewed': return { text: '专家已复核', kind: 'success' };
    case 'knowledge_recycled': return { text: '已回流知识库', kind: 'success' };
    default: return { text: reviewStatus.value, kind: 'info' };
  }
}

const chatMsgs = ref<ChatMessage[]>([
  { id: 'r0', role: 'assistant', content: '看完报告了吗？可以针对短板先做 2–3 次微课练习，练完上传新视频我继续对比。' },
]);
const suggs = ['怎么改进导入环节的话术？', '重难点停顿怎么练？', '解释一下这个成长曲线'];
let chatSessionId = '';
async function realChat(_h: ChatMessage[], onDelta: (t: string) => void, signal: AbortSignal): Promise<void> {
  const lastUserMsg = [..._h].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;
  try {
    const res = await fetch('/proxy-default/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: useAuthStore().userInfo?.userId || 'demo_user', message: lastUserMsg.content, session_id: chatSessionId || undefined }),
    });
    const r = await res.json();
    if (chatSessionId) chatSessionId = r.session_id || chatSessionId;
    const text = r.reply || '（暂时无法回答）';
    for (let i = 0; i < text.length; i += 3) {
      if (signal.aborted) return;
      onDelta(text.slice(i, i + 3));
      await new Promise(r2 => setTimeout(r2, 15));
    }
  } catch {
    onDelta('（网络异常，稍后再试）');
  }
}

/** 四维度展示（雷达/统计） */
const dimensionViews = computed(() => {
  const s = report.value.scores || {};
  const g = (k: string) => s[k] || { total: 0, weight: 0 };
  return [
    { id: 'D1', name: '教学设计合理性', weight: g('D1_teaching_design').weight, total: g('D1_teaching_design').total },
    { id: 'D2', name: '讲授语言表达', weight: g('D2_language').weight, total: g('D2_language').total },
    { id: 'D3', name: '课堂板书规范', weight: g('D3_blackboard').weight, total: g('D3_blackboard').total },
    { id: 'D4', name: '教姿教态', weight: g('D4_presence').weight, total: g('D4_presence').total },
  ];
});

/** 等级参考 */
function gradeLabel(p: number): string {
  if (p >= 90) return '优秀';
  if (p >= 80) return '良好';
  if (p >= 70) return '中等';
  if (p >= 60) return '及格';
  return '待改进';
}

const trendText: Record<string, string> = {
  improved: '较上次进步', declined: '较上次退步', flat: '与上次持平', first_try: '首次试讲',
};

/** 流水线各节点详情（点击节点显示） */
const nodeDetails = computed(() => {
  const r = report.value;
  const s = r.scores || {};
  const g = (k: string) => s[k]?.total ?? 0;
  const er = r.expert_review;
  const tp = r.training_plan;
  return {
    upload: {
      title: '上传视频',
      summary: `${r.meta?.subject || ''} · ${r.meta?.lesson || ''}，时长 ${Math.round((r.meta?.duration_seconds || 0) / 60)} 分钟`,
      metrics: [
        { label: '试讲ID', value: r.meta?.try_id || '' },
        { label: '上传时间', value: (r.meta?.recorded_at || '').slice(0, 16) },
      ],
    },
    collect: {
      title: '多模态采集',
      summary: 'ASR语音识别 + OCR板书识别 + 姿态检测 + 时间轴分段',
      metrics: [
        { label: '时间轴分段', value: `${(r.timeline_feedback || []).length} 段` },
        { label: '短板项', value: `${(r.weaknesses || []).length} 条` },
      ],
    },
    ai_review: {
      title: '机器初评',
      summary: `综合得分 ${s.overall_percent || 0}/100，四维度自动评分完成`,
      metrics: [
        { label: 'D1教学设计', value: g('D1_teaching_design').toFixed(1) },
        { label: 'D2语言表达', value: g('D2_language').toFixed(1) },
        { label: 'D3板书规范', value: g('D3_blackboard').toFixed(1) },
        { label: 'D4教姿教态', value: g('D4_presence').toFixed(1) },
      ],
    },
    expert_review: er ? {
      title: '专家复核',
      summary: er.comments || '专家已完成复核',
      metrics: [
        { label: '复核时间', value: (er.reviewed_at || '').slice(0, 16) },
        { label: '分歧维度', value: (er.diverged_dims || []).join(', ') || '无' },
      ],
    } : {
      title: '专家复核',
      summary: r.triage?.route === 'C' ? '触发硬规则，已送专家复核' : '等待专家复核…',
      metrics: r.triage ? [{ label: '分流原因', value: r.triage.reason || '' }] : [],
    },
    recycle: {
      title: '知识库回流',
      summary: er ? '专家复评完成后，差异较大课例已脱敏回流向量库' : '待专家复评后触发',
    },
    training: tp ? {
      title: '训练建议生成',
      summary: tp.next_focus || '已生成针对性训练计划',
      metrics: [
        { label: '建议重复练习', value: `${tp.estimated_repeat_times || 1} 次` },
      ],
    } : {
      title: '训练建议生成',
      summary: '完成专家复评后生成',
    },
  };
});

/** 雷达图（四维度，0–5 制） */
function renderRadar() {
  if (!radarRef.value || !report.value.scores) return;
  const s = report.value.scores;
  const g = (k: string) => s[k]?.total ?? 0;
  const chart = echarts.init(radarRef.value);
  chart.setOption({
    title: { text: '四维度评价雷达', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: {},
    radar: {
      indicator: dimensionViews.value.map(d => ({
        name: `${d.id} ${d.name}(${Math.round(d.weight * 100)}%)`,
        max: 5,
      })),
      radius: '62%',
    },
    series: [{
      type: 'radar',
      data: [{
        value: [
          g('D1_teaching_design'), g('D2_language'),
          g('D3_blackboard'), g('D4_presence'),
        ],
        name: '本次',
        areaStyle: { opacity: 0.2 },
        label: { show: true, formatter: (p: any) => p.value },
      }],
    }],
  });
}

/** 从真实后端加载报告 */
const loadError = ref(false);
const returnedMsg = ref('');
async function loadReport() {
  // 无 try_id 时自动取最近一次历史
  if (!tryId.value) {
    try {
      const uid = authStore.userInfo.userId || 'demo_user';
      const h = await (await fetch(`/proxy-default/api/users/${uid}/history?limit=1`)).json();
      const latest = h?.trials?.[0];
      if (latest?.try_id) tryId.value = latest.try_id;
    } catch { /* ignore */ }
  }
  if (!tryId.value) { loadError.value = true; return; }
  try {
    const res = await fetch(`/proxy-default/api/try/${tryId.value}`);
    if (!res.ok) { loadError.value = true; return; }
    const data = await res.json();
    if (!data || !data.scores) { loadError.value = true; return; }
    report.value = data;
    loadError.value = false;
    // 视频路径：后端返回的本地文件路径，通过后端静态服务访问
    const vp = data.meta?.video_path;
    if (vp) {
      videoUrl.value = vp.startsWith('http') ? vp : `/proxy-default/${vp.replace(/^\/+/, '')}`;
    }
    // 专家复核意见：从后端 expert_review 字段映射
    if (data.expert_review) {
      const er = data.expert_review;
      const adj: Record<string, number> = {};
      if (er.final_scores) {
        for (const [k, v] of Object.entries(er.final_scores)) {
          if (typeof v === 'object' && v !== null && 'total' in v) adj[k] = Number((v as any).total);
        }
      }
      expertOpinions.value = [{
        opinion_id: er.reviewed_at || 'er1',
        expert_name: er.expert_id === 'teacher_1' ? '李老师' : er.expert_id || '专家',
        expert_time: er.reviewed_at || '',
        diverged_dims: er.diverged_dims || [],
        comment: er.comments || '',
        adjusted_scores: adj,
      }];
    } else {
      expertOpinions.value = [];
    }
    const rs = data.review_status;
    if (rs === 'returned') {
      returnedMsg.value = '该试讲已被教师退回，请核对科目、课题和发送对象后重新上传。';
    } else if (rs === 'auto_pass') { reviewStatus.value = 'ai_reviewed'; autoPass.value = true; }
    else if (rs === 'expert_reviewed') { reviewStatus.value = 'expert_reviewed'; autoPass.value = false; }
    else { reviewStatus.value = 'ai_reviewed'; autoPass.value = false; }
  } catch { loadError.value = true; }
}

onMounted(async () => {
  await loadReport();
  await nextTick();
  renderRadar();
  // 从消息铃铛跳转而来：定位到"专家复核意见"区块
  if (route.query.focus === 'expert') {
    await nextTick();
    expertRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    highlighted.value = true;
  }
});
</script>

<template>
  <div style="max-width: 980px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <!-- 加载失败提示 -->
    <n-card v-if="loadError" style="text-align: center; padding: 40px">
      <div style="font-size: 16px; color: var(--n-text-color-disabled)">该试讲报告不存在或后端暂不可用</div>
      <div style="font-size: 13px; color: var(--n-text-color-disabled); margin-top: 8px">try_id: {{ tryId }}</div>
    </n-card>
    <template v-else>
    <!-- 退回警告横幅 -->
    <n-alert v-if="returnedMsg" type="warning" :show-icon="true" class="mb-3">
      {{ returnedMsg }}
    </n-alert>
    <!-- 元信息 + 免责 -->
    <n-card class="mb-3">
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap">
        <h2 style="color: var(--n-text-color); margin: 0">{{ report.meta?.subject }} · {{ report.meta?.lesson }}</h2>
        <n-tag size="small" type="info">{{ report.meta?.lesson_type }}</n-tag>
        <n-tag size="small">{{ report.meta?.grade_level }}</n-tag>
        <n-tag size="small" :type="statusTag().kind">{{ statusTag().text }}</n-tag>
        <n-tag v-if="report.triage?.duration_tier" size="small" color="#e8eaf6" style="color:#3f51b5">
          {{ report.triage.duration_tier }}
        </n-tag>
        <span class="text-gray-500" style="font-size: 12px">
          {{ report.meta?.recorded_at }} · 时长 {{ Math.round((report.meta?.duration_seconds || 0) / 60) }} 分钟 · 试讲 {{ report.meta?.try_id }}
        </span>
      </div>
      <div v-if="report.disclaimer" class="mt-2" style="font-size: 12px; color: #c8861a; background: rgba(200,134,26,0.08); padding: 6px 10px; border-radius: 4px">
        {{ report.disclaimer }}
      </div>
    </n-card>

    <!-- 全链路处理进度 -->
    <n-card title="全链路处理进度" class="mb-3">
      <PipelineFlow
        :review-status="reviewStatus"
        :skipped-stages="autoPass ? ['expert_review' as PipelineStage] : []"
        :node-details="nodeDetails"
      />
      <div v-if="report.triage" class="mt-2" style="font-size: 12px; color: var(--n-text-color-disabled)">
        <b>分流说明：</b>{{ report.triage.reason }}
        <span v-if="report.triage.duration_tier?.includes('短视频')" style="color:#3f51b5">
          （短视频片段已自动放宽「缺小结/练习」环节要求）
        </span>
      </div>
    </n-card>

    <!-- 综合得分 + 短板清单（左列） | 雷达 + 进步对比（右列） -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px" class="mb-3">
      <div style="display: flex; flex-direction: column; gap: 16px">
        <n-card title="综合得分">
          <n-statistic :value="report.scores?.overall_percent || 0" suffix="/100" />
          <n-tag :type="(report.scores?.overall_percent || 0) >= 80 ? 'success' : (report.scores?.overall_percent || 0) >= 60 ? 'warning' : 'error'" size="small" class="mt-1">
            {{ gradeLabel(report.scores?.overall_percent || 0) }}
          </n-tag>
          <div class="mt-4 text-sm text-gray-500">
            <div v-for="d in dimensionViews" :key="d.id" class="flex justify-between py-0.5">
              <span>{{ d.id }} {{ d.name }}</span>
              <span style="font-weight: 600; color: var(--n-text-color)">{{ d.total.toFixed(1) }}/5</span>
            </div>
          </div>
        </n-card>

        <n-card title="短板清单">
          <div v-for="(w, i) in (report.weaknesses || [])" :key="i" class="weak-item">
            {{ w }}
          </div>
          <n-empty v-if="!(report.weaknesses || []).length" description="无突出短板" :show-description="true" size="small" />
        </n-card>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <n-card title="四维度雷达">
          <div ref="radarRef" style="width: 100%; height: 300px" />
        </n-card>

        <n-card title="进步对比">
          <n-tag :type="report.progress_compare?.trend === 'improved' ? 'success' : report.progress_compare?.trend === 'declined' ? 'error' : 'default'" v-if="report.progress_compare">
            {{ trendText[report.progress_compare.trend] || report.progress_compare.trend }}
          </n-tag>
          <div v-if="report.progress_compare" class="mt-2 text-sm">
            <span v-for="(v, key) in report.progress_compare.dimension_deltas" :key="key" class="mr-3">
              {{ key }}
              <b :style="{ color: v >= 0 ? '#2e7d32' : '#c62828' }">{{ v > 0 ? '+' : '' }}{{ v.toFixed(1) }}</b>
            </span>
          </div>
          <div v-if="report.progress_compare" class="mt-2 text-sm text-gray-500">
            仍薄弱：<span v-for="w in report.progress_compare.still_weak" :key="w" class="mr-2">{{ w }}</span>
          </div>
          <n-empty v-else description="暂无对比数据" size="small" />
        </n-card>
      </div>
    </div>

    <!-- 分段式细节评语：证据时间轴 -->
    <n-card title="分段式细节评语（点击跳转到对应视频时间点）" class="mb-3">
      <EvidenceTimeline :video-url="videoUrl" :markers="markers" mode="readonly" />
    </n-card>

    <!-- 针对性训练规划 -->
    <n-card v-if="report.training_plan" title="针对性训练规划">
      <p class="mb-2"><b>重点改进方向：</b>{{ report.training_plan.next_focus }}</p>
      <ul class="mt-2 mb-2" style="padding-left: 18px">
        <li v-for="t in report.training_plan.specific_tasks" :key="t" class="mb-1">{{ t }}</li>
      </ul>
      <div class="text-sm text-gray-500">
        参考示范：{{ report.training_plan.reference_case }} · 建议重复练习 {{ report.training_plan.estimated_repeat_times }} 次
      </div>
    </n-card>

    <!-- 专家复核意见（4.1 试讲详情下半部分：原文保留 + 专家姓名/时间） -->
    <n-card
      v-if="reviewStatus === 'expert_reviewed' && expertOpinions.length"
      ref="expertRef"
      title="专家复核意见"
      class="mt-3"
      :class="{ 'op-highlight': highlighted }"
    >
      <div v-for="op in expertOpinions" :key="op.opinion_id" class="mb-3 op-block">
        <div class="flex items-center gap-2 mb-1">
          <b style="color: var(--n-text-color)">{{ op.expert_name }}</b>
          <span class="text-gray-500" style="font-size: 12px">{{ op.expert_time }}</span>
          <n-tag v-for="d in op.diverged_dims" :key="d" size="tiny" type="warning">分歧 {{ d }}</n-tag>
        </div>
        <div style="font-size: 13px; color: var(--n-body-text-color); white-space: pre-wrap; border-left: 3px solid #c8861a; padding-left: 10px">
          {{ op.comment }}
        </div>
        <div v-if="op.adjusted_scores && Object.keys(op.adjusted_scores).length" class="mt-1 text-sm text-gray-500">
          调整分数：<span v-for="(v, key) in op.adjusted_scores" :key="key">{{ key }} → {{ v === undefined ? '—' : v.toFixed(1) }}　</span>
        </div>
      </div>
    </n-card>

    <!-- AI 答疑 -->
    <div class="mt-3">
      <ChatPanel
        title="学生端 · 试讲练习助手"
        :initial-messages="chatMsgs"
        :suggestions="suggs"
        :stream-fn="realChat"
        placeholder="问：比如「怎么改进导入环节的话术？」"
      />
    </div>
    </template>
  </div>
</template>

<style scoped>
.op-highlight {
  outline: 2px solid #c8861a;
  outline-offset: 2px;
}
.weak-item {
  font-size: 12px;
  color: #c62828;
  background: rgba(198, 40, 40, 0.06);
  border: 1px solid rgba(198, 40, 40, 0.2);
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 6px;
  line-height: 1.5;
  word-break: break-word;
}
</style>
