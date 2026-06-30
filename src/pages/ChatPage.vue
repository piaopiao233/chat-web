<template>
  <t-layout class="chat-page">
    <!-- 左侧：会话列表。 -->
    <chat-session-sidebar
      :sessions="sessions"
      :current-session-id="currentSessionId"
      @create="handleCreateSession"
      @switch="handleSwitchSession"
      @deleted="handleSessionDeleted"
      @renamed="refreshSessions"
    />

    <!-- 右侧：聊天室。消息、输入框、工具抽屉、网络搜索都收在 ChatRoom 里。 -->
    <chat-room
      v-model:current-session-id="currentSessionId"
      @session-id-received="handleSessionIdReceived"
      @refresh-sessions="refreshSessions"
    />
  </t-layout>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatRoom from '../features/chat/components/ChatRoom.vue'
import ChatSessionSidebar from '../features/chat/components/ChatSessionSidebar.vue'
import { useChatSessions } from '../features/chat/composables/useChatSessions'
import type { ChatSession } from '../api/chat'

const route = useRoute()
const router = useRouter()

// 会话列表和当前会话ID放在页面层，因为它们需要和路由同步。
const sessionsState = useChatSessions()

// 这里是“解构响应式对象”。这些值本身仍然是 ref，模板里可以直接使用。
const {
  sessions,
  currentSessionId,
  refreshSessions,
  createSession
} = sessionsState

syncSessionFromRoute()

onMounted(async () => {
  await refreshSessions()
})

watch(
  () => route.params.sessionId,
  () => {
    syncSessionFromRoute()
  }
)

/**
 * 创建新会话，并把地址同步回 /chat。
 */
function handleCreateSession() {
  createSession()
  router.push({ name: 'chat', params: {} })
}

/**
 * 切换会话。
 * @param session 会话信息
 */
async function handleSwitchSession(session: ChatSession) {
  if (session.sessionId === currentSessionId.value) {
    return
  }
  await router.push({ name: 'chat', params: { sessionId: session.sessionId } })
}

/**
 * 处理会话删除后的收口逻辑。
 * @param session 被删除的会话
 */
function handleSessionDeleted(session: ChatSession) {
  refreshSessions()

  if (session.sessionId === currentSessionId.value) {
    createSession()
    router.push({ name: 'chat', params: {} })
  }
}

/**
 * 后端第一次返回新会话ID时，同步地址栏。
 * @param sessionId 会话ID
 */
function handleSessionIdReceived(sessionId: string) {
  if (getRouteSessionId() === sessionId) {
    return
  }
  router.replace({ name: 'chat', params: { sessionId } })
}

/**
 * 从路由参数同步当前会话ID。
 */
function syncSessionFromRoute() {
  const routeSessionId = getRouteSessionId()
  if ((routeSessionId || '') === currentSessionId.value) {
    return
  }

  currentSessionId.value = routeSessionId || ''
}

/**
 * 获取路由里的会话ID。
 * @returns 会话ID
 */
function getRouteSessionId() {
  const sessionId = route.params.sessionId
  return Array.isArray(sessionId) ? sessionId[0] : sessionId
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

@media (max-width: 760px) {
  .chat-page {
    flex-direction: column;
  }
}
</style>
