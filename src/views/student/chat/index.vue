<script setup lang="ts">
/**
 * 学生端 · 试讲陪练对话（独立 chat 页）
 * - 左：会话列表，按「主题分类」分组 + 时间筛选，方便查找
 * - 右：对话窗口，真实 POST /api/chat（非流式）；点会话回看完整历史；新建对话开新 session
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useAuthStore } from '@/store/modules/auth';

const USER_ID = useAuthStore().userInfo.userId || 'demo_user';

/** 主题分类（会话按首条消息 intent 归类） */
const CATEGORY: Record<string, { label: string; color: string }> = {
  self_progress: { label: '查成绩 / 复盘', color: '#2080f0' },
  how_to_practice: { label: '怎么练', color: '#18a058' },
  practice_drill: { label: '模拟陪练', color: '#f0a020' },
  state_check: { label: '状态调整', color: '#f5222d' },
  casual: { label: '随便聊聊', color: '#8d9aab' },
};

interface SessionItem { session_id: string; title: string; intent: string; first_at: string; last_at: string; msg_count: number }
interface Msg { role: 'user' | 'assistant'; content: string; intent: string; created_at: string }

const sessions = ref<SessionItem[]>([]);
const currentSid = ref('');
const messages = ref<Msg[]>([]);
const input = ref('');
const sending = ref(false);
const listRef = ref<HTMLDivElement | null>(null);
const timeFilter = ref<'all' | 'today' | 'week' | 'older'>('all');

function fmt(t: string, withYear = false): string {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const md = `${d.getMonth() + 1}-${d.getDate()}`;
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return withYear ? `${d.getFullYear()}-${md} ${hm}` : `${md} ${hm}`;
}

function inRange(t: string, f: string): boolean {
  if (f === 'all' || !t) return true;
  const d = new Date(t);
  const now = new Date();
  if (f === 'today') return d.toDateString() === now.toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  return f === 'week' ? d >= weekAgo : d < weekAgo;
}

const filtered = computed(() => sessions.value.filter(s => inRange(s.last_at, timeFilter.value)));

const grouped = computed(() => {
  const g: Record<string, SessionItem[]> = {};
  for (const s of filtered.value) {
    const k = s.intent && CATEGORY[s.intent] ? s.intent : 'casual';
    (g[k] = g[k] || []).push(s);
  }
  return Object.keys(g).length ? g : null;
});

const ORDER = ['self_progress', 'how_to_practice', 'practice_drill', 'state_check', 'casual'];

async function loadSessions() {
  try {
    const r = await (await fetch(`/proxy-default/api/chat/sessions?user_id=${USER_ID}`)).json();
    sessions.value = r?.sessions || [];
  } catch { sessions.value = []; }
}

/** 新建对话：清空当前会话，下次发送不带 session_id → 后端自动开新会话 */
function newChat() {
  currentSid.value = '';
  messages.value = [];
  input.value = '';
  void nextTick(scrollToBottom);
}

/** 点开历史会话：加载完整对话 */
async function openSession(sid: string) {
  currentSid.value = sid;
  messages.value = [];
  try {
    const r = await (await fetch(`/proxy-default/api/chat/sessions/${sid}?user_id=${USER_ID}`)).json();
    messages.value = r?.messages || [];
  } catch { messages.value = []; }
  void nextTick(scrollToBottom);
}

function scrollToBottom() {
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

/** 发送消息（真实后端，非流式） */
async function send() {
  const text = input.value.trim();
  if (!text || sending.value) return;
  input.value = '';
  messages.value.push({ role: 'user', content: text, intent: '', created_at: new Date().toISOString() });
  sending.value = true;
  scrollToBottom();
  try {
    const res = await fetch('/proxy-default/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID, message: text, session_id: currentSid.value || undefined }),
    });
    const r = await res.json();
    if (r?.session_id) currentSid.value = r.session_id;
    messages.value.push({
      role: 'assistant',
      content: r?.reply || '（未收到回复）',
      intent: r?.intent || '',
      created_at: new Date().toISOString(),
    });
    await loadSessions(); // 刷新列表（标题/时间/分类/消息数）
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: '发送失败：' + e.message, intent: '', created_at: '' });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

onMounted(() => { loadSessions(); newChat(); });
</script>

