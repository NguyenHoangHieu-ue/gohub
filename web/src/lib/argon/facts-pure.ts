// Sổ sự việc có hạn (argon_facts): phần THUẦN — kiểu, chuẩn hoá, gom nhóm theo hạn, chọn nhắc hẹn, soạn tin Lark. Không I/O.
export const FACT_TYPES = { khuyen_mai: "Khuyến mãi", ngung_ban: "Ngừng bán", san_pham_moi: "Sản phẩm mới", doi_gia: "Đổi giá", doi_mang: "Đổi mạng", chinh_sach: "Chính sách", han_chot: "Hạn chót", khac: "Khác" } as const
export type FactType = keyof typeof FACT_TYPES
export type FactStatus = "active" | "expired" | "superseded" | "rejected"
export const MAX_FACTS_PER_SOURCE = 8

export interface FactIn { type: FactType; vendor: string; subject: string; summary: string; evidence: string; effectiveFrom: string | null; expiresAt: string | null }
export interface FactRow {
  id: string; username: string; type: FactType; vendor: string; subject: string; summary: string; evidence: string
  effective_from: string | null; expires_at: string | null; status: FactStatus; origin: "auto" | "manual"; edited: boolean
  source_id: string | null; source_name: string; superseded_by: string | null; remind_days: number
  reminded_at: string | null; announced_at: string | null; created_at: string; updated_at: string
}

/** "2026-11-30" hợp lệ (đúng lịch) → chính nó, không thì null. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2100 ? m[0] : null
}

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
export const vnToday = (now = Date.now()) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10)

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** Chuẩn hoá danh sách sự việc model trả về: bỏ mục thiếu tóm tắt, ngày sai, loại lạ → "khac"; hạn trước ngày hiệu lực thì bỏ hạn; tối đa 8. */
export function normalizeFacts(raw: unknown): FactIn[] {
  if (!Array.isArray(raw)) return []
  const out: FactIn[] = []
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "")
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const summary = s(o.summary, 300)
    if (!summary) continue
    const type = (s(o.type, 30) in FACT_TYPES ? s(o.type, 30) : "khac") as FactType
    const effectiveFrom = isoDate(o.effectiveFrom)
    let expiresAt = isoDate(o.expiresAt)
    if (effectiveFrom && expiresAt && expiresAt < effectiveFrom) expiresAt = null
    out.push({ type, vendor: s(o.vendor, 80), subject: s(o.subject, 120), summary, evidence: s(o.evidence, 240), effectiveFrom, expiresAt })
    if (out.length >= MAX_FACTS_PER_SOURCE) break
  }
  return out
}

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
/** Khoá nhận diện "cùng một sự việc" giữa các nguồn: vendor + loại + đối tượng (không dấu, không phân biệt hoa thường). */
export const factKey = (f: { vendor: string; type: string; subject: string }) => `${fold(f.vendor)}|${f.type}|${fold(f.subject)}`

/** Ngày đáng chú ý của sự việc: loại "bắt đầu có hiệu lực" (đổi giá, ngừng bán, đổi mạng, sản phẩm mới) → ngày hiệu lực; còn lại → hạn. */
export function keyDate(f: Pick<FactRow, "type" | "effective_from" | "expires_at">): string | null {
  const start: FactType[] = ["doi_gia", "ngung_ban", "doi_mang", "san_pham_moi"]
  return start.includes(f.type) ? f.effective_from ?? f.expires_at : f.expires_at ?? f.effective_from
}

/** Sự việc đang hiệu lực mà hạn (expires_at) đã qua → cần đánh dấu hết hạn. */
export const expiredIds = (rows: FactRow[], today: string) => rows.filter(r => r.status === "active" && r.expires_at && r.expires_at < today).map(r => r.id)

