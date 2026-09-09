// Lark Bot API helpers
import * as XLSX from "xlsx"
import { supabaseAdmin } from "@/lib/supabase"

const LARK_API = "https://open.larksuite.com/open-apis"

// ─── OAuth user_access_token (cho phép đọc task cá nhân của creator) ─────────────
const OAUTH_KEY = "lark_oauth_creator"

interface LarkOAuthStore {
  open_id?:            string
  access_token:        string
  refresh_token:       string
  access_expires_at:   number   // ms
  refresh_expires_at:  number   // ms
}

// Đổi authorization_code → token (OAuth v2)
export async function exchangeLarkCode(code: string, redirectUri: string): Promise<any> {
  const res = await fetch(`${LARK_API}/authen/v2/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      grant_type:    "authorization_code",
      client_id:     process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code,
      redirect_uri:  redirectUri,
    }),
  })
  return res.json()
}

// Lưu token vào app_settings (tính sẵn thời điểm hết hạn, trừ hao 60s)
export async function saveLarkUserToken(tok: any, openId?: string): Promise<void> {
  const now = Date.now()
  const store: LarkOAuthStore = {
    open_id:            openId,
    access_token:       tok.access_token,
    refresh_token:      tok.refresh_token,
    access_expires_at:  now + ((tok.expires_in || 7200) - 60) * 1000,
    refresh_expires_at: now + ((tok.refresh_token_expires_in || 2592000) - 60) * 1000,
  }
  await supabaseAdmin.from("app_settings").upsert(
    { key: OAUTH_KEY, value: JSON.stringify(store), category: "lark_oauth" },
    { onConflict: "key" }
  )
}

// Trả access_token còn hạn (tự refresh nếu cần); null nếu chưa kết nối / refresh hết hạn.
export async function getLarkUserToken(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", OAUTH_KEY).maybeSingle()
  if (!data?.value) return null
  let store: LarkOAuthStore
  try { store = JSON.parse(data.value) } catch { return null }

  if (Date.now() < store.access_expires_at) return store.access_token
  // Access hết hạn → refresh nếu refresh còn hạn
  if (Date.now() >= store.refresh_expires_at || !store.refresh_token) return null
  try {
    const res = await fetch(`${LARK_API}/authen/v2/oauth/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        grant_type:    "refresh_token",
        client_id:     process.env.LARK_APP_ID,
        client_secret: process.env.LARK_APP_SECRET,
        refresh_token: store.refresh_token,
      }),
    })
    const tok = await res.json()
    if (tok.code && tok.code !== 0) return null
    if (!tok.access_token) return null
    await saveLarkUserToken(tok, store.open_id)
    return tok.access_token
  } catch { return null }
}

// open_id của creator đã kết nối Lark cá nhân (để gán task assignee mà không cần env).
export async function getLarkUserOpenId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", OAUTH_KEY).maybeSingle()
  if (!data?.value) return null
  try { return (JSON.parse(data.value) as LarkOAuthStore).open_id ?? null } catch { return null }
}

// Cache app_access_token (expires in ~2h, refresh 10 min before)
let _token: string | null   = null
let _tokenExp: number       = 0

export async function getLarkToken(): Promise<string> {
  if (_token && Date.now() < _tokenExp) return _token

  const res  = await fetch(`${LARK_API}/auth/v3/app_access_token/internal`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      app_id:     process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Lark token error: ${data.msg}`)

  _token    = data.app_access_token
  _tokenExp = Date.now() + (data.expire - 600) * 1000  // refresh 10 min early
  return _token!
}

// Send a text message to a Lark chat
export async function sendLarkMessage(receiveId: string, receiveIdType: string, text: string) {
  const token = await getLarkToken()
  await fetch(`${LARK_API}/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type:   "text",
      content:    JSON.stringify({ text }),
    }),
  })
}

// Reply to a specific message (shows threading)
export async function replyLarkMessage(messageId: string, text: string) {
  const token = await getLarkToken()
  await fetch(`${LARK_API}/im/v1/messages/${messageId}/reply`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      msg_type: "text",
      content:  JSON.stringify({ text }),
    }),
  })
}

