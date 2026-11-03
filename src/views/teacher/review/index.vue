<script setup lang="ts">
/**
 * 专家端 · 复评页（4.2 三栏布局）
 * 左：机器初评摘要（各维度分数+权重+评语）——已接通真实报告 /api/try/{try_id}
 * 中：视频证据时间轴（可点击跳转，复核模式可标注分歧）
 * 右：专家复评表单（调整分数、填写意见、标注分歧维度）+ 提交真实 /api/expert-review
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/store/modules/auth';
import EvidenceTimeline from '@/components/EvidenceTimeline/index.vue';
import ChatPanel, { type ChatMessage } from '@/components/ChatPanel/index.vue';
import { feedbackToMarkers, type TimelineMarker } from '@/components/EvidenceTimeline/timeline';
import type { DimensionId } from '@/shared/types/agent';
import { getReviewData, type ReviewMockData } from './mock';

const DEMO_VIDEO = 'https://vjs.zencdn.net/v/oceans.mp4';

const route = useRoute();
const authStore = useAuthStore();
const tryId = ref((route.query.try_id as string) || '');

/** 机器初评数据：接通真实报告，异常时回退 mock */
const data = ref<ReviewMockData>(getReviewData('try_20261028_001'));

/** 机器初评摘要（各维度分数 + 置信度 + 评语） */
const machineSummary = computed(() => {
  const s = data.value.scores;
  const conf = data.value.confidence;
  return [
    { id: 'D1' as DimensionId, name: '教学设计', total: s.D1.total, weight: s.D1.weight, conf: conf.D1 },
    { id: 'D2' as DimensionId, name: '语言表达', total: s.D2.total, weight: s.D2.weight, conf: conf.D2 },
    { id: 'D3' as DimensionId, name: '板书规范', total: s.D3.total, weight: s.D3.weight, conf: conf.D3 },
    { id: 'D4' as DimensionId, name: '教姿教态', total: s.D4.total, weight: s.D4.weight, conf: conf.D4 },
  ];
});

/** 时间轴标记：机器评语，标注一条为分歧 */
const markers = computed<TimelineMarker[]>(() => {
  const ms = feedbackToMarkers(data.value.timeline_feedback);
  if (ms[1]) ms[1] = { ...ms[1], diverged: true };
  return ms;
});

/** 复评表单（默认值取该试讲机器分） */
const form = reactive<{ adjusted: Record<DimensionId, number>; comment: string; diverged: DimensionId[] }>({
  adjusted: { D1: 0, D2: 0, D3: 0, D4: 0 },
  comment: '',
  diverged: [],
});
Object.keys(data.value.scores).forEach(k => {
  form.adjusted[k as DimensionId] = data.value.scores[k as keyof ReviewMockData['scores']].total;
});

const submitted = ref(false);
const recycleNote = ref('');

/** 从真实报告映射到复评页数据（后端暂未产出置信度，展示占位 0.7） */
async function load() {
  // 无 try_id 时自动取最久的待复评记录
  if (!tryId.value) {
    try {
      const eid = authStore.userInfo.userId || 'teacher_1';
      const p = await (await fetch(`/proxy-default/api/triage/pending?expert_id=${eid}&limit=1`)).json();
      const oldest = p?.trials?.[0];
      if (oldest?.try_id) tryId.value = oldest.try_id;
    } catch { /* ignore */ }
  }
  if (!tryId.value) return;
  try {
    const res = await fetch(`/proxy-default/api/try/${tryId.value}`);
    if (!res.ok) return;
    const d = await res.json();
    if (!d?.scores) return;
    data.value = {
      subject: d.meta.subject || '未标注',
      lesson: d.meta.lesson || '未记录课例',
      lesson_type: d.meta.lesson_type || '',
      grade_level: d.meta.grade_level || '',
      overall_percent: Number(d.scores.overall_percent) || 0,
      video: (() => {
        const vp = d.meta?.video_path;
        if (!vp) return '';
        return vp.startsWith('http') ? vp : `/proxy-default/${vp.replace(/^\/+/, '')}`;
      })(),
      scores: {
        D1: { total: Number(d.scores.D1_teaching_design?.total) || 0, weight: Number(d.scores.D1_teaching_design?.weight) || 0, items: d.scores.D1_teaching_design?.items || {} },
        D2: { total: Number(d.scores.D2_language?.total) || 0, weight: Number(d.scores.D2_language?.weight) || 0, items: d.scores.D2_language?.items || {} },
        D3: { total: Number(d.scores.D3_blackboard?.total) || 0, weight: Number(d.scores.D3_blackboard?.weight) || 0, items: d.scores.D3_blackboard?.items || {} },
        D4: { total: Number(d.scores.D4_presence?.total) || 0, weight: Number(d.scores.D4_presence?.weight) || 0, items: d.scores.D4_presence?.items || {} },
      },
      confidence: { D1: 0.7, D2: 0.7, D3: 0.7, D4: 0.7 },
      timeline_feedback: d.timeline_feedback || [],
    };
    // 同步复评表单默认值为机器分
    if (!submitted.value) {
      form.adjusted.D1 = data.value.scores.D1.total;
      form.adjusted.D2 = data.value.scores.D2.total;
      form.adjusted.D3 = data.value.scores.D3.total;
      form.adjusted.D4 = data.value.scores.D4.total;
    }
  } catch { /* 后端不可用，回退 mock */ }
}

