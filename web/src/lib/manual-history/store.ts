import { tursoConfigured, tursoQuery } from "@/lib/turso"
import { RETENTION, actionOf, capChanges, diffRecords, mergeChanges, shouldCoalesce, type Changes } from "./pure"

export * from "./pure"

// Nhật ký sửa tay lưu ở Turso (bảng manual_edit_history) — KHÔNG ở Supabase (Hobby gần đầy 500MB). Ghi lỗi chỉ log, KHÔNG BAO GIỜ làm hỏng việc lưu của người dùng.
export interface HistoryEntry { id: number; tbl: string; row_key: string; action: "create" | "update" | "delete"; changes: Changes; truncated: boolean; label: string; by: string; at: string; source: string }

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  ready ??= (async () => {
    await tursoQuery("CREATE TABLE IF NOT EXISTS manual_edit_history (id INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, row_key TEXT NOT NULL, action TEXT NOT NULL, changes TEXT NOT NULL, truncated INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '', by_user TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, source TEXT NOT NULL DEFAULT '')")
    await tursoQuery("CREATE INDEX IF NOT EXISTS mh_row ON manual_edit_history (tbl, row_key, id DESC)")
    await tursoQuery("CREATE INDEX IF NOT EXISTS mh_at ON manual_edit_history (at)")
  })().catch(e => { ready = null; throw e })
  return ready
}

const parse = (r: Record<string, string | number | null>): HistoryEntry => {
  let changes: Changes = {}
  try { changes = JSON.parse(String(r.changes ?? "{}")) } catch { /* bản ghi hỏng: coi như rỗng */ }
  return { id: Number(r.id), tbl: String(r.tbl), row_key: String(r.row_key), action: String(r.action) as HistoryEntry["action"], changes, truncated: Number(r.truncated) === 1, label: String(r.label ?? ""), by: String(r.by_user ?? ""), at: String(r.at), source: String(r.source ?? "") }
}

/** Làm phẳng đối tượng lồng nhau thành khoá "a.b.c" để so sánh/ghi theo từng trường (dùng cho target lưu dạng JSON một cục). */
export function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (prefix) out[prefix] = obj
  return out
}

export interface RecordInput {
  table: string; key: string; label?: string
  before: Record<string, unknown> | null; after: Record<string, unknown> | null
  user: string; source: string; ignore?: string[]
}

