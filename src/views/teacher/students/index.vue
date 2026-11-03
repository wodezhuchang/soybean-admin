<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useAuthStore } from '@/store/modules/auth';

const TEACHER_ID = useAuthStore().userInfo.userId || '';

const students = ref<any[]>([]);
const loading = ref(false);
const keyword = ref('');
const sortMode = ref<'default' | 'pending' | 'regress'>('default');

const showDetail = ref(false);
const detail = ref<any>(null);
const detailLoading = ref(false);
const growth = ref<any>(null);
const history = ref<any[]>([]);
const reviews = ref<any[]>([]);
const plans = ref<any[]>([]);
const calib = ref<any>(null);
const totalChartRef = ref<HTMLDivElement | null>(null);
const dimChartRef = ref<HTMLDivElement | null>(null);

const DIM_NAMES: Record<string, string> = { D1: '教学设计', D2: '讲授语言', D3: '课堂板书', D4: '教姿教态' };
const TREND: Record<string, { text: string; cls: string; arrow: string }> = {
  up: { text: '上升', cls: 'up', arrow: '↗' },
  down: { text: '下降', cls: 'down', arrow: '↘' },
  flat: { text: '持平', cls: 'flat', arrow: '→' },
};

const list = computed(() => {
  let arr = students.value.slice();
  if (keyword.value.trim()) {
    const k = keyword.value.trim().toLowerCase();
    arr = arr.filter(s => (s.name || '').toLowerCase().includes(k) || s.user_id.toLowerCase().includes(k));
  }
  if (sortMode.value === 'pending') arr.sort((a, b) => b.pending_count - a.pending_count);
  else if (sortMode.value === 'regress') arr.sort((a, b) => a.delta - b.delta);
  return arr;
});

async function loadStudents() {
  loading.value = true;
  try {
    const res = await fetch(`/proxy-default/api/teacher/${TEACHER_ID}/students`);
    const data = await res.json();
    students.value = data?.students || [];
  } catch { students.value = []; }
  finally { loading.value = false; }
}

async function openDetail(s: any) {
  detail.value = s;
  showDetail.value = true;
  detailLoading.value = true;
  growth.value = null;
  history.value = [];
  try {
    const [g, h, rv, pl] = await Promise.all([
      fetch(`/proxy-default/api/users/${s.user_id}/growth`).then(r => r.json()),
      fetch(`/proxy-default/api/users/${s.user_id}/history?limit=20`).then(r => r.json()),
      fetch(`/proxy-default/api/students/${s.user_id}/reviews`).then(r => r.json()),
      fetch(`/proxy-default/api/students/${s.user_id}/training-plans`).then(r => r.json()),
    ]);
    growth.value = g;
    history.value = h?.trials || [];
    reviews.value = rv?.reviews || [];
    plans.value = (pl?.plans || []).map((p: any) => ({ ...p, tasks: safeParse(p.specific_tasks) }));
  } catch { /* ignore */ }
  finally { detailLoading.value = false; }
  await nextTick();
  renderTotalChart();
  renderDimChart();
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : [String(v)]; }
  catch { return s ? [s] : []; }
}

function barW(v: number): string {
  const w = Math.min(Math.abs(v || 0), 10) / 10 * 100;
  return w.toFixed(0) + '%';
}

async function loadCalib() {
  try {
    const r = await (await fetch('/proxy-default/api/calibration')).json();
    calib.value = r;
  } catch { calib.value = null; }
}

function renderTotalChart() {
  if (!totalChartRef.value || !growth.value?.points?.length) return;
  const pts = growth.value.points;
  const chart = echarts.init(totalChartRef.value);
  chart.setOption({
    title: { text: '历次试讲总分变化', textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 46, right: 20, top: 34, bottom: 28 },
    xAxis: { type: 'category', data: pts.map(p => `第${p.index}次`) },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [{
      name: '机器分',
      type: 'line', smooth: true, data: pts.map(p => p.overall),
      itemStyle: { color: '#1a2b4a' }, lineStyle: { color: '#1a2b4a', width: 2 },
      areaStyle: { color: 'rgba(26,43,74,.08)' },
      label: { show: true, position: 'top', fontSize: 10 }
    },
    {
      name: '专家复评',
      type: 'scatter',
      symbol: 'diamond',
      symbolSize: 12,
      itemStyle: { color: '#d48806' },
      data: pts.map((p, i) => (p.expert_reviewed && p.expert_overall != null ? [i, p.expert_overall] : null)).filter(Boolean),
    }]
  });
}

