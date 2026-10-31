import { memo, memoInvalidate } from "@/lib/memo"
import { rq } from "./client"

// Chế độ rollup theo từng route (plan §7): off = đường thô; shadow = chạy cả hai, so sánh, vẫn TRẢ đường thô; on = trả rollup (rơi về thô khi thiếu/cũ/lỗi).
// Cờ lưu trong app_settings khóa `rollup_routes` ({ "<route>": "off|shadow|on" }) nên đổi không cần deploy; mặc định off.
export type RollupMode = "off" | "shadow" | "on"
const FLAG_KEY = "rollup_routes"
const MAX_STALE_MS = 3 * 3600_000   // rollup cũ hơn 3 giờ (kể từ lần kiểm cuối) thì không dùng

const sb = async () => (await import("@/lib/supabase")).supabaseAdmin

// Đọc cờ thẳng qua REST với cache:"no-store": client supabase-js có thể trả bản cũ từ cache fetch của Next, làm ghi cờ đè mất cờ vừa đặt (đã mất 2 cờ ngày 29/10).
async function readFlags(): Promise<Record<string, string>> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?key=eq.${FLAG_KEY}&select=value`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }, cache: "no-store",
  })
  if (!res.ok) throw new Error(`đọc cờ rollup lỗi ${res.status}`)
  const rows = (await res.json()) as { value: string }[]
  try { return JSON.parse(rows[0]?.value ?? "{}") } catch { return {} }
}

export async function getRollupMode(route: string): Promise<RollupMode> {
  try {
    const all = await memo("rollup_modes", 15_000, readFlags)
    const v = all[route]
    return v === "shadow" || v === "on" ? v : "off"
  } catch { return "off" }
}

export async function setRollupMode(route: string, mode: RollupMode): Promise<Record<string, string>> {
  const db = await sb()
  const cur = await readFlags()
  cur[route] = mode
  const { error } = await db.from("app_settings").upsert({ key: FLAG_KEY, value: JSON.stringify(cur), category: "cache", label: "Chế độ Rollup theo route", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  memoInvalidate("rollup_modes")
  return cur
}

/** Phiên bản dữ liệu rollup + độ tươi (memo 20s). `fresh` = lần kiểm cuối ≤ 3 giờ. Dùng làm một phần khoá cache. */
export async function rollupState(): Promise<{ version: number; fresh: boolean; checkedAt: string | null }> {
  return memo("rollup_state", 20_000, async () => {
    const rows = await rq("SELECT key, value FROM ru_meta WHERE key IN ('data_version', 'last_check_at')")
    const m = Object.fromEntries(rows.map(r => [String(r.key), String(r.value)]))
    const at = m.last_check_at ?? null
    return { version: Number(m.data_version ?? 0), fresh: !!at && Date.now() - Date.parse(at) <= MAX_STALE_MS, checkedAt: at }
  })
}