/** Ghi 1 lần sửa. Trả true nếu có ghi/gộp; false nếu không có gì đổi hoặc lỗi (đã log). Cùng người, cùng dòng, ≤10 phút → gộp vào mục trước. */
export async function recordEdit(i: RecordInput): Promise<boolean> {
  try {
    if (!tursoConfigured()) return false
    const raw = diffRecords(i.before, i.after, i.ignore)
    if (!Object.keys(raw).length) return false
    const action = actionOf(i.before, i.after)
    await ensureTable()
    const last = (await tursoQuery("SELECT id, by_user, at, action, changes, truncated FROM manual_edit_history WHERE tbl = ? AND row_key = ? ORDER BY id DESC LIMIT 1", [i.table, i.key]))[0]
    const now = new Date().toISOString()
    if (last && shouldCoalesce({ by: String(last.by_user), at: String(last.at), action: String(last.action) }, i.user, action)) {
      let prev: Changes = {}
      try { prev = JSON.parse(String(last.changes)) } catch { /* bỏ qua */ }
      const merged = capChanges(mergeChanges(prev, raw))
      if (!Object.keys(merged.changes).length) { await tursoQuery("DELETE FROM manual_edit_history WHERE id = ?", [Number(last.id)]); return true }   // sửa rồi sửa lại đúng như cũ → không còn gì để ghi
      await tursoQuery("UPDATE manual_edit_history SET changes = ?, truncated = ?, at = ?, source = ? WHERE id = ?", [JSON.stringify(merged.changes), merged.truncated || Number(last.truncated) === 1 ? 1 : 0, now, i.source, Number(last.id)])
      return true
    }
    const c = capChanges(raw)
    await tursoQuery("INSERT INTO manual_edit_history (tbl, row_key, action, changes, truncated, label, by_user, at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [i.table, i.key, action, JSON.stringify(c.changes), c.truncated ? 1 : 0, (i.label ?? "").slice(0, 200), i.user.slice(0, 80), now, i.source.slice(0, 80)])
    return true
  } catch (e) { console.error("[manual-history] ghi lỗi:", (e as Error).message); return false }
}

/** Ghi nhiều dòng (lưu hàng loạt). Chạy tuần tự, mỗi dòng độc lập. */
export async function recordEdits(list: RecordInput[]): Promise<number> {
  let n = 0
  for (const i of list) if (await recordEdit(i)) n++
  return n
}

/** Dạng JSON một cục (app_settings): so sánh theo đường dẫn lồng nhau. */
export function recordJsonEdit(i: Omit<RecordInput, "before" | "after"> & { before: unknown; after: unknown }): Promise<boolean> {
  return recordEdit({ ...i, before: i.before == null ? null : flatten(i.before), after: i.after == null ? null : flatten(i.after) })
}

export async function listHistory(f: { table?: string; key?: string; user?: string; q?: string; limit?: number; beforeId?: number }): Promise<HistoryEntry[]> {
  if (!tursoConfigured()) return []
  await ensureTable()
  const where: string[] = [], args: (string | number)[] = []
  if (f.table) { where.push("tbl = ?"); args.push(f.table) }
  if (f.key) { where.push("row_key = ?"); args.push(f.key) }
  if (f.user) { where.push("by_user = ?"); args.push(f.user) }
  if (f.q) { where.push("(label LIKE ? OR row_key LIKE ? OR changes LIKE ?)"); const l = `%${f.q.replace(/[%_]/g, " ")}%`; args.push(l, l, l) }
  if (f.beforeId) { where.push("id < ?"); args.push(f.beforeId) }
  const rows = await tursoQuery(`SELECT * FROM manual_edit_history ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${Math.max(1, Math.min(200, f.limit ?? 50))}`, args)
  return rows.map(parse)
}

export async function getEntry(id: number): Promise<HistoryEntry | null> {
  if (!tursoConfigured()) return null
  await ensureTable()
  const r = (await tursoQuery("SELECT * FROM manual_edit_history WHERE id = ?", [id]))[0]
  return r ? parse(r) : null
}

export async function historyStats(): Promise<{ rows: number; oldest: string | null; tables: { tbl: string; n: number }[] }> {
  if (!tursoConfigured()) return { rows: 0, oldest: null, tables: [] }
  await ensureTable()
  const [c] = await tursoQuery("SELECT COUNT(*) AS n, MIN(at) AS oldest FROM manual_edit_history")
  const t = await tursoQuery("SELECT tbl, COUNT(*) AS n FROM manual_edit_history GROUP BY tbl ORDER BY n DESC")
  return { rows: Number(c?.n ?? 0), oldest: c?.oldest ? String(c.oldest) : null, tables: t.map(r => ({ tbl: String(r.tbl), n: Number(r.n) })) }
}

/**
 * Dọn nhật ký (cron hằng ngày) — giữ kích thước có trần:
 *  1. mục cũ hơn 24 tháng bị xoá, TRỪ mục mới nhất của từng dòng (luôn biết lần sửa gần nhất);
 *  2. mỗi dòng giữ tối đa 100 mục mới nhất;
 *  3. toàn bảng quá 150.000 mục → xoá mục cũ nhất cho còn 120.000.
 */
export async function pruneHistory(now = Date.now()): Promise<{ aged: number; perRow: number; global: number; rows: number }> {
  if (!tursoConfigured()) return { aged: 0, perRow: 0, global: 0, rows: 0 }
  await ensureTable()
  const count = async () => Number((await tursoQuery("SELECT COUNT(*) AS n FROM manual_edit_history"))[0]?.n ?? 0)
  const before0 = await count()
  const cutoff = new Date(now - RETENTION.maxAgeDays * 86_400_000).toISOString()
  await tursoQuery("DELETE FROM manual_edit_history WHERE at < ? AND id NOT IN (SELECT MAX(id) FROM manual_edit_history GROUP BY tbl, row_key)", [cutoff])
  const before1 = await count()
  await tursoQuery(`DELETE FROM manual_edit_history WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY tbl, row_key ORDER BY id DESC) AS rn FROM manual_edit_history) WHERE rn > ${RETENTION.perRow})`)
  const before2 = await count()
  if (before2 > RETENTION.globalMax) await tursoQuery(`DELETE FROM manual_edit_history WHERE id <= (SELECT id FROM manual_edit_history ORDER BY id DESC LIMIT 1 OFFSET ${RETENTION.globalKeep})`)
  const rows = await count()
  return { aged: before0 - before1, perRow: before1 - before2, global: before2 - rows, rows }
}