function renderDimChart() {
  if (!dimChartRef.value || !growth.value?.points?.length) return;
  const pts = growth.value.points;
  const chart = echarts.init(dimChartRef.value);
  chart.setOption({
    title: { text: '四维能力趋势', textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['D1', 'D2', 'D3', 'D4'] },
    grid: { left: 46, right: 20, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: pts.map(p => `第${p.index}次`) },
    yAxis: { type: 'value', min: 0, max: 5 },
    series: ['D1', 'D2', 'D3', 'D4'].map(d => ({
      name: d, type: 'line', smooth: true, data: pts.map(p => p.dims?.[d] ?? 0),
      itemStyle: { width: 2 }
    }))
  });
}

onMounted(() => { loadStudents(); loadCalib(); });
onUnmounted(() => { /* echarts 实例随 DOM 销毁 */ });
</script>

<template>
  <div class="ts-page">
    <div class="page-head">
      <div>
        <h2>学生洞察</h2>
        <p>掌握所带学生的学情与成长，复评前先看背景</p>
      </div>
      <div class="toolbar">
        <input v-model="keyword" class="search" placeholder="搜索学生姓名 / ID" />
        <div class="seg">
          <button v-for="m in [['default','全部'],['pending','待复评优先'],['regress','退步优先']]" :key="m[0]"
            type="button" :class="['seg-btn', { on: sortMode === m[0] }]" @click="sortMode = m[0] as any">
            {{ m[1] }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="calib && calib.offsets && Object.keys(calib.offsets).length" class="calib-card">
      <div class="calib-title">机器 vs 专家 · 偏差诊断</div>
      <div class="calib-sub">基于 {{ calib.sample_size }} 份专家复评 · 正 = 机器评分偏低（需上调）　负 = 机器评分偏高（需下调）</div>
      <div class="calib-bars">
        <div v-for="(v, d) in calib.offsets" :key="d" class="calib-item">
          <span class="c-key">{{ d === 'overall' ? '总分' : (DIM_NAMES[d] || d) }}</span>
          <span class="c-track"><span class="c-bar" :class="v >= 0 ? 'pos' : 'neg'" :style="{ width: barW(v) }"></span></span>
          <span class="c-val" :class="v >= 0 ? 'pos' : 'neg'">{{ v >= 0 ? '+' : '' }}{{ v }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="tip">加载中…</div>
    <div v-else-if="!list.length" class="tip empty-tip">
      <div class="big">○</div>
      <div>暂无绑定学生</div>
      <p class="sub">学生拿到你的邀请口令申请并确认后，会出现在这里</p>
    </div>

    <div v-else class="grid">
      <div v-for="s in list" :key="s.user_id" class="card" @click="openDetail(s)">
        <div class="c-head">
          <div class="c-name">{{ s.name }}</div>
          <span class="tag" :class="s.trial_count ? (s.weakest_dim ? 'warn' : 'ok') : 'none'">
            {{ s.weakest_dim ? DIM_NAMES[s.weakest_dim] : (s.trial_count ? '无短板数据' : '未试讲') }}
          </span>
        </div>
        <div class="c-score-row">
          <div class="c-score">
            <span class="num">{{ s.last_score || '—' }}</span>
            <span class="unit">分</span>
            <span v-if="s.trial_count" class="tr" :class="TREND[s.trend].cls">{{ TREND[s.trend].arrow }} {{ Math.abs(s.delta).toFixed(1) }}</span>
          </div>
          <div class="avg">均分 {{ s.avg_score }}</div>
        </div>
        <div class="c-meta">
          <div class="m"><span class="m-n">{{ s.pending_count }}</span><span class="m-l">待复评</span></div>
          <div class="m"><span class="m-n">{{ s.review_count }}</span><span class="m-l">已复评</span></div>
          <div class="m"><span class="m-n">{{ s.trial_count }}</span><span class="m-l">试讲次数</span></div>
          <div class="m"><span class="m-n last">{{ s.last_at || '—' }}</span><span class="m-l">最近</span></div>
        </div>
      </div>
    </div>

    <!-- 学生详情抽屉 -->
    <n-drawer v-model:show="showDetail" :width="680" placement="right">
      <n-drawer-content :title="detail?.name || '学生详情'" closable>
        <div v-if="detailLoading" class="tip">加载中…</div>
        <template v-else>
          <div class="d-overview">
            <div class="d-item"><span class="k">最近总分</span><span class="v big">{{ detail?.last_score || '—' }}</span></div>
            <div class="d-item"><span class="k">平均分</span><span class="v">{{ detail?.avg_score }}</span></div>
            <div class="d-item"><span class="k">待复评</span><span class="v">{{ detail?.pending_count }}</span></div>
            <div class="d-item"><span class="k">已复评</span><span class="v">{{ detail?.review_count }}</span></div>
          </div>

          <div v-if="growth?.points?.length" class="charts">
            <div ref="totalChartRef" class="chart"></div>
            <div ref="dimChartRef" class="chart"></div>
          </div>
          <div v-else class="tip empty-tip"><div class="big">○</div><div>该学生暂无试讲数据</div></div>

          <div class="sec-title">机器 vs 专家 · 复评对比</div>
          <div v-if="reviews.length" class="revlist">
            <div v-for="(rv, i) in reviews" :key="i" class="rev-row">
              <div class="rev-top">
                <span class="rev-subj">{{ rv.title || rv.subject }}</span>
                <span class="rev-score">机器 <b>{{ rv.machine_overall }}</b> → 专家 <b>{{ rv.expert_overall }}</b>
                  <em :class="rv.delta > 0 ? 'pos' : (rv.delta < 0 ? 'neg' : '')">{{ rv.delta > 0 ? '+' : '' }}{{ rv.delta }}</em>
                </span>
              </div>
              <div v-if="rv.disagree_dims.length" class="rev-dis">
                <span v-for="d in rv.disagree_dims" :key="d" class="d-tag">{{ DIM_NAMES[d] || d }}</span>
                <span class="d-tip">机器评分有分歧，请重点核实</span>
              </div>
              <div class="rev-cmt">{{ rv.comments }}</div>
              <div class="rev-time">{{ rv.reviewed_at ? rv.reviewed_at.slice(0, 10) : '' }}</div>
            </div>
          </div>
          <div v-else class="tip small-tip">暂无专家复评记录</div>

          <div class="sec-title">训练计划</div>
          <div v-if="plans.length" class="plist">
            <div v-for="(p, i) in plans" :key="i" class="plan">
              <div class="plan-head">
                <span class="plan-focus">{{ p.next_focus || '训练方向' }}</span>
                <span class="plan-status" :class="p.status">{{ p.status }}</span>
              </div>
              <div class="plan-meta">{{ p.date || '' }} · 机器 {{ p.overall_percent }} 分</div>
              <ul v-if="p.tasks && p.tasks.length" class="plan-tasks">
                <li v-for="(t, j) in p.tasks" :key="j">{{ t }}</li>
              </ul>
            </div>
          </div>
          <div v-else class="tip small-tip">暂无训练计划</div>

          <div class="sec-title">历次试讲</div>
          <div v-if="history.length" class="hlist">
            <div v-for="t in history" :key="t.try_id" class="h-row">
              <span class="h-subj">{{ t.subject || t.lesson_type || '试讲' }}</span>
              <span class="h-score">{{ t.overall_percent }} 分</span>
              <span class="h-time">{{ t.created_at ? t.created_at.slice(0, 10) : '' }}</span>
            </div>
          </div>
          <div v-else class="tip small-tip">暂无历史试讲</div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.ts-page { max-width: 1180px; margin: 0 auto; padding: 28px 32px 40px; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 22px; gap: 16px; flex-wrap: wrap; }
.page-head h2 { margin: 0; font-size: 22px; font-weight: 700; color: #16181d; }
.page-head p { color: #8a94a6; font-size: 13px; margin: 6px 0 0; }
.toolbar { display: flex; align-items: center; gap: 10px; }
.search { padding: 9px 14px; border: 1px solid #e3e7ee; border-radius: 10px; font-size: 13px; outline: none; width: 200px; }
.search:focus { border-color: #2080f0; box-shadow: 0 0 0 3px rgba(32,128,240,.1); }
.seg { display: flex; gap: 4px; background: #f2f4f7; padding: 3px; border-radius: 10px; }
.seg-btn { border: none; background: transparent; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #6b7280; cursor: pointer; }
.seg-btn.on { background: #fff; color: #1a2b4a; font-weight: 600; box-shadow: 0 1px 2px rgba(16,24,40,.08); }

.tip { color: #b6bfcc; text-align: center; padding: 60px 20px; }
.empty-tip .big { font-size: 34px; opacity: .5; margin-bottom: 8px; }
.tip .sub { font-size: 12px; color: #c3cad6; margin-top: 6px; }
.small-tip { padding: 20px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.card {
  background: #fff; border: 1px solid #eef0f4; border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16,24,40,.05); padding: 18px 18px 14px; cursor: pointer;
  transition: transform .12s, box-shadow .12s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(16,24,40,.09); }
.c-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.c-name { font-size: 16px; font-weight: 700; color: #16181d; }
.tag { font-size: 11px; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
.tag.warn { background: #fdf2f2; color: #e5484d; }
.tag.ok { background: #edf7f0; color: #18a058; }
.tag.none { background: #f2f4f7; color: #8a94a6; }
.c-score-row { margin: 14px 0 12px; }
.c-score .num { font-size: 34px; font-weight: 800; color: #1a2b4a; }
.c-score .unit { font-size: 13px; color: #8a94a6; margin-left: 3px; }
.tr { font-size: 13px; margin-left: 10px; font-weight: 600; }
.tr.up { color: #18a058; }
.tr.down { color: #e5484d; }
.tr.flat { color: #8a94a6; }
.avg { font-size: 12px; color: #8a94a6; margin-top: 4px; }
.c-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; border-top: 1px solid #f2f4f7; padding-top: 12px; }
.m { text-align: center; }
.m-n { display: block; font-size: 15px; font-weight: 700; color: #2b2f36; }
.m-n.last { font-size: 12px; font-weight: 600; color: #8a94a6; line-height: 1.8; }
.m-l { font-size: 10px; color: #a4aebc; }

/* 抽屉 */
.d-overview { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
.d-item { background: #f8fafc; border: 1px solid #eef0f4; border-radius: 10px; padding: 12px; text-align: center; }
.d-item .k { display: block; font-size: 11px; color: #8a94a6; margin-bottom: 4px; }
.d-item .v { font-size: 18px; font-weight: 700; color: #1a2b4a; }
.d-item .v.big { font-size: 24px; color: #1a2b4a; }
.charts { display: grid; gap: 16px; margin-bottom: 18px; }
.chart { height: 210px; background: #fff; border: 1px solid #f0f2f6; border-radius: 10px; padding: 6px; }
.sec-title { font-size: 14px; font-weight: 700; color: #16181d; margin: 6px 0 10px; }
.hlist { border: 1px solid #f0f2f6; border-radius: 10px; overflow: hidden; }
.h-row { display: flex; align-items: center; padding: 10px 14px; border-bottom: 1px solid #f2f4f7; font-size: 13px; }
.h-row:last-child { border-bottom: none; }
.h-subj { flex: 1; color: #2b2f36; }
.h-score { color: #1a2b4a; font-weight: 600; margin-right: 14px; }
.h-time { color: #a4aebc; font-size: 12px; }

/* 差异诊断卡 */
.calib-card {
  background: #fff; border: 1px solid #eef0f4; border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16,24,40,.05); padding: 16px 20px; margin-bottom: 20px;
}
.calib-title { font-size: 14px; font-weight: 700; color: #16181d; }
.calib-sub { font-size: 12px; color: #8a94a6; margin: 5px 0 12px; }
.calib-bars { display: flex; gap: 22px; flex-wrap: wrap; }
.calib-item { display: flex; align-items: center; gap: 8px; }
.c-key { font-size: 12px; color: #6b7280; min-width: 40px; }
.c-track { width: 120px; height: 8px; background: #f0f2f6; border-radius: 4px; overflow: hidden; }
.c-bar { display: block; height: 100%; border-radius: 4px; }
.c-bar.pos { background: #2080f0; }
.c-bar.neg { background: #e5484d; }
.c-val { font-size: 12px; font-weight: 700; min-width: 36px; }
.c-val.pos { color: #2080f0; }
.c-val.neg { color: #e5484d; }

/* 复评对比 */
.revlist { border: 1px solid #f0f2f6; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
.rev-row { padding: 12px 14px; border-bottom: 1px solid #f2f4f7; }
.rev-row:last-child { border-bottom: none; }
.rev-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.rev-subj { font-size: 13px; font-weight: 600; color: #16181d; }
.rev-score { font-size: 12px; color: #6b7280; }
.rev-score b { color: #2b2f36; }
.rev-score em { font-style: normal; font-weight: 700; margin-left: 6px; }
.rev-score em.pos { color: #18a058; }
.rev-score em.neg { color: #e5484d; }
.rev-dis { margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.d-tag { font-size: 11px; background: #fdf2f2; color: #e5484d; padding: 2px 8px; border-radius: 5px; }
.d-tip { font-size: 11px; color: #e5484d; }
.rev-cmt { font-size: 12.5px; color: #4a5160; margin-top: 7px; line-height: 1.55; }
.rev-time { font-size: 11px; color: #a4aebc; margin-top: 5px; }

/* 训练计划 */
.plist { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.plan { border: 1px solid #eef0f4; border-radius: 10px; padding: 12px 14px; background: #fbfbfd; }
.plan-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.plan-focus { font-size: 13px; font-weight: 600; color: #1a2b4a; }
.plan-status { font-size: 11px; padding: 2px 8px; border-radius: 5px; background: #f0f2f6; color: #8a94a6; }
.plan-status.completed { background: #edf7f0; color: #18a058; }
.plan-meta { font-size: 11px; color: #a4aebc; margin: 5px 0 8px; }
.plan-tasks { margin: 0; padding-left: 18px; }
.plan-tasks li { font-size: 12.5px; color: #4a5160; line-height: 1.6; }

</style>
