<template>
  <t-layout class="chat-main">
    <!-- 没有消息时显示欢迎态；真正的聊天内容仍然由 tdesign-chat 的 t-chat-list 承载。 -->
    <div v-if="!messages.length" class="welcome-panel">
      <div class="welcome-badge">AI</div>
      <div class="welcome-title">
        <robot-filled-icon class="welcome-logo" />
        <span>开始新的对话</span>
      </div>
    </div>

    <div class="chat-surface">
      <!-- 聊天室 -->
      <t-chat-list
        :ref="setChatListRef"
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
            <!-- 有工具调用时，自定义 AI 消息内容：正文下方紧贴一个工具入口。 -->
            <template v-if="getMessageToolCalls(message).length" #content>
              <div class="assistant-message-content">
                <t-chat-markdown :content="getMessageMarkdown(message)" />
                <div class="tool-call-trigger-row">
                  <t-button
                    class="tool-call-trigger"
                    size="small"
                    variant="outline"
                    shape="round"
                    @click="openToolCallDrawer(getMessageToolRecordId(message))"
                  >
                    <template #icon><tools-icon /></template>
                    {{ formatToolSummary(getMessageToolCalls(message)) }}
                  </t-button>
                </div>
              </div>
            </template>
          </t-chat-message>
        </div>

        <!-- 如果当前是重播 不展示工具提示 -->
        <div class="chat-progress-queue">
          <!-- 工具提示只展示一小段时间，下面的“准备回答中”会跟随流式状态持续显示。 -->
          <progress-queue ref="progressQueueRef" loading-text="准备回答中">
            <template #icon>
              <tools-icon />
            </template>
          </progress-queue>
        </div>
      </t-chat-list>

      <!-- 输入框 -->
      <div class="chat-sender-panel">
        <t-chat-sender
          v-model="inputValue"
          class="chat-sender"
          placeholder="给 AI 发送消息"
          :textarea-props="{ autosize: { minRows: 2, maxRows: 6 } }"
          :loading="isChatLoading"
          @send="handleSend"
          @stop="stopMessage"
        >
          <template #footer-prefix>
            <div class="web-search-toggle">
              <t-switch v-model="enableWebSearch" size="small" />
              <span class="web-search-status" :class="{ active: enableWebSearch }">
                <internet-icon />
                {{ enableWebSearch ? '网络搜索已开启' : '网络搜索已关闭' }}
              </span>
            </div>
          </template>
        </t-chat-sender>
      </div>
    </div>

    <!-- 工具调用详情抽屉 -->
    <tool-call-detail-drawer
      v-model:visible="toolDrawerVisible"
      :record-id="toolRecordId"
    />
  </t-layout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { InternetIcon, RobotFilledIcon, ToolsIcon } from 'tdesign-icons-vue-next'
import {
  type AIMessageContent,
  type ChatMessagesData,
  type ChatServiceConfig,
  type SSEChunkData,
  type ChatRequestParams,
  useChat
} from '@tdesign-vue-next/chat'
import ProgressQueue from '../../../components/ProgressQueue.vue'
import {getMessages, isSessionIdHasRunningChat, stopChatStream, chatUrl, retryChatUrl} from '../../../api/chat'
import type { ChatMessage, CustomChatResponse, StreamToolCallMeta, ToolCallMeta } from '../../../api/chat'
import ToolCallDetailDrawer from './ToolCallDetailDrawer.vue'

const HISTORY_RELOAD_DELAYS = [100, 500, 1000, 1500] as const

const MESSAGE_TYPE = {
  SYSTEM: 0,
  USER: 1,
  ASSISTANT: 2,
  TOOL: 3
} as const

type ChatListInstance = {
  scrollToBottom?: (options?: { behavior?: 'auto' | 'smooth' }) => void
  $el?: HTMLElement
}

type DisplayToolCall = {
  id: string
  recordId: string
  type: string | null
  name: string
  arguments: string | null
  result: string | null
}

type ProgressQueueItem = {
  key: string
  label: string
}

type ProgressQueueInstance = {
  push: (item: ProgressQueueItem) => void
  clear: () => void
}

