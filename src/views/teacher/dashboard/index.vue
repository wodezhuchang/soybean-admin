<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts';

const DIM_NAMES: Record<string, string> = { D1: '教学设计', D2: '讲授语言', D3: '课堂板书', D4: '教姿教态' };

const classStats = ref({ avg: 0, dims: {} as Record<string, number>, trend: [] as any[], students: [] as any[] });
const radarRef = ref<HTMLDivElement | null>(null);
const trendRef = ref<HTMLDivElement | null>(null);
const distRef = ref<HTMLDivElement | null>(null);

// 集体弱项：低于2.5分的维度
const weakDims = computed(() =>
  Object.entries(classStats.value.dims).filter(([_, v]) => v < 2.5).map(([k, v]) => ({ dim: k, score: v }))
);

// 弱项学生名单：按弱维度分组，列出该维度为最弱维的学生
const weakStudents = computed(() => {
  const out: Record<string, any[]> = {};
  for (const w of weakDims.value) {
    const list = classStats.value.students.filter(s => s.weakest_dim === w.dim);
    if (list.length) out[w.dim] = list;
  }
  return out;
});

onMounted(async () => {
  try {
    const res = await fetch('/proxy-default/api/dashboard/class');
    const data = await res.json();
    classStats.value = {
      avg: data.class_avg,
      dims: data.dim_avg,
      trend: data.class_trend || [],
      students: data.students || []
    };
    await nextTick();
    // 布局需要额外帧才确定容器宽度，双 rAF 确保 echarts init 拿到真实尺寸
    requestAnimationFrame(() => requestAnimationFrame(renderAll));
  } catch { /* ignore */ }
});

/** 安全挂载/更新图表：同一 DOM 重复调用不报错 */
function mountChart(el: HTMLElement | null, option: any) {
  if (!el) return;
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el);
  chart.setOption(option);
}

/** 容器宽度为 0 时轮询重试，避免布局未确定导致空白图 */
function ensureSize(el: HTMLElement | null, cb: () => void, tries = 0) {
  if (!el) { cb(); return; }
  if (el.offsetWidth > 0 || tries > 8) { cb(); return; }
  setTimeout(() => ensureSize(el, cb, tries + 1), 60);
}

function renderAll() {
  ensureSize(radarRef.value, () => renderRadar());
  ensureSize(trendRef.value, () => renderTrend());
  ensureSize(distRef.value, () => renderDist());
}

function renderRadar() {
  if (!radarRef.value) return;
  const d = classStats.value.dims;
  mountChart(radarRef.value, {
    tooltip: {},
    radar: {
      indicator: [
        { name: 'D1 教学设计', max: 5 },
        { name: 'D2 语言表达', max: 5 },
        { name: 'D3 板书规范', max: 5 },
        { name: 'D4 教姿教态', max: 5 }
      ]
    },
    series: [{
      type: 'radar',
      data: [{ value: [d.D1, d.D2, d.D3, d.D4], name: '班级均分', areaStyle: { opacity: 0.3 } }]
    }]
  });
}

function renderTrend() {
  if (!trendRef.value || !classStats.value.trend.length) return;
  const t = classStats.value.trend;
  mountChart(trendRef.value, {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: t.map(p => p.date), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [{
      type: 'line', smooth: true, data: t.map(p => p.avg),
      itemStyle: { color: '#1a2b4a' }, lineStyle: { color: '#1a2b4a', width: 2 },
      areaStyle: { color: 'rgba(26,43,74,.08)' },
      label: { show: true, position: 'top', fontSize: 10 }
    }]
  });
}

function renderDist() {
  if (!distRef.value || !classStats.value.students.length) return;
  const s = classStats.value.students.map(x => x.last_score);
  const bins = [['<40', 0, 40], ['40-60', 40, 60], ['60-80', 60, 80], ['80+', 80, 100]];
  const data = bins.map(([label, lo, hi]) => {
    const loN = lo as number, hiN = hi as number;
    return { label, n: s.filter(v => v >= loN && v < hiN).length };
  });
  mountChart(distRef.value, {
    tooltip: {},
    grid: { left: 40, right: 20, top: 26, bottom: 28 },
    xAxis: { type: 'category', data: data.map(x => x.label) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar', data: data.map(x => x.n), barWidth: '46%',
      label: { show: true, position: 'top' },
      itemStyle: { color: '#18a058', borderRadius: [4, 4, 0, 0] }
    }]
  });
}
</script>

