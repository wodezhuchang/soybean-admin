<script setup lang="ts">
/**
 * PipelineFlow —— 全链路 DAG 状态图（AntV X6）
 * 渲染 上传→多模态采集→机器初评→专家复核→知识库回流→训练建议生成 主链路，
 * 节点状态由 review_status 状态机驱动着色：
 *   done=绿 / processing=蓝(边带动画) / error=红 / pending=灰 / skipped=虚线
 * 点击节点 → 右侧面板展示阶段产出摘要。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Graph } from '@antv/x6';
import type { ReviewStatus } from '@/shared/types/agent';

export type PipelineStage =
  | 'upload' | 'collect' | 'ai_review' | 'expert_review' | 'recycle' | 'training';
export type NodeStatus = 'pending' | 'processing' | 'done' | 'error' | 'skipped';

export interface PipelineNode {
  id: string;
  stage: PipelineStage;
  label: string;
  status: NodeStatus;
  detail?: { title: string; summary: string; metrics?: { label: string; value: string }[] };
  timestamp?: string;
}

interface Props {
  reviewStatus: ReviewStatus;
  /** 可跳过的节点（如自动通过时专家复核） */
  skippedStages?: PipelineStage[];
  /** 若传入，则不按状态机映射，直接渲染该节点集合 */
  customNodes?: PipelineNode[];
  /** 为自动生成节点补充点击详情（按阶段） */
  nodeDetails?: Partial<Record<PipelineStage, PipelineNode['detail']>>;
  tryId?: string;
  autoPoll?: boolean;
  pollIntervalMs?: number;
  /** 轮询函数（接入真实后端时传入），返回最新 review_status */
  pollFn?: () => Promise<ReviewStatus>;
  onNodeClick?: (n: PipelineNode) => void;
}

const props = withDefaults(defineProps<Props>(), {
  skippedStages: () => [],
  customNodes: undefined,
  nodeDetails: undefined,
  tryId: '',
  autoPoll: false,
  pollIntervalMs: 3000,
  pollFn: undefined,
  onNodeClick: undefined,
});

const emit = defineEmits<{ (e: 'nodeClick', node: PipelineNode): void }>();

const containerRef = ref<HTMLDivElement | null>(null);
const selected = ref<PipelineNode | null>(null);
let graph: Graph | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_STAGES: { stage: PipelineStage; label: string }[] = [
  { stage: 'upload', label: '上传视频' },
  { stage: 'collect', label: '多模态采集' },
  { stage: 'ai_review', label: '机器初评' },
  { stage: 'expert_review', label: '专家复核' },
  { stage: 'recycle', label: '知识库回流' },
  { stage: 'training', label: '训练建议生成' },
];

/** 状态机 → 节点状态 */
function statusFor(stage: PipelineStage): NodeStatus {
  if (props.skippedStages.includes(stage)) return 'skipped';
  switch (props.reviewStatus) {
    case 'uploaded':
      return stage === 'upload' ? 'done' : 'pending';
    case 'ai_reviewing':
      if (stage === 'upload') return 'done';
      if (stage === 'collect' || stage === 'ai_review') return 'processing';
      return 'pending';
    case 'ai_reviewed':
      return ['upload', 'collect', 'ai_review'].includes(stage) ? 'done' : 'pending';
    case 'expert_reviewed':
      return ['upload', 'collect', 'ai_review', 'expert_review'].includes(stage)
        ? 'done' : 'pending';
    case 'knowledge_recycled':
      return 'done';
    default:
      return 'pending';
  }
}

const nodes = computed<PipelineNode[]>(() => {
  if (props.customNodes?.length) return props.customNodes;
  return DEFAULT_STAGES.map((s, i) => ({
    id: s.stage,
    stage: s.stage,
    label: s.label,
    status: statusFor(s.stage),
    detail: props.nodeDetails?.[s.stage],
    timestamp: s.stage === 'upload' ? '10:02' : undefined,
  }));
});

const STATUS_STYLE: Record<NodeStatus, { fill: string; stroke: string; label: string }> = {
  pending: { fill: '#FAFAFA', stroke: '#CBD2DC', label: '#767676' },
  processing: { fill: '#E3F2FD', stroke: '#1565C0', label: '#0D47A1' },
  done: { fill: '#E8F5E9', stroke: '#2E7D32', label: '#1B5E20' },
  error: { fill: '#FFEBEE', stroke: '#C62828', label: '#B71C1C' },
  skipped: { fill: '#F5F5F5', stroke: '#BDBDBD', label: '#9E9E9E' },
};

const NODE_W = 132;
const NODE_H = 54;
const GAP = 22;

