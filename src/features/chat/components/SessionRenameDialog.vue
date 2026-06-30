<template>
  <t-dialog
    v-model:visible="visibleModel"
    header="修改会话标题"
    confirm-btn="保存"
    cancel-btn="取消"
    :confirm-loading="loading"
    @confirm="$emit('confirm')"
  >
    <t-input v-model="titleModel" clearable placeholder="请输入会话标题" />
  </t-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  title: string
  loading: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:title': [value: string]
  confirm: []
}>()

// 这里把弹窗自身的 v-model 转发给父组件 ChatSessionSidebar。
const visibleModel = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
})

// 标题输入框也是同理，弹窗不保存业务状态，只负责展示和输入。
const titleModel = computed({
  get: () => props.title,
  set: value => emit('update:title', value)
})
</script>
