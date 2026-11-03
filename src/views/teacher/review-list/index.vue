<script setup lang="ts">
/**
 * 专家端 · 待复评列表（4.2）
 * 按时间排序；显示试讲标题、学科、机器总分、最低置信度维度；点击进入复评页。
 * 已接通真实后端 /api/triage/pending；接口异常时回退内置演示数据。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/modules/auth';
import type { ReviewItem } from '@/shared/types/agent';

const router = useRouter();
const USER_ID = useAuthStore().userInfo.userId || '';

const MOCK: ReviewItem[] = [
  { try_id: 'try_20261028_001', title: '一次函数', student_name: '师范生小张', subject: '数学', lesson_type: '新授课', grade_level: '初中', recorded_at: '2026-10-28 09:30', machine_overall: 67, lowest_confidence_dim: 'D2', confidence: { D1: 0.72, D2: 0.61, D3: 0.78, D4: 0.8 }, review_status: 'ai_reviewed' },
  { try_id: 'try_20261027_005', title: '光的折射', student_name: '师范生小王', subject: '物理', lesson_type: '实验课', grade_level: '高中', recorded_at: '2026-10-27 14:20', machine_overall: 72, lowest_confidence_dim: 'D4', confidence: { D1: 0.8, D2: 0.74, D3: 0.69, D4: 0.58 }, review_status: 'ai_reviewed' },
  { try_id: 'try_20261027_002', title: '静夜思', student_name: '师范生小张', subject: '语文', lesson_type: '诵读', grade_level: '小学', recorded_at: '2026-10-27 10:05', machine_overall: 64, lowest_confidence_dim: 'D3', confidence: { D1: 0.77, D2: 0.7, D3: 0.55, D4: 0.72 }, review_status: 'ai_reviewed' },
];

const items = ref<ReviewItem[]>(MOCK);

const sorted = computed(() => [...items.value].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)));

const DIM_LABEL: Record<string, string> = { D1: '教学设计', D2: '语言表达', D3: '板书', D4: '教姿' };

function openReview(item: ReviewItem) {
  router.push({ path: '/teacher/review', query: { try_id: item.try_id } });
}

/** 从真实后端待复评列表映射到 ReviewItem */
async function load() {
  try {
    const url = USER_ID
      ? `/proxy-default/api/triage/pending?expert_id=${USER_ID}`
      : '/proxy-default/api/triage/pending';
    const r = await (await fetch(url)).json();
    const trials: any[] = r?.trials || [];
    if (!trials.length) return;
    items.value = trials.map(t => ({
      try_id: t.try_id,
      title: t.lesson || (t.subject ? `${t.subject}（${t.lesson_type || '未标课型'}）` : '未记录课例'),
      student_name: t.student_name || t.user_id || '未知学生',
      subject: t.subject || '未标注',
      lesson_type: t.lesson_type || '—',
      grade_level: t.grade_level || '—',
      recorded_at: String(t.created_at || '').replace('T', ' ').slice(0, 16),
      machine_overall: t.overall_percent,
      lowest_confidence_dim: '',
      confidence: {},
      review_status: 'ai_reviewed' as const,
    })) as unknown as ReviewItem[];
  } catch { /* 后端不可用，回退 mock */ }
}

/** 绑定申请（线下协商 → 学生发起 → 专家确认） */
const bindReqs = ref<{ student_id: string; student_name: string }[]>([]);
async function loadBindings() {
  if (!USER_ID) return;
  try {
    const r = await (await fetch(`/proxy-default/api/bindings/requests?teacher_id=${USER_ID}&status=pending`)).json();
    bindReqs.value = (r?.requests || []).map((b: any) => ({
      student_id: b.student_id,
      student_name: b.student_name || b.student_id,
    }));
  } catch { bindReqs.value = []; }
}
async function acceptBinding(studentId: string) {
  await fetch('/proxy-default/api/bindings/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_id: USER_ID, student_id: studentId }),
  });
  await loadBindings();
}
async function rejectBinding(studentId: string) {
  await fetch('/proxy-default/api/bindings/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_id: USER_ID, student_id: studentId }),
  });
  await loadBindings();
}

