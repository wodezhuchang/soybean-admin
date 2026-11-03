<script setup lang="ts">
/**
 * EvidenceTimeline —— 视频证据时间轴组件
 * 基于 video.js + 自研进度条标记层，支持：
 *  - 点击标记 / 评语卡片 → 跳转对应时间点（双向联动）
 *  - 播放到某段 → 对应评语卡片自动高亮
 *  - review 模式：专家可标注"与机器判断分歧"
 *  - 视频加载失败 → 自动降级为分段评语模式（仍可定位卡片）
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { guessVideoMime, secondsToMmss, type TimelineMarker } from './timeline';

interface Props {
  videoUrl: string;
  markers: TimelineMarker[];
  /** readonly=学生只读 / review=专家可标注分歧 */
  mode?: 'readonly' | 'review';
  autoplay?: boolean;
  poster?: string;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'readonly',
  autoplay: false,
  poster: '',
});

const emit = defineEmits<{
  (e: 'seek', sec: number): void;
  (e: 'markerClick', marker: TimelineMarker): void;
  (e: 'divergenceChange', marker: TimelineMarker, diverged: boolean): void;
}>();

/* ---------- DOM 引用 ---------- */
const playerEl = ref<HTMLVideoElement | null>(null);
const barEl = ref<HTMLDivElement | null>(null);

/* ---------- 播放器状态 ---------- */
let player: Player | null = null;
let duration = 0;
let disposed = false;

const playing = ref(false);
const current = ref(0);
const videoReady = ref(false);
const videoError = ref(false);
const activeMarkerId = ref<string | null>(null);

/* ---------- 派生 ---------- */
/** 标记按起始秒升序，避免渲染顺序抖动 */
const orderedMarkers = computed(() =>
  [...props.markers].sort((a, b) => a.startSec - b.startSec),
);

/** 元数据未就绪时的兜底时长（取最大标记终点 + 余量，保证定位可读） */
const fallbackDuration = computed(() => {
  const max = orderedMarkers.value.reduce((acc, m) => Math.max(acc, m.endSec ?? m.startSec + 60), 0);
  return max || 60;
});

const playheadPercent = computed(() => {
  const d = duration || 1;
  return Math.min(100, Math.max(0, (current.value / d) * 100));
});

const barVisibleDuration = computed(() => (duration > 0 ? duration : fallbackDuration.value));

/* ---------- 播放器初始化 ---------- */
function initPlayer() {
  if (!playerEl.value || player) return;
  if (!props.videoUrl) return;  // 等 URL 有值再初始化
  player = videojs(playerEl.value, {
    autoplay: props.autoplay,
    controls: true,
    fluid: true,
    sources: [{ src: props.videoUrl, type: guessVideoMime(props.videoUrl) }],
    ...(props.poster ? { poster: props.poster } : {}),
  });
  player.on('loadedmetadata', () => {
    if (disposed || !player) return;
    duration = player.duration() || 0;
    videoReady.value = duration > 0;
  });
  player.on('timeupdate', () => {
    if (disposed || !player) return;
    current.value = player.currentTime() || 0;
    syncActive();
  });
  player.on('play', () => (playing.value = true));
  player.on('pause', () => (playing.value = false));
  player.on('error', () => {
    videoError.value = true;
  });
}

