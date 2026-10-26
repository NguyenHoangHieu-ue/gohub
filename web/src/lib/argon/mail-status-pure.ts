// Sổ trạng thái mail theo thread: phần THUẦN — kiểu, nhận diện thư tự động, gộp luồng, chuẩn hoá kết quả phân loại, gom nhóm hiển thị. Không I/O.
import type { MailMessage } from "./mail"

export type MailThreadStatus = "waiting_me" | "waiting_partner" | "done" | "ignored"
export const STATUS_LABEL: Record<MailThreadStatus, string> = { waiting_me: "Chờ mình", waiting_partner: "Chờ đối tác", done: "Xong", ignored: "Bỏ qua" }

export interface MailThreadRow {
  id: string; username: string; thread_id: string; subject: string; counterparty: string; last_message_id: string; last_at: string | null
  last_from_me: boolean; message_count: number; status: MailThreadStatus; status_by: "auto" | "manual"; summary: string; next_action: string
  nudged_at: string | null; created_at: string; updated_at: string
}

/** Một luồng sau khi gộp thư INBOX + SENT. */
export interface ThreadSnapshot {
  threadId: string; subject: string; counterparty: string; lastMessageId: string; lastAt: number; lastFromMe: boolean; count: number
  messages: MailMessage[]; allAutomated: boolean
}

const AUTO_FROM = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounce|notification|notifications|newsletter|alerts?@|automated|noti@|system@)/i
/** Người gửi trông như hệ thống/tự động (OTP, newsletter, thông báo). */
export const isAutomatedSender = (from: string) => AUTO_FROM.test(from)

/** Gộp thư thành luồng. `sentIds` = id thư lấy từ thư mục SENT (thư CỦA MÌNH). Luồng chỉ gồm thư tự động từ người lạ → allAutomated. */
export function buildSnapshots(inbox: MailMessage[], sent: MailMessage[]): ThreadSnapshot[] {
  const sentIds = new Set(sent.map(m => m.id))
  const byThread = new Map<string, MailMessage[]>()
  for (const m of [...inbox, ...sent]) {
    const list = byThread.get(m.threadId) ?? []
    if (!list.some(x => x.id === m.id)) list.push(m)
    byThread.set(m.threadId, list)
  }
  const out: ThreadSnapshot[] = []
  for (const [threadId, ms] of byThread) {
    const sorted = [...ms].sort((a, b) => a.dateMs - b.dateMs)
    const last = sorted[sorted.length - 1]
    const lastFromMe = sentIds.has(last.id)
    const theirs = [...sorted].reverse().find(m => !sentIds.has(m.id))
    const counterparty = lastFromMe ? last.to : theirs?.from ?? last.from
    out.push({
      threadId, subject: last.subject, counterparty: counterparty.slice(0, 160), lastMessageId: last.id, lastAt: last.dateMs, lastFromMe, count: sorted.length,
      messages: sorted, allAutomated: sorted.every(m => sentIds.has(m.id) ? false : isAutomatedSender(m.from)),
    })
  }
  return out.sort((a, b) => b.lastAt - a.lastAt)
}

/** Trạng thái mặc định khi chưa phân loại được bằng model: thư cuối của mình → chờ đối tác, của họ → chờ mình. */
export const baseStatus = (lastFromMe: boolean): MailThreadStatus => (lastFromMe ? "waiting_partner" : "waiting_me")

export interface Classification { state: "waiting_me" | "waiting_partner" | "done"; summary: string; nextAction: string }

/** Chuẩn hoá JSON model trả về; sai định dạng → null (dùng baseStatus). */
export function normalizeClassification(raw: string): Classification | null {
  const m = /\{[\s\S]*\}/.exec(raw)
  if (!m) return null
  let o: Record<string, unknown>
  try { o = JSON.parse(m[0]) } catch { return null }
  const state = o.state
  if (state !== "waiting_me" && state !== "waiting_partner" && state !== "done") return null
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "")
  return { state, summary: s(o.summary, 240), nextAction: state === "done" ? "" : s(o.nextAction, 200) }
}