<template>
  <div class="dash-page">
    <div class="page-head">
      <div class="ph-title">
        <h2>班级学情看板</h2>
        <p>班级整体水平分析 · 宏观视角（个体详情见「学生洞察」）</p>
      </div>
      <n-button type="primary" @click="$router.push('/teacher/students')">进入学生洞察</n-button>
    </div>

    <!-- 概览 -->
    <section class="sec">
      <div class="sec-head"><h3>班级概览</h3></div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="st-label">学生人数</div>
          <div class="st-value">{{ classStats.students.length }}</div>
          <div class="st-sub">已绑定本班学生</div>
        </div>
        <div class="stat-card">
          <div class="st-label">班级平均分</div>
          <div class="st-value">{{ classStats.avg }}</div>
          <div class="st-sub">最近一次试讲均分</div>
        </div>
        <div class="stat-card">
          <div class="st-label">集体弱项（维度分低于 2.5）</div>
          <div class="st-tags" v-if="weakDims.length">
            <span v-for="w in weakDims" :key="w.dim" class="tag">{{ DIM_NAMES[w.dim] }} {{ w.score }}</span>
          </div>
          <div v-else class="st-ok">各维度均达标</div>
        </div>
      </div>
    </section>

    <!-- 能力与趋势 -->
    <section class="sec">
      <div class="sec-head"><h3>能力与趋势</h3></div>
      <div class="chart-grid">
        <div class="panel">
          <div class="panel-title">班级四维能力雷达</div>
          <div ref="radarRef" class="chart"></div>
        </div>
        <div class="panel">
          <div class="panel-title">班级整体水平趋势</div>
          <div ref="trendRef" class="chart"></div>
        </div>
      </div>
    </section>

    <!-- 分布与弱项名单 -->
    <section class="sec">
      <div class="sec-head"><h3>分布与弱项名单</h3></div>
      <div class="chart-grid">
        <div class="panel">
          <div class="panel-title">学生最近总分分布</div>
          <div ref="distRef" class="chart"></div>
        </div>
        <div class="panel">
          <div class="panel-title">弱项学生名单</div>
          <div v-if="Object.keys(weakStudents).length" class="wk-list">
            <div v-for="(list, d) in weakStudents" :key="d" class="wk-group">
              <div class="wk-dim">{{ DIM_NAMES[d] || d }} <span class="wk-count">{{ list.length }} 人</span></div>
              <div class="wk-row" v-for="s in list" :key="s.user_id" @click="$router.push('/teacher/students')">
                <span class="wk-name">{{ s.user_id }}</span>
                <span class="wk-score">{{ s.last_score }} 分</span>
              </div>
            </div>
          </div>
          <div v-else-if="classStats.students.length" class="wk-empty">暂无集体弱项维度</div>
          <div v-else class="wk-empty">暂无学生数据</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash-page {
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 40px 48px;
  box-sizing: border-box;
}

/* 页头 */
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 28px;
}
.ph-title h2 { color: #16181d; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: .3px; }
.ph-title p { color: #8a94a6; font-size: 13px; margin: 6px 0 0; }

/* 区块 */
.sec { margin-bottom: 34px; }
.sec-head { margin-bottom: 14px; }
.sec-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #16181d;
  padding-left: 12px;
  position: relative;
}
.sec-head h3::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 2px;
  background: #1a2b4a;
}

/* 概览统计卡 */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.stat-card {
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .05);
  padding: 20px 22px 18px;
}
.st-label { font-size: 13px; color: #8a94a6; font-weight: 600; }
.st-value { font-size: 34px; font-weight: 800; color: #1a2b4a; margin-top: 8px; line-height: 1.1; }
.st-sub { font-size: 11px; color: #b6bfcc; margin-top: 8px; }
.st-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tag {
  background: #fef0f0;
  color: #e5484d;
  border: 1px solid #fde2e2;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
}
.st-ok { color: #18a058; font-size: 13px; margin-top: 14px; font-weight: 600; }

/* 图表面板 */
.chart-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.panel {
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .05);
  padding: 16px 18px 14px;
}
.panel-title { font-size: 14px; font-weight: 700; color: #16181d; margin-bottom: 8px; }
.chart { height: 320px; }

/* 弱项名单 */
.wk-list { display: flex; flex-direction: column; gap: 12px; }
.wk-group { border: 1px solid #f0f2f6; border-radius: 10px; padding: 10px 12px; }
.wk-dim { font-size: 13px; font-weight: 600; color: #e5484d; margin-bottom: 6px; }
.wk-count { font-size: 11px; color: #a4aebc; font-weight: 500; }
.wk-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.wk-row:hover { background: #f6f7f9; }
.wk-name { font-size: 13px; color: #2b2f36; }
.wk-score { font-size: 12px; color: #8a94a6; }
.wk-empty { color: #b6bfcc; text-align: center; padding: 30px 0; font-size: 13px; }

@media (max-width: 900px) {
  .stat-grid, .chart-grid { grid-template-columns: 1fr; }
  .dash-page { padding: 20px; }
}
</style>
