// Chatwoot API — nguồn LEADS cho B2C.
// Env: CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN (api_access_token của agent).
//
// B2C lead sources tracked now: Live Chat, Whatsapp, Zalo, Facebook, Instagram.
// Zalo cá nhân chưa tracking được nên số liệu lead có thể thấp hơn thực tế.

const BASE  = process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com"
const ACC   = process.env.CHATWOOT_ACCOUNT_ID || ""
const TOKEN = process.env.CHATWOOT_API_TOKEN || ""

const HEADERS = { api_access_token: TOKEN }

const B2C_CHANNEL_ORDER = ["Live Chat", "Zalo", "Facebook", "Instagram", "Whatsapp"]
const CHANNEL_LABEL: Record<string, string> = {
  "Channel::WebWidget": "Live Chat",
  "Channel::Whatsapp": "Whatsapp",
  "Channel::FacebookPage": "Facebook",
  "Channel::Instagram": "Instagram",
  "Channel::Api": "Live Chat",
}

export interface LeadsBreakdown {
  total: Record<string, number>
  channels: { label: string; byMonth: Record<string, number> }[]
}

interface ChatwootInbox {
  id: number
  name?: string
  channel_type: string
}

interface ChatwootConversation {
  id: number
  inbox_id: number
  created_at?: number
  timestamp?: number
  last_activity_at?: number
  additional_attributes?: Record<string, any>
}

export function chatwootConfigured(): boolean {
  return !!(ACC && TOKEN)
}

function normalizeKey(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

// timestamp (giây) → "YYYY-MM"; +15 ngày để rơi giữa tháng (đúng dù lệch timezone biên tháng).
function monthKey(ts: number): string {
  const d = new Date((ts + 15 * 86400) * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthKeyFromCreatedAt(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function isZaloConversation(c: ChatwootConversation): boolean {
  const referer = String(c.additional_attributes?.referer || "").toLowerCase()
  try {
    const url = new URL(referer)
    const utmSource = url.searchParams.get("utm_source")?.toLowerCase() || ""
    const utmMedium = url.searchParams.get("utm_medium")?.toLowerCase() || ""
    const utmCampaign = url.searchParams.get("utm_campaign")?.toLowerCase() || ""
    return [utmSource, utmMedium, utmCampaign, referer].some(v => v.includes("zalo"))
  } catch {
    return referer.includes("zalo")
  }
}

function channelForInbox(inbox: ChatwootInbox): string | null {
  const name = normalizeKey(inbox.name)
  if (name.includes("zalocanhan") || name.includes("zalopersonal")) return null
  if (name.includes("zalo")) return "Zalo"
  if (name.includes("messenger") || name.includes("facebook")) return "Facebook"
  if (name.includes("instagram")) return "Instagram"
  if (name.includes("whatsapp")) return "Whatsapp"
  if (name.includes("livechat") || name.includes("webchat") || name.includes("website")) return "Live Chat"
  return CHANNEL_LABEL[inbox.channel_type] ?? null
}

async function cwInboxes(): Promise<{ id: number; channel: string }[]> {
  const res = await fetch(`${BASE}/api/v1/accounts/${ACC}/inboxes`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Chatwoot inboxes ${res.status}`)
  const j = await res.json()
  return (j.payload || [])
    .map((i: ChatwootInbox) => ({ id: i.id, channel: channelForInbox(i) }))
    .filter((i: { id: number; channel: string | null }): i is { id: number; channel: string } =>
      !!i.channel && B2C_CHANNEL_ORDER.includes(i.channel)
    )
}

async function cwInboxReport(inboxId: number, since: number, until: number): Promise<{ value: number; timestamp: number }[]> {
  const url = `${BASE}/api/v2/accounts/${ACC}/reports?metric=conversations_count&type=inbox&id=${inboxId}&since=${since}&until=${until}&group_by=month`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Chatwoot report ${res.status}`)
  return res.json()
}

async function cwInboxConversations(inboxId: number, since: number): Promise<ChatwootConversation[]> {
  const out: ChatwootConversation[] = []
  for (let page = 1; page <= 80; page++) {
    const res = await fetch(`${BASE}/api/v1/accounts/${ACC}/conversations?inbox_id=${inboxId}&page=${page}`, { headers: HEADERS })
    if (!res.ok) throw new Error(`Chatwoot conversations ${res.status}`)
    const j = await res.json()
    const rows = (j.data?.payload || j.payload || []) as ChatwootConversation[]
    if (!rows.length) break
    out.push(...rows.filter(c => (c.created_at ?? c.timestamp ?? c.last_activity_at ?? 0) >= since))
    const oldest = Math.min(...rows.map(c => c.created_at ?? c.timestamp ?? c.last_activity_at ?? Number.MAX_SAFE_INTEGER))
    if (oldest < since) break
  }
  return out
}

// Leads theo tháng + breakdown theo nguồn B2C.
// Hiện Chatwoot account chưa có label/custom attribute cho lead status, nên số này là conversations_count theo inbox/source B2C.
export async function chatwootLeadsBreakdown(months: string[]): Promise<LeadsBreakdown> {
  const total: Record<string, number> = {}
  for (const m of months) total[m] = 0
  if (!chatwootConfigured() || months.length === 0) return { total, channels: [] }

  const since = Math.floor(new Date(`${months[0]}-01T00:00:00Z`).getTime() / 1000)
  const until = Math.floor(Date.now() / 1000)
  const inboxes = await cwInboxes()

  const byChannel: Record<string, Record<string, number>> = {}
  for (const label of B2C_CHANNEL_ORDER) byChannel[label] = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>

  const webInboxes = inboxes.filter(i => i.channel === "Live Chat")
  const reportInboxes = inboxes.filter(i => i.channel !== "Live Chat")

  const webResults = await Promise.all(webInboxes.map(({ id }) =>
    cwInboxConversations(id, since).catch(() => [] as ChatwootConversation[])
  ))
  for (const rows of webResults) {
    for (const c of rows) {
      const key = monthKeyFromCreatedAt(c.created_at ?? c.timestamp ?? c.last_activity_at ?? 0)
      const channel = isZaloConversation(c) ? "Zalo" : "Live Chat"
      if (total[key] !== undefined) { byChannel[channel][key] += 1; total[key] += 1 }
    }
  }

  const results = await Promise.all(reportInboxes.map(({ id, channel }) =>
    cwInboxReport(id, since, until)
      .then(rows => ({ channel, rows }))
      .catch(() => ({ channel, rows: [] as { value: number; timestamp: number }[] })),
  ))

  for (const { channel, rows } of results) {
    for (const r of rows) {
      const key = monthKey(r.timestamp)
      if (total[key] !== undefined) { byChannel[channel][key] += r.value; total[key] += r.value }
    }
  }

  const channels = B2C_CHANNEL_ORDER
    .map(label => {
      const byMonth = byChannel[label] ?? Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>
      return { label, byMonth }
    })

  return { total, channels }
}