/** Cần phân loại lại? Chưa có dòng, hoặc có thư mới. Anh tự đặt trạng thái (manual) thì chỉ phân loại lại khi có thư mới. */
export const needsClassify = (row: Pick<MailThreadRow, "last_message_id"> | null, snap: Pick<ThreadSnapshot, "lastMessageId">) => !row || row.last_message_id !== snap.lastMessageId

export const NEW_HOURS = 48
export const NUDGE_DAYS = { waiting_me: 2, waiting_partner: 5 } as const
export const NUDGE_EVERY_DAYS = 3

/** Mới = vừa xuất hiện (≤48 giờ) và đang chờ mình. */
export const isNewThread = (r: Pick<MailThreadRow, "status" | "created_at">, now = Date.now()) => r.status === "waiting_me" && now - Date.parse(r.created_at) <= NEW_HOURS * 3_600_000

export function waitingDays(r: Pick<MailThreadRow, "last_at">, now = Date.now()): number {
  return r.last_at ? Math.max(0, Math.floor((now - Date.parse(r.last_at)) / 86_400_000)) : 0
}

export interface MailBuckets { waitingMe: MailThreadRow[]; waitingPartner: MailThreadRow[]; done: MailThreadRow[]; ignored: number }
/** Gom để hiển thị: chờ mình / chờ đối tác (chờ lâu nhất trước), xong (mới nhất trước), số thư tự động bị bỏ qua. */
export function bucketThreads(rows: MailThreadRow[]): MailBuckets {
  const oldest = (a: MailThreadRow, b: MailThreadRow) => (a.last_at ?? "").localeCompare(b.last_at ?? "")
  return {
    waitingMe: rows.filter(r => r.status === "waiting_me").sort(oldest),
    waitingPartner: rows.filter(r => r.status === "waiting_partner").sort(oldest),
    done: rows.filter(r => r.status === "done").sort((a, b) => oldest(b, a)),
    ignored: rows.filter(r => r.status === "ignored").length,
  }
}

/** Luồng nên nhắc Lark hôm nay: chờ mình ≥2 ngày hoặc chờ đối tác ≥5 ngày, và chưa nhắc trong 3 ngày qua. */
export function dueNudges(rows: MailThreadRow[], now = Date.now()): MailThreadRow[] {
  return rows.filter(r => {
    if (r.status !== "waiting_me" && r.status !== "waiting_partner") return false
    if (waitingDays(r, now) < NUDGE_DAYS[r.status]) return false
    return !r.nudged_at || now - Date.parse(r.nudged_at) >= NUDGE_EVERY_DAYS * 86_400_000
  }).sort((a, b) => (a.last_at ?? "").localeCompare(b.last_at ?? ""))
}

export const threadLine = (r: Pick<MailThreadRow, "subject" | "counterparty" | "summary" | "next_action" | "last_at">, now = Date.now()) =>
  `${r.subject || "(không tiêu đề)"}${r.counterparty ? ` — ${r.counterparty.replace(/<[^>]*>/g, "").trim()}` : ""} · ${waitingDays(r, now)} ngày${r.next_action ? ` · việc: ${r.next_action}` : r.summary ? ` · ${r.summary}` : ""}`

export function nudgeMessage(rows: MailThreadRow[], link: string, now = Date.now()): string {
  const me = rows.filter(r => r.status === "waiting_me"), partner = rows.filter(r => r.status === "waiting_partner")
  const parts: string[] = []
  if (me.length) parts.push(`📥 Chờ anh trả lời (${me.length}):\n${me.slice(0, 8).map(r => `• ${threadLine(r, now)}`).join("\n")}`)
  if (partner.length) parts.push(`📤 Anh đã gửi, đối tác chưa trả lời (${partner.length}):\n${partner.slice(0, 8).map(r => `• ${threadLine(r, now)}`).join("\n")}`)
  return parts.length ? `${parts.join("\n\n")}\n\nXong rồi thì anh đánh dấu ở tab Hôm nay › Mail: ${link}` : ""
}
