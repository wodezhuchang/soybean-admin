# EvidenceTimeline · 视频证据时间轴组件

基于 **video.js + 自研进度条标记层** 的 Vue3 组件，对应开发规格第 2 节。

## 已落盘文件

```
src/components/EvidenceTimeline/
├── index.vue        # 组件主体（播放器 + 时间轴 + 卡片列表 + 双向联动 + 分歧标注 + 失败降级）
└── timeline.ts      # 类型定义 + 工具函数（mm:ss↔秒 / MIME 猜测 / 后端字段转换）
src/views/demo/evidence-timeline/
└── index.vue        # 演示页（含 AgentReport mock → 标记转换），pnpm dev 后访问 /demo/evidence-timeline
```

## 依赖

已执行 `pnpm add video.js`（package.json 新增 `"video.js": "^10.2.0"`）。若在别处复用，执行：

```bash
pnpm add video.js
```

## 用法

```vue
<script setup lang="ts">
import EvidenceTimeline from '@/components/EvidenceTimeline/index.vue';
import { feedbackToMarkers } from '@/components/EvidenceTimeline/timeline';

const markers = feedbackToMarkers(report.timeline_feedback); // source=ai
</script>

<!-- 学生端只读 -->
<EvidenceTimeline :video-url="videoUrl" :markers="markers" mode="readonly" />

<!-- 专家复核：可标注分歧 -->
<EvidenceTimeline
  :video-url="videoUrl"
  :markers="markers"
  mode="review"
  @divergence-change="(m, v) => saveDivergence(m, v)"
/>
```

## Props / Events

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `videoUrl` | string | — | 视频地址（支持 mp4/webm/ogg/m3u8，自动猜 MIME） |
| `markers` | TimelineMarker[] | — | 时间轴标记（按 startSec 自动排序） |
| `mode` | 'readonly' \| 'review' | 'readonly' | review 下卡片显示"分歧"开关 |
| `autoplay` | boolean | false | — |
| `poster` | string | '' | 封面图 |

| Event | 载荷 | 说明 |
|---|---|---|
| `seek` | `sec: number` | 点击标记/进度条跳转时触发 |
| `markerClick` | `marker` | 点击标记或卡片 |
| `divergenceChange` | `(marker, diverged)` | 专家标注分歧（仅 review） |

## 关键实现说明

- **时间轴**：自定义进度条（非 video.js 默认进度条），标记按 `startSec / duration × 100%` 定位，避免与主题/版本耦合。
- **双向联动**：点标记/卡片 → `player.currentTime()` + 高亮；播放 `timeupdate` → 高亮处于 `[startSec, endSec]` 区间内的卡片。
- **降级**：`player.on('error')` 时切换为分段评语模式（卡片仍可定位问题段落，不缺失功能）。
- **生命周期**：`onBeforeUnmount` 调用 `player.dispose()`，`videoUrl` 变化自动换源。

## 注意事项

- 视频需可跨域访问（CORS），否则 video.js 报错会触发降级模式。
- 真实场景 `divergenceChange` 应写入后端（`/api/expert-review`），demo 仅打印日志。