const emit = defineEmits<{
  'refresh-sessions': []
  'session-id-received': [sessionId: string]
}>()

// 当前会话ID由父组件和路由维护；聊天室只负责根据它加载/清空聊天内容。
const currentSessionId = defineModel<string>('currentSessionId', { required: true })
//用户输入问题内容
const inputValue = ref('')
// 是否开启网络搜索
const enableWebSearch = ref(false)
// 是否跳过会话加载
const skipNextSessionLoad = ref(false)
// 当前正在流式生成的一轮对话ID
const activeRecordId = ref('')
// 聊天列表的引用
const chatListRef = ref<ChatListInstance>()
// 工具提示组件
const progressQueueRef = ref<ProgressQueueInstance>()
// 工具调用详情抽屉是否展示
const toolDrawerVisible = ref(false)
// 选中的对话记录id
const toolRecordId = ref('')
//是否重播
const isRetry = ref(false);

// tdesign-chat 的 useChat 配置放在这里，右侧聊天室完整掌握发送、SSE 和完成刷新流程。
const chatServiceConfig: ChatServiceConfig = {
  endpoint: undefined, //请求后端的地址
  stream: true,
  onRequest: chatOnRequest,
  onMessage: chatOnMessage,
  onComplete: chatOnComplete,
  onError: chatOnError
}
/**
 * chatEngine 聊天引擎
 * messages 聊天的上下文所有记录
 *
 */
const { chatEngine, messages, status } = useChat({
  defaultMessages: [],
  chatServiceConfig
})
const isChatLoading = computed(() => status.value === 'pending' || status.value === 'streaming')

//监听当前会话ID的变更
watch(
  currentSessionId,
  async (sessionId) => {
    if (skipNextSessionLoad.value) {
      // 新会话首个 chunk 会同步 sessionId；这时仍在流式输出，不能立刻用历史消息覆盖当前列表。
      skipNextSessionLoad.value = false
      return
    }

    resetRoomState()

    //如果有会话ID，加载列表
    if (sessionId) {
      await loadMessages(sessionId)
      //判断该会话ID是否正在运行中
      const isRunning = await isSessionIdHasRunningChat(sessionId)
      if (isRunning){//进行重播
        chatServiceConfig.endpoint = retryChatUrl + `?sessionId=${encodeURIComponent(sessionId)}`
        isRetry.value = true
        chatEngine.value?.sendAIMessage()
      }
    }else {
      await setChatMessages([])
    }
  },
  { immediate: true }
)


/**
 * 请求发送前的配置。
 * @param params
 */
function chatOnRequest (params: ChatRequestParams) {
  console.log('chatOnRequest', params)
  const requestConfig: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }
  //配置聊天消息参数
  if (chatServiceConfig.endpoint === chatUrl){
    requestConfig.body = JSON.stringify({
      message: params.prompt,
      sessionId: currentSessionId.value || undefined,
      enableWebSearch: enableWebSearch.value
    })
  }
  return requestConfig;

}
/**
 * 解析后端返回的SSE数据。
 */
function chatOnMessage(chunk: SSEChunkData): AIMessageContent | null {
  const data = chunk.data as CustomChatResponse

  if (data?.sessionId && !currentSessionId.value) {
    // 新会话第一次收到 sessionId 时，只同步路由和侧栏，不用历史消息覆盖当前流式内容。
    skipNextSessionLoad.value = true
    currentSessionId.value = data.sessionId
    emit('session-id-received', data.sessionId)
    emit('refresh-sessions')
  }

  if (data?.recordId) {
    activeRecordId.value = data.recordId
  }
  if (!isRetry.value){ //不是重播才展示工具
    showStreamToolCalls(data?.toolCalls)
  }

  if (!data?.content) {
    return null
  }

  if (data.isThinking) {
    return {
      type: 'thinking',
      data: { title: '思考中', text: data.content },
      status: 'streaming',
      strategy: 'merge'
    }
  }

  return {
    type: 'markdown',
    data: data.content,
    strategy: 'merge'
  }
}

/**
 * 请求完成回调。
 */