/** Cần nhắc hôm nay: còn hiệu lực, ngày đáng chú ý cách hôm nay 0..remind_days ngày, chưa nhắc. */
export function dueReminders(rows: FactRow[], today: string): FactRow[] {
  return rows.filter(r => {
    if (r.status !== "active" || r.reminded_at) return false
    const d = keyDate(r)
    if (!d) return false
    const n = daysUntil(d, today)
    return n >= 0 && n <= r.remind_days
  }).sort((a, b) => (keyDate(a) ?? "").localeCompare(keyDate(b) ?? ""))
}

export interface FactBuckets { soon: FactRow[]; active: FactRow[]; past: FactRow[] }
/** Gom để hiển thị: sắp tới hạn (≤14 ngày), đang hiệu lực, đã qua (hết hạn/thay thế/bỏ). */
export function bucketFacts(rows: FactRow[], today: string): FactBuckets {
  const soon: FactRow[] = [], active: FactRow[] = [], past: FactRow[] = []
  for (const r of rows) {
    if (r.status !== "active") { past.push(r); continue }
    const d = keyDate(r)
    if (d && daysUntil(d, today) >= 0 && daysUntil(d, today) <= 14) soon.push(r)
    else active.push(r)
  }
  const byDate = (a: FactRow, b: FactRow) => (keyDate(a) ?? "9999").localeCompare(keyDate(b) ?? "9999")
  return { soon: soon.sort(byDate), active: active.sort(byDate), past: past.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) }
}

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")
export const factLine = (f: Pick<FactRow, "type" | "vendor" | "subject" | "summary" | "effective_from" | "expires_at">) => {
  const when = [f.effective_from ? `từ ${dmy(f.effective_from)}` : "", f.expires_at ? `đến ${dmy(f.expires_at)}` : ""].filter(Boolean).join(" ")
  return `[${FACT_TYPES[f.type] ?? "Khác"}] ${[f.vendor, f.subject].filter(Boolean).join(" · ")}: ${f.summary}${when ? ` (${when})` : ""}`
}

/** Khối "sổ sự việc" đầu ngữ cảnh của Thủ thư Kho: các sự việc còn hiệu lực gần hạn nhất, mỗi dòng kèm id để cập nhật. */
export function factsBlock(rows: FactRow[], today: string, max = 30): string {
  const live = rows.filter(r => r.status === "active").sort((a, b) => (keyDate(a) ?? "9999").localeCompare(keyDate(b) ?? "9999")).slice(0, max)
  return `<so_su_viec hom_nay="${today}" dang_hieu_luc="${rows.filter(r => r.status === "active").length}">\n${live.map(f => `- [${f.id}] ${factLine(f)}${f.source_name ? ` — nguồn: ${f.source_name}` : ""}`).join("\n") || "(chưa có sự việc nào)"}\n</so_su_viec>`
}

/** Tin Lark gửi Hiếu mỗi đêm: sự việc mới Argon vừa tự ghi + sự việc tới hạn + số vừa hết hạn. Rỗng nếu không có gì. */
export function nightlyMessage(a: { added: FactRow[]; due: FactRow[]; expired: number; link: string }): string {
  const parts: string[] = []
  if (a.due.length) parts.push(`⏰ Sắp tới hạn (${a.due.length}):\n${a.due.slice(0, 10).map(f => `• ${factLine(f)}`).join("\n")}`)
  if (a.added.length) parts.push(`📝 Argon vừa ghi vào sổ ${a.added.length} sự việc mới:\n${a.added.slice(0, 10).map(f => `• ${factLine(f)}${f.source_name ? ` — ${f.source_name}` : ""}`).join("\n")}${a.added.length > 10 ? `\n… và ${a.added.length - 10} mục nữa` : ""}`)
  if (a.expired) parts.push(`⌛ ${a.expired} sự việc vừa hết hạn.`)
  if (!parts.length) return ""
  return `${parts.join("\n\n")}\n\nSai thì anh sửa hoặc bỏ ở Kho › Sổ sự việc: ${a.link}`
}