// DM trực tiếp đến 1 user Lark bằng open_id (LARK_CREATOR_USER_ID = open_id).
// LƯU Ý: phải dùng receive_id_type=open_id (không phải user_id) vì ta truyền open_id.
export async function sendLarkDM(openId: string, text: string): Promise<void> {
  try {
    await sendLarkMessage(openId, "open_id", text)
  } catch { /* fire-and-forget — không block */ }
}

// Reply with Lark Interactive Card (có bảng) + đính kèm xlsx
export async function replyLarkTable(
  messageId: string,
  chatId: string,
  preText: string,
  headers: string[],
  rows: string[][],
) {
  const token = await getLarkToken()

  // 1. Gửi Interactive Card với bảng
  const columns = headers.map((h, i) => ({
    name:         `col${i}`,
    display_name: h,
    width:        "auto",
  }))
  const cardRows = rows.map(r =>
    Object.fromEntries(headers.map((_, i) => [`col${i}`, r[i] ?? ""]))
  )

  const card = {
    schema: "2.0",
    body: {
      elements: [
        ...(preText ? [{ tag: "markdown", content: preText }] : []),
        {
          tag:       "table",
          page_size: 10,
          columns,
          rows:      cardRows,
        },
      ],
    },
  }

  await fetch(`${LARK_API}/im/v1/messages/${messageId}/reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      msg_type: "interactive",
      content:  JSON.stringify(card),
    }),
  })

  // 2. Generate xlsx và upload + gửi vào chat (optional — không throw nếu fail)
  try {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, "Data")
    const xlsxBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array
    const xlsxBlob = new Blob([Buffer.from(xlsxBuf)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    const formData = new FormData()
    formData.append("file_type", "xlsx")
    formData.append("file_name", "data.xlsx")
    formData.append("file", xlsxBlob, "data.xlsx")

    const uploadRes = await fetch(`${LARK_API}/im/v1/files`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body:    formData,
    })
    const uploadData = await uploadRes.json()

    if (uploadData.code === 0) {
      const fileKey = uploadData.data?.file_key
      await fetch(`${LARK_API}/im/v1/messages?receive_id_type=chat_id`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type:   "file",
          content:    JSON.stringify({ file_key: fileKey }),
        }),
      })
    }
  } catch (e: any) {
    console.error("[Lark] xlsx upload failed (card already sent):", e?.message)
    // Không re-throw — card đã gửi thành công rồi
  }
}

// Parse markdown table → { headers, rows }
export function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } | null {
  const lines = md.split("\n").map(l => l.trim()).filter(Boolean)
  const tableStart = lines.findIndex(l => l.startsWith("|"))
  if (tableStart === -1) return null

  const tableLines = lines.slice(tableStart).filter(l => l.startsWith("|"))
  if (tableLines.length < 2) return null

  const parseCells = (line: string) =>
    line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1)

  const headers = parseCells(tableLines[0])
  // tableLines[1] là separator (---|---), bỏ qua
  const rows = tableLines.slice(2).map(parseCells)

  if (!headers.length || !rows.length) return null
  return { headers, rows }
}

// Tách text trước bảng và bảng markdown ra
export function splitTextAndTable(text: string): { preText: string; tableText: string } | null {
  const match = text.match(/([\s\S]*?)(\|.+\|[\s\S]+)/)
  if (!match) return null
  return { preText: match[1].trim(), tableText: match[2].trim() }
}

// Tự tra open_id của CHÍNH người vừa OAuth (dùng user_access_token, KHÔNG phải app token).
// Lark OAuth v2 token exchange KHÔNG trả open_id trong response (khác giả định cũ) — phải gọi riêng
// endpoint này mới có. Bug thật: oauth/callback trước đọc thẳng `tok.open_id` (luôn undefined) →
// open_id KHÔNG BAO GIỜ được lưu vào lark_oauth_creator → mọi tính năng dựa vào getLarkUserOpenId()
// (My Metrics real-time capture, gán task assignee...) coi như chưa kết nối dù đã OAuth xong.
export async function getLarkSelfOpenId(userAccessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${LARK_API}/authen/v1/user_info`, {
      headers: { "Authorization": `Bearer ${userAccessToken}` },
    })
    const data = await res.json()
    if (data.code !== 0) return null
    return data.data?.open_id ?? null
  } catch { return null }
}

