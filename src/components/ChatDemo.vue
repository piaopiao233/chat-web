<template>
  <t-layout class="chat-page">
    <t-aside class="session-sidebar" width="262px">
      <div class="sidebar-header">
        <t-button class="new-chat-btn" variant="outline" shape="round" block @click="handleCreateSession">
          <template #icon><add-circle-icon /></template>
          开启新对话
        </t-button>
      </div>

      <div v-if="sessions.length" class="session-list">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.sessionId === currentSessionId }"
        >
          <div class="session-main" @click="handleSwitchSession(session)">
            <div class="session-title" :title="session.title">{{ session.title || '未命名会话' }}</div>
          </div>
          <t-dropdown
            class="session-menu"
            trigger="click"
            :options="sessionActions"
            @click="data => handleSessionAction(data, session)"
          >
            <t-button class="session-more" shape="circle" variant="text" size="small">
              <template #icon><more-icon /></template>
            </t-button>
          </t-dropdown>
        </div>
      </div>

      <div v-else class="empty-session">
        <t-empty description="暂无会话" />
      </div>
    </t-aside>

    <t-layout class="chat-main">
      <!-- 欢迎页面（无消息时显示） -->
      <div v-if="!messages.length" class="welcome-panel">
        <div class="welcome-badge">AI</div>
        <div class="welcome-title">
          <robot-filled-icon class="welcome-logo" />
          <span>开始新的对话</span>
        </div>
      </div>

      <div class="chat-surface">
        <t-chat-list
          ref="chatListRef"
          class="chat-list"
          :clear-history="false"
          :auto-scroll="true"
          default-scroll-to="bottom"
        >
          <div
            v-for="message in messages"
            :key="message.id"
            class="chat-message-group"
            :class="{ 'chat-message-group--user': message.role === 'user' }"
          >
            <t-chat-message
              :message="message"
              :placement="getMessagePlacement(message)"
              :variant="getMessageVariant(message)"
              :avatar="getMessageAvatar(message)"
              :name="getMessageName(message)"
              :datetime="message.datetime"
            >
              <template v-if="getMessageToolCalls(message).length" #content>
                <div class="assistant-message-content">
                  <t-chat-markdown :content="getMessageMarkdown(message)" />
                  <div class="tool-call-trigger-row">
                    <t-button
                      class="tool-call-trigger"
                      size="small"
                      variant="outline"
                      shape="round"
                      @click="openToolCallDrawer(getMessageToolCalls(message))"
                    >
                      <template #icon><tools-icon /></template>
                      {{ formatToolSummary(getMessageToolCalls(message)) }}
                    </t-button>
                  </div>
                </div>
              </template>
            </t-chat-message>
          </div>
        </t-chat-list>

        <div class="chat-sender-panel">
          <t-chat-sender
            v-model="inputValue"
            class="chat-sender"
            placeholder="给 AI 发送消息"
            :textarea-props="{ autosize: { minRows: 2, maxRows: 6 } }"
            :loading="isChatLoading"
            @send="handleSend"
            @stop="handleStop"
          />
        </div>
      </div>
    </t-layout>

    <t-dialog
      v-model:visible="renameVisible"
      header="修改会话标题"
      confirm-btn="保存"
      cancel-btn="取消"
      :confirm-loading="renameLoading"
      @confirm="handleRenameConfirm"
    >
      <t-input v-model="renameTitle" clearable placeholder="请输入会话标题" />
    </t-dialog>

    <t-drawer
      v-model:visible="toolDrawerVisible"
      header="工具调用"
      placement="right"
      size="min(440px, 92vw)"
      :footer="false"
    >
      <div v-if="selectedToolCalls.length" class="tool-drawer-list">
        <t-collapse :default-value="[0]" expand-icon-placement="right">
          <t-collapse-panel
            v-for="(tool, index) in selectedToolCalls"
            :key="tool.id || `${tool.name}-${index}`"
            :value="index"
          >
            <template #header>
              <div class="tool-panel-header">
                <tools-icon />
                <span>{{ tool.name || '未知工具' }}</span>
                <t-tag v-if="tool.type" size="small" variant="light">{{ tool.type }}</t-tag>
              </div>
            </template>

            <div class="tool-detail-block">
              <div class="tool-detail-label">参数</div>
              <pre class="tool-detail-code">{{ formatToolValue(tool.arguments) }}</pre>
            </div>
            <div class="tool-detail-block">
              <div class="tool-detail-label">结果</div>
              <pre class="tool-detail-code">{{ formatToolValue(tool.result) }}</pre>
            </div>
          </t-collapse-panel>
        </t-collapse>
      </div>
      <t-empty v-else description="暂无工具调用" />
    </t-drawer>
  </t-layout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { AddCircleIcon, MoreIcon, RobotFilledIcon, ToolsIcon } from 'tdesign-icons-vue-next'
