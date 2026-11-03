<script setup lang="ts">
/**
 * 知识库 · RAG 管理 / 检索 UI（改造版）
 * 职责：概览分布 + 文档管理（筛选/检索/删除）+ 语义检索（召回可视化/关键词高亮/来源标注）。
 * 入库脚本自动化另行排期：上传仅保存到 uploaded 目录，按钮 disabled 并标注待后端 /api/kb/index 接口。
 * 数据来自后端 /api/kb/*（Chroma 聚合）。
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useMessage } from 'naive-ui';
import * as echarts from 'echarts';

const message = useMessage();

// ---------------- 数据 ----------------
const docs = ref<any[]>([]);
const loading = ref(false);
const totalChunks = ref(0);
const uploading = ref(false);

// 检索
const searchQuery = ref('');
const searchResult = ref<any>(null);
const searching = ref(false);
const searchElapsed = ref(0);

// 待入库文件 / 增量入库
const uploads = ref<any[]>([]);
const uploadsLoading = ref(false);
const indexing = ref(false);
const indexResult = ref<any>(null);

// 文档筛选
const typeFilter = ref<'all' | string>('all');
const subjectFilter = ref('all');
const docSearch = ref('');

const typeMap: Record<string, { label: string; tag: 'info' | 'success' | 'warning' | 'default' }> = {
  // 键与后端实际写入的 doc_type 对齐（kb_manager.classify_doc 产物 + rule/未知兜底）
  curriculum: { label: '课标', tag: 'info' },
  rubric: { label: '评课量表', tag: 'success' },
  case: { label: '优秀课例', tag: 'warning' },
  rule: { label: '评课细则', tag: 'default' },
  general: { label: '通用', tag: 'default' },
  '?': { label: '未分类', tag: 'default' },
};

/** 检索结果（含距离→相似度） */
const searchResults = computed<any[]>(() => (searchResult.value?.results as any[]) || []);

const subjects = computed<string[]>(() => {
  const set = new Set<string>();
  docs.value.forEach(d => { if (d.subject && d.subject !== '?') set.add(d.subject); });
  return Array.from(set);
});

const filteredDocs = computed(() =>
  docs.value.filter(d =>
    (typeFilter.value === 'all' || d.type === typeFilter.value) &&
    (subjectFilter.value === 'all' || d.subject === subjectFilter.value) &&
    (!docSearch.value || (d.name || '').toLowerCase().includes(docSearch.value.toLowerCase())),
  ),
);

