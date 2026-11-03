<script setup lang="ts">
/**
 * MessageBell —— 消息铃铛（学生端右上角）
 * 未读红点 + 下拉消息列表，每条关联一个试讲（点击跳转报告）。
 * 点击单条标记已读；支持一键清空全部已读。
 */
import { ref, computed } from 'vue';
import type { MessageItem } from '@/shared/types/agent';

interface Props {
  messages?: MessageItem[];
  onOpen?: (m: MessageItem) => void;
  onRead?: (ids: string[]) => void;
  onClearRead?: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  messages: () => [],
  onOpen: undefined,
  onRead: undefined,
  onClearRead: undefined,
});

const open = ref(false);
const unread = computed(() => props.messages.filter(m => !m.read).length);

function toggle() { open.value = !open.value; }
function openItem(m: MessageItem) {
  open.value = false;
  if (!m.read) props.onRead?.([m.message_id]);
  props.onOpen?.(m);
}
function clearRead() {
  props.onClearRead?.();
}
</script>

<template>
  <div class="mb-root">
    <button type="button" class="mb-bell" title="消息" @click.stop="toggle">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke-linecap="round" />
      </svg>
      <span v-if="unread" class="mb-dot">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
    <div v-if="open" class="mb-panel" @click.stop>
      <div class="mb-head">
        <span>消息</span>
        <button v-if="messages.length" class="mb-clear" @click="clearRead">全部已读</button>
      </div>
      <div v-if="!messages.length" class="mb-empty">暂无消息</div>
      <div v-for="m in messages" :key="m.message_id" class="mb-item" :class="{ unread: !m.read }" @click="openItem(m)">
        <div class="mb-item-title">{{ m.title }}</div>
        <div class="mb-item-content">{{ m.content }}</div>
        <div class="mb-item-time">{{ m.created_at }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mb-root {
  position: relative;
}
.mb-bell {
  position: relative;
  width: 38px;
  height: 38px;
  border: 1px solid #e0e4ea;
  border-radius: 8px;
  background: #fff;
  color: #52647d;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mb-dot {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: #c62828;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mb-panel {
  position: absolute;
  right: 0;
  top: 46px;
  width: 320px;
  max-height: 380px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e0e4ea;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(26, 43, 74, 0.12);
  z-index: 50;
}
.mb-head {
  padding: 10px 14px;
  font-weight: 700;
  color: #1a2b4a;
  border-bottom: 1px solid #eef1f6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mb-clear {
  font-size: 12px;
  font-weight: 400;
  color: #8d9aab;
  background: none;
  border: none;
  cursor: pointer;
}
.mb-clear:hover { color: #c62828; }
.mb-empty {
  padding: 30px;
  text-align: center;
  color: #b0b7c3;
  font-size: 13px;
}
.mb-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f4f6f8;
  cursor: pointer;
}
.mb-item:hover {
  background: #fafbfc;
}
.mb-item.unread {
  background: #f2f7ff;
}
.mb-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #252525;
}
.mb-item-content {
  font-size: 12px;
  color: #52647d;
  margin: 2px 0;
}
.mb-item-time {
  font-size: 11px;
  color: #b0b7c3;
}
</style>
