import { supabaseAdmin } from "@/lib/supabase"
import { recordEdits, type RecordInput } from "./store"

// Tiện ích gắn lịch sử vào các route lưu tay (Supabase theo hàng). Đọc "bản trước" bằng MỘT truy vấn gom (không N+1), ghi lịch sử SAU khi lưu thành công; lỗi lịch sử không bao giờ làm hỏng việc lưu.
export const keyOf = (row: Record<string, unknown>, pk: string[]) => pk.map(c => String(row[c] ?? "")).join("|")

/** Đọc các hàng đang có (trước khi ghi) theo danh sách khoá, trả Map khoá → hàng. Tối đa 1.000 hàng/lần (giới hạn PostgREST). */
export async function fetchBefore(table: string, pk: string[], rows: Record<string, unknown>[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  if (!rows.length) return out
  try {
    const firsts = Array.from(new Set(rows.map(r => String(r[pk[0]] ?? "")))).slice(0, 900)
    const { data } = await supabaseAdmin.from(table).select("*").in(pk[0], firsts).limit(1000)
    const want = new Set(rows.map(r => keyOf(r, pk)))
    for (const r of (data ?? []) as Record<string, unknown>[]) { const k = keyOf(r, pk); if (want.has(k)) out.set(k, r) }
  } catch (e) { console.error("[manual-history] đọc bản trước lỗi:", table, (e as Error).message) }
  return out
}

export const userOfSession = (session: { user?: unknown } | null | undefined): string => {
  const u = session?.user as { username?: string; email?: string | null; name?: string | null } | undefined
  return u?.username || u?.email || u?.name || "web"
}

/** Sau khi lưu các hàng `rows` (upsert) vào `table`: so với `before` và ghi lịch sử từng hàng đổi. */
export async function logRowEdits(opts: {
  table: string; pk: string[]; rows: Record<string, unknown>[]; before: Map<string, Record<string, unknown>>
  user: string; source: string; label: (row: Record<string, unknown>) => string; ignore?: string[]
}): Promise<number> {
  const list: RecordInput[] = opts.rows.map(r => {
    const key = keyOf(r, opts.pk)
    const old = opts.before.get(key) ?? null
    // upsert/patch một phần: trường không có trong `r` giữ nguyên giá trị cũ (không tính là bị xoá)
    return { table: opts.table, key, label: opts.label(r), before: old, after: old ? { ...old, ...r } : r, user: opts.user, source: opts.source, ignore: opts.ignore }
  })
  return recordEdits(list)
}

/** Như fetchBefore nhưng cho bảng Turso khoá `id` (một truy vấn IN gom). */
export async function fetchTursoBefore(table: string, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  const uniq = Array.from(new Set(ids)).slice(0, 400)
  if (!uniq.length) return out
  try {
    const { tursoQuery } = await import("@/lib/turso")
    const rows = await tursoQuery<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id IN (${uniq.map(() => "?").join(",")})`, uniq)
    for (const r of rows) out.set(String(r.id), r)
  } catch (e) { console.error("[manual-history] đọc bản trước (Turso) lỗi:", table, (e as Error).message) }
  return out
}

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)/i

/** Giá trị cài đặt (app_settings) để so sánh: khoá nghi là bí mật thì KHÔNG lưu nội dung, chỉ ghi nhận "đã đổi". */
export const settingValue = (key: string, value: unknown): string | null => (value == null ? null : SECRET_KEY.test(key) ? "(bí mật — chỉ ghi nhận đã đổi)" : String(value))

/** Ghi lịch sử cho các khoá cài đặt vừa đổi (app_settings: mỗi khoá một "dòng", trường duy nhất là value). `current` = giá trị trước khi lưu. */
export async function logSettingChanges(list: { key: string; label?: string; before: string | null | undefined; after: string | null }[], user: string, source: string): Promise<number> {
  return recordEdits(list.map(c => {
    const secret = SECRET_KEY.test(c.key)
    const changed = (c.before ?? null) !== (c.after ?? null)
    return {
      table: "app_settings", key: c.key, label: c.label ?? `Cài đặt ${c.key}`,
      before: c.before == null ? null : { value: secret ? (changed ? "(bí mật — giá trị cũ)" : "(bí mật)") : c.before },
      after: c.after == null ? null : { value: secret ? (changed ? "(bí mật — giá trị mới)" : "(bí mật)") : c.after },
      user, source,
    }
  }))
}

/** Đọc giá trị hiện tại của các khoá app_settings (một truy vấn). */
export async function readSettings(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!keys.length) return out
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("key,value").in("key", keys.slice(0, 500))
    for (const r of data ?? []) out.set(String(r.key), String(r.value ?? ""))
  } catch (e) { console.error("[manual-history] đọc cài đặt lỗi:", (e as Error).message) }
  return out
}