function renderGraph() {
  if (!containerRef.value) return;
  const list = nodes.value;
  const width = list.length * NODE_W + (list.length - 1) * GAP + 24;
  const height = NODE_H + 24;

  graph?.dispose();
  graph = new Graph({
    container: containerRef.value,
    width,
    height,
    background: { color: '#FFFFFF' },
    grid: false,
    interacting: { nodeMovable: false, edgeMovable: false },
  });

  list.forEach((n, i) => {
    const st = STATUS_STYLE[n.status];
    graph!.addNode({
      id: n.id,
      shape: 'rect',
      x: 12 + i * (NODE_W + GAP),
      y: 12,
      width: NODE_W,
      height: NODE_H,
      attrs: {
        body: {
          fill: st.fill,
          stroke: st.stroke,
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          strokeDasharray: n.status === 'skipped' ? '4 4' : undefined,
        },
        label: {
          text: n.status === 'processing' ? `${n.label}…` : n.label,
          fill: st.label,
          fontSize: 13,
          fontWeight: 600,
        },
      },
      data: n,
    });
  });

  for (let i = 0; i < list.length - 1; i++) {
    const target = list[i + 1];
    const processing = target.status === 'processing';
    graph!.addEdge({
      source: list[i].id,
      target: target.id,
      attrs: {
        line: {
          stroke: processing ? '#1565C0' : '#B8C0CC',
          strokeWidth: 2,
          strokeDasharray: processing ? '8 6' : undefined,
        },
      },
    });
  }

  // 处理中节点的入边以蓝色虚线呈现（v3 不依赖运行时动画，静态即可表达"流转中"）
  // 处理中节点：蓝色虚线入边 + 蓝色节点（已在上方 attrs 完成）

  graph.on('node:click', ({ node }) => {
    const n = node.getData() as PipelineNode;
    selected.value = n;
    emit('nodeClick', n);
    props.onNodeClick?.(n);
  });
}

function refresh() {
  void nextTick(renderGraph);
}

watch(() => props.reviewStatus, refresh);
watch(() => props.skippedStages, refresh, { deep: true });
watch(() => props.customNodes, refresh, { deep: true });

function startPoll() {
  if (!props.autoPoll || !props.pollFn) return;
  pollTimer = setInterval(async () => {
    try {
      const status = await props.pollFn!();
      if (status !== props.reviewStatus) {
        // 通过 emit 通知父级更新 reviewStatus（父级绑定后触发 watch 重绘）
        // eslint-disable-next-line no-console
        console.warn('[PipelineFlow] 状态更新为', status, '，请由父级更新 reviewStatus');
      }
    } catch {
      /* 后端未就绪时静默 */
    }
  }, props.pollIntervalMs);
}

onMounted(() => {
  refresh();
  startPoll();
});
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  graph?.dispose();
  graph = null;
});
</script>

<template>
  <div class="pf-root">
    <div class="pf-graph-scroll">
      <div ref="containerRef" class="pf-graph" />
    </div>
    <!-- 点击节点 → 详情面板 -->
    <div v-if="selected" class="pf-detail">
      <div class="pf-detail-title">
        {{ selected.detail?.title || selected.label }}
        <span class="pf-detail-status">{{ selected.status }}</span>
      </div>
      <div v-if="selected.detail?.summary" class="pf-detail-summary">{{ selected.detail.summary }}</div>
      <div v-if="selected.detail?.metrics?.length" class="pf-detail-metrics">
        <span v-for="m in selected.detail.metrics" :key="m.label" class="pf-metric">
          {{ m.label }}：<b>{{ m.value }}</b>
        </span>
      </div>
      <div v-if="!selected.detail" class="pf-detail-summary muted">该阶段暂无更多产出摘要。</div>
      <div v-if="selected.timestamp" class="pf-detail-ts">完成于 {{ selected.timestamp }}</div>
    </div>
  </div>
</template>

<style scoped>
.pf-root {
  width: 100%;
  box-sizing: border-box;
}
.pf-graph-scroll {
  overflow-x: auto;
}
.pf-graph {
  min-height: 90px;
}
.pf-detail {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #e0e4ea;
  border-left: 4px solid #1a2b4a;
  border-radius: 6px;
  background: #fafbfc;
}
.pf-detail-title {
  font-weight: 700;
  color: #1a2b4a;
  margin-bottom: 4px;
}
.pf-detail-status {
  font-size: 11px;
  font-weight: 500;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef1f6;
  color: #52647d;
}
.pf-detail-summary {
  font-size: 13px;
  color: #252525;
}
.pf-detail-summary.muted {
  color: #8d9aab;
}
.pf-detail-metrics {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 12px;
  color: #52647d;
}
.pf-detail-ts {
  margin-top: 6px;
  font-size: 12px;
  color: #8d9aab;
}
</style>