/* ---------- 交互 ---------- */
function markerLeft(m: TimelineMarker): number {
  const pct = (m.startSec / barVisibleDuration.value) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** 点击标记 / 卡片 → 跳转并高亮 */
function seekTo(m: TimelineMarker) {
  activeMarkerId.value = m.id;
  emit('markerClick', m);
  if (player && !videoError.value) {
    player.currentTime(m.startSec);
    emit('seek', m.startSec);
  }
}

/** 点击进度条任意位置 → 跳转 */
function onBarClick(e: MouseEvent) {
  if (!barEl.value || !duration) return;
  const rect = barEl.value.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const sec = ratio * duration;
  if (player && !videoError.value) {
    player.currentTime(sec);
    emit('seek', sec);
  }
}

/** 依据当前播放时间，高亮处于区间内的标记 */
function syncActive() {
  const c = current.value;
  const hit = orderedMarkers.value.find(
    m => c >= m.startSec && (!m.endSec || c <= m.endSec),
  );
  activeMarkerId.value = hit?.id ?? null;
}

/** 专家标注分歧（仅 review 模式） */
function toggleDivergence(m: TimelineMarker) {
  const next = !m.diverged;
  emit('divergenceChange', { ...m, diverged: next }, next);
}

/* ---------- videoUrl 变化时换源 ---------- */
watch(
  () => props.videoUrl,
  url => {
    if (!url) return;
    if (player) {
      videoError.value = false;
      player.src({ src: url, type: guessVideoMime(url) });
    } else {
      // URL 到达时播放器还没初始化（挂载时 URL 为空），现在初始化
      nextTick(() => initPlayer());
    }
  },
);

/* ---------- 生命周期 ---------- */
onMounted(async () => {
  await nextTick();
  initPlayer();
});
onBeforeUnmount(() => {
  disposed = true;
  if (player) {
    player.dispose();
    player = null;
  }
});
</script>

<template>
  <div class="et-root">
    <!-- 播放器 -->
    <div class="et-player-wrap">
      <video ref="playerEl" class="video-js vjs-big-play-centered" playsinline />
      <div v-if="!videoUrl" class="et-error" style="display:flex;align-items:center;justify-content:center;height:100%;min-height:180px">
        暂无视频文件（可能是历史记录未保存视频）
      </div>
      <div v-if="videoError && videoUrl" class="et-error">
        视频加载失败，已降级为分段评语模式（点击卡片仍可定位问题段落）。
      </div>
    </div>

    <!-- 自定义时间轴（进度条 + 标记层） -->
    <div ref="barEl" class="et-bar" @click="onBarClick">
      <div class="et-bar-track" />
      <div
        class="et-playhead"
        :style="{ left: playheadPercent + '%' }"
        :class="{ moving: playing }"
      />
      <button
        v-for="m in orderedMarkers"
        :key="m.id"
        type="button"
        class="et-marker"
        :class="[
          m.source,
          { active: activeMarkerId === m.id, diverged: m.diverged },
        ]"
        :style="{ left: markerLeft(m) + '%' }"
        :title="m.issue"
        @click.stop="seekTo(m)"
      />
    </div>

    <!-- 评语卡片列表 -->
    <div class="et-list">
      <div
        v-for="m in orderedMarkers"
        :key="m.id"
        class="et-card"
        :class="{ active: activeMarkerId === m.id, diverged: m.diverged }"
        @click="seekTo(m)"
      >
        <div class="et-card-head">
          <span class="et-time">
            {{ secondsToMmss(m.startSec) }}{{ m.endSec ? ` - ${secondsToMmss(m.endSec)}` : '' }}
          </span>
          <span v-if="m.segment" class="et-seg">{{ m.segment }}</span>
          <span class="et-src" :class="m.source">{{ m.source === 'ai' ? 'AI初评' : '专家' }}</span>
          <label v-if="mode === 'review'" class="et-div" @click.stop>
            <input
              type="checkbox"
              :checked="!!m.diverged"
              @change="toggleDivergence(m)"
            />
            分歧
          </label>
        </div>
        <div class="et-issue">{{ m.issue }}</div>
        <div v-if="m.suggestion" class="et-sug">建议：{{ m.suggestion }}</div>
      </div>
      <div v-if="!orderedMarkers.length" class="et-empty">暂无可展示的时间轴标记。</div>
    </div>
  </div>
</template>

<style scoped>
.et-root {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  color: #252525;
}
.et-player-wrap {
  position: relative;
  width: 100%;
  background: #0b0f1a;
  border-radius: 8px;
  overflow: hidden;
}
.et-player-wrap :deep(.video-js) {
  width: 100%;
}
.et-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: #f5f5f5;
  font-size: 13px;
  text-align: center;
  background: rgba(0, 0, 0, 0.55);
}
.et-bar {
  position: relative;
  height: 22px;
  margin: 8px 0 12px;
  cursor: pointer;
  touch-action: none;
}
.et-bar-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background: #e0e4ea;
}
.et-playhead {
  position: absolute;
  top: 2px;
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: #1a2b4a;
  transform: translateX(-1.5px);
}
.et-playhead.moving {
  background: #c8861a;
}
.et-marker {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 14px;
  padding: 0;
  border: 1.5px solid #fff;
  border-radius: 2px;
  transform: translate(-50%, -50%);
  cursor: pointer;
  box-sizing: border-box;
}
.et-marker.ai {
  background: #1a2b4a;
}
.et-marker.expert {
  background: #2e7d32;
}
.et-marker.diverged {
  background: #c8861a;
}
.et-marker.active {
  outline: 2px solid #c8861a;
  outline-offset: 1px;
}
.et-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.et-card {
  padding: 10px 12px;
  border: 1px solid #e0e4ea;
  border-left: 4px solid #1a2b4a;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.et-card.active {
  border-left-color: #c8861a;
  box-shadow: 0 0 0 2px rgba(200, 134, 26, 0.18);
}
.et-card.diverged {
  border-left-color: #c8861a;
}
.et-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}
.et-time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #1a2b4a;
}
.et-seg {
  padding: 1px 6px;
  border-radius: 4px;
  background: #f2f4f7;
  color: #52647d;
}
.et-src {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
}
.et-src.ai {
  background: #1a2b4a;
}
.et-src.expert {
  background: #2e7d32;
}
.et-div {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #52647d;
  cursor: pointer;
  user-select: none;
}
.et-issue {
  font-size: 13px;
  color: #252525;
}
.et-sug {
  margin-top: 4px;
  font-size: 12px;
  color: #52647d;
}
.et-empty {
  padding: 20px;
  text-align: center;
  color: #8d9aab;
  font-size: 13px;
}
</style>
