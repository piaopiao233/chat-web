<template>
  <t-aside class="session-sidebar" width="262px">
    <div class="sidebar-header">
      <t-button class="new-chat-btn" variant="outline" shape="round" block @click="$emit('create')">
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
        <div class="session-main" @click="$emit('switch', session)">
          <div class="session-title" :title="session.title">{{ session.title || '未命名会话' }}</div>
        </div>
        <t-dropdown
          class="session-menu"
          trigger="click"
          :options="sessionActions"
          @click="handleSessionAction($event, session)"
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

    <session-rename-dialog
      v-model:visible="renameVisibleModel"
      v-model:title="renameTitleModel"
      :loading="renameLoading"
      @confirm="handleRenameConfirm"
    />
  </t-aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { AddCircleIcon, MoreIcon } from 'tdesign-icons-vue-next'
import { deleteSession, updateSessionTitle } from '../../../api/chat'
import type { ChatSession } from '../../../api/chat'
import SessionRenameDialog from './SessionRenameDialog.vue'

defineProps<{
  sessions: ChatSession[]
  currentSessionId: string
}>()

const emit = defineEmits<{
  create: []
  switch: [session: ChatSession]
  deleted: [session: ChatSession]
  renamed: [session: ChatSession]
}>()

const sessionActions = [
  { content: '修改标题', value: 'rename' },
  { content: '删除会话', value: 'delete', theme: 'error' }
]

const renameVisible = ref(false)
const renameLoading = ref(false)
const renameTitle = ref('')
const renameSession = ref<ChatSession>()

// 这两个 computed 是为了给 SessionRenameDialog 使用 v-model，同时把状态留在会话侧栏内部。
const renameVisibleModel = computed({
  get: () => renameVisible.value,
  set: value => {
    renameVisible.value = value
  }
})

const renameTitleModel = computed({
  get: () => renameTitle.value,
  set: value => {
    renameTitle.value = value
  }
})

/**
 * 打开会话重命名弹窗。
 * @param session 会话信息
 */
function openRenameDialog(session: ChatSession) {
  renameSession.value = session
  renameTitle.value = session.title
  renameVisible.value = true
}

/**
 * 保存会话标题。
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
    emit('renamed')
    MessagePlugin.success('标题已更新')
  } finally {
    renameLoading.value = false
  }
}

/**
 * 处理会话操作菜单。
 * @param action 操作类型
 * @param session 会话信息
 */
function handleSessionAction(action: unknown, session: ChatSession) {
  const actionValue = getDropdownValue(action)
  if (actionValue === 'rename') {
    openRenameDialog(session)
    return
  }

  if (actionValue === 'delete') {
    confirmDeleteSession(session)
  }
}

/**
 * 删除会话前确认并执行删除。
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
      dialog.setConfirmLoading?.(true)
      try {
        await deleteSession(session.id)
        emit('deleted', session)
        MessagePlugin.success('会话已删除')
        dialog.hide()
      } finally {
        dialog.setConfirmLoading?.(false)
      }
    }
  })
}

/**
 * 获取下拉菜单选中的值。
 * @param action 下拉菜单事件数据
 * @returns 操作值
 */
function getDropdownValue(action: unknown) {
  if (typeof action === 'object' && action && 'value' in action) {
    return String((action as { value: unknown }).value)
  }
  return String(action)
}
</script>

<style scoped>
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

@media (max-width: 760px) {
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
}
</style>
