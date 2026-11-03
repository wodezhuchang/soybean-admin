# ChatPanel 组件

流式 AI 对话板块（学生答疑 / 专家复核批注通用）。消息气泡、打字机式增量渲染、停止生成、快捷提问、清空。

## Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | `string` | `'AI 助手'` | 面板标题 |
| `placeholder` | `string` | `'输入你的问题…'` | 输入框占位 |
| `initialMessages` | `ChatMessage[]` | `[]` | 初始消息（角色 user/assistant/system） |
| `suggestions` | `string[]` | `[]` | 快捷提问 chips，点击即发送 |
| `apiUrl` | `string` | `'/proxy-default/api/chat'` | 后端试讲陪练接口（当前**非流式**：GET，body 传 `user_id/message/session_id`）；SSE/WS 流式属规划 |
| `streamFn` | `(history, onDelta, signal) => Promise<void>` | 无 | 自定义流式传输；提供则忽略 apiUrl |
| `loadingPlaceholder` | `string` | `'思考中…'` | 等待首段时的占位 |
| `disabled` | `boolean` | `false` | 禁用输入 |

## 事件

- `send(text)` —— 用户发送时触发
- `complete` —— 一轮流式完成 / 停止时触发

## 类型

```ts
interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; loading?: boolean; error?: boolean; }
```

## 用法

无后端（模拟流式）：

```vue
<ChatPanel
  :initial-messages="msgs"
  :suggestions="suggs"
  :stream-fn="mockStream"  <!-- 内部按 chunk 调 onDelta -->
/>
```

接 DeepSeek / 任意 SSE：

```vue
<ChatPanel api-url="/proxy-default/api/chat" :initial-messages="msgs" />
<!-- 后端返回 data: {"delta":{"content":"..."}} 或 data: {"content":"..."}，结束发 data: [DONE] -->
```

## 暴露方法

`send(text)` / `stop()` / `clear()` / `messages`（通过 `defineExpose`）。

## 说明

- SSE 解析支持 `delta.content` / `content` / `message.content` 三种增量字段，遇 `data: [DONE]` 结束；非 JSON 行自动忽略。
- 发送期间输入框保持可输入，可随时"停止"（AbortController 中止请求）。