import {
  type AIMessageContent,
  type ChatMessagesData,
  type ChatServiceConfig,
  type SSEChunkData,
  useChat
} from '@tdesign-vue-next/chat'
import { API_BASE_URL } from '../config'
import {
  deleteSession,
  getMessages,
  getSessions,
  updateSessionTitle
} from '../api/chat'
import type { ChatMessage, ChatSession, CustomChatResponse, ToolCallMeta } from '../api/chat'

type ChatListInstance = {
  scrollToBottom?: (options?: { behavior?: 'auto' | 'smooth' }) => void
  $el?: HTMLElement
}

type DisplayToolCall = {
  id: string
  type: string | null
  name: string
  arguments: string | null
  result: string | null
}

type ToolCallMessageExt = {
  toolCalls?: DisplayToolCall[]
}

const MESSAGE_TYPE = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2,
  TOOL: 3
} as const

const HISTORY_RELOAD_DELAYS = [100, 500, 1000, 1500] as const

/**
 * 会话操作菜单选项
 */
const sessionActions = [
  { content: '修改标题', value: 'rename' },
  { content: '删除会话', value: 'delete', theme: 'error' }
]

// 会话列表
const sessions = ref<ChatSession[]>([])
// 当前会话ID
const currentSessionId = ref('')
// 输入框内容
const inputValue = ref('')
// ChatList组件引用
const chatListRef = ref<ChatListInstance>()
// 重命名相关
const renameVisible = ref(false)
const renameLoading = ref(false)
const renameTitle = ref('')
const renameSession = ref<ChatSession>()
// 删除中的会话ID
const deletingSessionId = ref<number>()
// 工具调用抽屉
const toolDrawerVisible = ref(false)
const selectedToolCalls = ref<DisplayToolCall[]>([])

/**
 * 聊天服务配置
 */
const chatServiceConfig: ChatServiceConfig = {
  endpoint: `${API_BASE_URL}/ChatMessage/message`,
  stream: true,

  /**
   * 请求发送前的配置
   */
  onRequest: (params) => {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.prompt,
        sessionId: currentSessionId.value || undefined
      })
    }
  },

  /**
   * 解析后端返回的SSE数据
   */
  onMessage: (chunk: SSEChunkData): AIMessageContent | null => {
    const data = chunk.data as CustomChatResponse

    // 保存后端返回的sessionId
    if (data?.sessionId && !currentSessionId.value) {
      currentSessionId.value = data.sessionId
      refreshSessions()
    }

    if (!data?.content) {
      return null
    }

    // 思考过程
    if (data.isThinking) {
      return {
        type: 'thinking',
        data: { title: '思考中', text: data.content },
        status: 'streaming',
        strategy: 'merge'
      }
    }

    // 普通文本
    return {
      type: 'markdown',
      data: data.content,
      strategy: 'merge'
    }
  },

  /**
   * 请求完成回调
   */
  onComplete: async (isAborted) => {
    if (!isAborted && currentSessionId.value) {
      await loadMessagesWhenReady(currentSessionId.value, messages.value.length)
      await refreshSessions()
    }
  },

  /**
   * 错误处理回调
   */
  onError: () => {
    MessagePlugin.error('消息发送失败')
  }
}

