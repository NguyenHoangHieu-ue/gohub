import { tursoQuery } from "@/lib/turso"
import { fetchCsTickets, type CsTicket } from "@/lib/lark-cs-tickets"

// Kho ticket CS trên Turso (s240) — thay bảng Supabase `lark_cs_tickets` (~20MB). Lark Base chỉ còn giữ ~5 tháng gần nhất (12,5 nghìn ticket) nên cần một bản
// lịch sử riêng: chuyển một lần từ Supabase (13 tháng), rồi mỗi ngày kéo N ngày gần nhất từ Lark về (cập nhật trạng thái ticket cũ + thêm ticket mới).
// Báo cáo đọc từ đây (nhanh, không tốn hạn mức API Lark); nút "Tải lại từ Lark" kéo ngay ticket mới nhất.

let _ready = false
export async function ensureCsTable() {
  if (_ready) return
  await tursoQuery("CREATE TABLE IF NOT EXISTS cs_tickets (lark_record_id TEXT PRIMARY KEY, ticket_no TEXT, order_no TEXT, sku TEXT, ticket_type TEXT, issue_detail TEXT, source TEXT, vendor TEXT, product_action TEXT, money_action TEXT, creation_date INTEGER NOT NULL, leadtime_minutes REAL, source_1 TEXT, updated_at TEXT NOT NULL)")
  await tursoQuery("CREATE INDEX IF NOT EXISTS idx_cs_tickets_date ON cs_tickets (creation_date)")
  _ready = true
}

const COLS = ["lark_record_id", "ticket_no", "order_no", "sku", "ticket_type", "issue_detail", "source", "vendor", "product_action", "money_action", "creation_date", "leadtime_minutes", "source_1", "updated_at"] as const
const CHUNK = 80

/** Ghi (thêm hoặc thay) ticket theo lark_record_id. Trả số dòng đã ghi. */
export async function upsertCsTickets(rows: CsTicket[]): Promise<number> {
  if (!rows.length) return 0
  await ensureCsTable()
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    const marks = part.map(() => `(${COLS.map(() => "?").join(",")})`).join(",")
    const args: (string | number)[] = []
    for (const r of part) args.push(r.lark_record_id, r.ticket_no, r.order_no, r.sku, r.ticket_type, r.issue_detail, r.source, r.vendor, r.product_action, r.money_action, r.creation_date, r.leadtime_minutes, r.source_1, now)
    await tursoQuery(`INSERT OR REPLACE INTO cs_tickets (${COLS.join(",")}) VALUES ${marks}`, args)
  }
  return rows.length
}

/** Ticket có creation_date trong [startTs, endTs) (ms). */
export async function queryCsTickets(startTs: number, endTs: number): Promise<CsTicket[]> {
  await ensureCsTable()
  const rows = await tursoQuery<Record<string, string | number | null>>(
    "SELECT lark_record_id, ticket_no, order_no, sku, ticket_type, issue_detail, source, vendor, product_action, money_action, creation_date, leadtime_minutes, source_1 FROM cs_tickets WHERE creation_date >= ? AND creation_date < ?",
    [startTs, endTs])
  return rows.map(r => ({
    lark_record_id: String(r.lark_record_id), ticket_no: String(r.ticket_no ?? ""), order_no: String(r.order_no ?? ""), sku: String(r.sku ?? ""),
    ticket_type: String(r.ticket_type ?? ""), issue_detail: String(r.issue_detail ?? ""), source: String(r.source ?? ""), vendor: String(r.vendor ?? ""),
    product_action: String(r.product_action ?? ""), money_action: String(r.money_action ?? ""), creation_date: Number(r.creation_date) || 0,
    leadtime_minutes: Number(r.leadtime_minutes) || 0, source_1: String(r.source_1 ?? ""),
  }))
}

export async function csStoreStats(): Promise<{ count: number; newestTicket: number | null; lastMirror: string | null }> {
  await ensureCsTable()
  const r = await tursoQuery<{ n: number | string; a: number | string | null; b: string | null }>("SELECT COUNT(*) AS n, MAX(creation_date) AS a, MAX(updated_at) AS b FROM cs_tickets")
  return { count: Number(r[0]?.n) || 0, newestTicket: r[0]?.a != null ? Number(r[0].a) : null, lastMirror: r[0]?.b ?? null }
}

/** Kéo ticket của N ngày gần nhất từ Lark Base về kho. */
export async function mirrorCsTickets(daysBack: number): Promise<{ fetched: number; upserted: number; strategy: string; pages: number }> {
  const end = Date.now() + 86_400_000
  const start = end - (Math.max(1, daysBack) + 1) * 86_400_000
  const r = await fetchCsTickets(start, end)
  const upserted = await upsertCsTickets(r.tickets)
  return { fetched: r.tickets.length, upserted, strategy: r.strategy, pages: r.pages }
}
