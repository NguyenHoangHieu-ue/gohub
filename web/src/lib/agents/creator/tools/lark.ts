import { getLarkToken, getLarkUserToken, getLarkUserOpenId } from "@/lib/lark"

const LARK = "https://open.larksuite.com/open-apis"

// Lark Task v2 due.timestamp = MILI giây (trước đây gửi giây → hạn rơi về 01/1970). Chuỗi giờ không kèm múi giờ
// hiểu là giờ VN (server Vercel chạy UTC, new Date("2026-09-24T15:00") sẽ lệch 7 tiếng).
export function dueMs(due: string): string {
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(due)
  const iso = !hasTz && /T\d{2}:\d{2}/.test(due) ? `${due}+07:00` : !hasTz && /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T23:59:00+07:00` : due
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) throw new Error(`due không hợp lệ: ${due}`)
  return String(ms)
}

export async function runLarkTask(action: string, args: any): Promise<any> {
  try {
    const userToken = await getLarkUserToken()
    const appToken  = await getLarkToken()
    // Assignee: env LARK_CREATOR_USER_ID, fallback open_id đã kết nối Lark cá nhân
    const creatorOpenId = process.env.LARK_CREATOR_USER_ID || (await getLarkUserOpenId()) || ""
    const h: Record<string, string> = {
      "Authorization": `Bearer ${userToken || appToken}`,
      "Content-Type": "application/json",
    }
    if (!userToken && creatorOpenId) h["X-Lark-Request-User-Open-Id"] = creatorOpenId

    const needsUserToken = action === "listLarkTasks" || action === "listLarkTasklists"
    if (needsUserToken && !userToken)
      return { error: "Chưa kết nối Lark để duyệt task cá nhân. Vào Gấu Pro bấm 'Kết nối Lark' để cấp quyền, rồi thử lại." }

    if (action === "listLarkTasklists") {
      const res = await fetch(`${LARK}/task/v2/tasklists?page_size=100&user_id_type=open_id`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d, note: "Cần scope task:tasklist:read." }
      const lists = (d.data?.items || []).map((t: any) => ({ guid: t.guid, name: t.name }))
      return { tasklists: lists, hint: "Gọi listLarkTasks với tasklist_guid để xem task bên trong." }
    }
    if (action === "listLarkTasks") {
      const ps = Math.min(args?.page_size || 20, 50)
      const qs = new URLSearchParams({ page_size: String(ps), user_id_type: "open_id" })
      if (args?.page_token) qs.set("page_token", args.page_token)
      const url = args?.tasklist_guid
        ? `${LARK}/task/v2/tasklists/${encodeURIComponent(args.tasklist_guid)}/tasks?${qs}`
        : `${LARK}/task/v2/tasks?${qs}`
      const res = await fetch(url, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "getLarkTask") {
      const res = await fetch(`${LARK}/task/v2/tasks/${encodeURIComponent(args.task_guid)}?user_id_type=open_id`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "createLarkTask") {
      const body: any = {
        summary: args.summary,
        members: creatorOpenId ? [{ id: creatorOpenId, type: "user", role: "assignee" }] : undefined,
      }
      if (args.description) body.description = { content: args.description, content_type: "markdown" }
      if (args.due) body.due = { timestamp: dueMs(args.due) }
      const res = await fetch(`${LARK}/task/v2/tasks?user_id_type=open_id`, { method: "POST", headers: h, body: JSON.stringify(body) })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    if (action === "updateLarkTask") {
      const body: any = { task: {}, update_fields: [] as string[] }
      if (args.summary)     { body.task.summary = args.summary; body.update_fields.push("summary") }
      if (args.description) { body.task.description = { content: args.description, content_type: "markdown" }; body.update_fields.push("description") }
      if (args.due)         { body.task.due = { timestamp: dueMs(args.due) }; body.update_fields.push("due") }
      if (args.complete)    { body.task.completed_at = String(Date.now() / 1000 | 0); body.update_fields.push("completed_at") }
      const res = await fetch(`${LARK}/task/v2/tasks/${encodeURIComponent(args.task_guid)}?user_id_type=open_id`, { method: "PATCH", headers: h, body: JSON.stringify(body) })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return d.data || d
    }
    return { error: `Unknown action: ${action}` }
  } catch (e: any) { return { error: e.message } }
}

export async function runLarkBase(args: any): Promise<any> {
  try {
    const token = await getLarkToken()
    const creatorOpenId = process.env.LARK_CREATOR_USER_ID || ""
    const h: Record<string, string> = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    if (creatorOpenId) h["X-Lark-Request-User-Open-Id"] = creatorOpenId

    if (!args?.app_token) {
      const res = await fetch(`${LARK}/bitable/v1/apps?page_size=50`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d, note: "Cần scope bitable:app:readonly." }
      return { hint: "Truyền app_token để xem tables trong 1 Base.", ...(d.data || d) }
    }
    if (!args?.table_id) {
      const res = await fetch(`${LARK}/bitable/v1/apps/${encodeURIComponent(args.app_token)}/tables?page_size=100`, { headers: h })
      const d = await res.json()
      if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
      return { hint: "Truyền cả app_token + table_id để đọc records.", ...(d.data || d) }
    }
    const ps = Math.min(args?.page_size || 50, 200)
    const qs = new URLSearchParams({ page_size: String(ps) })
    if (args?.filter) qs.set("filter", args.filter)
    const res = await fetch(`${LARK}/bitable/v1/apps/${encodeURIComponent(args.app_token)}/tables/${encodeURIComponent(args.table_id)}/records?${qs}`, { headers: h })
    const d = await res.json()
    if (d.code && d.code !== 0) return { error: `Lark API error ${d.code}: ${d.msg}`, raw: d }
    const records = (d.data?.items || []).map((r: any) => ({ record_id: r.record_id, ...r.fields }))
    return { records, total: d.data?.total, has_more: d.data?.has_more, page_token: d.data?.page_token }
  } catch (e: any) { return { error: e.message } }
}