<template>
  <div class="chat-page">
    <div class="page-head">
      <div class="ph-title">
        <h2>试讲陪练</h2>
        <p>和你的 AI 教练聊聊怎么练、查成绩、模拟陪练</p>
      </div>
      <n-button type="primary" :disabled="sending" @click="newChat">＋ 新建对话</n-button>
    </div>

    <div class="cp-body">
      <!-- 左：会话列表 -->
      <aside class="side">
        <div class="side-head">
          <span class="side-title">对话记录</span>
          <span class="side-count">{{ sessions.length }} 段</span>
        </div>

        <div class="tf">
          <button v-for="f in [['all','全部'],['today','今天'],['week','近7天'],['older','更早']]" :key="f[0]"
            type="button" :class="['tf-btn', { on: timeFilter === f[0] }]" @click="timeFilter = f[0] as any">
            {{ f[1] }}
          </button>
        </div>

        <div class="list">
          <div v-if="!grouped" class="empty">
            <div class="empty-icon">✳</div>
            <div>还没有对话记录</div>
            <div class="empty-sub">在右侧发起新对话，历史会自动按主题归类到这里</div>
          </div>

          <template v-else>
            <div v-for="k in ORDER" :key="k" class="group">
              <template v-if="grouped[k] && grouped[k].length">
                <div class="cat">
                  <span class="dot" :style="{ background: CATEGORY[k]?.color }"></span>
                  <span class="cat-label">{{ CATEGORY[k]?.label || k }}</span>
                  <span class="cnt">{{ grouped[k].length }}</span>
                </div>
                <div v-for="s in grouped[k]" :key="s.session_id" :class="['item', { cur: s.session_id === currentSid }]"
                  @click="openSession(s.session_id)">
                  <div class="it-title">{{ s.title || '（无标题）' }}</div>
                  <div class="it-meta">{{ fmt(s.last_at) }} · {{ s.msg_count }} 条</div>
                </div>
              </template>
            </div>
          </template>
        </div>
      </aside>

      <!-- 右：对话窗口 -->
      <section class="main">
        <div ref="listRef" class="chat-list">
          <div v-if="!messages.length" class="empty">
            <div class="empty-icon">✦</div>
            <div>开始和 AI 对话</div>
            <div class="empty-sub">例如：我上次试讲多少分 / 板书怎么练 / 模拟评委提问</div>
          </div>
          <div v-for="(m, i) in messages" :key="i" :class="['row', m.role]">
            <div class="bubble">
              <div class="b-text">{{ m.content }}</div>
              <div v-if="m.created_at" class="b-time">{{ fmt(m.created_at, true) }}</div>
            </div>
          </div>
          <div v-if="sending" class="row assistant"><div class="bubble thinking">思考中…</div></div>
        </div>

        <div class="inputbar">
          <input v-model="input" class="cp-input" placeholder="输入你的问题，例如：我上次试讲多少分 / 板书怎么练"
            :disabled="sending" @keydown.enter.prevent="send" />
          <button type="button" class="cp-btn" :disabled="sending || !input.trim()" @click="send">发送</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  max-width: 1160px;
  margin: 0 auto;
  padding: 28px 32px 40px;
  box-sizing: border-box;
}

/* 页头 */
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 22px;
}
.ph-title h2 { color: #16181d; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: .3px; }
.ph-title p { color: #8a94a6; font-size: 13px; margin: 6px 0 0; }

/* 两栏主体 */
.cp-body {
  display: flex;
  gap: 20px;
  align-items: stretch;
}

/* 左：会话列表卡片 */
.side {
  width: 312px;
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .05);
  display: flex;
  flex-direction: column;
  max-height: 640px;
  overflow: hidden;
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #f2f4f7;
}
.side-title { font-size: 15px; font-weight: 700; color: #16181d; }
.side-count { font-size: 12px; color: #8a94a6; }
.tf {
  display: flex;
  gap: 6px;
  padding: 12px 18px 4px;
}
.tf-btn {
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.tf-btn:hover { background: #f3f4f6; color: #16181d; }
.tf-btn.on { background: #eef4ff; color: #2080f0; font-weight: 600; }

.list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px 16px;
}
.group + .group { margin-top: 10px; }
.cat {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 6px 6px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
.dot { width: 7px; height: 7px; border-radius: 50%; }
.cnt { margin-left: auto; color: #b6bfcc; font-weight: 500; }
.item {
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
  transition: background .12s;
}
.item:hover { background: #f6f7f9; }
.item.cur {
  background: #f0f6ff;
  border-color: #d9e8ff;
}
.it-title {
  font-size: 13px;
  color: #16181d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}
.item.cur .it-title { color: #1a4fd8; font-weight: 600; }
.it-meta { font-size: 11px; color: #9aa3b2; margin-top: 3px; }

/* 右：对话窗口 */
.main {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-list {
  flex: 1;
  min-height: 420px;
  max-height: 560px;
  overflow-y: auto;
  padding: 24px 26px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #fbfbfd;
}
.row { display: flex; }
.row.user { justify-content: flex-end; }
.row.assistant { justify-content: flex-start; }
.bubble {
  max-width: 76%;
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  word-break: break-word;
}
.row.user .bubble {
  background: #1a2b4a;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.row.assistant .bubble {
  background: #fff;
  color: #2b2f36;
  border: 1px solid #eef0f4;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  border-bottom-left-radius: 4px;
}
.b-time { font-size: 10px; opacity: .5; margin-top: 5px; text-align: right; letter-spacing: .3px; }
.thinking { color: #8a94a6; }

.empty {
  color: #b6bfcc;
  font-size: 13px;
  text-align: center;
  padding: 56px 20px;
}
.empty-icon { font-size: 30px; margin-bottom: 10px; opacity: .5; }
.empty-sub { font-size: 12px; margin-top: 6px; color: #c3cad6; }

/* 输入条 */
.inputbar {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid #f2f4f7;
  background: #fff;
}
.cp-input {
  flex: 1;
  padding: 11px 14px;
  border: 1px solid #e3e7ee;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  transition: border-color .15s;
}
.cp-input:focus { border-color: #2080f0; box-shadow: 0 0 0 3px rgba(32, 128, 240, .1); }
.cp-btn {
  padding: 0 22px;
  border: none;
  border-radius: 10px;
  background: #1a2b4a;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s;
}
.cp-btn:hover:not(:disabled) { opacity: .9; }
.cp-btn:disabled { opacity: .45; cursor: not-allowed; }

@media (max-width: 840px) {
  .cp-body { flex-direction: column; }
  .side { width: 100%; max-height: 300px; }
  .chat-page { padding: 20px; }
}
</style>
