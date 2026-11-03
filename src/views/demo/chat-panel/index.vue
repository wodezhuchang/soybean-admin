<script setup lang="ts">
/**
 * ChatPanel 演示页 —— 学生答疑 + 专家复核批注
 * 未接后端，用 streamFn 模拟流式回复；接入真实 DeepSeek SSE 后替换 streamFn / apiUrl 即可。
 */
import { ref } from 'vue';
import ChatPanel, { type ChatMessage } from '@/components/ChatPanel/index.vue';

const studentMsgs = ref<ChatMessage[]>([
  { id: 's0', role: 'assistant', content: '你好，我是你的试讲练习助手。上节课你整体 67 分，短板在重难点停顿和互动提问，想先提升哪块？' },
]);
const expertMsgs = ref<ChatMessage[]>([
  { id: 'e0', role: 'assistant', content: '这是 AI 初评结果待复核。你可以在证据时间轴上核对，也可直接提问或补充专家意见。' },
]);

const studentSuggs = ['帮我改一下导入环节的话术', '重难点停顿怎么练？', '给我一个递进式提问的例子'];
const expertSuggs = ['列出与 AI 评分有分歧的节点', '追加一条板书同步性意见', '把这次复核结论写入知识库'];

/** 模拟流式返回（打字机逐段输出） */
async function mockStream(
  history: ChatMessage[],
  onDelta: (t: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const last = [...history].filter(m => m.role === 'user').pop();
  const reply =
    '收到你的问题「' + (last?.content || '') + '」。\n\n' +
    '建议先看当前报告的证据时间轴：把机器初评里标红的节点逐条回放，再对照我的提示做 2–3 次微课练习。每次练完把新视频传上来，我会继续给出对比。\n\n' +
    '（这是模拟回复——接入真实 DeepSeek 接口后即为流式 AI 回答。）';
  for (let i = 0; i < reply.length; i += 4) {
    if (signal.aborted) return;
    onDelta(reply.slice(i, i + 4));
    await new Promise(r => setTimeout(r, 18));
  }
}
</script>

<template>
  <div style="max-width: 1080px; margin: 0 auto; padding: 20px; box-sizing: border-box">
    <h2 style="color: #1a2b4a; margin-bottom: 4px">AI 对话板块（ChatPanel）</h2>
    <p style="color: #767676; font-size: 13px; margin-bottom: 16px">
      双区对话：学生端答疑 + 专家端复核批注。输入或点快捷提问即可看到流式打字机效果。
    </p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px" class="dual">
      <ChatPanel
        title="学生端 · 试讲练习助手"
        :initial-messages="studentMsgs"
        :suggestions="studentSuggs"
        :stream-fn="mockStream"
        placeholder="问：比如「重难点停顿怎么练？」"
      />
      <ChatPanel
        title="专家端 · 复核批注助手"
        :initial-messages="expertMsgs"
        :suggestions="expertSuggs"
        :stream-fn="mockStream"
        placeholder="问：比如「列出与 AI 评分有分歧的节点」"
      />
    </div>
  </div>
</template>

<style scoped>
.dual {
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 760px) {
  .dual {
    grid-template-columns: 1fr;
  }
}
</style>
