<script setup lang="ts">
/**
 * ChatPanel —— 流式 AI 对话板块
 * - 消息气泡（用户右 / 助手左）、打字机式增量渲染、发送中加载态、停止生成
 * - 默认走 fetch + SSE（data: JSON，兼容 DeepSeek 及多数流式后端），可用 streamFn 覆盖自定义传输
 * - 预设快捷提问 chips，一键发送
 */
import { ref, nextTick, watch, onBeforeUnmount } from 'vue';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  loading?: boolean;
  error?: boolean;
}

interface Props {
  title?: string;
  placeholder?: string;
  initialMessages?: ChatMessage[];
  suggestions?: string[];
  /** 默认 SSE 接口（POST { messages }，解析 data: 增量） */
  apiUrl?: string;
  /** 自定义流式传输：回调 onDelta 逐段追加 */
  streamFn?: (history: ChatMessage[], onDelta: (t: string) => void, signal: AbortSignal) => Promise<void>;
  loadingPlaceholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'AI 助手',
  placeholder: '输入你的问题…',
  initialMessages: () => [],
  suggestions: () => [],
  apiUrl: '/api/chat',
  streamFn: undefined,
  loadingPlaceholder: '思考中…',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'send', text: string): void;
  (e: 'complete'): void;
}>();

const messages = ref<ChatMessage[]>([...props.initialMessages]);
const input = ref('');
const sending = ref(false);
const listRef = ref<HTMLDivElement | null>(null);
let controller: AbortController | null = null;
let uid = 0;

watch(() => props.initialMessages, m => { messages.value = [...m]; }, { deep: true });

function scrollToBottom() {
  void nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  });
}

/** 解析 SSE 流：按行读 data:，逐段回调 */
async function readSSE(res: Response, onDelta: (t: string) => void): Promise<void> {
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const obj = JSON.parse(data);
        const delta: string =
          (obj as any).delta?.content ??
          (obj as any).content ??
          (obj as any).message?.content ??
          '';
        if (delta) onDelta(delta);
      } catch {
        /* 非 JSON 增量行忽略 */
      }
    }
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value || props.disabled) return;
  input.value = '';
  emit('send', text);

  messages.value.push({ id: `u${uid++}`, role: 'user', content: text });
  const ai: ChatMessage = { id: `a${uid++}`, role: 'assistant', content: '', loading: true };
  messages.value.push(ai);
  sending.value = true;
  controller = new AbortController();
  scrollToBottom();

  const history = messages.value.filter(m => m.role !== 'system' && !m.loading);
  const onDelta = (t: string) => { ai.content += t; ai.loading = false; scrollToBottom(); };

  try {
    if (props.streamFn) {
      await props.streamFn(history, onDelta, controller.signal);
    } else {
      const res = await fetch(props.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readSSE(res, onDelta);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      ai.content = ai.content || '已停止生成。';
    } else {
      ai.error = true;
      ai.content = ai.content || `出错了：${err?.message || '未知错误'}`;
    }
  } finally {
    ai.loading = false;
    sending.value = false;
    controller = null;
    scrollToBottom();
    emit('complete');
  }
}

function stop() {
  controller?.abort();
}

function useSuggestion(s: string) {
  input.value = s;
  void send();
}

function clear() {
  controller?.abort();
  messages.value = [];
  sending.value = false;
}

defineExpose({ send, stop, clear, messages });

onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="cp-root">
    <div class="cp-head">
      <span class="cp-title">{{ title }}</span>
      <button v-if="messages.length" type="button" class="cp-clear" title="清空" @click="clear">清空</button>
    </div>

    <div ref="listRef" class="cp-list">
      <div v-if="!messages.length" class="cp-empty">
        开始和 AI 对话，或点击下方快捷提问。
      </div>
      <div
        v-for="m in messages"
        :key="m.id"
        :class="['cp-row', m.role === 'user' ? 'user' : 'assistant']"
      >
        <div :class="['cp-bubble', { err: m.error }]">
          <template v-if="m.loading">{{ loadingPlaceholder }}</template>
          <template v-else>{{ m.content }}</template>
        </div>
      </div>
    </div>

    <div v-if="suggestions.length" class="cp-chips">
      <button
        v-for="s in suggestions"
        :key="s"
        type="button"
        class="cp-chip"
        :disabled="sending || disabled"
        @click="useSuggestion(s)"
      >
        {{ s }}
      </button>
    </div>

    <div class="cp-inputbar">
      <input
        v-model="input"
        class="cp-input"
        :placeholder="placeholder"
        :disabled="disabled"
        @keydown.enter.prevent="send"
      />
      <button v-if="sending" type="button" class="cp-btn stop" @click="stop">停止</button>
      <button v-else type="button" class="cp-btn" :disabled="disabled || !input.trim()" @click="send">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.cp-root {
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #e0e4ea;
  border-radius: 10px;
  background: #fff;
  box-sizing: border-box;
}
.cp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #eef1f6;
}
.cp-title {
  font-weight: 700;
  color: #1a2b4a;
  font-size: 14px;
}
.cp-clear {
  border: none;
  background: none;
  color: #8d9aab;
  font-size: 12px;
  cursor: pointer;
}
.cp-list {
  flex: 1;
  min-height: 260px;
  max-height: 420px;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fafbfc;
}
.cp-empty {
  color: #b0b7c3;
  font-size: 13px;
  text-align: center;
  margin-top: 60px;
}
.cp-row {
  display: flex;
}
.cp-row.user {
  justify-content: flex-end;
}
.cp-row.assistant {
  justify-content: flex-start;
}
.cp-bubble {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.cp-row.user .cp-bubble {
  background: #1a2b4a;
  color: #fff;
  border-top-right-radius: 2px;
}
.cp-row.assistant .cp-bubble {
  background: #fff;
  color: #252525;
  border: 1px solid #e0e4ea;
  border-top-left-radius: 2px;
}
.cp-bubble.err {
  border-color: #c62828;
  color: #b71c1c;
}
.cp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
}
.cp-chip {
  padding: 5px 10px;
  border: 1px solid #cbd2dc;
  border-radius: 999px;
  background: #fff;
  color: #52647d;
  font-size: 12px;
  cursor: pointer;
}
.cp-chip:hover {
  border-color: #1a2b4a;
  color: #1a2b4a;
}
.cp-inputbar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #eef1f6;
}
.cp-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #d3d9e1;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.cp-input:focus {
  border-color: #1a2b4a;
}
.cp-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #1a2b4a;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.cp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cp-btn.stop {
  background: #c62828;
}
</style>