const { chatEngine, messages, status } = useChat({
  defaultMessages: [],
  chatServiceConfig
})

const isChatLoading = computed(() => status.value === 'pending' || status.value === 'streaming')

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  refreshSessions()
})

/**
 * 刷新会话列表
 */
async function refreshSessions() {
  const page = await getSessions(1, 20)
  sessions.value = page.records || []
}

/**
 * 创建新会话
 */
function handleCreateSession() {
  currentSessionId.value = ''
  inputValue.value = ''
  closeToolCallDrawer()
  setChatMessages([])
}

/**
 * 切换会话
 * @param session 会话信息
 */
async function handleSwitchSession(session: ChatSession) {
  if (session.sessionId === currentSessionId.value) {
    return
  }
  currentSessionId.value = session.sessionId
  inputValue.value = ''
  closeToolCallDrawer()
  await loadMessages(session.sessionId)
}

/**
 * 发送消息
 * @param value 输入内容
 */
async function handleSend(value: string) {
  const prompt = value.trim()
  if (!prompt) {
    return
  }

  const sendTask = chatEngine.value?.sendUserMessage({ prompt })
  inputValue.value = ''
  await nextTick()
  scrollChatToBottom('smooth')
  await sendTask
}

/**
 * 停止生成
 */
function handleStop() {
  chatEngine.value?.abortChat()
}

/**
 * 加载历史消息
 * @param sessionId 业务会话ID
 */
async function loadMessages(sessionId: string) {
  const historyMessages = await getMessages(sessionId)
  await setChatMessages(toChatMessages(historyMessages))
}

/**
 * 等待后端历史消息落库后再刷新列表
 * @param sessionId 业务会话ID
 * @param minVisibleCount 当前页面至少应保留的可见消息数量
 */
async function loadMessagesWhenReady(sessionId: string, minVisibleCount: number) {
  for (const delayMs of HISTORY_RELOAD_DELAYS) {
    if (delayMs > 0) {
      await sleep(delayMs)
    }
    const historyMessages = await getMessages(sessionId)
    const nextMessages = toChatMessages(historyMessages)
    // 后端落库存在短暂延迟时，不用旧历史覆盖当前流式结果。
    if (nextMessages.length >= minVisibleCount) {
      await setChatMessages(nextMessages)
      return
    }
  }
}

/**
 * 延迟指定毫秒数
 * @param delayMs 延迟时间
 */
function sleep(delayMs: number) {
  return new Promise(resolve => window.setTimeout(resolve, delayMs))
}

/**
 * 设置聊天组件消息
 * @param nextMessages 聊天消息列表
 */
async function setChatMessages(nextMessages: ChatMessagesData[]) {
  chatEngine.value?.setMessages(nextMessages, 'replace')
  await nextTick()
  scrollChatToBottom('auto')
}

/**
 * 滚动聊天列表到底部
 * @param behavior 滚动动画类型
 */
function scrollChatToBottom(behavior: 'auto' | 'smooth') {
  if (chatListRef.value?.scrollToBottom) {
    chatListRef.value.scrollToBottom({ behavior })
    return
  }

  const chatListElement = chatListRef.value?.$el
  const scrollElement = chatListElement?.querySelector<HTMLElement>('.t-chat__list') || chatListElement

  scrollElement?.scrollTo({
    top: scrollElement.scrollHeight,
    behavior
  })
}

/**
 * 将后端消息转换为TDesign Chat消息
 * @param backendMessages 后端消息列表
 * @returns 聊天组件消息列表
 */
