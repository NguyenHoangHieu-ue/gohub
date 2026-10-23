import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

// Lưu trữ dài hạn log hội thoại/hành động (s240): dòng cũ hơn hạn giữ ở Supabase được SAO sang Turso (bảng log_archive, 5GB) rồi mới xoá khỏi Supabase
// (giữ DB Supabase 500MB gọn). Chỉ xoá sau khi đếm lại thấy đủ ở Turso. Chạy lặp lại an toàn (INSERT OR IGNORE).

export interface ArchiveSource { table: string; keepDays: number; refCol: string | null }

/** Hạn giữ ở Supabase. app_usage_events dài hơn vì các màn Usage/My Metrics tính theo quý. */
export const ARCHIVE_SOURCES: ArchiveSource[] = [
  { table: "conversation_messages", keepDays: 120, refCol: "conversation_id" },
  { table: "gp_runs", keepDays: 120, refCol: "username" },
  { table: "app_usage_events", keepDays: 150, refCol: "user_name" },
  { table: "gp_action_log", keepDays: 120, refCol: "username" },
  { table: "browser_bridge_commands", keepDays: 30, refCol: "owner_username" },
  { table: "lark_chat_history", keepDays: 90, refCol: "lark_open_id" },
]

export interface ArchiveRow { id: string; created_at: string; ref: string; data: string }

/** Dòng Supabase → dòng lưu trữ (thuần, có test). */
export function toArchiveRow(src: ArchiveSource, row: Record<string, unknown>): ArchiveRow {
  return {
    id: String(row.id),
    created_at: String(row.created_at ?? ""),
    ref: src.refCol && row[src.refCol] != null ? String(row[src.refCol]) : "",
    data: JSON.stringify(row),
  }
}

export const cutoffIso = (keepDays: number, now = Date.now()) => new Date(now - keepDays * 86_400_000).toISOString()

let _ready = false
async function ensureTable() {
  if (_ready) return
  await tursoQuery("CREATE TABLE IF NOT EXISTS log_archive (src TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, archived_at TEXT NOT NULL, PRIMARY KEY (src, id))")
  await tursoQuery("CREATE INDEX IF NOT EXISTS idx_log_archive_time ON log_archive (src, created_at)")
  await tursoQuery("CREATE INDEX IF NOT EXISTS idx_log_archive_ref ON log_archive (src, ref)")
  _ready = true
}

export interface ArchiveResult { table: string; cutoff: string; pending: number; archived: number; deleted: number; error?: string }

const BATCH = 150          // dòng mỗi lượt đọc Supabase
const INSERT_CHUNK = 40    // dòng mỗi câu INSERT Turso
const MAX_BATCHES = 12     // mỗi nguồn tối đa ~1.800 dòng/lần chạy (chạy hằng ngày sẽ đuổi kịp dần)

/** Sao các dòng quá hạn sang Turso rồi xoá khỏi Supabase. `apply=false` chỉ đếm. */
export async function runLogArchive(apply: boolean, only?: string): Promise<ArchiveResult[]> {
  if (!tursoConfigured()) throw new Error("Chưa cấu hình Turso (TURSO_URL / TURSO_AUTH_TOKEN)")
  await ensureTable()
  const out: ArchiveResult[] = []
  for (const src of ARCHIVE_SOURCES) {
    if (only && src.table !== only) continue
    const cutoff = cutoffIso(src.keepDays)
    const res: ArchiveResult = { table: src.table, cutoff, pending: 0, archived: 0, deleted: 0 }
    try {
      const { count } = await supabaseAdmin.from(src.table).select("id", { count: "exact", head: true }).lt("created_at", cutoff)
      res.pending = count ?? 0
      if (apply && res.pending > 0) {
        for (let b = 0; b < MAX_BATCHES; b++) {
          const { data: rows, error } = await supabaseAdmin.from(src.table).select("*").lt("created_at", cutoff).order("created_at", { ascending: true }).limit(BATCH)
          if (error) throw new Error(error.message)
          if (!rows || rows.length === 0) break
          const arch = rows.map(r => toArchiveRow(src, r as Record<string, unknown>))
          const now = new Date().toISOString()
          for (let i = 0; i < arch.length; i += INSERT_CHUNK) {
            const part = arch.slice(i, i + INSERT_CHUNK)
            const marks = part.map(() => "(?,?,?,?,?,?)").join(",")
            const args: (string | number)[] = []
            for (const r of part) args.push(src.table, r.id, r.created_at, r.ref, r.data, now)
            await tursoQuery(`INSERT OR IGNORE INTO log_archive (src, id, created_at, ref, data, archived_at) VALUES ${marks}`, args)
          }
          // Chỉ xoá khi Turso đã có ĐỦ các id vừa sao
          const ids = arch.map(r => r.id)
          const got = await tursoQuery<{ n: number | string }>(`SELECT COUNT(*) AS n FROM log_archive WHERE src = ? AND id IN (${ids.map(() => "?").join(",")})`, [src.table, ...ids])
          if (Number(got[0]?.n) !== ids.length) throw new Error(`Turso chỉ có ${got[0]?.n}/${ids.length} dòng — dừng, không xoá`)
          const del = await supabaseAdmin.from(src.table).delete().in("id", rows.map(r => (r as { id: unknown }).id as string | number))
          if (del.error) throw new Error(del.error.message)
          res.archived += ids.length
          res.deleted += ids.length
        }
      }
    } catch (e) { res.error = (e as Error).message.slice(0, 300) }
    out.push(res)
  }
  return out
}

/** Đọc lại dòng đã lưu trữ theo `ref` (vd conversation_id) hoặc theo khoảng thời gian. */
export async function readArchive(src: string, o: { ref?: string; from?: string; to?: string; limit?: number } = {}): Promise<Record<string, unknown>[]> {
  if (!tursoConfigured()) return []
  await ensureTable()
  const where = ["src = ?"], args: (string | number)[] = [src]
  if (o.ref) { where.push("ref = ?"); args.push(o.ref) }
  if (o.from) { where.push("created_at >= ?"); args.push(o.from) }
  if (o.to) { where.push("created_at < ?"); args.push(o.to) }
  const limit = Math.min(Math.max(o.limit ?? 200, 1), 2000)
  const rows = await tursoQuery<{ data: string }>(`SELECT data FROM log_archive WHERE ${where.join(" AND ")} ORDER BY created_at ASC LIMIT ${limit}`, args)
  return rows.map(r => { try { return JSON.parse(r.data) as Record<string, unknown> } catch { return {} } })
}

export async function archiveStats(): Promise<{ src: string; rows: number; oldest: string | null; newest: string | null }[]> {
  if (!tursoConfigured()) return []
  await ensureTable()
  const r = await tursoQuery<{ src: string; n: number | string; a: string | null; b: string | null }>("SELECT src, COUNT(*) AS n, MIN(created_at) AS a, MAX(created_at) AS b FROM log_archive GROUP BY src ORDER BY src")
  return r.map(x => ({ src: x.src, rows: Number(x.n), oldest: x.a, newest: x.b }))
}
