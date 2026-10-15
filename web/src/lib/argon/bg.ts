import { supabaseAdmin } from "@/lib/supabase"
import type { ToolLogEntry } from "./tools"

// Trạng thái phụ của lượt chạy Phòng Argon, lưu ở app_settings (không cần migration):
//   argon_bg:<runId>         = việc nền đang chạy (người giao, nhịp tim, cờ công cụ…) — xoá khi xong, nên danh sách quét luôn nhỏ
//   argon_run_tools:<runId>  = nhật ký gọi công cụ của lượt (kết quả đầy đủ, để đoạn sau và Hiếu xem lại)
export const MAX_BG_SEGMENTS = 40            // ≈ 3 giờ chạy thật
export const MAX_BG_COST_USD = 10
export const BG_STALE_MS = 6 * 60_000        // đoạn "running" quá lâu không có nhịp tim = request đã chết → cho chạy lại

export interface BgState { username: string; projectId: string; allowTools: boolean; thinking: string; startedAt: string; heartbeat: string }

const bgKey = (runId: string) => `argon_bg:${runId}`
const toolsKey = (runId: string) => `argon_run_tools:${runId}`

async function put(key: string, label: string, value: unknown) {
  await supabaseAdmin.from("app_settings").upsert({ key, value: JSON.stringify(value), category: "argon", label, updated_at: new Date().toISOString() }, { onConflict: "key" })
}
async function get<T>(key: string): Promise<T | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle()
  if (!data?.value) return null
  try { return (typeof data.value === "string" ? JSON.parse(data.value) : data.value) as T } catch { return null }
}

export const getBg = (runId: string) => get<BgState>(bgKey(runId))
export const setBg = (runId: string, s: BgState) => put(bgKey(runId), "Việc nền Phòng Argon", s)
export const touchBg = async (runId: string, s: BgState) => setBg(runId, { ...s, heartbeat: new Date().toISOString() })
export const deleteBg = async (runId: string) => { await supabaseAdmin.from("app_settings").delete().eq("key", bgKey(runId)) }
export async function listBgRunIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("key").like("key", "argon_bg:%")
  return (data ?? []).map(r => String(r.key).slice("argon_bg:".length))
}

export const getToolLog = async (runId: string): Promise<ToolLogEntry[]> => (await get<ToolLogEntry[]>(toolsKey(runId))) ?? []
export const saveToolLog = (runId: string, log: ToolLogEntry[]) => put(toolsKey(runId), "Nhật ký công cụ lượt chạy Argon", log)
export const deleteToolLog = async (runId: string) => { await supabaseAdmin.from("app_settings").delete().eq("key", toolsKey(runId)) }

/** Gọi worker chạy 1 đoạn (request mới = 300s mới). Worker trả 202 ngay nên chờ được. */
export function triggerWorker(origin: string, runId: string): Promise<void> {
  return fetch(`${origin}/api/creator/argon/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ runId }),
    cache: "no-store",
  }).then(() => {}, e => console.error("[argon worker] trigger:", (e as Error).message))
}
