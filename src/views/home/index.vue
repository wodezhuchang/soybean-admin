<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/store/modules/auth';

const authStore = useAuthStore();

const role = computed(() => authStore.userInfo.role || 'admin');
const uid = computed(() => authStore.userInfo.userId || 'demo_user');
const userName = computed(() => authStore.userInfo.userName || '访客');
const isSandbox = computed(() => authStore.userInfo.accountType === 'sandbox');

// admin 全局数据
const globalStats = ref({ students: 0, pending: 0, docs: 0, traces: 0 });
// student 概览
const studentStats = ref<{ trials: number; lastScore: number; trend: string; recent: any }>({
  trials: 0,
  lastScore: 0,
  trend: '—',
  recent: null
});
// teacher 概览
const teacherStats = ref({ pending: 0, classAvg: 0, classSize: 0, docs: 0 });

const pipelineSteps = [
  { title: '上传试讲', desc: '视频/文本' },
  { title: '多模态感知', desc: 'ASR·OCR·姿态' },
  { title: 'AI 初评', desc: '四维量表' },
  { title: '专家复核', desc: '人机协同' },
  { title: '知识库回流', desc: 'RAG 沉淀' }
];

const roleLabel = computed(() =>
  role.value === 'admin' ? '全知全能' : role.value === 'teacher' ? '教师' : '师范生'
);

onMounted(async () => {
  try {
    if (role.value === 'admin') {
      const [cls, pd, kb, tr] = await Promise.all([
        fetch('/proxy-default/api/dashboard/class').then(r => r.json()),
        fetch('/proxy-default/api/triage/pending').then(r => r.json()),
        fetch('/proxy-default/api/kb/documents').then(r => r.json()),
        fetch('/proxy-default/api/traces').then(r => r.json())
      ]);
      globalStats.value = {
        students: (cls.students || []).length,
        pending: pd.count || 0,
        docs: (kb.documents || []).length,
        traces: tr.count || 0
      };
    } else if (role.value === 'student') {
      const h = await fetch(`/proxy-default/api/users/${uid.value}/history?limit=5`).then(r => r.json());
      studentStats.value.trials = h.count || 0;
      if (h.trials?.length) {
        const latest = h.trials[0];
        const rep = await fetch(`/proxy-default/api/try/${latest.try_id}`).then(r => r.json());
        studentStats.value.lastScore = rep?.scores?.overall_percent ?? 0;
        studentStats.value.recent = rep;
        const g = await fetch(`/proxy-default/api/users/${uid.value}/growth`).then(r => r.json());
        const pts = g.points || [];
        if (pts.length > 1) {
          const diff = pts[pts.length - 1].overall - pts[pts.length - 2].overall;
          studentStats.value.trend = diff > 0 ? '↑ 稳步进步' : diff < 0 ? '↓ 需关注' : '→ 平稳保持';
        }
      }
    } else if (role.value === 'teacher') {
      const [pd, cls, kb] = await Promise.all([
        fetch(`/proxy-default/api/triage/pending?expert_id=${uid.value}`).then(r => r.json()),
        fetch('/proxy-default/api/dashboard/class').then(r => r.json()),
        fetch('/proxy-default/api/kb/documents').then(r => r.json())
      ]);
      teacherStats.value = {
        pending: pd.count || 0,
        classAvg: cls.class_avg || 0,
        classSize: (cls.students || []).length,
        docs: (kb.documents || []).length
      };
    }
  } catch {
    /* 数据加载失败时保留默认占位 */
  }
});
</script>

