import { ref } from 'vue'
import { getSessions } from '../../../api/chat'
import type { ChatSession } from '../../../api/chat'

/**
 * 管理聊天会话列表和会话操作。
 */
export function useChatSessions() {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref('')

  /**
   * 刷新会话列表。
   */
  async function refreshSessions() {
    const page = await getSessions(1, 20)
    sessions.value = page.records || []
  }

  /**
   * 创建新会话。
   */
  function createSession() {
    currentSessionId.value = ''
  }

  return {
    sessions,
    currentSessionId,
    refreshSessions,
    createSession
  }
}
