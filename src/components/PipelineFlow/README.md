# PipelineFlow 组件

全链路 DAG 状态图（AntV X6）。渲染 上传 → 多模态采集 → 机器初评 → 专家复核 → 知识库回流 → 训练建议生成 六个关键节点，节点状态由 `review_status` 状态机驱动自动着色。

## 依赖

`@antv/x6@^3.1.8`（v3 无需引入 CSS，样式由库运行时注入）。

## Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `reviewStatus` | `ReviewStatus` | 必填 | 状态机值：`uploaded / ai_reviewing / ai_reviewed / expert_reviewed / knowledge_recycled` |
| `skippedStages` | `PipelineStage[]` | `[]` | 需跳过（虚线）的节点，如初评高分自动通过时传 `['expert_review']` |
| `customNodes` | `PipelineNode[]` | 无 | 传入时跳过状态机映射，直接按给定节点渲染 |
| `nodeDetails` | `Partial<Record<PipelineStage, detail>>` | 无 | 为自动生成节点补充点击详情 |
| `tryId` | `string` | `''` | 当前试讲 id（供轮询上下文） |
| `autoPoll` | `boolean` | `false` | 是否开启轮询 |
| `pollIntervalMs` | `number` | `3000` | 轮询间隔 |
| `pollFn` | `() => Promise<ReviewStatus>` | 无 | 轮询函数（接入真实后端时传入） |
| `onNodeClick` | `(n) => void` | 无 | 节点点击回调 |

## 事件

- `nodeClick(node: PipelineNode)` —— 点击节点触发，同时选中节点在右侧面板展示 `detail`。

## 状态机 → 节点着色映射

| 状态 | 着色 |
|---|---|
| `pending` | 灰底 `#FAFAFA` / 灰边 `#CBD2DC` |
| `processing` | 蓝底 `#E3F2FD` / 蓝边 `#1565C0`，入边为蓝色虚线 |
| `done` | 绿底 `#E8F5E9` / 绿边 `#2E7D32` |
| `error` | 红底 `#FFEBEE` / 红边 `#C62828` |
| `skipped` | 浅灰底，`4 4` 虚线边 |

## 使用

```vue
<PipelineFlow
  :review-status="status"
  :skipped-stages="['expert_review']"
  :node-details="nodeDetails"
  @node-click="onClick"
/>
```

## 接入真实后端

开启轮询并绑定后端接口（需父级同步更新 `reviewStatus`）：

```ts
const status = ref<ReviewStatus>('uploaded');
<PipelineFlow
  :review-status="status"
  :auto-poll="true"
  :poll-fn="async () => (await fetch(`/proxy-default/api/try/${tryId}/pipeline`)).json()"  // 后端暂未实现；可先用 review_status 轮询或演示数据代替
/>
```

## 注意

- 容器宽度由节点数量自动计算，节点较多时外层 `.pf-graph-scroll` 允许横向滚动。
- X6 v3 的节点 `shape` 使用注册名 `'rect'`，不要传形状类。
