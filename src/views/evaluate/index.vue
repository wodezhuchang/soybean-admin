<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useAuthStore } from '@/store/modules/auth';
import * as echarts from 'echarts';

const userId = ref(useAuthStore().userInfo.userId || 'demo_user');
const subject = ref('数学');
const lesson = ref('一次函数');
const lessonType = ref('新授课');
const videoFile = ref<File | null>(null);
const asrText = ref('');
const boardText = ref('');

const loading = ref(false);
const sensingLog = ref('');
const result = ref<any>(null);
const growthData = ref<any>(null);

/** 四维度分数（D1–D4），供模板直接遍历，避免 v-for 类型推断问题 */
const dimensions = computed(() => {
  const s: any = result.value?.scores || {};
  const keys = ['D1_teaching_design', 'D2_language', 'D3_blackboard', 'D4_presence'];
  const out: { key: string; total: number }[] = [];
  for (const key of keys) {
    const v = s[key];
    if (v && typeof v === 'object' && typeof (v as any).total === 'number') {
      out.push({ key, total: Number((v as any).total) });
    }
  }
  return out;
});

const growthChartRef = ref<HTMLDivElement | null>(null);
const heatChartRef = ref<HTMLDivElement | null>(null);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  videoFile.value = input.files?.[0] || null;
}

async function runEvaluate() {
  loading.value = true;
  sensingLog.value = '';
  result.value = null;
  try {
    let r: any;
    if (videoFile.value) {
      const fd = new FormData();
      fd.append('video', videoFile.value);
      fd.append('user_id', userId.value);
      fd.append('subject', subject.value);
      fd.append('lesson', lesson.value);
      fd.append('lesson_type', lessonType.value);
      fd.append('grade_level', '初中');
      fd.append('duration_seconds', '600');
      const res = await fetch('/proxy-default/api/evaluate_video', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      r = await res.json();
      if (r.sensing_steps) {
        sensingLog.value = r.sensing_steps.map((s: any) => `${s.tool}: ${s.ok ? '✓' : '✗'}`).join(' | ');
      }
    } else {
      const res = await fetch('/proxy-default/api/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId.value, subject: subject.value, lesson: lesson.value,
          lesson_type: lessonType.value, grade_level: '初中',
          duration_seconds: 600, asr_text: asrText.value, board_text: boardText.value
        })
      });
      if (!res.ok) throw new Error(await res.text());
      r = await res.json();
    }
    result.value = r;
    await loadGrowth();
  } catch (e: any) {
    alert('评价失败: ' + e.message);
  } finally {
    loading.value = false;
  }
}

async function loadGrowth() {
  try {
    const res = await fetch(`/proxy-default/api/users/${userId.value}/growth`);
    growthData.value = await res.json();
    await nextTick();
    renderGrowthChart();
    renderHeatChart();
  } catch { /* ignore */ }
}

function renderGrowthChart() {
  if (!growthChartRef.value || !growthData.value?.points?.length) return;
  const chart = echarts.init(growthChartRef.value);
  const pts = growthData.value.points;
  chart.setOption({
    title: { text: '成长曲线（总分变化）', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: pts.map((p: any, i: number) => `第${i+1}次`) },
    yAxis: { type: 'value', min: 0, max: 100, name: '总分' },
    series: [{
      data: pts.map((p: any) => p.overall),
      type: 'line', smooth: true,
      label: { show: true, formatter: '{c}' },
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.15 },
    }]
  });
}

function renderHeatChart() {
  if (!heatChartRef.value || !growthData.value?.heatmap?.length) return;
  const chart = echarts.init(heatChartRef.value);
  const hm = growthData.value.heatmap;
  chart.setOption({
    title: { text: '短板热力图（各指标历次表现）', textStyle: { fontSize: 14 } },
    tooltip: { position: 'top' },
    grid: { height: '60%', top: '10%' },
    xAxis: { type: 'category', data: ['第1次','第2次','第3次','第4次'] },
    yAxis: { type: 'category', data: hm.map((h: any) => h.indicator) },
    visualMap: { min: 1, max: 5, calculable: true, orient: 'horizontal', left: 'center', bottom: '2%' },
    series: [{
      type: 'heatmap',
      data: hm.flatMap((row: any, i: number) =>
        row.scores.map((v: number, j: number) => [j, i, v])
      ),
      label: { show: true, formatter: (p: any) => p.value[2] },
    }]
  });
}

