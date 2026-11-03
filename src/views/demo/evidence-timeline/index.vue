<script setup lang="ts">
/**
 * EvidenceTimeline 演示页
 * 运行：pnpm dev 后访问 /demo/evidence-timeline（Soybean 文件路由自动生成）
 * 说明：videoUrl 为演示占位（video.js 官方示例视频），请替换为真实试讲视频地址。
 */
import EvidenceTimeline from '@/components/EvidenceTimeline/index.vue';
import {
  feedbackToMarkers,
  type TimelineMarker,
} from '@/components/EvidenceTimeline/timeline';

/** 演示视频（video.js 官方示例，请替换为真实视频） */
const videoUrl = 'https://vjs.zencdn.net/v/oceans.mp4';

/** 后端 AgentReport.timeline_feedback 原始数据（mock） */
const mockFeedback = [
  {
    timestamp_start: '00:12',
    timestamp_end: '00:35',
    segment: '导入',
    issue: '导入环节语速偏快，目标表述不够清晰',
    suggestion: '放慢到每分钟 180 字左右，先点明"本课能学会什么"',
  },
  {
    timestamp_start: '00:58',
    timestamp_end: '01:40',
    segment: '新授',
    issue: '重难点讲解前缺少一次有效停顿，重点不突出',
    suggestion: '在讲到重难点前停顿 2-3 秒并复述关键词',
  },
  {
    timestamp_start: '02:20',
    timestamp_end: '03:05',
    segment: '练习',
    issue: '互动提问较机械，未留给学生思考时间',
    suggestion: '提问后停顿 3 秒再点名，增强启发性',
  },
];

const markers: TimelineMarker[] = feedbackToMarkers(mockFeedback);

function handleDivergenceChange(marker: TimelineMarker, diverged: boolean) {
  // 演示：在专家模式，分歧标记可被更新（真实场景写入后端）
  console.log('[分歧]', marker.id, diverged);
}
</script>

<template>
  <div style="max-width: 860px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <h2 style="color: #1a2b4a; margin-bottom: 4px">EvidenceTimeline 演示</h2>
    <p style="color: #767676; font-size: 13px; margin-bottom: 16px">
      学生只读模式（readonly）：点击标记/卡片跳转，播放联动高亮。
    </p>

    <EvidenceTimeline
      :video-url="videoUrl"
      :markers="markers"
      mode="readonly"
    />

    <h2 style="color: #1a2b4a; margin: 24px 0 4px">专家复核模式（review）</h2>
    <p style="color: #767676; font-size: 13px; margin-bottom: 16px">
      额外支持标注"分歧"（琥珀色标记），在复评三栏页的中栏使用。
    </p>

    <EvidenceTimeline
      :video-url="videoUrl"
      :markers="markers"
      mode="review"
      @divergence-change="handleDivergenceChange"
    />
  </div>
</template>
