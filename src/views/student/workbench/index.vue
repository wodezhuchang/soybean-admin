<script setup lang="ts">
/**
 * 学生端 · Studio 工作台（学生仪表盘/默认首页，4.1）
 * 职责：只放「状态＋全局进度＋快捷入口＋待办＋摘要」，不做完整拆解。
 * 完整评分（四维雷达/证据时间轴/训练规划/专家复核）下沉到 report；上传动作独立到 upload 页。
 * 已接通真实后端：最近试讲报告 /api/try/{id}、消息 /api/messages；接口异常时回退内置演示数据。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/modules/auth';
import PipelineFlow, { type PipelineStage } from '@/components/PipelineFlow/index.vue';
import MessageBell from '@/components/MessageBell/index.vue';
import type { ReviewStatus, MessageItem, AgentReport } from '@/shared/types/agent';
import { getReportData } from '../report/mock';

const router = useRouter();
const USER_ID = useAuthStore().userInfo.userId || 'demo_user';

/** 最新一次试讲（默认展示最近记录；接通后端后以接口返回为准） */
const latest = ref<AgentReport>(getReportData('try_20261028_001'));
const status = ref<ReviewStatus>('expert_reviewed');
const autoPass = ref(false);

/** 一句话摘要：总分 + 等级 + 最弱维度 */
const weakest = computed(() => latest.value.weaknesses[0] || '无明显短板');

const messages = ref<MessageItem[]>([]);

/** 快捷建议（替代完整 ChatPanel，保持仪表盘轻量） */
const quickTips = [
  '先看完整报告的证据时间轴，定位最需改进的片段',
  '按训练规划完成 2–3 次微课练习，再上传新视频对比',
  '有疑问时到报告页内与 AI 助手对话',
];

/** 由后端 review_status 映射前端状态机 */
function applyReviewStatus(rs: string | undefined) {
  if (rs === 'returned') { status.value = 'returned'; autoPass.value = false; }
  else if (rs === 'auto_pass') { status.value = 'ai_reviewed'; autoPass.value = true; }
  else if (rs === 'expert_reviewed') { status.value = 'expert_reviewed'; autoPass.value = false; }
  else { status.value = 'ai_reviewed'; autoPass.value = false; }
}

async function load() {
  try {
    // 最近一次试讲 → 完整报告
    const h = await (await fetch(`/proxy-default/api/users/${USER_ID}/history?limit=1`)).json();
    const recent = h?.trials?.[0];
    if (recent?.try_id) {
      const r = await (await fetch(`/proxy-default/api/try/${recent.try_id}`)).json();
      if (r?.scores) {
        latest.value = r;
        applyReviewStatus(r.review_status);
      }
    }
    // 消息铃铛
    const m = await (await fetch(`/proxy-default/api/messages?user_id=${USER_ID}`)).json();
    if (Array.isArray(m?.messages) && m.messages.length) messages.value = m.messages;
  } catch { /* 后端不可用，回退 mock 演示数据 */ }
}

function statusTag(): { text: string; kind: 'info' | 'success' | 'warning' | 'error' } {
  switch (status.value) {
    case 'uploaded': return { text: '已上传', kind: 'info' };
    case 'ai_reviewing': return { text: 'AI 初评中', kind: 'warning' };
    case 'ai_reviewed': return autoPass.value
      ? { text: 'AI初评·已自动通过', kind: 'success' }
      : { text: 'AI初评·待专家复核', kind: 'warning' };
    case 'expert_reviewed': return { text: '专家已复核', kind: 'success' };
    case 'returned': return { text: '已退回·请重传', kind: 'error' };
    case 'knowledge_recycled': return { text: '已回流知识库', kind: 'success' };
    default: return { text: status.value, kind: 'info' };
  }
}

function goUpload() { router.push('/student/upload'); }
function goReport() { router.push({ path: '/student/report', query: { try_id: latest.value.meta.try_id } }); }
function goGrowth() { router.push('/student/growth'); }

/** 点消息 → 跳报告页并滚动到专家复核意见区 */
function onMessageOpen(m: MessageItem) {
  router.push({ path: '/student/report', query: { try_id: m.try_id, focus: 'expert' } });
}

/** 标记单条消息已读（调后端 + 更新本地红点） */
async function onMessagesRead(ids: string[]) {
  ids.forEach(id => {
    const m = messages.value.find(x => x.message_id === id);
    if (m) m.read = true;
  });
  try {
    await fetch('/proxy-default/api/messages/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, message_ids: ids }),
    });
  } catch { /* 静默 */ }
}

