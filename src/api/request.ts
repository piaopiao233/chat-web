import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'
import { API_BASE_URL } from '../config'

/**
 * 后端统一返回结构
 */
interface Result<T> {
  /** 状态码 */
  code: number
  /** 提示信息 */
  msg: string
  /** 业务数据 */
  data: T
}

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
})

request.interceptors.response.use(
  response => {
    const result = response.data as Result<unknown>

    // 后端 Result 结构统一在这里拆包，业务层只处理 data。
    if (result && typeof result.code === 'number') {
      if (result.code === 200) {
        return result.data
      }

      MessagePlugin.error(result.msg || '系统异常')
      return Promise.reject(result)
    }

    return response.data
  },
  error => {
    const message = error?.response?.data?.msg || error?.message || '网络错误'
    MessagePlugin.error(message === 'Network Error' ? '网络错误' : message)
    return Promise.reject(error)
  }
)

export default request