function chatOnComplete (isAborted: boolean)  {
  if (!isAborted && currentSessionId.value) {
    // 后端保存最终消息可能有一点延迟，所以这里会轮询几次历史消息，避免旧数据覆盖流式结果。
    loadMessagesWhenReady(currentSessionId.value, messages.value.length)
        .then(() => emit('refresh-sessions'))
  }
  activeRecordId.value = ''
  clearStreamToolCalls()
}

/**
 * 错误处理。
 */
function chatOnError(){
  activeRecordId.value = ''
  clearStreamToolCalls()
  MessagePlugin.error('消息发送失败')
}


/**
 * 发送消息。
 * @param value 输入内容
 */
async function handleSend(value: string) {
  const prompt = value.trim()
  if (!prompt) {
    return
  }
  // 聊天消息后端请求url
  chatServiceConfig.endpoint = chatUrl
  // sendUserMessage 会先把用户消息放入 messages，再请求后端 SSE。
  isRetry.value = false
  const sendTask = chatEngine.value?.sendUserMessage({ prompt })
  await nextTick()
  scrollChatToBottom('smooth')
  await sendTask
  inputValue.value = ''
}

/**
 * 停止生成。
 */
async function stopMessage() {
  const recordId = activeRecordId.value
  //前端停止请求
  await chatEngine.value?.abortChat()
  if (recordId) {
    //后端停止生成
    await stopChatStream(recordId)
  }
}

/**
 * 同步聊天列表组件引用给聊天运行时。
 * @param instance 聊天列表组件实例
 */
function setChatListRef(instance: ChatListInstance | null) {
  chatListRef.value = instance || undefined
}

/**
 * 清理聊天室状态。
 */
function resetRoomState() {
  inputValue.value = ''
  activeRecordId.value = ''
  clearStreamToolCalls()
  closeToolCallDrawer()
}

/**
 * 加载历史消息。
 * @param sessionId 业务会话ID
 */
async function loadMessages(sessionId: string) {
  const historyMessages = await getMessages(sessionId)
  await setChatMessages(toChatMessages(historyMessages))
}

/**
 * 设置聊天组件消息。
 * @param nextMessages 聊天消息列表
 */
async function setChatMessages(nextMessages: ChatMessagesData[]) {
  // replace 表示用后端历史消息整体替换 tdesign-chat 内部 messages。
  chatEngine.value?.setMessages(nextMessages, 'replace')
  await nextTick()
  scrollChatToBottom('auto')
}

/**
 * 等待后端历史消息落库后再刷新列表。
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
    if (nextMessages.length >= minVisibleCount) {
      await setChatMessages(nextMessages)
      return
    }
  }
}

/**
 * 滚动聊天列表到底部。
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
 * 将后端消息转换为TDesign Chat消息。
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
 * 收集每轮对话中的工具调用信息。
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
        recordId: message.recordId,
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
 * 获取后端消息中的工具调用列表。
 * @param message 后端消息
 * @returns 工具调用列表
 */
function getBackendToolCalls(message: ChatMessage): ToolCallMeta[] {
  return message.metaJson?.toolCalls?.filter((toolCall): toolCall is ToolCallMeta => Boolean(toolCall)) || []
}

/**
 * 判断是否为AI发起工具调用的中间消息。
 * @param message 后端消息
 * @returns 是否为工具调用中间消息
 */
function isAssistantToolCallRecord(message: ChatMessage) {
  return message.type === MESSAGE_TYPE.ASSISTANT && getBackendToolCalls(message).length > 0
}

/**
 * 获取聊天消息中的工具调用列表。
 * @param message 聊天消息
 * @returns 工具调用列表
 */
function getMessageToolCalls(message: ChatMessagesData): DisplayToolCall[] {
  const ext = message.ext as { toolCalls?: DisplayToolCall[] } | undefined
  return ext?.toolCalls || []
}

/**
 * 获取消息对应的一轮对话ID。
 * @param message 聊天消息
 * @returns 一轮对话ID
 */
