<template>
  <t-drawer
    v-model:visible="visibleModel"
    header="工具调用"
    placement="right"
    size="min(440px, 92vw)"
    :footer="false"
  >
    <t-loading :loading="loading" text="加载工具详情中">
      <div v-if="hasToolDisplay" class="tool-drawer-list">
        <section v-if="webSearchGroups.length" class="tool-section">
          <div class="tool-section-title">
            <internet-icon />
            <span>网络搜索</span>
            <t-tag size="small" variant="light">{{ webSearchGroups.length }} 个搜索词</t-tag>
          </div>

          <t-collapse :default-value="[]" expand-icon-placement="right">
            <t-collapse-panel
              v-for="(group, index) in webSearchGroups"
              :key="group.query"
              :value="index"
            >
              <template #header>
                <div class="web-search-query">
                  <span class="web-search-query-label">搜索词</span>
                  <span class="web-search-query-text">{{ group.query }}</span>
                  <t-tag size="small" variant="light">{{ group.results.length }} 个网址</t-tag>
                </div>
              </template>

              <div v-if="group.results.length" class="web-search-results">
                <a
                  v-for="(result, resultIndex) in group.results"
                  :key="`${group.query}-${result.url}-${resultIndex}`"
                  class="web-search-link"
                  :href="result.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="web-search-link-title">{{ result.title || result.url }}</span>
                  <span class="web-search-link-url">{{ result.url }}</span>
                </a>
              </div>
              <div v-else class="web-search-empty">暂无搜索结果</div>
            </t-collapse-panel>
          </t-collapse>
        </section>

        <section v-if="normalToolCalls.length" class="tool-section">
          <div class="tool-section-title">
            <tools-icon />
            <span>工具调用</span>
            <t-tag size="small" variant="light">{{ normalToolCalls.length }} 个工具</t-tag>
          </div>

          <t-collapse :default-value="[0]" expand-icon-placement="right">
            <t-collapse-panel
              v-for="(tool, index) in normalToolCalls"
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
                <pre class="tool-detail-code">{{ tool.arguments || '暂无' }}</pre>
              </div>
              <div class="tool-detail-block">
                <div class="tool-detail-label">结果</div>
                <pre class="tool-detail-code">{{ tool.result || '暂无' }}</pre>
              </div>
            </t-collapse-panel>
          </t-collapse>
        </section>
      </div>
      <t-empty v-else description="暂无工具调用" />
    </t-loading>
  </t-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { InternetIcon, ToolsIcon } from 'tdesign-icons-vue-next'
import isPlainObject from 'lodash-es/isPlainObject'
import { getToolCallsByRecordId } from '../../../api/chat'
import type { ToolCallMeta } from '../../../api/chat'

const WEB_SEARCH_TOOL_NAME = 'web_search'

type WebSearchResultItem = {
  url: string
  title: string
  message: string
  code: number | string | null
}

type WebSearchGroup = {
  query: string
  results: WebSearchResultItem[]
}

const props = defineProps<{
  visible: boolean
  recordId: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const toolCalls = ref<ToolCallMeta[]>([])
const loading = ref(false)

const normalToolCalls = computed(() => toolCalls.value.filter(tool => tool.name !== WEB_SEARCH_TOOL_NAME))
const webSearchGroups = computed(() => buildWebSearchGroups(toolCalls.value))
const hasToolDisplay = computed(() => normalToolCalls.value.length > 0 || webSearchGroups.value.length > 0)

const visibleModel = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
})

watch(
  () => [props.visible, props.recordId] as const,
  async ([visible, recordId]) => {
    if (!visible) {
      return
    }

    if (!recordId) {
      toolCalls.value = []
      return
    }

    await loadToolCalls(recordId)
  },
  { immediate: true }
)

/**
 * 根据一轮对话ID加载工具调用详情。
 * @param recordId 一轮对话ID
 */
async function loadToolCalls(recordId: string) {
  loading.value = true
  toolCalls.value = []

  try {
    toolCalls.value = await getToolCallsByRecordId(recordId)
  } catch {
    MessagePlugin.error('工具详情加载失败')
  } finally {
    loading.value = false
  }
}

/**
 * 聚合网络搜索工具调用。
 * @param tools 工具调用列表
 * @returns 按搜索词聚合后的网络搜索结果
 */
function buildWebSearchGroups(tools: ToolCallMeta[]) {
  const groupMap = new Map<string, WebSearchGroup>()

  tools
    .filter(tool => tool.name === WEB_SEARCH_TOOL_NAME)
    .forEach((tool) => {
      const query = (JSON.parse(tool.arguments || '{}') as { query: string }).query
      const existsGroup = groupMap.get(query)
      const group = existsGroup || { query, results: [] }

      group.results.push(...parseWebSearchResults(tool.result))
      groupMap.set(query, group)
    })

  return Array.from(groupMap.values())
}

/**
 * 解析网络搜索结果。
 * @param value 工具结果
 * @returns 可展示的搜索结果
 */
function parseWebSearchResults(value: string | null) {
  if (!value) {
    return []
  }

  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map(item => normalizeWebSearchResult(item))
    .filter((item): item is WebSearchResultItem => Boolean(item))
}

/**
 * 归一化单条网络搜索结果。
 * @param value 搜索结果原始数据
 * @returns 可展示的搜索结果
 */
function normalizeWebSearchResult(value: unknown) {
  if (!isPlainObject(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const url = record.url
  if (!url) {
    return null
  }
  return {
    url,
    title: record.title || '',
    message: record.message,
    code: record.code
  }
}
</script>

<style scoped>
.tool-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
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

.web-search-query {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.web-search-query-label {
  flex: 0 0 auto;
  padding: 1px 6px;
  color: #2563eb;
  font-size: 12px;
  line-height: 18px;
  background: #dbeafe;
  border-radius: 4px;
}

.web-search-query-text {
  min-width: 0;
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  word-break: break-word;
}

.web-search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.web-search-link {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 9px 10px;
  text-decoration: none;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.web-search-link:hover {
  border-color: #93c5fd;
  box-shadow: 0 6px 18px rgb(37 99 235 / 10%);
  transform: translateY(-1px);
}

.web-search-link-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  word-break: break-word;
}

.web-search-link-url {
  color: #2563eb;
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
}

.web-search-empty {
  padding: 10px;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}
</style>
