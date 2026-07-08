import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'
const DATE_TIME_PARSE_FORMATS = [
  DATE_TIME_FORMAT,
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ssZ'
]
const FORMATTED_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/**
 * 格式化日期时间。
 * @param datetime 日期时间、秒时间戳或毫秒时间戳
 * @returns YYYY-MM-DD HH:mm:ss 格式的时间
 */
export function formatDateTime(datetime?: string | number | null) {
  if (datetime === undefined || datetime === null || datetime === '') {
    return ''
  }

  const normalizedDatetime = String(datetime).trim()
  if (FORMATTED_DATE_TIME_PATTERN.test(normalizedDatetime)) {
    return normalizedDatetime
  }
  const timestamp = Number(normalizedDatetime)
  const parsedDate = /^\d+$/.test(normalizedDatetime)
    ? dayjs(normalizedDatetime.length === 10 ? timestamp * 1000 : timestamp)
    : dayjs(normalizedDatetime, DATE_TIME_PARSE_FORMATS, true)
  const date = parsedDate.isValid() ? parsedDate : dayjs(normalizedDatetime)

  if (!date.isValid()) {
    return normalizedDatetime
  }

  return date.format(DATE_TIME_FORMAT)
}
