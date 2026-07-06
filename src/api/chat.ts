import request from './request'
import {API_BASE_URL} from "../config";

// 聊天消息的url
export const chatUrl =`${API_BASE_URL}/ChatMessage/message`
//重连消息的 url
export const retryChatUrl = `${API_BASE_URL}/ChatMessage/message/reconnect`

/**
 * 聊天消息响应
 */
export interface CustomChatResponse {
  /** 当前chunk的文本 */
  content: string
  /** 是否属于思考过程 */
  isThinking: boolean
  /** 会话ID */
  sessionId: string
  /** 对话ID */
  recordId: string
  /** token数量 */
  tokenCount: number | null
  /** 是否开启网络搜索 */
  enableWebSearch?: boolean
  /** 流式工具调用提示 */
  toolCalls?: Array<StreamToolCallMeta | null> | null
}

/**
 * 流式工具调用元数据
 */
export interface StreamToolCallMeta {
  /** 工具名称 */
  toolName: string | null
  /** 工具参数JSON */
  toolArguments: string | null
  /** 工具调用展示文案 */
  label: string | null
}

/**
 * 会话信息
 */
export interface ChatSession {
  /** 数据库主键，改名和删除使用 */
  id: number
  /** 业务会话ID，查询历史和发送消息使用 */
  sessionId: string
  /** 会话标题 */
  title: string
  /** 创建时间 */
  createTime: string
  /** 最近更新时间 */
  updateTime: string
}

/**
 * 工具调用元数据
 */
export interface ToolCallMeta {
  /** 工具调用ID */
  id: string | null
  /** 工具调用类型 */
  type: string | null
  /** 工具名称 */
  name: string | null
  /** 工具参数JSON */
  arguments: string | null
  /** 工具执行结果 */
  result: string | null
}

/**
 * 消息扩展元数据
 */
export interface ChatMessageMetaJson {
  /** 工具调用列表 */
  toolCalls?: ToolCallMeta[] | null
  /** 图片信息 */
  images?: unknown[] | null
  /**思考过程 */
  thinking?: string | null
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息ID */
  id: number
  /** 消息类型：0-系统, 1-用户, 2-AI, 3-工具 */
  type: number
  /** 会话ID */
  sessionId: string
  /** 对话ID */
  recordId: string
  /** 消息内容 */
  content: string | null
  /** 消息扩展元数据 */
  metaJson: ChatMessageMetaJson | null
  /** token数量 */
  tokenCount: number | null
  /** 创建时间 */
  createTime: string
}

/**
 * 分页响应结构
 */
export interface PageResult<T> {
  /** 总数 */
  total: number
  /** 当前页 */
  pageNum: number
  /** 每页数量 */
  pageSize: number
  /** 记录列表 */
  records: T[]
}

/**
 * 获取会话列表
 * @param pageNum 页码
 * @param pageSize 每页数量
 * @returns 会话分页数据
 */
export async function getSessions(pageNum = 1, pageSize = 20): Promise<PageResult<ChatSession>> {
  return request.get<unknown, PageResult<ChatSession>>('/ChatSession/list', {
    params: { pageNum, pageSize }
  })
}

/**
 * 获取历史消息列表
 * @param sessionId 会话ID
 * @returns 消息列表
 */
export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  return request.get<unknown, ChatMessage[]>('/ChatMessage/selectBySessionId', {
    params: { sessionId }
  })
}

/**
 * 根据对话ID获取本轮工具调用详情
 * @param recordId 对话ID
 * @returns 工具调用详情列表
 */
export async function getToolCallsByRecordId(recordId: string): Promise<ToolCallMeta[]> {
  return request.get<unknown, ToolCallMeta[]>('/ChatMessage/selectToolCallsByRecordId', {
    params: { recordId }
  })
}

/**
 * 停止指定对话的流式生成
 * @param recordId 对话ID
 */
export async function stopChatStream(recordId: string): Promise<void> {
  await request.post<unknown, void>('/ChatMessage/message/stop', null, {
    params: { recordId }
  })
}

/**
 * 修改会话标题
 * @param id 数据库主键
 * @param title 新标题
 */
export async function updateSessionTitle(id: number, title: string): Promise<void> {
  await request.post<unknown, void>('/ChatSession/update', { id, title })
}

/**
 * 删除会话
 * @param id 数据库主键
 */
export async function deleteSession(id: number): Promise<void> {
  await request.get<unknown, void>('/ChatSession/delete', {
    params: { id }
  })
}

/**
 * 查询sessionId 有没有正在进行的聊天
 */
export async function isSessionIdHasRunningChat(sessionId: string): Promise<boolean> {
 return await request.get<unknown, boolean>('/ChatMessage/isSessionIdHasRunningChat', {
    params: { sessionId }
  })
}
