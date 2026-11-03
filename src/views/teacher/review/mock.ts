/**
 * 专家复评页 mock：按 try_id 参数化
 * 与 review-list 的待复评条目一一对应；接入后端后替换为 fetch(`/api/try/{tryId}`)。
 */
import type { DimensionId, DimensionScore, TimelineFeedbackItem } from '@/shared/types/agent';

export interface ReviewMockData {
  subject: string;
  lesson: string;
  lesson_type: string;
  grade_level: string;
  overall_percent: number;
  scores: { D1: DimensionScore; D2: DimensionScore; D3: DimensionScore; D4: DimensionScore };
  confidence: Record<DimensionId, number>;
  timeline_feedback: TimelineFeedbackItem[];
  video: string;
}

function dim(total: number, weight: number, items: Record<string, number>): DimensionScore {
  return { total, weight, items };
}

const VIDEO = '';

export const REVIEW_MOCKS: Record<string, ReviewMockData> = {
  try_20261028_001: {
    subject: '数学',
    lesson: '一次函数',
    lesson_type: '新授课',
    grade_level: '初中',
    overall_percent: 67,
    scores: {
      D1: dim(3.8, 0.25, { 'D1.1': 4, 'D1.2': 3, 'D1.3': 4, 'D1.4': 4 }),
      D2: dim(3.0, 0.3, { 'D2.1': 4, 'D2.2': 3, 'D2.3': 2, 'D2.4': 3, 'D2.5': 3 }),
      D3: dim(3.8, 0.2, { 'D3.1': 4, 'D3.2': 4, 'D3.3': 3, 'D3.4': 4 }),
      D4: dim(3.0, 0.25, { 'D4.1': 4, 'D4.2': 3, 'D4.3': 2, 'D4.4': 3, 'D4.5': 3 }),
    },
    confidence: { D1: 0.72, D2: 0.61, D3: 0.78, D4: 0.8 },
    timeline_feedback: [
      { timestamp_start: '00:12', timestamp_end: '00:35', segment: '导入', issue: '导入环节语速偏快，目标表述不够清晰', suggestion: '放慢到每分钟 180 字左右，先点明"本课能学会什么"' },
      { timestamp_start: '02:40', timestamp_end: '03:20', segment: '新授', issue: '讲解解析式前缺少有效停顿，重难点不突出', suggestion: '讲到重难点前停顿 2–3 秒并复述关键定义' },
      { timestamp_start: '04:05', timestamp_end: '04:40', segment: '新授', issue: '板书"y=kx+b"标注与讲授不同步', suggestion: '讲到对应关系时再书写，板书与语音保持同步' },
      { timestamp_start: '06:30', timestamp_end: '07:10', segment: '练习', issue: '互动提问较机械，未留思考时间', suggestion: '提问后停顿 3 秒再点名，增强启发性' },
    ],
    video: VIDEO,
  },
  try_20261027_005: {
    subject: '物理',
    lesson: '光的折射',
    lesson_type: '实验课',
    grade_level: '高中',
    overall_percent: 72,
    scores: {
      D1: dim(4.0, 0.25, { 'D1.1': 4, 'D1.2': 4, 'D1.3': 4, 'D1.4': 4 }),
      D2: dim(3.5, 0.3, { 'D2.1': 4, 'D2.2': 3, 'D2.3': 4, 'D2.4': 3, 'D2.5': 3 }),
      D3: dim(3.4, 0.2, { 'D3.1': 4, 'D3.2': 3, 'D3.3': 3, 'D3.4': 4 }),
      D4: dim(3.6, 0.25, { 'D4.1': 4, 'D4.2': 4, 'D4.3': 3, 'D4.4': 3, 'D4.5': 4 }),
    },
    confidence: { D1: 0.8, D2: 0.74, D3: 0.69, D4: 0.58 },
    timeline_feedback: [
      { timestamp_start: '00:20', timestamp_end: '00:50', segment: '导入', issue: '实验引入快，未先说明观察要点', suggestion: '先讲清"入射角/折射角"观察目标再演示' },
      { timestamp_start: '03:10', timestamp_end: '03:45', segment: '新授', issue: '实验操作时讲解略滞后，指向不明', suggestion: '操作前先说出步骤，操作中同步解说' },
      { timestamp_start: '05:40', timestamp_end: '06:20', segment: '练习', issue: '学生分组实验纪律引导不足', suggestion: '实验前明确分工与安全要求' },
    ],
    video: VIDEO,
  },
  try_20261027_002: {
    subject: '语文',
    lesson: '静夜思',
    lesson_type: '诵读',
    grade_level: '小学',
    overall_percent: 64,
    scores: {
      D1: dim(3.4, 0.25, { 'D1.1': 3, 'D1.2': 3, 'D1.3': 4, 'D1.4': 4 }),
      D2: dim(3.2, 0.3, { 'D2.1': 4, 'D2.2': 3, 'D2.3': 3, 'D2.4': 3, 'D2.5': 3 }),
      D3: dim(2.8, 0.2, { 'D3.1': 3, 'D3.2': 3, 'D3.3': 2, 'D3.4': 3 }),
      D4: dim(3.3, 0.25, { 'D4.1': 4, 'D4.2': 3, 'D4.3': 3, 'D4.4': 3, 'D4.5': 3 }),
    },
    confidence: { D1: 0.77, D2: 0.7, D3: 0.55, D4: 0.72 },
    timeline_feedback: [
      { timestamp_start: '00:15', timestamp_end: '00:40', segment: '导入', issue: '诗句背景铺垫不足，学生难入情境', suggestion: '先给一两个生活化"思乡"情境再诵读' },
      { timestamp_start: '02:20', timestamp_end: '02:55', segment: '新授', issue: '生字板书缺少笔顺示范', suggestion: '关键生字分步演示笔顺并让学生书空' },
      { timestamp_start: '04:30', timestamp_end: '05:00', segment: '练习', issue: '集体诵读节奏快，未逐句带读', suggestion: '放慢节奏，逐句领读后跟读' },
    ],
    video: VIDEO,
  },
};

/** 取指定试讲的复评数据；未知 tryId 回退到默认（一次函数） */
export function getReviewData(tryId: string): ReviewMockData {
  return REVIEW_MOCKS[tryId] ?? REVIEW_MOCKS['try_20261028_001'];
}
