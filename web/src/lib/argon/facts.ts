import { dueReminders, expiredIds, factKey, nightlyMessage, planSupersede, vnToday, type FactIn, type FactRow, type FactStatus, type FactType } from "./facts-pure"

export * from "./facts-pure"
const db = async () => (await import("@/lib/supabase")).supabaseAdmin   // nạp muộn: phần thuần test được không cần env Supabase

/** Sự việc của người dùng (mới cập nhật trước). Mặc định chỉ lấy còn hiệu lực + đã hết hạn/thay thế gần đây để hiển thị; status rỗng = tất cả. */
export async function listFacts(username: string, opts: { status?: FactStatus[]; limit?: number } = {}): Promise<FactRow[]> {
  let q = (await db()).from("argon_facts").select("*").eq("username", username).order("updated_at", { ascending: false }).limit(opts.limit ?? 500)
  if (opts.status?.length) q = q.in("status", opts.status)
  const { data } = await q
  return (data ?? []) as FactRow[]
}

/** Ghi các sự việc Argon trích được từ 1 nguồn. Trích lại cùng nguồn thì thay bản tự động cũ (trừ mục Hiếu đã sửa/bỏ); sự việc trùng khoá
 *  (vendor + loại + đối tượng) với nguồn khác cũ hơn thì bản cũ chuyển "thay thế". Trả các dòng mới ghi. */
export async function saveSourceFacts(username: string, src: { id: string; name: string; date?: string }, facts: FactIn[]): Promise<FactRow[]> {
  const sb = await db()
  const nowIso = new Date().toISOString()
  const sourceDate = src.date ?? vnToday()
  const { data: mine } = await sb.from("argon_facts").select("*").eq("source_id", src.id)
  const keep = ((mine ?? []) as FactRow[]).filter(f => f.edited || f.status === "rejected" || f.origin === "manual")
  const dropIds = ((mine ?? []) as FactRow[]).filter(f => !keep.includes(f)).map(f => f.id)
  if (dropIds.length) {
    // Trích lại cùng nguồn: sự việc cũ hơn từng bị bản sắp xoá thay thế được mở lại, rồi quyết định lại với bản mới (không để con trỏ treo).
    await sb.from("argon_facts").update({ status: "active", superseded_by: null, expired_at: null, updated_at: nowIso }).in("superseded_by", dropIds).eq("status", "superseded")
    await sb.from("argon_facts").delete().in("id", dropIds)
  }
  const have = new Set(keep.map(factKey))
  const fresh = facts.filter(f => !have.has(factKey(f)))
  if (!fresh.length) return []
  const { data: others } = await sb.from("argon_facts").select("*").eq("username", username).in("status", ["active", "expired"]).neq("source_id", src.id)
  const pool = (others ?? []) as FactRow[]
  const plans = fresh.map(f => planSupersede(f, sourceDate, pool))
  const { data: ins, error } = await sb.from("argon_facts").insert(fresh.map((f, i) => ({
    username, type: f.type, vendor: f.vendor, subject: f.subject, attribute: f.attribute, value: f.value, summary: f.summary, evidence: f.evidence,
    effective_from: f.effectiveFrom, expires_at: f.expiresAt, source_id: src.id, source_name: src.name.slice(0, 160),
    source_date: sourceDate, recorded_at: nowIso, change_note: plans[i].note, needs_review: plans[i].needsReview,
    // Tin này CŨ HƠN sự việc đã có → ghi lại để tra cứu nhưng không cho đè tin mới.
    ...(plans[i].staleBy ? { status: "superseded", superseded_by: plans[i].staleBy!.id, expired_at: nowIso } : {}),
  }))).select("*")
  if (error) throw new Error(error.message)
  const rows = (ins ?? []) as FactRow[]
  // insert trả hàng theo thứ tự chèn; ghép lại theo vị trí để biết sự việc nào thay thế bản nào
  for (let i = 0; i < rows.length; i++)
    for (const o of plans[i].replace) await sb.from("argon_facts").update({ status: "superseded", superseded_by: rows[i].id, expired_at: nowIso, updated_at: nowIso }).eq("id", o.id)
  return rows.filter((_, i) => !plans[i].staleBy)
}

export async function addManualFact(username: string, f: Omit<FactIn, "attribute" | "value"> & Partial<Pick<FactIn, "attribute" | "value">> & { sourceId?: string | null; sourceName?: string; needsReview?: boolean; changeNote?: string }): Promise<FactRow> {
  const { data, error } = await (await db()).from("argon_facts").insert({
    username, type: f.type, vendor: f.vendor, subject: f.subject, attribute: f.attribute ?? "", value: f.value ?? "", summary: f.summary, evidence: f.evidence, effective_from: f.effectiveFrom, expires_at: f.expiresAt,
    origin: "manual", edited: true, source_id: f.sourceId ?? null, source_name: f.sourceName ?? "", source_date: vnToday(), needs_review: !!f.needsReview, change_note: f.changeNote ?? "",
  }).select("*").single()
  if (error || !data) throw new Error(error?.message ?? "Không ghi được sự việc")
  return data as FactRow
}

