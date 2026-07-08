<template>
  <div v-if="loadingVisible" class="progress-queue">
    <div v-if="currentItem" :key="currentItem.key" class="progress-queue__item">
      <span v-if="$slots.icon" class="progress-queue__icon">
        <slot name="icon" :item="currentItem" />
      </span>
      <span class="progress-queue__label">{{ currentItem.label }}</span>
    </div>
    <div class="progress-queue__loading">
      <t-loading size="small" />
      <span>{{ loadingText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import debounce from 'lodash-es/debounce'

type ProgressQueueItem = {
  key: string
  label: string
}

const props = withDefaults(
  defineProps<{
    loadingText?: string
    intervalMs?: number
  }>(),
  {
    loadingText: '处理中',
    intervalMs: 2000
  }
)

const queue = ref<ProgressQueueItem[]>([])
const currentItem = ref<ProgressQueueItem>()
const loadingVisible = ref(false)
const scheduleNextItem = debounce(showNextItem, props.intervalMs)

defineExpose({
  push,
  clear
})

/**
 * 组件卸载时清理定时器。
 */
onBeforeUnmount(() => {
  scheduleNextItem.cancel()
})

/**
 * 显示队列中的下一条进度提示。
 */
function showNextItem() {
  const nextItem = queue.value.shift()
  if (!nextItem) {
    currentItem.value = undefined
    return
  }

  currentItem.value = nextItem
  scheduleNextItem()
}

/**
 * 推入一条进度提示。
 * @param item 进度提示
 */
function push(item: ProgressQueueItem) {
  queue.value.push(item)
  loadingVisible.value = true

  // 当前没有正在展示的提示时，立即从队列里取一条展示。
  if (!currentItem.value) {
    showNextItem()
  }
}

/**
 * 清空进度队列。
 */
function clear() {
  queue.value = []
  currentItem.value = undefined
  loadingVisible.value = false
  scheduleNextItem.cancel()
}
</script>

<style scoped>
.progress-queue {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.progress-queue__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, calc(100% - 24px));
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
  animation: progress-queue-fade 0.22s ease;
}

.progress-queue__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 16px;
}

.progress-queue__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-queue__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 18px;
}

@keyframes progress-queue-fade {
  from {
    opacity: 0;
    transform: translateY(3px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .progress-queue__item {
    max-width: calc(100% - 16px);
    font-size: 12px;
  }
}
</style>