onMounted(loadGrowth);
</script>

<template>
  <div style="padding: 16px;">
    <n-card title="提交试讲" class="mb-4">
      <n-form label-width="80px">
        <n-grid :cols="4" :x-gap="12">
          <n-form-item label="用户ID"><n-input v-model:value="userId" @change="loadGrowth" /></n-form-item>
          <n-form-item label="学科"><n-input v-model:value="subject" /></n-form-item>
          <n-form-item label="课题"><n-input v-model:value="lesson" /></n-form-item>
          <n-form-item label="课型">
            <n-select v-model:value="lessonType" :options="[{label:'新授课',value:'新授课'},{label:'复习课',value:'复习课'}]" />
          </n-form-item>
        </n-grid>
        <n-form-item label="上传视频">
          <input type="file" accept="video/*" @change="onFileChange" />
          <div v-if="videoFile" class="text-gray-500 text-sm mt-1">已选: {{ videoFile.name }}</div>
        </n-form-item>
        <n-collapse>
          <n-collapse-item title="测试快捷路径：粘贴文本（跳过视频感知）" name="text">
            <n-form-item label="ASR文本"><n-input v-model:value="asrText" type="textarea" :rows="3" /></n-form-item>
            <n-form-item label="板书OCR"><n-input v-model:value="boardText" type="textarea" :rows="2" /></n-form-item>
          </n-collapse-item>
        </n-collapse>
        <n-button type="primary" :loading="loading" size="large" @click="runEvaluate">开始评价</n-button>
        <div v-if="sensingLog" class="mt-2 text-sm text-gray-500">感知: {{ sensingLog }}</div>
      </n-form>
    </n-card>

    <n-card v-if="result" title="评价结果" class="mb-4">
      <n-statistic label="总分" :value="result.scores?.overall_percent || 0" suffix="/100" class="mr-8" />
      <n-grid :cols="4" class="mt-4">
        <n-statistic v-for="d in dimensions" :key="d.key" :label="d.key" :value="d.total" suffix="/5" />
      </n-grid>
      <div class="mt-3">
        <div class="text-sm text-gray-500 mb-1">短板识别：</div>
        <n-tag v-for="w in result.weaknesses" :key="w" type="error" class="mr-1 mb-1">{{ w }}</n-tag>
      </div>
    </n-card>

    <n-card v-if="result?.timeline_feedback?.length" title="分段式细节评语（时间轴定位）" class="mb-4">
      <n-timeline>
        <n-timeline-item v-for="(t, i) in result.timeline_feedback" :key="i" type="info">
          <template #header>
            <b>{{ t.segment }}</b>
            <span class="text-gray-500 ml-2">{{ t.timestamp_start }} - {{ t.timestamp_end }}</span>
          </template>
          <div class="text-red-500 mb-1"><b>问题：</b>{{ t.issue }}</div>
          <div class="text-green-600"><b>建议：</b>{{ t.suggestion }}</div>
        </n-timeline-item>
      </n-timeline>
    </n-card>

    <n-card v-if="result" title="针对性训练规划" class="mb-4">
      <p><b>重点改进方向：</b>{{ result.training_plan?.next_focus }}</p>
      <ul>
        <li v-for="t in result.training_plan?.specific_tasks" :key="t">{{ t }}</li>
      </ul>
    </n-card>

    <n-card title="个人成长档案（历史追踪）">
      <div ref="growthChartRef" style="height:300px"></div>
      <div ref="heatChartRef" style="height:300px" class="mt-4"></div>
      <div v-if="!growthData?.points?.length" class="text-gray-400 text-center py-8">暂无历史记录</div>
    </n-card>
  </div>
</template>
