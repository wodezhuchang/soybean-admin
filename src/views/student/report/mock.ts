/**
 * AgentReport Mock（演示数据）· 按 try_id 参数化
 * 结构严格对齐 shared/types/agent.ts，可与真实后端 `/api/try/{id}` 返回互换。
 * 数值均为演示示例，非真实评价结果。
 */
import type { AgentReport, ExpertOpinion } from '@/shared/types/agent';

/** 演示视频（video.js 官方示例，仅占位；接入真实后端时替换为试讲视频地址） */
export const DEMO_VIDEO_URL = 'https://vjs.zencdn.net/v/oceans.mp4';

/** 一次函数（初中数学 · 新授课 · 67 分）—— 默认/最近一次 */
const REPORT_001: AgentReport = {
  meta: {
    user_id: 'demo_user',
    try_id: 'try_20261028_001',
    subject: '数学',
    lesson: '一次函数',
    lesson_type: '新授课',
    grade_level: '初中',
    duration_seconds: 600,
    recorded_at: '2026-10-28T09:30:00+08:00',
  },
  disclaimer: '本评价为 AI 辅助练习建议，不作为课程最终考核结果，专业评判以任课教师为准。',
  scores: {
    D1_teaching_design: { total: 3.8, weight: 0.25, items: { 'D1.1': 4, 'D1.2': 3, 'D1.3': 4, 'D1.4': 4 } },
    D2_language: { total: 3.0, weight: 0.3, items: { 'D2.1': 4, 'D2.2': 3, 'D2.3': 2, 'D2.4': 3, 'D2.5': 3 } },
    D3_blackboard: { total: 3.8, weight: 0.2, items: { 'D3.1': 4, 'D3.2': 4, 'D3.3': 3, 'D3.4': 4 } },
    D4_presence: { total: 3.0, weight: 0.25, items: { 'D4.1': 4, 'D4.2': 3, 'D4.3': 2, 'D4.4': 3, 'D4.5': 3 } },
    overall_percent: 67,
  },
  timeline_feedback: [
    { timestamp_start: '00:12', timestamp_end: '00:35', segment: '导入', issue: '导入环节语速偏快，目标表述不够清晰', suggestion: '放慢到每分钟 180 字左右，先点明"本课能学会什么"' },
    { timestamp_start: '02:40', timestamp_end: '03:20', segment: '新授', issue: '讲解"一次函数解析式"前缺少一次有效停顿，重难点不突出', suggestion: '讲到重难点前停顿 2–3 秒并复述关键定义' },
    { timestamp_start: '04:05', timestamp_end: '04:40', segment: '新授', issue: '板书"y=kx+b"标注与讲授不同步，略早于讲解', suggestion: '讲到对应关系时再书写，板书与语音保持同步' },
    { timestamp_start: '06:30', timestamp_end: '07:10', segment: '练习', issue: '互动提问较机械，未留给学生思考时间', suggestion: '提问后停顿 3 秒再点名，增强启发性' },
  ],
  weaknesses: ['重难点处缺乏有效停顿', '互动提问启发性不足', '板书与讲授同步性欠佳'],
  progress_compare: {
    vs_previous_try_id: 'try_20261021_002',
    trend: 'improved',
    dimension_deltas: { D1: 0.3, D2: 0.4, D3: 0.1, D4: -0.2 },
    still_weak: ['讲授节奏（重难点停顿）', '互动提问'],
  },
  training_plan: {
    next_focus: '重难点处加入有效停顿，并强化提问后的思考留白',
    specific_tasks: [
      '选取一段 2 分钟教学片段，在重难点前加入 2–3 秒停顿并复述',
      '设计 3 个递进式提问，每次提问后停顿 3 秒',
      '对照优秀课例观察板书与讲授同步的节奏',
    ],
    reference_case: '初中数学《正比例函数》优秀课例片段',
    estimated_repeat_times: 3,
  },
};

