<script setup lang="ts">
/**
 * 学生端 · 试讲视频分析（student/upload，与 growth 同级）
 * 职责：上传动作 + 各次试讲的分析状态（流水线入口/控制台），不承担评分拆解。
 * 上传后自动进入「AI初评中」，完成后跳转该次 report；历史记录均可进入对应报告。
 * mock 数据；接入后端替换为 fetch。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type { ReviewStatus } from '@/shared/types/agent';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/store/modules/auth';

const router = useRouter();
const message = useMessage();

interface UploadRecord {
  try_id: string;
  subject: string;
  lesson: string;
  stage: string;
  class_type: string;
  uploaded_at: string;
  status: ReviewStatus;
  overall?: number;
}

/** 试讲元数据候选值（随文件提交给后端，作为 AI 评价上下文与知识库归类依据） */
const SUBJECT_OPTIONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '科学', '信息技术', '体育', '音乐', '美术'];
const STAGE_OPTIONS = ['小学', '初中', '高中'];
const CLASS_TYPE_OPTIONS = ['新授课', '复习课', '习题课', '实验课', '公开课', '其他'];

/** 上传前需要填写的试讲信息（受控表单） */
const form = ref({
  lesson: '',
  subject: '',
  stage: '',
  class_type: '',
});

/** 历史上传记录（从后端真实加载） */
const uploads = ref<UploadRecord[]>([]);

/** 上传进度 */
const uploading = ref(false);
const progress = ref(0);
const uploadingName = ref('');
const errorMsg = ref('');

/** 历史上传条数统计 */
const counts = computed(() => ({
  total: uploads.value.length,
  reviewing: uploads.value.filter(r => r.status === 'ai_reviewing' || r.status === 'ai_reviewed').length,
  done: uploads.value.filter(r => r.status === 'expert_reviewed' || r.status === 'knowledge_recycled').length,
}));

/** 分析状态标签 */
function statusTag(s: ReviewStatus): { text: string; kind: 'info' | 'success' | 'warning' | 'error' } {
  switch (s) {
    case 'uploaded': return { text: '已上传', kind: 'info' };
    case 'ai_reviewing': return { text: 'AI 初评中', kind: 'warning' };
    case 'ai_reviewed': return { text: 'AI初评·待专家复核', kind: 'warning' };
    case 'expert_reviewed': return { text: '专家已复核', kind: 'success' };
    case 'returned': return { text: '已退回·请重传', kind: 'error' };
    case 'knowledge_recycled': return { text: '已回流知识库', kind: 'success' };
    default: return { text: s, kind: 'info' };
  }
}

const USER_ID = useAuthStore().userInfo.userId || 'demo_user';

/** 已绑定老师（发送试讲时指定发送对象） */
const teachers = ref<{ teacher_id: string; teacher_name: string }[]>([]);
const selectedTeacher = ref('');
/** 我的绑定申请状态 / 申请口令（线下由老师提供） */
const myRequests = ref<{ teacher_id: string; teacher_name: string; status: string }[]>([]);
const inviteCode = ref('');
const bindMsg = ref('');

async function loadTeachers() {
  try {
    const r = await (await fetch(`/proxy-default/api/users/${USER_ID}/teachers`)).json();
    teachers.value = (r?.teachers || []).map((t: any) => ({
      teacher_id: t.teacher_id, teacher_name: t.teacher_name || t.teacher_id,
    }));
    if (!selectedTeacher.value && teachers.value.length) selectedTeacher.value = teachers.value[0].teacher_id;
  } catch { teachers.value = []; }
}
async function loadBindings() {
  try {
    const r = await (await fetch(`/proxy-default/api/bindings/requests?student_id=${USER_ID}`)).json();
    myRequests.value = (r?.requests || []).map((b: any) => ({
      teacher_id: b.teacher_id, teacher_name: b.teacher_name || b.teacher_id, status: b.status,
    }));
  } catch { myRequests.value = []; }
}
async function applyByCode() {
  const code = inviteCode.value.trim();
  if (!code) return;
  bindMsg.value = '';
  try {
    const res = await fetch('/proxy-default/api/bindings/apply-by-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: USER_ID, invite_code: code }),
    });
    const r = await res.json();
    if (!res.ok || r?.ok === false) {
      bindMsg.value = '申请失败：' + (r?.reason || r?.detail || res.statusText);
      return;
    }
    if (r?.status === 'already_bound') {
      bindMsg.value = `你已与 ${r.teacher_name || r.teacher_id} 建立绑定关系，无需重复申请。`;
      inviteCode.value = '';
      await loadTeachers();
      await loadBindings();
      return;
    }
    bindMsg.value = `已向 ${r.teacher_name || r.teacher_id} 发起绑定申请，等待对方确认。`;
    inviteCode.value = '';
    await loadBindings();
  } catch (e: any) {
    bindMsg.value = '申请失败：' + e.message;
  }
}
/** 确认弹窗状态 */
const showConfirm = ref(false);
const pendingFile = ref<File | null>(null);