function toggleDiverged(d: DimensionId) {
  const i = form.diverged.indexOf(d);
  if (i >= 0) form.diverged.splice(i, 1);
  else form.diverged.push(d);
}

/** 维度权重（对齐指标体系 D1 25% / D2 30% / D3 20% / D4 25%） */
const WS = { D1: 0.25, D2: 0.3, D3: 0.2, D4: 0.25 };

/** 提交：校验 → 调真实 /api/expert-review → 自动加载下一条待复评 */
const submitting = ref(false);
const allDone = ref(false);
async function submit() {
  if (submitting.value) return;
  if (!form.comment.trim()) {
    submitted.value = true;
    recycleNote.value = '请先填写专家意见后再提交。';
    return;
  }
  submitting.value = true;
  const overall = Math.round(
    (WS.D1 * form.adjusted.D1 + WS.D2 * form.adjusted.D2 + WS.D3 * form.adjusted.D3 + WS.D4 * form.adjusted.D4) * 20 * 10) / 10;
  try {
    const res = await fetch('/proxy-default/api/expert-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        try_id: tryId.value,
        expert_id: useAuthStore().userInfo.userId || 'expert',
        final_scores: {
          D1: { total: form.adjusted.D1 }, D2: { total: form.adjusted.D2 },
          D3: { total: form.adjusted.D3 }, D4: { total: form.adjusted.D4 },
          overall_percent: overall,
        },
        comments: form.comment,
      }),
    });
    const r = await res.json();
    if (r?.status === 'ok') {
      // 成功 → 拉取下一条待复评
      const eid = useAuthStore().userInfo.userId || 'teacher_1';
      const p = await (await fetch(`/proxy-default/api/triage/pending?expert_id=${eid}&limit=1`)).json();
      const next = p?.trials?.[0];
      if (next?.try_id) {
        // 有下一条：重置表单并加载
        submitted.value = false;
        recycleNote.value = '';
        form.comment = '';
        form.diverged = [];
        tryId.value = next.try_id;
        await load();
      } else {
        // 没有了：显示完成页
        allDone.value = true;
      }
    } else {
      submitted.value = true;
      recycleNote.value = `提交失败：${r?.error || res.status}`;
    }
  } catch (e: any) {
    submitted.value = true;
    recycleNote.value = '提交失败：' + e.message;
  } finally {
    submitting.value = false;
  }
}

/** 退回：发错/非本职责范围的试讲 → 标记退回并通知学生重新上传（不指明具体老师） */
async function returnTrial() {
  if (!window.confirm('确定退回该试讲吗？学生将收到提示并需重新上传给正确的老师。')) return;
  try {
    const res = await fetch('/proxy-default/api/expert-review/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        try_id: tryId.value,
        teacher_id: useAuthStore().userInfo.userId || 'expert',
        reason: '',
      }),
    });
    const r = await res.json();
    submitted.value = true;
    recycleNote.value = r?.ok
      ? '已退回该试讲，学生将收到重新上传的提示。'
      : `退回失败：${r?.reason || res.status}`;
  } catch (e: any) {
    submitted.value = true;
    recycleNote.value = '退回失败：' + e.message;
  }
}

const expertChat = ref<ChatMessage[]>([
  { id: 'x0', role: 'assistant', content: '可对照证据时间轴核对机器初评。标注分歧维度后提交，系统会自动计算人机差异。' },
]);
const suggs = ['列出与机器初评分歧最大的节点', '追加一条板书同步性意见'];
let expertSessionId = '';
async function realExpertChat(_h: ChatMessage[], onDelta: (t: string) => void, signal: AbortSignal): Promise<void> {
  const lastUserMsg = [..._h].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;
  try {
    const res = await fetch('/proxy-default/api/expert-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expert_id: useAuthStore().userInfo?.userId || 'teacher_1',
        message: lastUserMsg.content,
        student_id: data.value.student_id || undefined,
        session_id: expertSessionId || undefined,
      }),
    });
    const r = await res.json();
    if (expertSessionId) expertSessionId = r.session_id || expertSessionId;
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

onMounted(load);
</script>