/** 类型 / 学科分布（用于图表） */
const typeDist = computed(() => {
  const m: Record<string, number> = {};
  docs.value.forEach(d => { m[d.type] = (m[d.type] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => ({ name: typeMap[k]?.label || '其他', value: v }));
});
const subjectDist = computed(() => {
  const m: Record<string, number> = {};
  docs.value.forEach(d => { const s = d.subject && d.subject !== '?' ? d.subject : '未知'; m[s] = (m[s] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => ({ name: k, value: v }));
});

// ---------------- 请求 ----------------
async function loadDocs() {
  loading.value = true;
  try {
    const res = await fetch('/proxy-default/api/kb/documents');
    const data = await res.json();
    docs.value = data.documents || [];
    totalChunks.value = docs.value.reduce((s, d) => s + (d.chunks || 0), 0);
    await nextTick();
    renderDist();
  } catch (e: any) {
    message.error('加载失败: ' + e.message);
  } finally { loading.value = false; }
}

async function doSearch() {
  if (!searchQuery.value.trim()) return;
  searching.value = true;
  searchResult.value = null;
  const t0 = performance.now();
  try {
    const res = await fetch('/proxy-default/api/kb/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery.value, top_k: 5 }),
    });
    searchResult.value = await res.json();
    searchElapsed.value = Math.round(performance.now() - t0);
  } catch (e: any) {
    message.error('检索失败: ' + e.message);
  } finally { searching.value = false; }
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/proxy-default/api/kb/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
      message.success(`「${data.filename}」已保存到待入库目录`);
      loadUploads();
    }
  } catch (e: any) {
    message.error('上传失败: ' + e.message);
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

/** 待入库清单：当前上传目录里有什么 */
async function loadUploads() {
  uploadsLoading.value = true;
  try {
    const res = await fetch('/proxy-default/api/kb/uploads');
    const data = await res.json();
    uploads.value = data.uploads || [];
  } catch (e: any) {
    message.error('加载待入库列表失败: ' + e.message);
  } finally { uploadsLoading.value = false; }
}

/** 增量入库：扫描待入库目录，新增/变更文件写入向量库 */
async function doIndex() {
  indexing.value = true;
  indexResult.value = null;
  try {
    const res = await fetch('/proxy-default/api/kb/index', { method: 'POST' });
    indexResult.value = await res.json();
    message.success(`增量入库完成：新增/更新 ${indexResult.value?.indexed?.length || 0} 个文件`);
    loadUploads();
    loadDocs();
  } catch (e: any) {
    message.error('增量入库失败: ' + e.message);
  } finally { indexing.value = false; }
}

/** 撤销上传：删除待入库目录中尚未入库的文件 */
async function revokeUpload(name: string) {
  if (!confirm(`撤销上传「${name}」？该文件尚未入库，将从待入库目录移除。`)) return;
  try {
    await fetch(`/proxy-default/api/kb/uploads/${encodeURIComponent(name)}`, { method: 'DELETE' });
    message.success('已撤销上传');
    loadUploads();
  } catch (e: any) {
    message.error('撤销失败: ' + e.message);
  }
}

async function onDelete(row: any) {
  if (!confirm(`确认从知识库撤销入库 ${row.name}？将删除该文档的全部向量片段。`)) return;
  try {
    await fetch(`/proxy-default/api/kb/documents/${encodeURIComponent(row.name)}`, { method: 'DELETE' });
    message.success('已撤销入库');
    loadDocs();
  } catch (e: any) {
    message.error('撤销失败: ' + e.message);
  }
}

// ---------------- 图表 ----------------
const distRef = ref<HTMLDivElement | null>(null);
function renderDist() {
  if (!distRef.value) return;
  const chart = echarts.init(distRef.value);
  chart.setOption({
    title: { text: '知识库构成（按类型）', left: 'center', textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 30, right: 16, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: typeDist.value.map(d => d.name) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar', data: typeDist.value.map(d => d.value), barWidth: '42%',
      itemStyle: { color: '#1A2B4A', borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: 'top', fontSize: 11 },
    }],
  });
}

// ---------------- 高亮 ----------------
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function highlight(text: string, q: string): string {
  if (!q) return esc(text);
  const qEsc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(text).replace(new RegExp(qEsc, 'gi'), m => `<mark style="background:#f4d28c;padding:0 1px;border-radius:2px">${m}</mark>`);
}
onMounted(() => { loadDocs(); loadUploads(); });
</script>

<template>
  <div style="max-width: 1080px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <h2 style="color: #1a2b4a; margin: 0 0 12px">知识库 · RAG 管理与检索</h2>

    <!-- 概览 -->
    <n-grid :cols="4" :x-gap="12" class="mb-3">
      <n-card><n-statistic label="已入库文档" :value="docs.length" /></n-card>
      <n-card><n-statistic label="向量片段总数" :value="totalChunks" /></n-card>
      <n-card><n-statistic label="待入库文件" :value="uploads.length" /></n-card>
      <n-card><n-statistic label="优秀课例" :value="docs.filter(d => d.type === 'case').length" /></n-card>
    </n-grid>

    <!-- 构成分布 + 检索入口 -->
    <n-grid :cols="2" :x-gap="12" class="mb-3">
      <n-grid-item>
        <n-card title="知识库构成">
          <div ref="distRef" style="width: 100%; height: 200px" />
          <div style="font-size: 12px; color: #8d9aab; margin-top: 6px">
            数据来源：后端 /api/kb/documents（Chroma 聚合）；主体为课标、评课量表、优秀课例与评课细则。
          </div>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="语义检索（RAG 召回）">
          <n-input v-model:value="searchQuery" placeholder="输入问题，如：课堂互动提问、板书规范、导入语速…" size="large" clearable @keyup.enter="doSearch">
            <template #suffix>
              <n-button type="primary" :loading="searching" @click="doSearch">检索</n-button>
            </template>
          </n-input>
          <div v-if="searchResult" class="mt-3">
            <div class="text-sm text-gray-500 mb-2">
              召回 {{ searchResults.length }} 条 · 耗时 {{ searchElapsed }}ms · 检索词「<b style="color:#1a2b4a">{{ searchQuery }}</b>」
            </div>
            <div v-for="(r, i) in searchResults" :key="i" style="border:1px solid #eef1f6;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fafbfc">
              <div class="flex items-center gap-2 mb-1">
                <n-tag :type="typeMap[r.doc_type]?.tag || 'default'" size="small" :bordered="false">{{ typeMap[r.doc_type]?.label || r.doc_type }}</n-tag>
                <n-tag size="small" :bordered="false" type="info" v-if="r.subject && r.subject !== '?'">{{ r.subject }}</n-tag>
                <span class="text-xs" style="color:#52647d">{{ r.indicator || r.source }}</span>
                <span class="text-xs ml-auto" style="color:#c8861a">相似度 {{ (1 - (r.distance || 0)).toFixed(3) }}</span>
              </div>
              <div class="text-sm" style="line-height:1.7;color:#252525" v-html="highlight(r.text || '', searchQuery)"></div>
            </div>
            <n-empty v-if="!searchResults.length" description="无召回片段" size="small" />
          </div>
          <div v-else class="text-sm" style="color:#8d9aab;margin-top:8px">
            输入问题后检索课标/量表/课例片段，用于验证 RAG 召回质量（BGE + Chroma）。
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>

    <!-- 待入库文件（上传 → 增量入库 → 撤销） -->
    <n-card title="待入库文件（上传 → 增量入库 → 撤销）" class="mb-3">
      <div class="mb-3 flex items-center gap-2" style="flex-wrap:wrap">
        <input type="file" accept=".md,.pdf,.txt" @change="onUpload" />
        <n-button type="primary" :loading="indexing" @click="doIndex">增量入库</n-button>
        <span class="text-xs" style="color:#52647d">扫描待入库目录，仅新增/变更文件写入向量库；已入库状态可重新入库覆盖</span>
      </div>
      <div class="overflow-auto" style="max-height:300px">
        <table class="w-full text-sm" style="border-collapse:collapse;min-width:640px">
          <thead>
            <tr style="background:#f6f7fb;color:#1a2b4a">
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3">文件名</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:110px">类型</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:90px">学科</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:90px">大小</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:100px">状态</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:96px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in uploads" :key="row.name" style="border-bottom:1px solid #f0f2f6" class="hover:bg-gray-50">
              <td class="px-3 py-2" style="color:#252525">{{ row.name }}</td>
              <td class="px-3 py-2"><n-tag size="small" :bordered="false" :type="typeMap[row.doc_type]?.tag || 'default'">{{ typeMap[row.doc_type]?.label || row.doc_type }}</n-tag></td>
              <td class="px-3 py-2" style="color:#52647d">{{ row.subject || '—' }}</td>
              <td class="px-3 py-2" style="color:#52647d">{{ ((row.size || 0) / 1024).toFixed(1) }} KB</td>
              <td class="px-3 py-2"><n-tag size="small" :bordered="false" :type="row.already_indexed ? 'success' : 'warning'">{{ row.already_indexed ? '已入库' : '待入库' }}</n-tag></td>
              <td class="px-3 py-2"><n-button size="small" type="warning" @click="revokeUpload(row.name)">{{ row.already_indexed ? '重新入库' : '撤销上传' }}</n-button></td>
            </tr>
            <tr v-if="!uploads.length">
              <td colspan="6" class="px-3 py-6 text-center" style="color:#a4aebc">{{ uploadsLoading ? '加载中…' : '暂无待入库文件' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="indexResult" class="mt-2 text-sm" style="color:#52647d">
        入库结果：新增/更新 <b style="color:#1a2b4a">{{ indexResult.indexed?.length || 0 }}</b> 个 · 跳过 {{ indexResult.skipped?.length || 0 }} · 失败 {{ indexResult.errors?.length || 0 }} · 库内共 {{ indexResult.collection_count || 0 }} 片段
        <div v-if="indexResult.errors?.length" class="mt-1" style="color:#c62828;font-size:12px">
          <div v-for="(er, i) in indexResult.errors" :key="i">{{ er.name }}：{{ er.reason }}</div>
        </div>
      </div>
    </n-card>

    <!-- 已入库文档管理 -->
    <n-card title="已入库文档管理">
      <div class="flex items-center gap-2 mb-3" style="flex-wrap:wrap">
        <n-radio-group v-model:value="typeFilter" size="small">
          <n-radio-button value="all">全部</n-radio-button>
          <n-radio-button v-for="(t, k) in typeMap" :key="k" :value="k">{{ t.label }}</n-radio-button>
        </n-radio-group>
        <n-select v-model:value="subjectFilter" size="small" style="width:130px" :options="[{ label: '全部学科', value: 'all' }, ...subjects.map(s => ({ label: s, value: s }))]" />
        <n-input v-model:value="docSearch" size="small" placeholder="按文件名过滤…" clearable style="width:180px" />
        <span class="ml-auto text-xs" style="color:#8d9aab">当前 {{ filteredDocs.length }} / {{ docs.length }} 篇</span>
      </div>

      <div class="overflow-auto" style="max-height:440px">
        <table class="w-full text-sm" style="border-collapse:collapse;min-width:560px">
          <thead>
            <tr style="background:#f6f7fb;color:#1a2b4a">
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3">文件路径</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:110px">类型</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:90px">学科</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:90px">片段数</th>
              <th class="px-3 py-2 text-left font-medium" style="border-bottom:1px solid #e8ecf3;width:100px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredDocs" :key="row.name" style="border-bottom:1px solid #f0f2f6" class="hover:bg-gray-50">
              <td class="px-3 py-2" style="color:#252525">{{ row.name }}</td>
              <td class="px-3 py-2"><n-tag size="small" :bordered="false" :type="typeMap[row.type]?.tag || 'default'">{{ typeMap[row.type]?.label || row.type }}</n-tag></td>
              <td class="px-3 py-2" style="color:#52647d">{{ row.subject || '—' }}</td>
              <td class="px-3 py-2" style="color:#52647d">{{ row.chunks }}</td>
              <td class="px-3 py-2"><n-button size="small" type="error" @click="onDelete(row)">撤销入库</n-button></td>
            </tr>
            <tr v-if="!filteredDocs.length">
              <td colspan="5" class="px-3 py-6 text-center" style="color:#a4aebc">{{ loading ? '加载中…' : '暂无已入库文档' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-card>
  </div>
</template>
