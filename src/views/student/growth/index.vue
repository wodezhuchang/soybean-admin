<script setup lang="ts">
/**
 * 学生端 · 成长曲线页（4.1）
 * 始终用机器分画趋势线；专家复评过的点加小标记（离散点）。
 * 已接通真实后端 /api/users/{uid}/growth；接口异常时回退到内置演示数据。
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/modules/auth';
import * as echarts from 'echarts';
import type { GrowthPoint } from '@/shared/types/agent';

const router = useRouter();

const USER_ID = useAuthStore().userInfo.userId || 'demo_user';

/** 点击数据点/记录行 → 跳转对应课例报告（report 已按 try_id 参数化） */
function goReport(try_id: string) {
  router.push({ path: '/student/report', query: { try_id } });
}

const points = ref<GrowthPoint[]>([]);
const chartRef = ref<HTMLDivElement | null>(null);
const current = computed(() => points.value[points.value.length - 1]);

const labels = computed(() => points.value.map(p => p.recorded_at));
const machine = computed(() => points.value.map(p => p.machine_overall));
/** 专家复评点（散点，[类别索引, 专家分]） */
const expertMarked = computed<[number, number][]>(() =>
  points.value
    .map((p, i) => (p.expert_reviewed && p.expert_overall != null ? [i, p.expert_overall] as [number, number] : null))
    .filter((x): x is [number, number] => x !== null),
);

/** 从后端真实 growth 数据映射到 GrowthPoint */
function mapPoints(raw: any[]): GrowthPoint[] {
  return (raw || []).map((p: any) => ({
    try_id: p.try_id,
    recorded_at: p.date,
    machine_overall: Number(p.overall) || 0,
    expert_overall: p.expert_overall != null ? Number(p.expert_overall) : null,
    expert_reviewed: Boolean(p.expert_reviewed),
  }));
}

function renderChart() {
  if (!chartRef.value) return;
  const chart = echarts.init(chartRef.value);
  chart.setOption({
    title: { text: '成长曲线（机器分）', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const idx = params[0].dataIndex;
        const p = points.value[idx];
        if (!p) return '';
        let html = `<b>第${idx + 1}次</b> · ${p.recorded_at}<br/>`;
        html += `机器分：<b>${p.machine_overall}</b><br/>`;
        if (p.expert_overall != null) html += `专家复评：<b style="color:#C8861A">${p.expert_overall}</b><br/>`;
        html += `<span style="color:#8d9aab;font-size:11px">${p.try_id}</span>`;
        return html;
      },
    },
    legend: { bottom: 0, data: ['机器分', '专家复评点'] },
    grid: { left: 40, right: 20, top: 40, bottom: 44 },
    xAxis: { type: 'category', data: points.value.map((_, i) => `第${i + 1}次`) },
    yAxis: { type: 'value', min: 0, max: 100, name: '百分制' },
    series: [
      {
        name: '机器分',
        type: 'line',
        data: machine.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#1A2B4A' },
        lineStyle: { color: '#1A2B4A', width: 2 },
        label: { show: true, formatter: (p: any) => p.value, fontSize: 10 },
        markPoint: {
          data: [{ type: 'max', name: '最高' }],
          symbolSize: 50,
          label: { fontSize: 11 },
        },
      },
      {
        name: '专家复评点',
        type: 'scatter',
        data: expertMarked.value,
        xAxisIndex: 0,
        symbol: 'diamond',
        symbolSize: 12,
        itemStyle: { color: '#C8861A' },
      },
    ],
  });
  // 数据点点击 → 跳对应报告
  chart.on('click', (params: any) => {
    const idx = params.seriesType === 'scatter'
      ? (params.data && params.data[0] as number)
      : (params.dataIndex as number);
    const p = points.value[idx];
    if (p) goReport(p.try_id);
  });
}

async function load() {
  try {
    const res = await fetch(`/proxy-default/api/users/${USER_ID}/growth`);
    const data = await res.json();
    points.value = mapPoints(data?.points || []);
  } catch (e: any) {
    // 后端不可用时回退内置演示数据，保证页面可展示
    points.value = [
      { try_id: 'try_20261014_004', recorded_at: '2026-10-14', machine_overall: 72, expert_reviewed: true },
      { try_id: 'try_20261028_001', recorded_at: '2026-10-28', machine_overall: 67, expert_reviewed: true },
    ];
  }
}

onMounted(async () => {
  await load();
  await nextTick();
  renderChart();
});
</script>

<template>
  <div style="max-width: 980px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <div class="flex items-center justify-between mb-3">
      <h2 style="color: #1a2b4a; margin: 0">成长曲线</h2>
      <div class="text-sm text-gray-500">
        <template v-if="points.length">
          当前：<b style="color: #1a2b4a">{{ current.machine_overall }}/100</b>
          <template v-if="points.length >= 2">
            · 较上次 <span style="color: #2e7d32">{{ (current.machine_overall - points[points.length - 2].machine_overall).toFixed(1) }}</span>
          </template>
        </template>
        <span v-else style="color:#8d9aab">暂无历史评价数据</span>
      </div>
    </div>

    <n-card>
      <div ref="chartRef" style="width: 100%; height: 380px" />
      <div style="font-size: 12px; color: #8d9aab; margin-top: 6px">
        折线始终为机器分；菱形点为专家复评过的试讲。点击数据点或下方记录可查看对应报告。接入后端后按 /api/user/{id}/growth 渲染真实记录。
      </div>
    </n-card>

    <n-card title="历次记录（点击进入对应报告）" class="mt-3">
      <table class="gt">
        <thead>
          <tr><th>试讲</th><th>日期</th><th>机器分</th><th>专家复评</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in [...points].reverse()" :key="p.try_id" style="cursor: pointer" @click="goReport(p.try_id)">
            <td>{{ p.try_id }}</td>
            <td>{{ p.recorded_at }}</td>
            <td><b style="color: #1a2b4a">{{ p.machine_overall }}</b></td>
            <td>{{ p.expert_reviewed ? '已复评' : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </n-card>
  </div>
</template>

<style scoped>
.gt {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.gt th, .gt td {
  text-align: left;
  padding: 7px 10px;
  border-bottom: 1px solid #eef1f6;
}
.gt th {
  color: #52647d;
  font-weight: 600;
}
</style>
