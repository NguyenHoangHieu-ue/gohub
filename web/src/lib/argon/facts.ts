import { dateKey, dueReminders, expiredIds, factKey, nightlyMessage, vnToday, type FactIn, type FactRow, type FactStatus, type FactType } from "./facts-pure"

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
export async function saveSourceFacts(username: string, src: { id: string; name: string }, facts: FactIn[]): Promise<FactRow[]> {
  const sb = await db()
  const { data: mine } = await sb.from("argon_facts").select("*").eq("source_id", src.id)
  const keep = ((mine ?? []) as FactRow[]).filter(f => f.edited || f.status === "rejected" || f.origin === "manual")
  const dropIds = ((mine ?? []) as FactRow[]).filter(f => !keep.includes(f)).map(f => f.id)
  if (dropIds.length) await sb.from("argon_facts").delete().in("id", dropIds)
  const have = new Set(keep.map(factKey))
  const fresh = facts.filter(f => !have.has(factKey(f)))
  if (!fresh.length) return []
  const { data: ins, error } = await sb.from("argon_facts").insert(fresh.map(f => ({
    username, type: f.type, vendor: f.vendor, subject: f.subject, summary: f.summary, evidence: f.evidence,
    effective_from: f.effectiveFrom, expires_at: f.expiresAt, source_id: src.id, source_name: src.name.slice(0, 160),
  }))).select("*")
  if (error) throw new Error(error.message)
  const added = (ins ?? []) as FactRow[]
  const { data: others } = await sb.from("argon_facts").select("id,vendor,type,subject,effective_from,expires_at,source_id,status").eq("username", username).in("status", ["active", "expired"]).neq("source_id", src.id)
  const newest = new Map(added.map(f => [factKey(f), f.id]))
  const newestByDate = new Map(added.flatMap(f => { const k = dateKey(f); return k ? [[k, f.id] as const] : [] }))
  const old = ((others ?? []) as Pick<FactRow, "id" | "vendor" | "type" | "subject" | "effective_from" | "expires_at">[])
    .map(o => ({ o, by: (o.subject && newest.get(factKey(o))) || newestByDate.get(dateKey(o) ?? "") })).filter(x => !!x.by)
  for (const { o, by } of old) await sb.from("argon_facts").update({ status: "superseded", superseded_by: by, updated_at: new Date().toISOString() }).eq("id", o.id)
  return added
}

export async function addManualFact(username: string, f: FactIn & { sourceId?: string | null; sourceName?: string }): Promise<FactRow> {
  const { data, error } = await (await db()).from("argon_facts").insert({
    username, type: f.type, vendor: f.vendor, subject: f.subject, summary: f.summary, evidence: f.evidence, effective_from: f.effectiveFrom, expires_at: f.expiresAt,
    origin: "manual", edited: true, source_id: f.sourceId ?? null, source_name: f.sourceName ?? "",
  }).select("*").single()
  if (error || !data) throw new Error(error?.message ?? "Không ghi được sự việc")
  return data as FactRow
}

export interface FactPatch { status?: FactStatus; type?: FactType; vendor?: string; subject?: string; summary?: string; effective_from?: string | null; expires_at?: string | null; remind_days?: number }
/** Hiếu (hoặc Thủ thư) sửa sự việc: đổi nội dung/ngày → đánh dấu đã sửa (không bị trích lại ghi đè) và nhắc lại được; chỉ đổi trạng thái thì giữ nguyên cờ. */
export async function updateFact(username: string, id: string, p: FactPatch): Promise<FactRow | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (p.status) row.status = p.status
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