function getMessageToolRecordId(message: ChatMessagesData) {
  return getMessageToolCalls(message).find(toolCall => toolCall.recordId)?.recordId || ''
}

/**
 * 获取消息中的Markdown文本。
 * @param message 聊天消息
 * @returns Markdown文本
 */
function getMessageMarkdown(message: ChatMessagesData) {
  const content = message.content?.find(item => item.type === 'markdown' || item.type === 'text')
  return typeof content?.data === 'string' ? content.data : ''
}

/**
 * 获取消息气泡方向。
 * @param message 聊天消息
 * @returns 气泡方向
 */
function getMessagePlacement(message: ChatMessagesData) {
  return message.role === 'user' ? 'right' : 'left'
}

/**
 * 获取消息气泡样式。
 * @param message 聊天消息
 * @returns 气泡样式
 */
function getMessageVariant(message: ChatMessagesData) {
  return message.role === 'user' ? 'base' : 'text'
}

/**
 * 获取消息头像。
 * @param message 聊天消息
 * @returns 头像地址
 */
function getMessageAvatar(message: ChatMessagesData) {
  return message.role === 'user'
    ? 'https://tdesign.gtimg.com/site/avatar.jpg'
    : 'https://tdesign.gtimg.com/site/chat-avatar.png'
}

/**
 * 获取消息展示名称。
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
 * 打开工具调用抽屉。
 * @param recordId 一轮对话ID
 */
function openToolCallDrawer(recordId: string) {
  if (!recordId) {
    return
  }

  toolRecordId.value = recordId
  toolDrawerVisible.value = true
}

/**
 * 关闭工具调用抽屉。
 */
function closeToolCallDrawer() {
  toolRecordId.value = ''
  toolDrawerVisible.value = false
}

/**
 * 格式化工具调用摘要。
 * @param toolCalls 工具调用列表
 * @returns 摘要文本
 */
function formatToolSummary(toolCalls: DisplayToolCall[]) {
  return `调用 ${toolCalls.length} 个工具`
}

/**
 * 展示本次流式返回的工具调用状态。
 * @param toolCalls 流式工具调用列表
 */
function showStreamToolCalls(toolCalls?: Array<StreamToolCallMeta | null> | null) {
  const nextToolCalls = toolCalls?.filter((toolCall): toolCall is StreamToolCallMeta => Boolean(toolCall)) || []
  if (!nextToolCalls.length) {
    return
  }

  nextToolCalls.forEach(toolCall => progressQueueRef.value?.push(toProgressQueueItem(toolCall)))
  nextTick(() => scrollChatToBottom('smooth'))
}

/**
 * 清空流式工具调用展示状态。
 */
function clearStreamToolCalls() {
  progressQueueRef.value?.clear()
}

/**
 * 获取流式工具调用去重Key。
 * @param toolCall 流式工具调用
 * @returns 去重Key
 */
function getStreamToolKey(toolCall?: StreamToolCallMeta | null) {
  if (!toolCall) {
    return ''
  }
  return `${toolCall.toolName || 'tool'}-${toolCall.label || ''}`
}

/**
 * 转换为进度队列展示项。
 * @param toolCall 流式工具调用
 * @returns 进度队列展示项
 */
function toProgressQueueItem(toolCall: StreamToolCallMeta | null): ProgressQueueItem {
  return {
    key: getStreamToolKey(toolCall),
    label: toolCall?.label || `正在调用 ${toolCall?.toolName || '工具'}`
  }
}

/**
 * 延迟指定毫秒数。
 * @param delayMs 延迟时间
 */
function sleep(delayMs: number) {
  return new Promise(resolve => window.setTimeout(resolve, delayMs))
}
</script>

<style scoped>
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

.chat-progress-queue {
  margin: 2px 0 18px 66px;
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

.web-search-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.web-search-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.web-search-status.active {
  color: #366ef4;
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

@media (max-width: 760px) {
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

  .chat-progress-queue {
    margin-left: 54px;
  }

  .chat-sender-panel {
    padding: 10px 12px 12px;
  }

  .web-search-toggle {
    gap: 6px;
  }

  .web-search-status {
    font-size: 11px;
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