<template>
  <div style="padding: 16px">
    <div class="mb-4 flex items-center gap-2">
      <h2 style="font-size: 20px; margin: 0">师范生试讲智能评价 Agent</h2>
      <n-tag v-if="isSandbox" type="warning" size="small">测试账号</n-tag>
      <n-tag :type="role === 'admin' ? 'info' : role === 'teacher' ? 'success' : 'primary'" size="small">
        {{ roleLabel }}
      </n-tag>
    </div>

    <!-- 全知全能：系统全景导览 -->
    <div v-if="role === 'admin'">
      <n-card class="mb-4">
        <n-alert type="info" :show-icon="false" title="系统定位"
          content="面向师范生试讲训练的智能评价 Agent：上传试讲 → 多模态感知 → AI 四维初评 → 专家人机协同复核 → 知识库回流，形成完整练习闭环。" />
      </n-card>

      <n-card title="全链路处理流程" class="mb-4">
        <n-steps :current="4" class="mt-2">
          <n-step v-for="s in pipelineSteps" :key="s.title" :title="s.title" :description="s.desc" />
        </n-steps>
      </n-card>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px">
        <n-card><n-statistic label="学生总数" :value="globalStats.students" /></n-card>
        <n-card><n-statistic label="待专家复核" :value="globalStats.pending" /></n-card>
        <n-card><n-statistic label="知识库文档" :value="globalStats.docs" /></n-card>
        <n-card><n-statistic label="评价链路轨迹" :value="globalStats.traces" /></n-card>
      </div>

      <n-card title="三角色功能入口">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
          <n-card title="师范生端" :bordered="false" style="background: #f8fafc">
            <n-statistic label="我的试讲与成长" :value="globalStats.students" />
            <n-button type="primary" size="small" class="mt-3" @click="$router.push('/student/workbench')">
              进入学生工作台
            </n-button>
          </n-card>
          <n-card title="教师端" :bordered="false" style="background: #f8fafc">
            <n-statistic label="待复核意见" :value="globalStats.pending" />
            <n-button type="success" size="small" class="mt-3" @click="$router.push('/teacher/review-list')">
              进入教师复核
            </n-button>
          </n-card>
          <n-card title="知识库治理" :bordered="false" style="background: #f8fafc">
            <n-statistic label="课标/量表/课例" :value="globalStats.docs" />
            <n-button size="small" class="mt-3" @click="$router.push('/knowledge')">
              进入知识库
            </n-button>
          </n-card>
        </div>
      </n-card>
    </div>

    <!-- 师范生：工作台概览 -->
    <div v-if="role === 'student'">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px">
        <n-card><n-statistic label="累计试讲" :value="studentStats.trials" /></n-card>
        <n-card><n-statistic label="最近一次总分" :value="studentStats.lastScore" /></n-card>
        <n-card><n-statistic label="成长趋势" :value="studentStats.trend" /></n-card>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px">
        <n-card title="最近一次报告">
          <div v-if="studentStats.recent" class="text-sm">
            <div class="mb-2">
              <span class="text-xl font-medium" style="color:#18a058">{{ studentStats.lastScore }}</span>
              <span class="text-gray-400 ml-2">分</span>
            </div>
            <div v-if="studentStats.recent.weaknesses?.length" class="text-gray-600">
              仍需关注：{{ studentStats.recent.weaknesses.slice(0, 2).join('、') }}
            </div>
            <n-button size="small" type="primary" class="mt-3"
              @click="$router.push({ path: '/student/report', query: { try_id: studentStats.recent.meta?.try_id || studentStats.recent.try_id } })">
              查看详细报告
            </n-button>
          </div>
          <n-empty v-else description="暂无试讲记录，上传你的第一次试讲吧" size="small" />
        </n-card>
        <n-card title="快捷动作">
          <div class="flex flex-col gap-2">
            <n-button type="primary" block @click="$router.push('/student/upload')">上传新试讲</n-button>
            <n-button block @click="$router.push('/student/growth')">查看成长曲线</n-button>
            <n-button block @click="$router.push('/student/workbench')">打开工作台</n-button>
          </div>
        </n-card>
      </div>
    </div>

    <!-- 教师：看板 -->
    <div v-if="role === 'teacher'">
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px">
        <n-card><n-statistic label="推给我的待复核" :value="teacherStats.pending" /></n-card>
        <n-card><n-statistic label="班级平均分" :value="teacherStats.classAvg" /></n-card>
        <n-card><n-statistic label="学生人数" :value="teacherStats.classSize" /></n-card>
        <n-card><n-statistic label="知识库文档" :value="teacherStats.docs" /></n-card>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px">
        <n-card title="待复核清单">
          <div class="text-sm text-gray-600 mb-3">
            共 <span class="font-medium">{{ teacherStats.pending }}</span> 条待专家复核的试讲评价
          </div>
          <n-button type="success" @click="$router.push('/teacher/review-list')">前往复核清单</n-button>
        </n-card>
        <n-card title="快捷动作">
          <div class="flex flex-col gap-2">
            <n-button block @click="$router.push('/teacher/students')">学生洞察</n-button>
            <n-button block @click="$router.push('/teacher/dashboard')">班级学情看板</n-button>
            <n-button block @click="$router.push('/knowledge')">知识库管理</n-button>
          </div>
        </n-card>
      </div>
    </div>
  </div>
</template>