/** 光的折射（高中物理 · 实验课 · 72 分） */
const REPORT_004: AgentReport = {
  meta: {
    user_id: 'demo_user',
    try_id: 'try_20261014_004',
    subject: '物理',
    lesson: '光的折射',
    lesson_type: '实验课',
    grade_level: '高中',
    duration_seconds: 540,
    recorded_at: '2026-10-14T10:00:00+08:00',
  },
  disclaimer: '本评价为 AI 辅助练习建议，不作为课程最终考核结果，专业评判以任课教师为准。',
  scores: {
    D1_teaching_design: { total: 4.0, weight: 0.25, items: { 'D1.1': 4, 'D1.2': 4, 'D1.3': 4, 'D1.4': 4 } },
    D2_language: { total: 3.6, weight: 0.3, items: { 'D2.1': 4, 'D2.2': 4, 'D2.3': 3, 'D2.4': 4, 'D2.5': 3 } },
    D3_blackboard: { total: 3.4, weight: 0.2, items: { 'D3.1': 3, 'D3.2': 4, 'D3.3': 3, 'D3.4': 3 } },
    D4_presence: { total: 3.8, weight: 0.25, items: { 'D4.1': 4, 'D4.2': 4, 'D4.3': 4, 'D4.4': 4, 'D4.5': 3 } },
    overall_percent: 72,
  },
  timeline_feedback: [
    { timestamp_start: '00:20', timestamp_end: '00:50', segment: '导入', issue: '引入生活现象充分，但未点明实验目标', suggestion: '演示前先说明"通过实验要验证什么规律"' },
    { timestamp_start: '02:50', timestamp_end: '03:40', segment: '实验', issue: '操作讲解时转身背对实验台，教姿遮挡视线', suggestion: '边操作边侧身面向学生，避免背对' },
    { timestamp_start: '05:10', timestamp_end: '05:50', segment: '总结', issue: '结论板书与口头总结重复，信息冗余', suggestion: '口头先说结论，板书只留公式与关键词' },
  ],
  weaknesses: ['实验操作示范时教姿遮挡', '结论呈现信息冗余'],
  progress_compare: {
    vs_previous_try_id: 'try_20261001_003',
    trend: 'improved',
    dimension_deltas: { D1: 0.2, D2: 0.3, D3: -0.1, D4: 0.4 },
    still_weak: ['板书精简性'],
  },
  training_plan: {
    next_focus: '实验操作示范时保持面向学生，结论呈现做到口头与板书互补',
    specific_tasks: [
      '练习边演示边讲解，保持身体侧向学生，视线可及全班',
      '每次实验后先口头总结，再补充板书关键词',
      '用手机自录 3 次，回看教姿遮挡与重复讲解片段',
    ],
    reference_case: '高中物理《光的折射》实验示范优秀课例',
    estimated_repeat_times: 3,
  },
};