/** 选择文件 → 校验 → 弹出确认弹窗（科目/标题/发送给谁），降低错发概率 */
function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const missing: string[] = [];
  if (!form.value.lesson.trim()) missing.push('课题名称');
  if (!form.value.subject) missing.push('学科');
  if (!form.value.stage) missing.push('学段');
  if (!form.value.class_type) missing.push('课程类型');
  if (!selectedTeacher.value) missing.push('发送给哪位老师');
  if (missing.length) {
    message.warning(`请先完善：${missing.join('、')}`);
    input.value = '';
    return;
  }
  pendingFile.value = file;
  showConfirm.value = true;
  input.value = '';
}

/** 确认发送：立即关闭弹窗（防重复点击重复上传），后台执行真实上传 */
function onConfirmSend() {
  const file = pendingFile.value;
  if (!file) return;
  showConfirm.value = false;
  void confirmUpload(file);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** 启动轮询 */
function startPolling(taskId: string) {
  if (pollTimer) clearInterval(pollTimer);
  sessionStorage.setItem('activeTaskId', taskId);
  uploading.value = true;
  progress.value = 0;
  pollTimer = setInterval(async () => {
    try {
      const t = await (await fetch(`/proxy-default/api/tasks/${taskId}`)).json();
      progress.value = t.progress || 0;
      if (t.status === 'done') {
        stopPolling();
        sessionStorage.removeItem('activeTaskId');
        message.success('分析完成！');
        router.push({ path: '/student/report', query: { try_id: t.try_id } });
      } else if (t.status === 'error') {
        stopPolling();
        sessionStorage.removeItem('activeTaskId');
        errorMsg.value = t.error || '分析失败，请重试';
        message.error('分析失败：' + (t.error || '未知错误'));
      }
    } catch { /* 轮询失败静默 */ }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  uploading.value = false;
}

/** 读取视频文件时长（秒） */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(v.duration)); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(600); };
    v.src = url;
  });
}

/** 后台真实提交 → /api/evaluate_video → 轮询任务进度 → 跳报告 */
async function confirmUpload(file: File) {
  uploading.value = true;
  progress.value = 0;
  uploadingName.value = file.name;
  errorMsg.value = '';
  try {
    const durationSec = await getVideoDuration(file);
    const fd = new FormData();
    fd.append('video', file);
    fd.append('user_id', USER_ID);
    fd.append('expert_id', selectedTeacher.value);
    fd.append('subject', form.value.subject);
    fd.append('lesson', form.value.lesson.trim());
    fd.append('lesson_type', form.value.class_type);
    fd.append('grade_level', form.value.stage);
    fd.append('duration_seconds', String(durationSec));
    const res = await fetch('/proxy-default/api/evaluate_video', { method: 'POST', body: fd });
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      throw new Error(t?.detail || res.statusText);
    }
    const r = await res.json();
    message.success('视频已上传，AI 正在分析中…');
    startPolling(r.task_id);
  } catch (e: any) {
    message.error('提交失败：' + e.message);
    stopPolling();
    pendingFile.value = null;
  }
}

function openReport(try_id: string) {
  router.push({ path: '/student/report', query: { try_id } });
}

/** 后端 review_status → 前端 ReviewStatus */
function mapStatus(rs: string, route?: string): ReviewStatus {
  if (rs === 'expert_reviewed') return 'expert_reviewed';
  if (rs === 'returned') return 'returned';
  if (rs === 'auto_pass') return 'ai_reviewed';
  if (rs === 'pending_expert' || rs === 'pending') return 'ai_reviewed';
  return 'uploaded';
}

/** 从后端加载历史上传记录 */
async function loadHistory() {
  try {
    const r = await (await fetch(`/proxy-default/api/users/${USER_ID}/history?limit=20`)).json();
    uploads.value = (r?.trials || []).map((t: any) => ({
      try_id: t.try_id,
      subject: t.subject || '',
      lesson: t.lesson || '',
      stage: t.grade_level || '',
      class_type: t.lesson_type || '',
      uploaded_at: (t.created_at || '').slice(0, 16).replace('T', ' '),
      status: mapStatus(t.review_status, t.triage_route),
      overall: t.overall_percent,
    }));
  } catch { uploads.value = []; }
}