function toChatMessages(backendMessages: ChatMessage[]): ChatMessagesData[] {
  const recordToolCalls = collectRecordToolCalls(backendMessages)
  const chatMessageList: ChatMessagesData[] = []

  for (const message of backendMessages) {
    if (message.type === MESSAGE_TYPE.TOOL || isAssistantToolCallRecord(message)) {
      continue
    }

    const id = String(message.id)
    const datetime = message.createTime

    if (message.type === MESSAGE_TYPE.USER) {
      chatMessageList.push({
        id,
        role: 'user',
        datetime,
        content: [{ type: 'text', data: message.content || '' }]
      })
      continue
    }

    if (message.type === MESSAGE_TYPE.SYSTEM) {
      chatMessageList.push({
        id,
        role: 'system',
        datetime,
        content: [{ type: 'text', data: message.content || '' }]
      })
      continue
    }

    if (message.type === MESSAGE_TYPE.ASSISTANT) {
      const content = message.content || ''
      if (!content.trim()) {
        continue
      }

      const toolCalls = recordToolCalls.get(message.recordId) || []
      chatMessageList.push({
        id,
        role: 'assistant',
        datetime,
        status: 'complete',
        content: [{ type: 'markdown', data: content }],
        ext: toolCalls.length ? { toolCalls } : undefined
      })
    }
  }

  return chatMessageList
}

/**
 * 收集每轮对话中的工具调用信息
 * @param backendMessages 后端消息列表
 * @returns 按recordId归集后的工具调用
 */
function collectRecordToolCalls(backendMessages: ChatMessage[]) {
  const recordToolCallMap = new Map<string, Map<string, DisplayToolCall>>()

  for (const message of backendMessages) {
    const toolCalls = getBackendToolCalls(message)
    if (!toolCalls.length) {
      continue
    }

    if (!recordToolCallMap.has(message.recordId)) {
      recordToolCallMap.set(message.recordId, new Map())
    }

    const currentRecordTools = recordToolCallMap.get(message.recordId)!
    toolCalls.forEach((toolCall, index) => {
      const toolKey = toolCall.id || `${toolCall.name || 'tool'}-${index}`
      const existsTool = currentRecordTools.get(toolKey)

      // 同一个工具调用会分别保存“请求”和“结果”，这里按id合并为一条展示记录。
      currentRecordTools.set(toolKey, {
        id: toolCall.id || existsTool?.id || toolKey,
        type: toolCall.type ?? existsTool?.type ?? null,
        name: toolCall.name || existsTool?.name || '未知工具',
        arguments: toolCall.arguments ?? existsTool?.arguments ?? null,
        result: toolCall.result ?? existsTool?.result ?? null
      })
    })
  }

  return new Map(
    Array.from(recordToolCallMap.entries()).map(([recordId, toolMap]) => [
      recordId,
      Array.from(toolMap.values())
    ])
  )
}

/**
 * 获取后端消息中的工具调用列表
 * @param message 后端消息
 * @returns 工具调用列表
 */
function getBackendToolCalls(message: ChatMessage): ToolCallMeta[] {
  return message.metaJson?.toolCalls?.filter(Boolean) || []
}

/**
 * 判断是否为AI发起工具调用的中间消息
 * @param message 后端消息
 * @returns 是否为工具调用中间消息
 */
function isAssistantToolCallRecord(message: ChatMessage) {
  return message.type === MESSAGE_TYPE.ASSISTANT && getBackendToolCalls(message).length > 0
}

/**
 * 获取聊天消息中的工具调用列表
 * @param message 聊天消息
 * @returns 工具调用列表
 */
function getMessageToolCalls(message: ChatMessagesData): DisplayToolCall[] {
  const ext = message.ext as ToolCallMessageExt | undefined
  return ext?.toolCalls || []
}

/**
 * 获取消息中的Markdown文本
 * @param message 聊天消息
 * @returns Markdown文本
 */
function getMessageMarkdown(message: ChatMessagesData) {
  const content = message.content?.find(item => item.type === 'markdown' || item.type === 'text')
  return typeof content?.data === 'string' ? content.data : ''
}

/**
 * 打开工具调用抽屉
 * @param toolCalls 工具调用列表
 */
