<script setup lang="ts">
/**
 * PipelineFlow 演示页 —— 全链路状态流转
 * 通过按钮推进 review_status，观察节点着色与处理中动效；点击节点查看阶段摘要。
 * 接入真实后端后，可将 autoPoll + pollFn 绑定 `/api/try/{id}/pipeline`。
 */
import { ref } from 'vue';
import PipelineFlow, { type PipelineStage } from '@/components/PipelineFlow/index.vue';
import type { ReviewStatus } from '@/shared/types/agent';

const status = ref<ReviewStatus>('uploaded');
const autoPass = ref(false);

const steps: { key: ReviewStatus; label: string }[] = [
  { key: 'uploaded', label: '1 已上传' },
  { key: 'ai_reviewing', label: '2 机器初评中' },
  { key: 'ai_reviewed', label: '3 初评完成' },
  { key: 'expert_reviewed', label: '4 专家复核' },
  { key: 'knowledge_recycled', label: '5 知识回流' },
];

const nodeDetails: Partial<Record<PipelineStage, { title: string; summary: string; metrics: { label: string; value: string }[] }>> = {
  upload: { title: '上传视频', summary: '已接收试讲视频与教案元数据（初中数学·一次函数·新授课）。', metrics: [{ label: '时长', value: '10 分钟' }, { label: '格式', value: 'MP4' }] },
  collect: { title: '多模态采集', summary: '完成 ASR 语音识别、板书 OCR、姿态识别、表情识别，输出结构化特征。', metrics: [{ label: '语音文本', value: '1 032 字' }, { label: '板书帧', value: '6 帧' }] },
  ai_review: { title: '机器初评', summary: 'Agent 按四维度指标打分，输出结构化 JSON 与分段式评语。', metrics: [{ label: '总分', value: '67/100' }, { label: '短板', value: '3 项' }] },
  expert_review: { title: '专家复核', summary: '进入人工复核队列，专家可在证据时间轴上标注分歧并提交意见。', metrics: [{ label: '人机差异', value: '待计算' }] },
  recycle: { title: '知识库回流', summary: '专家改进建议切分后写入 ChromaDB，供后续试讲检索。', metrics: [{ label: '新增片段', value: '2 条' }] },
  training: { title: '训练建议生成', summary: '生成针对性训练规划：重难点停顿、递进式提问、板书同步。', metrics: [{ label: '建议任务', value: '3 项' }] },
};

const skipped = () => (autoPass.value ? ['expert_review' as PipelineStage] : []);
</script>

<template>
  <div style="max-width: 1080px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <h2 style="color: #1a2b4a; margin-bottom: 4px">全链路关键节点可视化（PipelineFlow）</h2>
    <p style="color: #767676; font-size: 13px; margin-bottom: 16px">
      演示状态流转：点击按钮推进 review_status，节点自动着色（绿=完成 / 蓝=处理中 / 灰=待处理）；点击节点查看阶段摘要。
    </p>

    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px">
      <button
        v-for="s in steps"
        :key="s.key"
        type="button"
        :class="['stp', { on: status === s.key }]"
        @click="status = s.key"
      >
        {{ s.label }}
      </button>
      <label style="margin-left: 12px; font-size: 13px; color: #52647d">
        <input v-model="autoPass" type="checkbox" /> 初评高分自动通过（跳过专家复核）
      </label>
    </div>

    <PipelineFlow
      :review-status="status"
      :skipped-stages="skipped()"
      :node-details="nodeDetails"
    />
  </div>
</template>

<style scoped>
.stp {
  padding: 6px 12px;
  border: 1px solid #cbd2dc;
  border-radius: 6px;
  background: #fff;
  color: #52647d;
  font-size: 13px;
  cursor: pointer;
}
.stp.on {
  border-color: #1a2b4a;
  background: #1a2b4a;
  color: #fff;
}
</style>