export interface FactPatch { status?: FactStatus; type?: FactType; vendor?: string; subject?: string; summary?: string; effective_from?: string | null; expires_at?: string | null; remind_days?: number; confirm?: boolean }
/** Hiếu (hoặc Thủ thư) sửa sự việc: đổi nội dung/ngày → đánh dấu đã sửa (không bị trích lại ghi đè) và nhắc lại được; chỉ đổi trạng thái thì giữ nguyên cờ.
 *  `confirm` = anh đã xem thay đổi (bỏ cờ chờ xác nhận). Bỏ ("rejected") một sự việc đã thay thế bản cũ → bản cũ được mở lại (không mất tin đúng). */
export async function updateFact(username: string, id: string, p: FactPatch): Promise<FactRow | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (p.confirm) row.needs_review = false
  if (p.status) {
    row.status = p.status
    if (p.status === "rejected" || p.status === "superseded" || p.status === "expired") row.expired_at = row.updated_at
    if (p.status === "active") row.expired_at = null
    if (p.status === "rejected") {
      row.needs_review = false
      await (await db()).from("argon_facts").update({ status: "active", superseded_by: null, expired_at: null, updated_at: row.updated_at }).eq("username", username).eq("superseded_by", id).eq("status", "superseded")
    }
  }
  for (const k of ["type", "vendor", "subject", "summary"] as const) if (typeof p[k] === "string") { row[k] = p[k]; row.edited = true }
  for (const k of ["effective_from", "expires_at"] as const) if (k in p) { row[k] = p[k] ?? null; row.edited = true; row.reminded_at = null }
  if (typeof p.remind_days === "number") row.remind_days = Math.max(0, Math.min(30, Math.round(p.remind_days)))
  const { data } = await (await db()).from("argon_facts").update(row).eq("id", id).eq("username", username).select("*").maybeSingle()
  return (data as FactRow | null) ?? null
}

/** Việc đêm: đánh dấu hết hạn, nhắc sự việc tới hạn, gửi MỘT tin tóm tắt (đã ghi gì + tới hạn + hết hạn) cho Hiếu. Trả số liệu để cron báo. */
export async function runFactsNightly(username: string, link: string, now = Date.now()): Promise<{ added: number; due: number; expired: number; sent: boolean }> {
  const sb = await db()
  const today = vnToday(now)
  const live = await listFacts(username, { status: ["active"], limit: 2000 })
  const exp = expiredIds(live, today)
  if (exp.length) await sb.from("argon_facts").update({ status: "expired", updated_at: new Date().toISOString() }).in("id", exp)
  const due = dueReminders(live.filter(f => !exp.includes(f.id)), today)
  const { data: fresh } = await sb.from("argon_facts").select("*").eq("username", username).eq("status", "active").is("announced_at", null).order("created_at", { ascending: false }).limit(60)
  const added = (fresh ?? []) as FactRow[]
  const text = nightlyMessage({ added, due, expired: exp.length, link })
  let sent = false
  if (text) {
    const { notify } = await import("@/lib/notify")
    const bits = [added.length && `${added.length} sự việc mới`, due.length && `${due.length} sắp tới hạn`, exp.length && `${exp.length} hết hạn`].filter(Boolean)
    sent = await notify("creator", { kind: "Báo cáo", source: "Argon", title: `Sổ sự việc: ${bits.join(", ")}`, body: text, priority: "low" })
  }
  const nowIso = new Date(now).toISOString()
  if (sent || !text) {
    if (due.length) await sb.from("argon_facts").update({ reminded_at: nowIso }).in("id", due.map(f => f.id))
    if (added.length) await sb.from("argon_facts").update({ announced_at: nowIso }).in("id", added.map(f => f.id))
  }
  return { added: added.length, due: due.length, expired: exp.length, sent }
}

/** Người dùng có dự án Argon (cron đêm chạy sổ sự việc cho từng người). */
export async function argonUsernames(): Promise<string[]> {
  const { data } = await (await db()).from("argon_projects").select("username").limit(2000)
  return Array.from(new Set((data ?? []).map(r => r.username as string)))
}

/** Thay đổi so với tin cũ chờ anh xem: sự việc đang hiệu lực có ghi chú thay đổi và cờ chờ xác nhận (mới nhất trước). */
export async function listPendingChanges(username: string): Promise<FactRow[]> {
  const { data } = await (await db()).from("argon_facts").select("*").eq("username", username).eq("status", "active").eq("needs_review", true).order("recorded_at", { ascending: false }).limit(50)
  return (data ?? []) as FactRow[]
}
