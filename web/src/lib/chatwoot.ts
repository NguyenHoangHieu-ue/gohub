// Chatwoot API — nguồn LEADS cho B2C (conversations = lead inquiries).
// Env: CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN (api_access_token của agent).

const BASE  = process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com"
const ACC   = process.env.CHATWOOT_ACCOUNT_ID || ""
const TOKEN = process.env.CHATWOOT_API_TOKEN || ""

export function chatwootConfigured(): boolean {
  return !!(ACC && TOKEN)
}

async function cwReport(metric: string, since: number, until: number, groupBy: string): Promise<{ value: number; timestamp: number }[]> {
  const url = `${BASE}/api/v2/accounts/${ACC}/reports?metric=${metric}&type=account&since=${since}&until=${until}&group_by=${groupBy}`
  const res = await fetch(url, { headers: { api_access_token: TOKEN } })
  if (!res.ok) throw new Error(`Chatwoot ${res.status}`)
  return res.json()
}

// Leads (conversations mới) theo tháng cho window [months[0] .. nay]. Lỗi/chưa cấu hình → tất cả 0.
export async function chatwootLeadsByMonth(months: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const m of months) out[m] = 0
  if (!chatwootConfigured() || months.length === 0) return out

  const since = Math.floor(new Date(`${months[0]}-01T00:00:00Z`).getTime() / 1000)
  const until = Math.floor(Date.now() / 1000)
  const rows = await cwReport("conversations_count", since, until, "month")
  for (const r of rows) {
    // +15 ngày để rơi vào giữa tháng → đúng YYYY-MM dù lệch timezone biên tháng.
    const d = new Date((r.timestamp + 15 * 86400) * 1000)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    if (out[key] !== undefined) out[key] = r.value
  }
  return out
}
