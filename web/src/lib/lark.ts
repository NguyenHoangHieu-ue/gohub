// Lark Bot API helpers

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
