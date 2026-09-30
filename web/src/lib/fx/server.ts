import { supabaseAdmin } from "@/lib/supabase"
import { currentMonth, emptyTable, FLAT_KEYS, FX_ROWS, toFlat, type FxTable } from "./table"

export const FX_TABLE_KEY = "fx.monthly"

/** Chuẩn hoá dữ liệu đọc từ DB: chỉ giữ dòng hợp lệ và giá trị số dương. */
function sanitize(raw: unknown): FxTable {
  const t = emptyTable()
  const values = (raw as FxTable | null)?.values ?? {}
  for (const def of FX_ROWS) {
    for (const [m, v] of Object.entries(values[def.id] ?? {})) if (/^\d{4}-\d{2}$/.test(m) && Number(v) > 0) (t.values[def.id] ??= {})[m] = Number(v)
  }
  return t
}

export async function loadMonthlyTable(): Promise<{ table: FxTable; updatedAt: string | null } | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value,updated_at").eq("key", FX_TABLE_KEY).maybeSingle()
  if (!data?.value) return null
  try { return { table: sanitize(JSON.parse(data.value)), updatedAt: data.updated_at ?? null } } catch { return null }
}

/**
 * Bảng tỷ giá đang dùng. Chưa nhập bảng theo tháng thì dựng tạm từ các khoá phẳng `fx.*` cũ (coi là giá tháng hiện tại)
 * để mọi nơi vẫn chạy: VND→USD chưa có tỷ giá Inc riêng thì dùng chung tỷ giá JSC.
 */
export async function loadEffectiveTable(): Promise<{ table: FxTable; source: "monthly" | "legacy"; updatedAt: string | null }> {
  const monthly = await loadMonthlyTable()
  if (monthly) return { ...monthly, source: "monthly" }
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").like("key", "fx.%")
  const byKey = new Map((data ?? []).map(r => [r.key as string, parseFloat(String(r.value))]))
  const month = currentMonth()
  const t = emptyTable()
  for (const [id, key] of Object.entries(FLAT_KEYS)) {
    const v = byKey.get(key)
    if (v && v > 0) t.values[id] = { [month]: v }
  }
  if (!t.values["INC:VND/USD"] && t.values["JSC:VND/USD"]) t.values["INC:VND/USD"] = { ...t.values["JSC:VND/USD"] }
  return { table: t, source: "legacy", updatedAt: null }
}

/**
 * Lưu bảng theo tháng + ghi xuôi sang các khoá phẳng `fx.*` (giá tháng hiện tại hoặc tháng gần nhất trước đó đã nhập)
 * để chatbot / MCP / admin-gohub đang đọc `fx.*` tiếp tục chạy đúng.
 */
export async function saveMonthlyTable(t: FxTable, now = new Date()): Promise<{ flatWritten: number }> {
  const at = now.toISOString()
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: FX_TABLE_KEY, value: JSON.stringify(t), label: "Bảng tỷ giá nội bộ theo tháng × pháp nhân", category: "fx_monthly", updated_at: at },
    { onConflict: "key" })
  if (error) throw new Error(error.message)
  const flat = toFlat(t, currentMonth(now)).map(f => ({ key: f.key, value: String(f.value), label: f.label, category: "fx_rate", updated_at: at }))
  if (flat.length) {
    const { error: e2 } = await supabaseAdmin.from("app_settings").upsert(flat, { onConflict: "key" })
    if (e2) throw new Error(e2.message)
  }
  return { flatWritten: flat.length }
}
