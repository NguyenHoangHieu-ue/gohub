import { larkToken } from "./lark"

// Đọc mail Lark của Creator (CHỈ ĐỌC — token Creator, scope mail:user_mailbox.*:read). Không gửi, không xoá, không đánh dấu đã đọc.
const L = "https://open.larksuite.com/open-apis"
const PAGE = 20
export const MAX_SCAN_MESSAGES = 150

export interface MailRule {
  id: string
  name: string
  folder: string            // id thư mục Lark (INBOX, SENT, ARCHIVED... hoặc id thư mục tự tạo)
  from?: string             // chứa chuỗi này trong địa chỉ/tên người gửi
  keywords?: string         // các từ cách nhau bằng dấu phẩy; khớp bất kỳ từ nào trong tiêu đề hoặc nội dung
  sinceDays: number         // chỉ lấy thư trong N ngày gần nhất
  maxThreads: number        // tối đa số luồng thư giữ lại (mới nhất trước)
  attachments: boolean      // tải đính kèm (pdf/docx/xlsx/pptx/csv/txt/md ≤15MB) thành nguồn riêng
}

export interface MailAttachment { id: string; filename: string; inline: boolean }
export interface MailMessage {
  id: string; threadId: string; subject: string; from: string; to: string; cc: string; dateMs: number; text: string; attachments: MailAttachment[]
}

async function lk(token: string, path: string): Promise<any> {
  const res = await fetch(`${L}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) {
    const need = String(d.msg ?? "").match(/required one of these privileges[^:]*:\s*(\[[^\]]*\])/)
    throw new Error(d.code === 99991679 ? `Token Lark thiếu quyền mail ${need ? need[1] : ""} — bấm "Kết nối Lark" lại ở Creator Settings` : `Lark mail ${d.code}: ${d.msg}`)
  }
  return d.data ?? d
}

const b64 = (s: unknown) => (s ? Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "")
const addr = (a: { mail_address?: string; name?: string } | undefined) => (a ? (a.name ? `${a.name} <${a.mail_address}>` : String(a.mail_address ?? "")) : "")
const addrs = (l: { mail_address?: string; name?: string }[] | undefined) => (l ?? []).map(addr).filter(Boolean).join(", ")

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|tr|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export async function listFolders(token?: string): Promise<{ id: string; name: string }[]> {
  const t = token ?? (await larkToken())
  const d = await lk(t, "/mail/v1/user_mailboxes/me/folders")
  return ((d.items ?? []) as { id: string; name: string }[]).map(f => ({ id: f.id, name: f.name }))
}

export async function getMessage(token: string, id: string): Promise<MailMessage | null> {
  const d = await lk(token, `/mail/v1/user_mailboxes/me/messages/${encodeURIComponent(id)}`)
  const m = d.message
  if (!m) return null
  const plain = b64(m.body_plain_text)
  return {
    id: String(m.message_id ?? id), threadId: String(m.thread_id ?? m.message_id ?? id), subject: String(m.subject ?? "(không tiêu đề)"),
    from: addr(m.head_from), to: addrs(m.to), cc: addrs(m.cc), dateMs: Number(m.internal_date) || 0,
    text: (plain.trim() ? plain : htmlToText(b64(m.body_html))).trim(),
    attachments: ((m.attachments ?? []) as { id: string; filename: string; is_inline?: boolean; cid?: string }[]).map(a => ({ id: a.id, filename: a.filename, inline: !!a.is_inline || !!a.cid })),
  }
}

/** Duyệt thư mục từ MỚI → CŨ, dừng khi quá `sinceMs` hoặc đủ `maxScan`; `knownIds` (đã đồng bộ) không tải lại nội dung. Trả các thư KHỚP quy tắc. */
export async function scanFolder(token: string, rule: MailRule, knownIds: Set<string> = new Set(), maxScan = MAX_SCAN_MESSAGES): Promise<{ messages: MailMessage[]; scanned: number }> {
  const sinceMs = Date.now() - rule.sinceDays * 86_400_000
  const fromQ = rule.from?.trim().toLowerCase()
  const kws = (rule.keywords ?? "").split(",").map(k => k.trim().toLowerCase()).filter(Boolean)
  const out: MailMessage[] = []
  let scanned = 0, pageToken = "", done = false
  while (!done && scanned < maxScan) {
    const d = await lk(token, `/mail/v1/user_mailboxes/me/messages?folder_id=${encodeURIComponent(rule.folder)}&page_size=${PAGE}${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`)
    const ids: string[] = d.items ?? []
    for (let i = 0; i < ids.length && !done; i += 5) {
      const batch = await Promise.all(ids.slice(i, i + 5).map(id => (knownIds.has(id) ? Promise.resolve(null) : getMessage(token, id).catch(() => null))))
      for (const m of batch) {
        scanned++
        if (!m) continue
        if (m.dateMs && m.dateMs < sinceMs) { done = true; continue }
        if (fromQ && !m.from.toLowerCase().includes(fromQ)) continue
        if (kws.length) { const hay = `${m.subject}\n${m.text}`.toLowerCase(); if (!kws.some(k => hay.includes(k))) continue }
        out.push(m)
      }
    }
    if (!d.has_more || !ids.length) break
    pageToken = d.page_token
  }
  return { messages: out, scanned }
}

export async function downloadAttachment(token: string, messageId: string, attachmentId: string): Promise<Buffer> {
  const d = await lk(token, `/mail/v1/user_mailboxes/me/messages/${encodeURIComponent(messageId)}/attachments/download_url?attachment_ids=${encodeURIComponent(attachmentId)}`)
  const url = d.download_urls?.[0]?.download_url
  if (!url) throw new Error("Lark không trả đường tải đính kèm")
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Tải đính kèm lỗi HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Gom thư theo luồng, trả văn bản 1 luồng: 2 thư mới nhất đầy đủ, thư cũ hơn chỉ giữ dòng tiêu đề (thư trả lời đã trích dẫn lại thư trước). */
export function threadText(messages: MailMessage[]): string {
  const sorted = [...messages].sort((a, b) => a.dateMs - b.dateMs)
  const fmt = (m: MailMessage, full: boolean) => {
    const head = `Từ: ${m.from}\nĐến: ${m.to}${m.cc ? `\nCc: ${m.cc}` : ""}\nNgày: ${m.dateMs ? new Date(m.dateMs).toISOString().slice(0, 16).replace("T", " ") : "?"}`
    return full ? `${head}\n\n${m.text}` : `${head}  (nội dung đã nằm trong thư sau)`
  }
  return sorted.map((m, i) => fmt(m, i >= sorted.length - 2)).join("\n\n---\n\n")
}

export const ATTACH_EXT = /\.(pdf|docx|xlsx|pptx|csv|txt|md)$/i
export const MAX_ATTACH_BYTES = 15 * 1024 * 1024
