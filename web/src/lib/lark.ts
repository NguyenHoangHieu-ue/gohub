// Lark Bot API helpers
import * as XLSX from "xlsx"

const LARK_API = "https://open.larksuite.com/open-apis"

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

  // 2. Generate xlsx và upload + gửi vào chat
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  const xlsxBuf: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" })
  const xlsxArrayBuf = xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength) as ArrayBuffer
  const xlsxBlob = new Blob([xlsxArrayBuf], {
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