/** 我的邀请口令（线下告知指定学生，学生凭口令申请绑定） */
const inviteCode = ref('');
async function loadInviteCode() {
  if (!USER_ID) return;
  try {
    const r = await (await fetch(`/proxy-default/api/users/${USER_ID}/invite-code`)).json();
    inviteCode.value = r?.invite_code || '';
  } catch { inviteCode.value = ''; }
}
async function copyInvite() {
  if (!inviteCode.value) return;
  try {
    await navigator.clipboard.writeText(inviteCode.value);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = inviteCode.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

onMounted(() => { load(); loadBindings(); loadInviteCode(); });
</script>

<template>
  <div style="max-width: 1080px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <div class="flex items-center justify-between mb-3">
      <h2 style="color: #1a2b4a; margin: 0">专家工作台 · 待复评列表</h2>
      <n-tag type="warning" size="small">{{ sorted.length }} 条待复核</n-tag>
    </div>

    <!-- 我的邀请口令（线下告知指定学生；学生端不显示老师池，凭口令申请） -->
    <n-card title="我的邀请口令" class="mb-3" style="border-left: 3px solid #18a058">
      <div class="flex items-center gap-2" style="font-size: 15px">
        <b style="letter-spacing: 2px; color: #1a2b4a">{{ inviteCode || '—' }}</b>
        <n-button size="tiny" :disabled="!inviteCode" @click="copyInvite">复制口令</n-button>
      </div>
      <div style="font-size: 12px; color: #8d9aab; margin-top: 4px">
        线下把口令告知你指定的学生；学生输入口令才会向你发起绑定申请（学生端看不到全部老师，避免恶意骚扰）。
      </div>
    </n-card>

    <n-card v-if="bindReqs.length" title="绑定申请（待确认）" class="mb-3" style="border-left: 3px solid #f0a020">
      <div v-for="b in bindReqs" :key="b.student_id" class="flex items-center justify-between mb-2" style="border-bottom: 1px dashed #eef1f6; padding-bottom: 8px">
        <span><b style="color:#1a2b4a">{{ b.student_name }}</b> 申请与你建立师生绑定</span>
        <div class="flex gap-2">
          <n-button size="small" type="primary" @click="acceptBinding(b.student_id)">确认绑定</n-button>
          <n-button size="small" @click="rejectBinding(b.student_id)">拒绝</n-button>
        </div>
      </div>
    </n-card>

    <n-card>
      <table class="rv">
        <thead>
          <tr>
            <th>学生</th>
            <th>试讲标题</th>
            <th>学科</th>
            <th>类型</th>
            <th>机器总分</th>
            <th>最低置信度</th>
            <th>提交时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in sorted" :key="it.try_id">
            <td>{{ it.student_name }}</td>
            <td><b style="color: #1a2b4a">{{ it.title }}</b></td>
            <td>{{ it.subject }}</td>
            <td>{{ it.lesson_type }}</td>
            <td>
              <b style="color: #1a2b4a">{{ it.machine_overall }}</b>
              <span style="color: #8d9aab">/100</span>
            </td>
            <td><template v-if="it.lowest_confidence_dim"><n-tag type="error" size="small">{{ it.lowest_confidence_dim }} {{ DIM_LABEL[it.lowest_confidence_dim] }}</n-tag><span style="color: #8d9aab; font-size: 12px; margin-left: 4px">置信 {{ (it.confidence[it.lowest_confidence_dim] * 100).toFixed(0) }}%</span></template><span v-else style="color: #8d9aab">—</span></td>
            <td style="color: #52647d">{{ it.recorded_at }}</td>
            <td>
              <n-button type="primary" size="small" @click="openReview(it)">去复核</n-button>
            </td>
          </tr>
        </tbody>
      </table>
    </n-card>

    <p style="color: #8d9aab; font-size: 12px; margin-top: 10px">
      接入后端后替换为 fetch(`/api/expert/pending`)。排序规则：按提交时间倒序；未复评列表实时更新。
    </p>
  </div>
</template>

<style scoped>
.rv {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rv th, .rv td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid #eef1f6;
}
.rv th {
  color: #52647d;
  font-weight: 600;
  background: #fafbfc;
}
.rv tr:hover td {
  background: #fafbfc;
}
</style>