// Get user info by open_id (to get name)
export async function getLarkUserInfo(openId: string): Promise<{ name: string } | null> {
  try {
    const token = await getLarkToken()
    const res   = await fetch(`${LARK_API}/contact/v3/users/${openId}?user_id_type=open_id`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.code !== 0) return null
    return { name: data.data?.user?.name ?? "" }
  } catch { return null }
}

// Chuyển báo cáo markdown → mảng element cho Lark interactive card (text + bảng thật).
// Tách các đoạn text và bảng markdown xen kẽ; mỗi bảng → 1 table element (hiển thị đẹp).
export function markdownToLarkElements(md: string): any[] {
  const lines = (md || "").split("\n")
  const elements: any[] = []
  let textBuf: string[] = []
  let tableBuf: string[] = []
  const normalize = (t: string) => t
    .replace(/```[\s\S]*?```/g, "")            // bỏ code block (SQL/chart lỡ có)
    .replace(/^#{1,6}\s*(.+)$/gm, "**$1**")    // heading → bold
    .replace(/^\s*[-*]\s+/gm, "• ")            // bullet
    .replace(/^\s*-{3,}\s*$/gm, "")            // hr
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const flushText = () => { const t = normalize(textBuf.join("\n")); if (t) elements.push({ tag: "markdown", content: t }); textBuf = [] }
  const flushTable = () => {
    if (tableBuf.length >= 2) {
      const parsed = parseMarkdownTable(tableBuf.join("\n"))
      if (parsed?.headers.length) {
        // Ô bảng Lark không render markdown → bỏ **đậm**, *nghiêng*, `code` để hiện số/chữ sạch
        const cleanCell = (s: string) => (s ?? "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\*/g, "").trim()
        const columns = parsed.headers.map((h, i) => ({ name: `c${i}`, display_name: cleanCell(h), width: "auto" }))
        const rows = parsed.rows.map(r => Object.fromEntries(parsed.headers.map((_, i) => [`c${i}`, cleanCell(r[i] ?? "")])))
        elements.push({ tag: "table", page_size: Math.min(Math.max(rows.length, 1), 20), columns, rows })
        tableBuf = []
        return
      }
    }
    textBuf.push(...tableBuf); tableBuf = []   // không parse được → coi như text
  }
  for (const line of lines) {
    if (line.trim().startsWith("|")) { if (tableBuf.length === 0) flushText(); tableBuf.push(line) }
    else { if (tableBuf.length) flushTable(); textBuf.push(line) }
  }
  flushTable(); flushText()
  return elements
}

// Card báo cáo (schema 2.0): header màu + nội dung (text + bảng).
export function buildReportCard(title: string, reportMarkdown: string, prefix?: string): any {
  const elements = markdownToLarkElements(reportMarkdown)
  if (prefix) elements.unshift({ tag: "markdown", content: prefix })
  return {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: title || "Báo cáo" }, template: "blue" },
    body: { elements: elements.length ? elements : [{ tag: "markdown", content: reportMarkdown || "(trống)" }] },
  }
}

// Gửi interactive card vào 1 chat qua bot API (dùng cho scheduled message khi không có webhook).
export async function sendLarkCardToChat(chatId: string, card: any) {
  const token = await getLarkToken()
  const res = await fetch(`${LARK_API}/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
  })
  if (!res.ok) throw new Error(`Lark card send returned ${res.status}`)
}

// Strip markdown for plain text output
export function stripMarkdown(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")       // bold
    .replace(/\*(.+?)\*/g, "$1")            // italic
    .replace(/`(.+?)`/g, "$1")             // inline code
    .replace(/^#{1,3}\s+/gm, "")           // headings
    .replace(/^[-*]\s+/gm, "• ")           // bullets
    .replace(/^\d+\.\s+/gm, (m) => m)      // numbered list (keep)
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")    // links
    .replace(/---+/g, "─────────")         // hr
    .trim()
}