/** 清空：把所有消息标记已读并清空本地列表（刷新后不再拉回） */
async function onClearRead() {
  const allIds = messages.value.map(m => m.message_id);
  if (allIds.length) {
    try {
      await fetch('/proxy-default/api/messages/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, message_ids: allIds }),
      });
    } catch { /* 静默 */ }
  }
  messages.value = [];
}

onMounted(load);
</script>

<template>
  <div style="max-width: 1080px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <!-- 顶部：标题 + 状态标签 + 消息铃铛 -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
        <h2 style="color: #1a2b4a; margin: 0">我的试讲工作台</h2>
        <n-tag type="info" size="small" :bordered="false">仪表盘</n-tag>
      </div>
      <MessageBell :messages="messages" :on-open="onMessageOpen" :on-read="onMessagesRead" :on-clear-read="onClearRead" />
    </div>

    <!-- 全链路状态 -->
    <n-card title="全链路处理进度" class="mb-3">
      <PipelineFlow
        :review-status="status"
        :skipped-stages="autoPass ? ['expert_review' as PipelineStage] : []"
      />
    </n-card>

    <!-- 最近试讲摘要 -->
    <n-card class="mb-3" :bordered="true">
      <template #header>
        <span style="color: #1a2b4a; font-weight: 600">最近试讲 · {{ latest.meta.subject }}《{{ latest.meta.lesson }}》</span>
        <n-tag :type="statusTag().kind" size="small" style="margin-left: 8px">{{ statusTag().text }}</n-tag>
      </template>
      <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap">
        <div>
          <div style="font-size: 12px; color: #8d9aab">综合得分</div>
          <div style="font-size: 34px; font-weight: 700; color: #1a2b4a; line-height: 1.1">
            {{ latest.scores.overall_percent }}<span style="font-size: 16px">/100</span>
          </div>
        </div>
        <div style="flex: 1; min-width: 240px">
          <div style="font-size: 14px; color: #252525; line-height: 1.6">
            一句话评语：{{ latest.weaknesses[0] || '表现稳定，可向更高要求进阶' }}
          </div>
          <div class="mt-2">
            <n-tag type="error" size="small" :bordered="false">最需改进：{{ weakest }}</n-tag>
            <n-tag size="small" :bordered="false" class="ml-2">{{ latest.meta.recorded_at }}</n-tag>
          </div>
        </div>
      </div>
      <div class="mt-3" style="font-size: 13px; color: #52647d">
        四维雷达、证据时间轴、训练规划与专家复核意见详见<a style="color: #1a2b4a; font-weight: 600; cursor: pointer" @click="goReport">完整报告</a>。
      </div>
    </n-card>

    <!-- 快捷入口 -->
    <n-grid :cols="3" :x-gap="16" class="mb-3">
      <n-grid-item>
        <n-card size="small" @click="goUpload" style="cursor: pointer">
          <div style="font-size: 16px; color: #1a2b4a; font-weight: 600">上传新试讲</div>
          <div style="font-size: 12px; color: #8d9aab; margin-top: 4px">提交视频 → AI 初评 → 生成报告</div>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small" @click="goReport" style="cursor: pointer">
          <div style="font-size: 16px; color: #1a2b4a; font-weight: 600">查看完整报告</div>
          <div style="font-size: 12px; color: #8d9aab; margin-top: 4px">四维雷达 · 证据时间轴 · 训练规划</div>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small" @click="goGrowth" style="cursor: pointer">
          <div style="font-size: 16px; color: #1a2b4a; font-weight: 600">查看成长趋势</div>
          <div style="font-size: 12px; color: #8d9aab; margin-top: 4px">历次机器分趋势与专家复评点</div>
        </n-card>
      </n-grid-item>
    </n-grid>

    <!-- 待办 + 快捷建议 -->
    <n-grid :cols="2" :x-gap="16">
      <n-grid-item>
        <n-card title="当前待办">
          <div class="text-sm" style="line-height: 1.8">
            <div>· 按训练规划练习：<span style="color: #1a2b4a; font-weight: 600">{{ latest.training_plan.next_focus }}</span></div>
            <div>· <span style="cursor: pointer; color: #1a2b4a; font-weight: 600" @click="goReport">查看专家复核意见</span>（李老师已完成《一次函数》复核）</div>
          </div>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="快捷建议">
          <div class="text-sm" style="line-height: 1.8; color: #52647d">
            <div v-for="t in quickTips" :key="t">· {{ t }}</div>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