function openToolCallDrawer(toolCalls: DisplayToolCall[]) {
  selectedToolCalls.value = toolCalls
  toolDrawerVisible.value = true
}

/**
 * 关闭工具调用抽屉
 */
function closeToolCallDrawer() {
  selectedToolCalls.value = []
  toolDrawerVisible.value = false
}

/**
 * 格式化工具调用摘要
 * @param toolCalls 工具调用列表
 * @returns 摘要文本
 */
function formatToolSummary(toolCalls: DisplayToolCall[]) {
  return `调用 ${toolCalls.length} 个工具`
}

/**
 * 格式化工具参数或结果
 * @param value 参数或结果
 * @returns 展示文本
 */
function formatToolValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '暂无'
  }

  if (typeof value !== 'string') {
    return JSON.stringify(value, null, 2)
  }

  const text = value.trim()
  if (!text) {
    return '暂无'
  }

  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

/**
 * 获取消息气泡方向
 * @param message 聊天消息
 * @returns 气泡方向
 */
function getMessagePlacement(message: ChatMessagesData) {
  return message.role === 'user' ? 'right' : 'left'
}

/**
 * 获取消息气泡样式
 * @param message 聊天消息
 * @returns 气泡样式
 */
function getMessageVariant(message: ChatMessagesData) {
  return message.role === 'user' ? 'base' : 'text'
}

/**
 * 获取消息头像
 * @param message 聊天消息
 * @returns 头像地址
 */
function getMessageAvatar(message: ChatMessagesData) {
  return message.role === 'user'
    ? 'https://tdesign.gtimg.com/site/avatar.jpg'
    : 'https://tdesign.gtimg.com/site/chat-avatar.png'
}

/**
 * 获取消息展示名称
 * @param message 聊天消息
 * @returns 展示名称
 */
function getMessageName(message: ChatMessagesData) {
  if (message.role === 'user') {
    return '我'
  }
  return message.role === 'system' ? '系统' : 'AI'
}

/**
 * 处理会话操作菜单
 * @param action 操作类型
 * @param session 会话信息
 */
function handleSessionAction(action: unknown, session: ChatSession) {
  const actionValue = getDropdownValue(action)
  if (actionValue === 'rename') {
    renameSession.value = session
    renameTitle.value = session.title
    renameVisible.value = true
    return
  }

  if (actionValue === 'delete') {
    confirmDeleteSession(session)
  }
}

/**
 * 获取下拉菜单选中的值
 * @param action 下拉菜单事件数据
 * @returns 操作值
 */
function getDropdownValue(action: unknown) {
  if (typeof action === 'object' && action && 'value' in action) {
    return String((action as { value: unknown }).value)
  }
  return String(action)
}

/**
 * 保存会话标题
 */
async function handleRenameConfirm() {
  const title = renameTitle.value.trim()

  if (!title) {
    MessagePlugin.warning('请输入会话标题')
    return
  }
  if (!renameSession.value) {
    return
  }

  renameLoading.value = true
  try {
    await updateSessionTitle(renameSession.value.id, title)
    renameVisible.value = false
    renameSession.value.title = title
    await refreshSessions()
    MessagePlugin.success('标题已更新')
  } finally {
    renameLoading.value = false
  }
}

/**
 * 删除会话前确认
 * @param session 会话信息
 */
function confirmDeleteSession(session: ChatSession) {
  const dialog = DialogPlugin.confirm({
    header: '删除会话',
    body: `确定删除「${session.title || '未命名会话'}」吗？`,
    confirmBtn: {
      content: '删除',
      theme: 'danger'
    },
    cancelBtn: '取消',
    async onConfirm() {
      if (deletingSessionId.value) {
        return
      }
      deletingSessionId.value = session.id
      try {
        await deleteSession(session.id)
        await refreshSessions()

        if (session.sessionId === currentSessionId.value) {
          handleCreateSession()
        }

        MessagePlugin.success('会话已删除')
        dialog.hide()
      } finally {
        deletingSessionId.value = undefined
      }
    }
  })
}
</script>

