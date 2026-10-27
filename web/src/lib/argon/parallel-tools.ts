import { LIST_NAME, READ_NAME, SEARCH_NAME } from "./source-tools"

/** Công cụ chỉ ĐỌC, không có hạn mức theo log, không đụng gohub_dw (pool dùng chung): chạy song song khi model gọi nhiều cái trong cùng một lượt. sql/run_code/layDuLieuHeThong/ghi/hỏi vẫn tuần tự. */
export const PARALLEL_SAFE: ReadonlySet<string> = new Set([LIST_NAME, READ_NAME, SEARCH_NAME, "lietKeFile", "docFile", "traSuViec", "traMail", "traThucThe", "timTrenWeb", "docLark", "docLarkBase", "traBangSupabase", "docTrang", "docPortal"])

/** Gom các lời gọi LIỀN NHAU an toàn song song thành một nhóm; còn lại mỗi lời gọi một nhóm (giữ nguyên thứ tự). Thuần. */
export function groupCalls<T extends { name?: string }>(calls: T[]): T[][] {
  const out: T[][] = []
  for (const c of calls) {
    const last = out[out.length - 1]
    if (last && PARALLEL_SAFE.has(String(c.name)) && PARALLEL_SAFE.has(String(last[0].name))) last.push(c)
    else out.push([c])
  }
  return out
}
