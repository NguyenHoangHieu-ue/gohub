// GA4 helper — đọc config (2 property gohub.com/gohub.vn) từ Supabase app_settings(key='ga4_configs')
// và chạy runReport qua service account. Config copy từ Turso intel (session 67).
import { google } from "googleapis"
import { supabaseAdmin } from "./supabase"

export interface GA4Site { id: string; name: string; propertyId: string; siteUrl?: string; currency?: string }
interface GA4Config extends GA4Site { credentials: string }

interface ReportRow { dimensionValues: { value: string }[]; metricValues: { value: string }[] }
export interface GA4Report { rows?: ReportRow[]; rowCount?: number }

async function loadConfigs(): Promise<GA4Config[]> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "ga4_configs").maybeSingle()
  if (!data?.value) return []
  try { return JSON.parse(data.value) } catch { return [] }
}

// Danh sách site (KHÔNG kèm credentials) — cho selector.
export async function ga4Sites(): Promise<GA4Site[]> {
  return (await loadConfigs()).map(({ id, name, propertyId, siteUrl, currency }) => ({ id, name, propertyId, siteUrl, currency }))
}

export async function ga4Configured(): Promise<boolean> {
  return (await loadConfigs()).length > 0
}

interface RunOpts {
  siteId?: string
  startDate?: string
  endDate?: string
  dimensions?: string[]
  metrics: string[]
  eventNameFilter?: string
  limit?: number
}

// Chạy 1 report cho site (mặc định site đầu nếu không truyền siteId).
export async function runGA4Report(opts: RunOpts): Promise<GA4Report> {
  const configs = await loadConfigs()
  const cfg = configs.find(c => c.id === opts.siteId) || (opts.siteId ? null : configs[0])
  if (!cfg) throw new Error("GA4 site not found")
  if (!cfg.propertyId || !cfg.credentials) throw new Error("GA4 propertyId/credentials missing")

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(cfg.credentials),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  })
  const authClient = await auth.getClient()
  const analyticsData = google.analyticsdata("v1beta")

  const requestBody: Record<string, unknown> = {
    dateRanges: [{ startDate: opts.startDate || "30daysAgo", endDate: opts.endDate || "today" }],
    dimensions: (opts.dimensions || ["date"]).map(name => ({ name })),
    metrics: opts.metrics.map(name => ({ name })),
  }
  if (opts.limit) requestBody.limit = opts.limit
  if (opts.eventNameFilter) {
    requestBody.dimensionFilter = {
      filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: opts.eventNameFilter } },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await analyticsData.properties.runReport({ property: `properties/${cfg.propertyId}`, auth: authClient as any, requestBody })
  return resp.data as GA4Report
}

// Tổng + chuỗi ngày cho 1 site (dùng cho trang Website + B2C Section 4).
export async function ga4WebsiteSummary(siteId: string | undefined, startDate: string, endDate: string) {
  const M = ["activeUsers", "sessions", "screenPageViews", "conversions", "bounceRate", "purchaseRevenue", "ecommercePurchases"]
  const [daily, countries, sources] = await Promise.all([
    runGA4Report({ siteId, startDate, endDate, dimensions: ["date"], metrics: M }),
    runGA4Report({ siteId, startDate, endDate, dimensions: ["country"], metrics: ["sessions", "conversions"], limit: 8 }),
    runGA4Report({ siteId, startDate, endDate, dimensions: ["sessionSourceMedium"], metrics: ["sessions", "conversions"], limit: 8 }),
  ])

  const num = (v?: { value: string }) => parseFloat(v?.value || "0")
  const totals = { activeUsers: 0, sessions: 0, screenPageViews: 0, conversions: 0, bounceRateSum: 0, purchaseRevenue: 0, ecommercePurchases: 0, days: 0 }
  const series = (daily.rows || []).map(r => {
    const m = r.metricValues
    totals.activeUsers += num(m[0]); totals.sessions += num(m[1]); totals.screenPageViews += num(m[2])
    totals.conversions += num(m[3]); totals.bounceRateSum += num(m[4]); totals.purchaseRevenue += num(m[5]); totals.ecommercePurchases += num(m[6])
    totals.days++
    const d = r.dimensionValues[0].value // YYYYMMDD
    const sess = num(m[1]), purch = num(m[6])
    return {
      date: `${d.slice(4, 6)}/${d.slice(6, 8)}`,
      users: num(m[0]), sessions: sess, pageviews: num(m[2]), conversions: num(m[3]),
      purchases: purch,
      // CR = tỷ lệ MUA HÀNG (ecommercePurchases/sessions) — bị chặn hợp lý, đúng spec B2C.
      cr: sess > 0 ? (purch / sess) * 100 : 0,
      revenue: num(m[5]),
    }
  })

  const mapRows = (rep: GA4Report) => (rep.rows || []).map(r => ({
    name: r.dimensionValues[0].value,
    sessions: num(r.metricValues[0]),
    conversions: num(r.metricValues[1]),
    cr: num(r.metricValues[0]) > 0 ? (num(r.metricValues[1]) / num(r.metricValues[0])) * 100 : 0,
  }))

  return {
    kpis: {
      activeUsers: totals.activeUsers,
      sessions: totals.sessions,
      pageviews: totals.screenPageViews,
      conversions: totals.conversions,
      bounceRate: totals.days > 0 ? totals.bounceRateSum / totals.days : 0,
      revenue: totals.purchaseRevenue,
      purchases: totals.ecommercePurchases,
      // CR = tỷ lệ mua hàng (purchases/sessions); conversions giữ riêng làm số đếm.
      cr: totals.sessions > 0 ? (totals.ecommercePurchases / totals.sessions) * 100 : 0,
    },
    series,
    countries: mapRows(countries),
    sources: mapRows(sources),
  }
}