<style scoped>
.chat-page {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.session-sidebar {
  display: flex;
  flex-direction: column;
  background: #f6f7f9;
  border-right: 1px solid #e7eaf0;
}

.sidebar-header {
  padding: 16px 12px 14px;
}

.new-chat-btn {
  height: 40px;
  color: #111827;
  background: #fff;
  border-color: #e9edf3;
  box-shadow: 0 6px 16px rgba(17, 24, 39, 0.06);
}

.session-list {
  flex: 1;
  padding: 8px 10px 18px;
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-height: 38px;
  padding: 2px 4px 2px 6px;
  color: #1f2937;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  text-align: left;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.session-item:hover,
.session-item.active {
  background: #fff;
  border-color: #eef1f6;
}

.session-main {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  padding-left: 8px;
  cursor: pointer;
}

.session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-menu {
  flex: 0 0 auto;
}

.session-more {
  flex: 0 0 auto;
  opacity: 0;
  color: #6b7280;
}

.session-item:hover .session-more,
.session-item.active .session-more {
  opacity: 1;
}

.empty-session {
  padding: 48px 16px;
}

.chat-main {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #ffffff 0%, #ffffff 70%, #fafbff 100%);
}

.chat-surface {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #fff;
}

.chat-list {
  flex: 1;
  min-height: 0;
}

.chat-list :deep(.t-chat__list) {
  padding: 24px 32px;
}

.chat-message-group {
  margin-bottom: 12px;
}

.chat-message-group--user {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.assistant-message-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assistant-message-content :deep(.t-chat__markdown) {
  margin-bottom: 0;
}

.assistant-message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.tool-call-trigger-row {
  display: flex;
  align-items: center;
  margin: 0;
  padding-left: 0;
}

.tool-call-trigger {
  height: 28px;
  color: #334155;
  background: #fff;
  border-color: #e2e8f0;
  box-shadow: none;
}

.chat-sender-panel {
  flex: 0 0 auto;
  padding: 12px 32px 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), #fff 38%);
  border-top: 1px solid #eef1f6;
}

.chat-sender {
  max-width: 960px;
  margin: 0 auto;
}

.welcome-panel {
  position: absolute;
  top: 33%;
  left: 50%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(720px, calc(100% - 48px));
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  color: #366ef4;
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  background: #eef3ff;
  border: 1px solid #dbe6ff;
  border-radius: 999px;
}

.welcome-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #020617;
  font-size: 24px;
  font-weight: 700;
  line-height: 32px;
}

.welcome-logo {
  color: #366ef4;
  font-size: 30px;
}

.tool-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-panel-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #111827;
  font-weight: 600;
}

.tool-detail-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.tool-detail-label {
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

.tool-detail-code {
  max-height: 220px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  color: #0f172a;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

@media (max-width: 760px) {
  .chat-page {
    flex-direction: column;
  }

  .session-sidebar {
    width: 100% !important;
    height: 104px;
    flex: 0 0 104px !important;
    border-right: 0;
    border-bottom: 1px solid #e7eaf0;
  }

  .sidebar-header {
    padding: 10px 12px 8px;
  }

  .new-chat-btn {
    height: 36px;
  }

  .session-list {
    display: flex;
    gap: 8px;
    padding: 0 10px 10px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .session-item {
    flex: 0 0 172px;
    min-height: 36px;
  }

  .session-more {
    opacity: 1;
  }

  .empty-session {
    display: none;
  }

  .chat-main {
    width: 100%;
    flex: 1 1 auto;
  }

  .chat-list :deep(.t-chat__list) {
    padding: 16px 12px;
  }

  .chat-message-group {
    margin-bottom: 10px;
  }

  .chat-sender-panel {
    padding: 10px 12px 12px;
  }

  .welcome-panel {
    top: 42%;
    width: calc(100% - 24px);
  }

  .welcome-title {
    font-size: 20px;
    line-height: 28px;
  }
}
</style>