<template>
  <div style="max-width: 1240px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <!-- 全部完成页 -->
    <div v-if="allDone" style="text-align: center; padding: 80px 20px">
      <div style="font-size: 48px; margin-bottom: 16px">🎉</div>
      <h2 style="color: var(--n-text-color); margin: 0 0 8px">今日复评全部完成</h2>
      <p style="color: var(--n-text-color-disabled); font-size: 15px; margin-bottom: 24px">
        所有待复评的试讲都已处理完毕，辛苦老师，好好休息一下吧。
      </p>
      <n-button type="primary" @click="$router.push('/teacher/review-list')">返回待复评列表</n-button>
    </div>

    <template v-else>
    <div class="flex items-center justify-between mb-3">
      <h2 style="margin: 0; color: var(--n-text-color)">
        复评 · {{ data.subject }}《{{ data.lesson }}》
        <span style="font-size: 13px; color: var(--n-text-color-disabled); font-weight: 400">（{{ tryId }}）</span>
      </h2>
      <n-tag type="warning" size="small">AI初评·待专家复核</n-tag>
    </div>

    <div style="display: grid; grid-template-columns: 280px 1fr 340px; gap: 16px" class="rv-grid">
      <!-- 左：机器初评摘要 -->
      <n-card title="机器初评摘要">
        <div v-for="d in machineSummary" :key="d.id" class="mb-3">
          <div class="flex justify-between text-sm">
            <span>{{ d.id }} {{ d.name }}</span>
            <b style="color: var(--n-text-color)">{{ d.total.toFixed(1) }}/5</b>
          </div>
          <div class="conf-bar"><i :style="{ width: `${d.conf * 100}%` }" /></div>
          <div style="font-size: 11px; color: var(--n-text-color-disabled); margin-top: 2px">权重 {{ d.weight * 100 }}% · 置信 {{ (d.conf * 100).toFixed(0) }}%</div>
        </div>
        <n-divider />
        <div class="text-sm"><b>机器评语</b></div>
        <div v-for="m in markers.slice(0, 3)" :key="m.id" style="font-size: 12px; color: var(--n-body-text-color); margin-top: 4px">
          {{ m.segment }} · {{ m.issue }}
        </div>
      </n-card>

      <!-- 中：视频证据时间轴 -->
      <n-card title="视频证据时间轴（点击跳转到对应时间点）">
        <EvidenceTimeline :video-url="data.video" :markers="markers" mode="review" />
      </n-card>

      <!-- 右：专家复评表单 + AI批注助手 -->
      <n-card title="专家复评表单">
        <div class="text-sm mb-1">调整维度分数（0–5）</div>
        <div v-for="d in machineSummary" :key="d.id" class="flex items-center gap-2 mb-2">
          <span style="width: 96px">{{ d.id }} {{ d.name }}</span>
          <input v-model.number="form.adjusted[d.id]" type="number" min="0" max="5" step="0.1" class="f-input" />
        </div>

        <div class="text-sm mb-1 mt-2">标注分歧维度</div>
        <div class="flex gap-2 flex-wrap mb-2">
          <label v-for="d in machineSummary" :key="d.id" class="divg">
            <input type="checkbox" :checked="form.diverged.includes(d.id)" @change="toggleDiverged(d.id)" />
            {{ d.id }}
          </label>
        </div>

        <div class="text-sm mb-1">专家意见（原文保留）</div>
        <textarea v-model="form.comment" rows="3" class="f-area" placeholder="填写复核意见…" />

        <n-button type="primary" block class="mt-3" :loading="submitting" @click="submit">
          {{ submitting ? '提交中…' : '提交复评' }}
        </n-button>
        <n-button type="error" secondary block class="mt-2" :disabled="submitting" @click="returnTrial">退回该试讲（通知学生重新上传）</n-button>

        <div v-if="submitted" class="rv-result">
          {{ recycleNote }}
        </div>

        <n-divider />
        <ChatPanel
          title="AI 批注助手"
          :initial-messages="expertChat"
          :suggestions="suggs"
          :stream-fn="realExpertChat"
          placeholder="问：比如「列出与机器初评分歧最大的节点」"
        />
      </n-card>
    </div>
    </template>
  </div>
</template>

<style scoped>
.rv-grid {
  grid-template-columns: 280px 1fr 340px;
  align-items: start;
}
@media (max-width: 1000px) {
  .rv-grid {
    grid-template-columns: 1fr;
  }
}
.conf-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--n-border-color);
  margin-top: 4px;
  overflow: hidden;
}
.conf-bar i {
  display: block;
  height: 100%;
  background: var(--n-text-color);
}
.f-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--n-border-color);
  border-radius: 5px;
  font-size: 13px;
  background: var(--n-color);
  color: var(--n-text-color);
}
.f-area {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--n-border-color);
  border-radius: 5px;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
  background: var(--n-color);
  color: var(--n-text-color);
}
.divg {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--n-body-text-color);
  border: 1px solid var(--n-border-color);
  border-radius: 5px;
  padding: 3px 7px;
}
.rv-result {
  margin-top: 10px;
  padding: 8px 10px;
  border-left: 3px solid #2e7d32;
  background: rgba(46, 125, 50, 0.1);
  font-size: 12px;
  color: var(--n-text-color);
  border-radius: 4px;
}
</style>
