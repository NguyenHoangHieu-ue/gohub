// Chatwoot API — nguồn LEADS cho B2C (conversations = lead inquiries).
// Env: CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN (api_access_token của agent).

const BASE  = process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com"
const ACC   = process.env.CHATWOOT_ACCOUNT_ID || ""
const TOKEN = process.env.CHATWOOT_API_TOKEN || ""

const HEADERS = { api_access_token: TOKEN }

// Gom channel_type của inbox về nhãn kênh hiển thị.
const CHANNEL_LABEL: Record<string, string> = {
  "Channel::WebWidget": "Web",
  "Channel::Whatsapp": "WhatsApp",
  "Channel::FacebookPage": "Facebook",
  "Channel::Instagram": "Instagram",
  "Channel::Tiktok": "Tiktok",
  "Channel::Email": "Email",
  "Channel::TwilioSms": "SMS",
  "Channel::Telegram": "Telegram",
  "Channel::Line": "Line",
  "Channel::Api": "API",
}
const CHANNEL_ORDER = ["Web", "WhatsApp", "Facebook", "Instagram", "Tiktok"]

export function chatwootConfigured(): boolean {
  return !!(ACC && TOKEN)
}

// timestamp (giây) → "YYYY-MM"; +15 ngày để rơi giữa tháng (đúng dù lệch timezone biên tháng).
function monthKey(ts: number): string {
  const d = new Date((ts + 15 * 86400) * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

async function cwInboxes(): Promise<{ id: number; channel: string }[]> {
  const res = await fetch(`${BASE}/api/v1/accounts/${ACC}/inboxes`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Chatwoot inboxes ${res.status}`)
  const j = await res.json()
  return (j.payload || []).map((i: { id: number; channel_type: string }) => ({
    id: i.id, channel: CHANNEL_LABEL[i.channel_type] || "Khác",
  }))
}

async function cwInboxReport(inboxId: number, since: number, until: number): Promise<{ value: number; timestamp: number }[]> {
  const url = `${BASE}/api/v2/accounts/${ACC}/reports?metric=conversations_count&type=inbox&id=${inboxId}&since=${since}&until=${until}&group_by=month`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Chatwoot report ${res.status}`)
  return res.json()
}

export interface LeadsBreakdown {
  total: Record<string, number>
  channels: { label: string; byMonth: Record<string, number> }[]
}

// Leads (conversations mới) theo tháng + breakdown theo kênh. Lỗi/chưa cấu hình → total 0, channels [].
export async function chatwootLeadsBreakdown(months: string[]): Promise<LeadsBreakdown> {
  const total: Record<string, number> = {}
  for (const m of months) total[m] = 0
  if (!chatwootConfigured() || months.length === 0) return { total, channels: [] }

  const since = Math.floor(new Date(`${months[0]}-01T00:00:00Z`).getTime() / 1000)
  const until = Math.floor(Date.now() / 1000)

  const inboxes = await cwInboxes()
  const results = await Promise.all(
    inboxes.map(ib =>
      cwInboxReport(ib.id, since, until)
        .then(rows => ({ channel: ib.channel, rows }))
        .catch(() => ({ channel: ib.channel, rows: [] as { value: number; timestamp: number }[] })),
    ),
  )

  // gộp nhiều inbox cùng kênh
  const byChannel: Record<string, Record<string, number>> = {}
  for (const { channel, rows } of results) {
    if (!byChannel[channel]) { byChannel[channel] = {}; for (const m of months) byChannel[channel][m] = 0 }
    for (const r of rows) {
      const key = monthKey(r.timestamp)
      if (total[key] !== undefined) { byChannel[channel][key] += r.value; total[key] += r.value }
    }
  }

  const ordered = [...CHANNEL_ORDER, ...Object.keys(byChannel).filter(c => !CHANNEL_ORDER.includes(c))]
  const channels = ordered
    .filter(c => byChannel[c] && months.some(m => byChannel[c][m] > 0))
    .map(label => ({ label, byMonth: byChannel[label] }))

  return { total, channels }
}
