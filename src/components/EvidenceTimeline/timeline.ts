/**
 * EvidenceTimeline 工具与类型定义
 * 与后端 Agent JSON（timeline_feedback）严格对齐
 */

/** 标记来源：机器初评 / 专家 */
export type TimelineMarkerSource = 'ai' | 'expert';

/** 时间轴标记（由 AgentReport.timeline_feedback 或专家新增产生） */
export interface TimelineMarker {
  id: string;
  /** 起始秒数 */
  startSec: number;
  /** 结束秒数（可选） */
  endSec?: number;
  /** 环节：导入 / 新授 / 练习 / 小结 */
  segment?: string;
  /** 问题描述 */
  issue?: string;
  /** 改进建议 */
  suggestion?: string;
  source: TimelineMarkerSource;
  /** 专家标注：与机器判断分歧 */
  diverged?: boolean;
}

/** 后端 AgentReport.timeline_feedback 原始项 */
export interface TimelineFeedbackItem {
  timestamp_start: string | number; // "mm:ss" 或秒数
  timestamp_end: string | number;   // "mm:ss" 或秒数
  segment: string;
  issue: string;
  suggestion: string;
}

/** "mm:ss" 或纯秒数 → 秒 */
export function mmssToSeconds(v: string | number): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return 0;
  const s = v.trim();
  if (/^\d+$/.test(s)) return Number(s);  // 纯秒数
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 秒 → "mm:ss" */
export function secondsToMmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** 依据视频 URL 后缀猜测 MIME（video.js sources 需要） */
export function guessVideoMime(url: string): string {
  const u = (url.split('?')[0] || url).toLowerCase();
  if (u.endsWith('.mp4')) return 'video/mp4';
  if (u.endsWith('.webm')) return 'video/webm';
  if (u.endsWith('.ogg')) return 'video/ogg';
  if (u.endsWith('.m3u8')) return 'application/x-mpegURL';
  return 'video/mp4';
}

/** 后端 timeline_feedback → 前端 TimelineMarker[]（source=ai） */
export function feedbackToMarkers(list: TimelineFeedbackItem[]): TimelineMarker[] {
  return (list || []).map((f, i) => ({
    id: `fb_${i}`,
    startSec: mmssToSeconds(f.timestamp_start),
    endSec: mmssToSeconds(f.timestamp_end) || undefined,
    segment: f.segment,
    issue: f.issue,
    suggestion: f.suggestion,
    source: 'ai',
  }));
}