onMounted(async () => {
  loadTeachers(); loadBindings(); loadHistory();
  // 恢复之前可能中断的任务轮询
  const savedTaskId = sessionStorage.getItem('activeTaskId');
  if (savedTaskId) {
    try {
      const t = await (await fetch(`/proxy-default/api/tasks/${savedTaskId}`)).json();
      if (t.status === 'pending' || t.status === 'running') {
        uploading.value = true;
        progress.value = t.progress || 0;
        uploadingName.value = 'AI 分析中（恢复）';
        startPolling(savedTaskId);
      } else if (t.status === 'done') {
        sessionStorage.removeItem('activeTaskId');
        message.success('分析已完成！');
        router.push({ path: '/student/report', query: { try_id: t.try_id } });
      } else {
        sessionStorage.removeItem('activeTaskId');
        if (t.error) {
          errorMsg.value = t.error;
          message.error('之前的分析失败：' + t.error);
        }
      }
    } catch { /* 任务查询失败则忽略 */ }
  }
});

onUnmounted(() => {
  // 组件卸载时清定时器，回来时 onMounted 从 sessionStorage 恢复
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
});
</script>

<template>
  <div style="max-width: 980px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <div class="flex items-center justify-between mb-3">
      <h2 style="color: #1a2b4a; margin: 0">试讲视频分析</h2>
      <span style="font-size: 13px; color: #8d9aab">上传视频 → AI 初评 → 生成报告</span>
    </div>

    <!-- 我的指导老师（线下协商一致 → 线上发起绑定 → 专家确认后发送试讲） -->
    <n-card title="我的指导老师" class="mb-3" style="border-left: 3px solid #2080f0">
      <div class="mb-2" style="font-size:13px;color:#52647d">已绑定 / 已申请状态</div>
      <div v-if="!myRequests.length && !teachers.length" style="font-size:13px;color:#8d9aab;margin-bottom:8px">
        暂无绑定。与老师线下协商一致、拿到老师提供的申请口令后，在下方输入口令发起申请，对方确认后即可发送试讲。
      </div>
      <div v-for="t in teachers" :key="t.teacher_id" class="flex items-center gap-2 mb-1" style="font-size:13px">
        <n-tag type="success" size="small" :bordered="false">已绑定</n-tag><span>{{ t.teacher_name }}</span>
      </div>
      <div v-for="r in myRequests.filter(x => x.status === 'pending')" :key="r.teacher_id" class="flex items-center gap-2 mb-1" style="font-size:13px">
        <n-tag type="warning" size="small" :bordered="false">待对方确认</n-tag><span>{{ r.teacher_name }}</span>
      </div>
      <n-divider style="margin:10px 0" />
      <div class="mb-1" style="font-size:13px;color:#52647d">输入老师给的口令，发起绑定申请</div>
      <div class="flex items-center gap-2">
        <n-input v-model:value="inviteCode" placeholder="粘贴老师线下提供的申请口令" style="max-width: 260px"
          @keyup.enter="applyByCode" />
        <n-button size="small" type="primary" ghost :disabled="!inviteCode.trim()" @click="applyByCode">申请绑定</n-button>
      </div>
      <div style="font-size:12px;color:#8d9aab;margin-top:4px">口令由老师主动提供，仅拿到口令的学生能申请到该老师，避免恶意骚扰。</div>
      <div v-if="bindMsg" style="font-size:12px;color:#2080f0;margin-top:6px">{{ bindMsg }}</div>
    </n-card>

    <!-- 上传区 -->
    <n-card title="上传新试讲" class="mb-3">
      <!-- 试讲信息（元数据，随文件提交给后端，作为评价上下文与知识库归类依据） -->
      <div class="mb-3" style="background:#fafbfc;border:1px solid #e8ecf3;border-radius:8px;padding:14px">
        <div style="font-size:13px;font-weight:600;color:#1a2b4a;margin-bottom:10px">试讲信息（必填）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px" class="upload-meta-grid">
          <n-input v-model:value="form.lesson" placeholder="课题名称，如：一次函数" />
          <n-select v-model:value="form.subject" :options="SUBJECT_OPTIONS.map(v => ({ label: v, value: v }))" placeholder="学科" />
          <n-select v-model:value="form.stage" :options="STAGE_OPTIONS.map(v => ({ label: v, value: v }))" placeholder="学段（小学/初中/高中）" />
          <n-select v-model:value="form.class_type" :options="CLASS_TYPE_OPTIONS.map(v => ({ label: v, value: v }))" placeholder="课程类型（新授课/复习课…）" />
        </div>
        <div style="font-size:12px;color:#8d9aab;margin-top:8px">将用于 AI 评价上下文、报告标题与知识库课例归类。</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <span style="font-size:13px;color:#52647d;white-space:nowrap">发送给老师</span>
          <n-select
            v-model:value="selectedTeacher"
            :options="teachers.map(t => ({ label: t.teacher_name, value: t.teacher_id }))"
            placeholder="选择已绑定的老师" style="max-width: 280px"
          />
          <span v-if="!teachers.length" style="font-size:12px;color:#f0a020">
            尚未绑定老师，请先在「我的指导老师」发起绑定
          </span>
        </div>
      </div>
      <label
        for="upload-file-input"
        style="border: 2px dashed #c9d0d9; border-radius: 8px; padding: 24px; text-align: center; background: #fafbfc; cursor: pointer; display: block"
        :style="uploading ? 'pointer-events: none; opacity: .6' : ''"
      >
        <template v-if="!uploading">
          <div style="font-size: 26px; color: #1a2b4a">＋</div>
          <div style="color: #52647d; margin-top: 4px">点击或拖拽上传试讲视频（mp4 / webm）</div>
          <div style="font-size: 12px; color: #8d9aab; margin-top: 4px">上传后自动进入 AI 初评，完成后可查看报告</div>
        </template>
        <template v-else>
          <div style="color: #52647d; margin-bottom: 8px">正在上传 {{ uploadingName }}…</div>
          <n-progress type="line" :percentage="progress" :show-indicator="true" style="max-width: 360px; margin: 0 auto" />
        </template>
      </label>
      <input id="upload-file-input" type="file" accept="video/mp4,video/webm" style="display: none" @change="onPickFile" />
      <div v-if="errorMsg" style="margin-top: 10px; padding: 10px 14px; background: #fff2f0; border: 1px solid #ffccc7; border-radius: 6px; color: #cf1322; font-size: 13px; display: flex; justify-content: space-between; align-items: center">
        <span>分析失败：{{ errorMsg }}</span>
        <n-button size="tiny" @click="errorMsg = ''">关闭</n-button>
      </div>
    </n-card>

    <!-- 上传确认弹窗（科目/标题/发送给谁，降低错发概率） -->
    <n-modal v-model:show="showConfirm" preset="dialog" title="确认发送该试讲？"
      positive-text="确认发送" negative-text="取消"
      @positive-click="onConfirmSend" @negative-click="showConfirm = false">
      <div style="padding-top: 10px; line-height: 1.9">
        <div>视频文件：<b>{{ pendingFile?.name || '—' }}</b></div>
        <div>学科：<b>{{ form.subject }}</b></div>
        <div>课题：<b>{{ form.lesson }}</b></div>
        <div>学段 / 课型：<b>{{ form.stage }} · {{ form.class_type }}</b></div>
        <div>发送给：<b>{{ teachers.find(t => t.teacher_id === selectedTeacher)?.teacher_name || selectedTeacher }}</b></div>
      </div>
    </n-modal>

    <!-- 分析状态概览 -->
    <n-grid :cols="3" :x-gap="16" class="mb-3">
      <n-card><n-statistic label="上传记录" :value="counts.total" /></n-card>
      <n-card><n-statistic label="AI 初评中/待复核" :value="counts.reviewing" /></n-card>
      <n-card><n-statistic label="已复核完成" :value="counts.done" /></n-card>
    </n-grid>

    <!-- 历史上传记录 -->
    <n-card title="历史上传记录（点击进入对应报告）">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px">
        <thead>
          <tr style="color: #52647d; text-align: left">
            <th style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">课例</th>
            <th style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">上传时间</th>
            <th style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">分析状态</th>
            <th style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in uploads" :key="r.try_id">
            <td style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">
              {{ r.subject }} · {{ r.stage }} · {{ r.class_type }}《{{ r.lesson }}》
            </td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">{{ r.uploaded_at }}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">
              <n-tag :type="statusTag(r.status).kind" size="small" :bordered="false">{{ statusTag(r.status).text }}</n-tag>
            </td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eef1f6">
              <n-button size="tiny" type="primary" text @click="openReport(r.try_id)">查看报告</n-button>
            </td>
          </tr>
        </tbody>
      </table>
      <div style="font-size: 12px; color: #8d9aab; margin-top: 6px">
        提交走真实后端 POST /api/evaluate_video（携带发送对象 expert_id）；历史记录与状态来自报告接口。
      </div>
    </n-card>
  </div>
</template>
