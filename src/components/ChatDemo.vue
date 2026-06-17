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
      <div v-if="!chatMessages.length" class="welcome-panel">
        <div class="welcome-badge">AI</div>
        <div class="welcome-title">
          <robot-filled-icon class="welcome-logo" />
          <span>开始新的对话</span>
        </div>
      </div>

      <!-- Chatbot组件（自带发送框） -->
      <t-chatbot
        ref="chatRef"
        class="chatbot"
        :chat-service-config="chatServiceConfig"
        :default-messages="chatMessages"
        :sender-props="senderProps"
        :list-props="listProps"
        :message-props="messageProps"
      />
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
  </t-layout>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { AddCircleIcon, MoreIcon, RobotFilledIcon } from 'tdesign-icons-vue-next'
import type {
  AIMessageContent,
  ChatMessagesData,
  ChatRequestParams,
  ChatServiceConfig,
  SSEChunkData,
  TdChatMessageConfigItem
} from '@tdesign-vue-next/chat'
import { API_BASE_URL } from '../config'
import {
  deleteSession,
  getMessages,
  getSessions,
  updateSessionTitle
} from '../api/chat'
import type { ChatMessage, ChatSession, CustomChatResponse } from '../api/chat'

/**
 * Chatbot实例类型
 */
type ChatbotInstance = {
  setMessages?: (messages: ChatMessagesData[], mode?: 'replace' | 'prepend' | 'append') => void
  sendUserMessage?: (params: ChatRequestParams) => Promise<void>
  scrollList?: (options?: { behavior?: 'auto' | 'smooth'; to?: 'top' | 'bottom' }) => void
}

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
// 聊天消息
const chatMessages = ref<ChatMessagesData[]>([])
// Chatbot组件引用
const chatRef = ref<ChatbotInstance>()
// 重命名相关
const renameVisible = ref(false)
const renameLoading = ref(false)
const renameTitle = ref('')
const renameSession = ref<ChatSession>()
// 删除中的会话ID
const deletingSessionId = ref<number>()

/**
 * 发送者属性
 */
const senderProps = {
  placeholder: '给 AI 发送消息',
  textareaProps: {
    autosize: { minRows: 2, maxRows: 6 }
  }
}

/**
 * 列表属性
 */
const listProps = {
  autoScroll: true,
  defaultScrollTo: 'bottom' as const
}

/**
 * 消息属性配置 - 自定义头像、操作栏等
 * @param msg 消息数据
 * @returns 消息配置
 */
const messageProps = (msg: ChatMessagesData): TdChatMessageConfigItem => {
  const { role, datetime } = msg
  // 用户消息配置
  if (role === 'user') {
    return {
      variant: 'base',
      placement: 'right',
      avatar: 'https://tdesign.gtimg.com/site/avatar.jpg',
      name: '我',
      datetime
    }
  }

  // AI消息配置
  if (role === 'assistant') {
    return {
      placement: 'left',
      avatar: 'https://tdesign.gtimg.com/site/chat-avatar.png',
      name: 'AI',
      datetime,
      actions: ['copy']
    }
  }

  // 系统消息配置
  return {
    avatar: 'https://tdesign.gtimg.com/site/chat-avatar.png',
    name: '系统',
    datetime
  }
}

/**
 * 聊天服务配置
 */
const chatServiceConfig: ChatServiceConfig = {
  endpoint: `${API_BASE_URL}/ChatMessage/message`,
  stream: true,

  /**
   * 请求发送前的配置
   */
  onRequest: (params: ChatRequestParams) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.prompt,
      sessionId: currentSessionId.value || undefined
    })
  }),

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
      await loadMessages(currentSessionId.value)
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
  await loadMessages(session.sessionId)
}

/**
 * 加载历史消息
 * @param sessionId 业务会话ID
 */
async function loadMessages(sessionId: string) {
  const messages = await getMessages(sessionId)
  setChatMessages(toChatMessages(messages))
}

/**
 * 设置聊天组件消息
 * @param messages 聊天消息列表
 */
async function setChatMessages(messages: ChatMessagesData[]) {
  chatMessages.value = messages
  await nextTick()
  chatRef.value?.setMessages?.(messages, 'replace')
  chatRef.value?.scrollList?.({ to: 'bottom', behavior: 'auto' })
}

/**
 * 将后端消息转换为TDesign Chat消息
 * @param messages 后端消息列表
 * @returns 聊天组件消息列表
 */
function toChatMessages(messages: ChatMessage[]): ChatMessagesData[] {
  return messages
    .filter(message => message.type !== 3)
    .map(message => {
      const id = String(message.id)
      const datetime = message.createTime

      if (message.type === 1) {
        return {
          id,
          role: 'user' as const,
          datetime,
          content: [{ type: 'text' as const, data: message.content }]
        }
      }

      if (message.type === 0) {
        return {
          id,
          role: 'system' as const,
          datetime,
          content: [{ type: 'text' as const, data: message.content }]
        }
      }

      return {
        id,
        role: 'assistant' as const,
        datetime,
        status: 'complete' as const,
        content: [{ type: 'markdown' as const, data: message.content }]
      }
    })
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

.chatbot {
  width: 100%;
  height: 100%;
  --td-chat-list-padding-bottom: 128px;
}

.chatbot :deep(.t-chatbot) {
  height: 100%;
  background: #fff;
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
</style>