/** 静夜思（小学语文 · 诵读 · 61 分） */
const REPORT_002: AgentReport = {
  meta: {
    user_id: 'demo_user',
    try_id: 'try_20260918_002',
    subject: '语文',
    lesson: '静夜思',
    lesson_type: '诵读',
    grade_level: '小学',
    duration_seconds: 480,
    recorded_at: '2026-09-18T09:00:00+08:00',
  },
  disclaimer: '本评价为 AI 辅助练习建议，不作为课程最终考核结果，专业评判以任课教师为准。',
  scores: {
    D1_teaching_design: { total: 3.4, weight: 0.25, items: { 'D1.1': 3, 'D1.2': 3, 'D1.3': 4, 'D1.4': 3 } },
    D2_language: { total: 2.8, weight: 0.3, items: { 'D2.1': 3, 'D2.2': 3, 'D2.3': 2, 'D2.4': 3, 'D2.5': 3 } },
    D3_blackboard: { total: 3.2, weight: 0.2, items: { 'D3.1': 3, 'D3.2': 3, 'D3.3': 3, 'D3.4': 4 } },
    D4_presence: { total: 3.0, weight: 0.25, items: { 'D4.1': 3, 'D4.2': 3, 'D4.3': 3, 'D4.4': 3, 'D4.5': 3 } },
    overall_percent: 61,
  },
  timeline_feedback: [
    { timestamp_start: '00:30', timestamp_end: '01:00', segment: '导入', issue: '古诗背景交代过多，冲淡诵读主线', suggestion: '导入控制 1 分钟，直接进入朗读与正音' },
    { timestamp_start: '03:00', timestamp_end: '03:40', segment: '朗读', issue: '领读时语速偏快，停顿点与诗句节奏不符', suggestion: '按"二二三"节奏领读，每句后留半拍停顿' },
    { timestamp_start: '05:20', timestamp_end: '05:50', segment: '互动', issue: '提问对象集中在前排，后排学生参与少', suggestion: '点名覆盖后排，走动式提问提升参与' },
  ],
  weaknesses: ['诵读节奏偏快', '互动覆盖不均衡'],
  progress_compare: {
    vs_previous_try_id: 'try_20260905_001',
    trend: 'improved',
    dimension_deltas: { D1: 0.2, D2: 0.3, D3: 0.1, D4: 0.0 },
    still_weak: ['诵读节奏', '课堂互动均衡性'],
  },
  training_plan: {
    next_focus: '控制诵读节奏并均衡课堂互动覆盖面',
    specific_tasks: [
      '按"二二三"节奏练习领读，每句后停顿半拍',
      '设计点名顺序，覆盖前排与后排各 3 人',
      '录 2 分钟朗读片段，回放检查语速与停顿',
    ],
    reference_case: '小学语文《静夜思》诵读示范课例',
    estimated_repeat_times: 2,
  },
};

/** 课例索引：按 try_id 取报告 */
export const REPORT_MOCKS: Record<string, AgentReport> = {
  try_20261028_001: REPORT_001,
  try_20261014_004: REPORT_004,
  try_20260918_002: REPORT_002,
};

/** 未知 try_id 回退到最近一次课例 */
const FALLBACK = REPORT_001;

export function getReportData(tryId: string): AgentReport {
  return REPORT_MOCKS[tryId] || FALLBACK;
}

/** 各课例演示视频（接入后端后由接口返回） */
export function getReportVideo(tryId: string): string {
  return DEMO_VIDEO_URL;
}

/** 专家复核意见（按课例参数化，接入后端后替换为接口返回） */
const EXPERT_MOCKS: Record<string, ExpertOpinion[]> = {
  try_20261028_001: [
    {
      opinion_id: 'op_1',
      try_id: 'try_20261028_001',
      expert_name: '李老师',
      expert_time: '2026-10-28 09:40',
      adjusted_scores: { D2: 3.4 },
      comment: '导入部分目标表述还不够聚焦，建议把"学会一次函数解析式"改成"能由实际情境列出一次函数解析式并说明含义"。板书同步性整体可以，注意第二次书写前先停 2 秒。',
      diverged_dims: ['D2'],
    },
  ],
  try_20261014_004: [
    {
      opinion_id: 'op_2',
      try_id: 'try_20261014_004',
      expert_name: '王老师',
      expert_time: '2026-10-14 15:20',
      adjusted_scores: { D3: 3.6 },
      comment: '实验示范整体流畅，注意转折处背对学生的片段；结论板书建议精简为"折射定律 + 关键量"，与口头总结互补即可。',
      diverged_dims: ['D3'],
    },
  ],
  try_20260918_002: [
    {
      opinion_id: 'op_3',
      try_id: 'try_20260918_002',
      expert_name: '陈老师',
      expert_time: '2026-09-18 14:00',
      adjusted_scores: { D2: 3.0 },
      comment: '诵读节奏有提升空间，重点练"二二三"停顿；互动覆盖建议按名单轮转，避免集中在固定区域。',
      diverged_dims: ['D2'],
    },
  ],
};

export function getExpertOpinions(tryId: string): ExpertOpinion[] {
  return EXPERT_MOCKS[tryId] || EXPERT_MOCKS['try_20261028_001'] || [];
}
