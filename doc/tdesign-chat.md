**以下是各组件的使用文档和源码地址**（直接来自 GitHub 源码中的 `.md` 文档）：

### **Chatbot**（智能对话核心容器）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chatbot
- **使用文档**（关键 Props / 方法）：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chatbot/chatbot.md  
  主要用于整合整个聊天界面，支持 `defaultMessages`、`messageProps`、`listProps`、`senderProps`、`chatServiceConfig` 等。提供实例方法如 `sendUserMessage`、`regenerate`、`abortChat` 等。

### **ChatEngine**（对话引擎）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-engine
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-engine/chat-engine.md  
  提供 `useChat` Hook，支持 `chatServiceConfig`（endpoint、onMessage 等）、事件总线、工具调用（useAgentToolcall）、Activity 等。

### **ChatSender**（对话输入）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-sender
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-sender/chat-sender.md  
  支持 `value`、`loading`、`textareaProps`、`onSend`、`onFileSelect` 等 Props 和插槽（header、suffix 等）。

### **ChatMessage**（对话消息体）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-message
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-message/chat-message.md  
  支持 `role`、`content`（多种类型）、`status`、`avatar`、`name` 等 Props，以及 content、actionbar 等插槽。

### **ChatActionbar**（对话操作栏）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-actionbar
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-actionbar/chat-actionbar.md  
  支持 `actionBar`、`content`、`onActions` 等。

### **ChatMarkdown**（Markdown 内容）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-markdown
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-markdown/chat-markdown.md  
  主要 Props：`content`、`options`。

### **ChatThinking**（思考过程）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-thinking
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-thinking/chat-thinking.md  
  支持 `content`、`status`、`collapsed`、`layout` 等。

### **ChatLoading**（对话加载）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-loading
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-loading/chat-loading.md  
  支持 `animation`、`text`。

### **Attachments**（文件附件）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/attachments
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/attachments/attachments.md  
  支持 `items`、`removable`、`onRemove` 等。

### **ChatList**（对话列表）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-list
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-list/chat-list.md  
  支持 `data`、`autoScroll`、多种插槽（avatar、content、actionbar 等）、`scrollToBottom` 方法。

### **ChatContent**（对话正文）
- **源码地址**：https://github.com/Tencent/tdesign-vue-next/tree/develop/packages/pro-components/chat/chat-content
- **使用文档**：  
  https://github.com/Tencent/tdesign-vue-next/blob/develop/packages/pro-components/chat/chat-content/chat-content.md  
  支持 `content`、`role`、`status`、`markdownProps` 等。

**通用安装**：`npm i @tdesign-vue-next/chat`  
推荐直接打开上面的 `.md` 链接查看完整表格和示例。需要某个组件的完整示例代码再告诉我！