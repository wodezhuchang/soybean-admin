/**
 * Agent 结构化输出的前端类型定义（单一事实来源）
 * 严格对齐《Agent_SystemPrompt与输出模板_v1.0》的 JSON Schema 与
 * 《标准化评价指标体系_v1.0》（四维度 D1–D4，18 个二级指标，0–5 锚点，百分制）。
 */

/** 一级维度标识 */
export type DimensionId = 'D1' | 'D2' | 'D3' | 'D4';

/** 全链路状态机（后端驱动迁移，前端只读轮询） */
export type ReviewStatus =
  | 'uploaded'           // 已上传
  | 'ai_reviewing'       // 机器初评中
  | 'ai_reviewed'        // 机器初评完成（待决策：人工复核 或 自动通过）
  | 'expert_reviewed'    // 专家复核完成
  | 'returned'           // 教师退回
  | 'knowledge_recycled';// 知识库回流完成

/** 单维度得分 */
export interface DimensionScore {
  total: number;          // 维度分 0–5
  weight: number;         // 权重 0.25 / 0.30 / 0.20 / 0.25
  items: Record<string, number>; // 二级指标得分，如 { "D1.1": 4 }
}

/** 分段式评语（时间轴定位） */
export interface TimelineFeedbackItem {
  timestamp_start: string; // "mm:ss"
  timestamp_end: string;   // "mm:ss"
  segment: string;         // 导入 / 新授 / 练习 / 小结
  issue: string;
  suggestion: string;
}

/** 进步对比 */
export interface ProgressCompare {
  vs_previous_try_id: string;
  trend: 'improved' | 'declined' | 'flat' | 'first_try';
  dimension_deltas: Record<DimensionId, number>;
  still_weak: string[];
}

/** 针对性训练规划 */
export interface TrainingPlan {
  next_focus: string;
  specific_tasks: string[];
  reference_case: string;
  estimated_repeat_times: number;
}

/** 元信息 */
export interface ReportMeta {
  user_id: string;
  try_id: string;
  subject: string;
  lesson: string;
  lesson_type: string;
  grade_level: string;
  duration_seconds: number;
  recorded_at: string; // ISO8601
}

/** 完整评价报告（AgentReport） */
export interface AgentReport {
  meta: ReportMeta;
  disclaimer: string;
  scores: {
    D1_teaching_design: DimensionScore; // weight 0.25
    D2_language:          DimensionScore; // weight 0.30
    D3_blackboard:        DimensionScore; // weight 0.20
    D4_presence:          DimensionScore; // weight 0.25
    overall_percent: number;
  };
  timeline_feedback: TimelineFeedbackItem[];
  weaknesses: string[];
  progress_compare: ProgressCompare;
  training_plan: TrainingPlan;
}

/** 待复评列表项（专家端 4.2） */
export interface ReviewItem {
  try_id: string;
  title: string;
  student_name: string;
  subject: string;
  lesson_type: string;
  grade_level: string;
  recorded_at: string;
  machine_overall: number;      // 机器总分（百分制）
  lowest_confidence_dim: DimensionId; // 最低置信度维度
  confidence: Record<DimensionId, number>; // 各维度置信度 0–1
  review_status: ReviewStatus;
}

/** 专家复核意见（4.1 试讲详情下半部分 / 4.2 复评表单产出） */
export interface ExpertOpinion {
  opinion_id: string;
  try_id: string;
  expert_name: string;
  expert_time: string;
  adjusted_scores?: Partial<Record<DimensionId, number>>; // 调整后维度分（0–5）
  comment: string;              // 专家意见（原文保留）
  diverged_dims: DimensionId[]; // 标注的分歧维度
}

/** 消息（4.1 消息铃铛） */
export interface MessageItem {
  message_id: string;
  try_id: string;
  title: string;
  content: string;
  read: boolean;
  created_at: string;
}

/** 成长曲线点（4.1 成长曲线页） */
export interface GrowthPoint {
  try_id: string;
  recorded_at: string;
  machine_overall: number;      // 机器分（趋势线）
  expert_overall: number | null; // 专家复评后的分数（菱形点位置）
  expert_reviewed: boolean;     // 是否专家复评过（加标记）
}
