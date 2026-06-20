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

const num = (v?: { value: string }) => parseFloat(v?.value || "0")
const SUMMARY_METRICS = ["activeUsers", "sessions", "screenPageViews", "conversions", "bounceRate", "purchaseRevenue", "ecommercePurchases"]

// GA4 totals + chuỗi ngày cho 1 khoảng (relative date OK).
async function ga4Period(siteId: string | undefined, startDate: string, endDate: string) {
  const daily = await runGA4Report({ siteId, startDate, endDate, dimensions: ["date"], metrics: SUMMARY_METRICS })
  const t = { users: 0, sessions: 0, pageviews: 0, conversions: 0, bounceSum: 0, revenue: 0, purchases: 0, days: 0 }
  const series = (daily.rows || []).map(r => {
    const m = r.metricValues
    t.users += num(m[0]); t.sessions += num(m[1]); t.pageviews += num(m[2]); t.conversions += num(m[3])
    t.bounceSum += num(m[4]); t.revenue += num(m[5]); t.purchases += num(m[6]); t.days++
    const d = r.dimensionValues[0].value // YYYYMMDD
    const sess = num(m[1]), purch = num(m[6])
    return { date: `${d.slice(4, 6)}/${d.slice(6, 8)}`, users: num(m[0]), sessions: sess, pageviews: num(m[2]), conversions: num(m[3]), purchases: purch, cr: sess > 0 ? (purch / sess) * 100 : 0, revenue: num(m[5]) }
  })
  const kpis = {
    activeUsers: t.users, sessions: t.sessions, pageviews: t.pageviews, conversions: t.conversions,
    bounceRate: t.days > 0 ? t.bounceSum / t.days : 0, revenue: t.revenue, purchases: t.purchases,
    cr: t.sessions > 0 ? (t.purchases / t.sessions) * 100 : 0, // CR = tỷ lệ mua hàng (chặn hợp lý)
  }
  return { kpis, series }
}

// ── Search Console (GSC) ──────────────────────────────────────────────────────
interface GscRow { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }
const ymd = (d: Date) => d.toISOString().slice(0, 10)
// GSC dữ liệu trễ ~2 ngày. period=0 hiện tại, 1 = kỳ trước liền kề.
function gscRange(days: number, period = 0) {
  const end = new Date(Date.now() - (2 + period * days) * 864e5)
  const start = new Date(end.getTime() - (days - 1) * 864e5)
  return { start: ymd(start), end: ymd(end) }
}
function gscVariants(siteUrl: string, name: string): string[] {
  const url = siteUrl || name
  const domain = url.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return [url, `sc-domain:${domain}`, `https://${domain}/`]
}

export async function runGSC(siteId: string | undefined, startDate: string, endDate: string, dimensions: string[], rowLimit = 1000): Promise<GscRow[]> {
  const configs = await loadConfigs()
  const cfg = configs.find(c => c.id === siteId) || (siteId ? null : configs[0])
  if (!cfg) throw new Error("GA4 site not found")
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(cfg.credentials),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  })
  const authClient = await auth.getClient()
  const sc = google.searchconsole("v1")
  let lastErr: unknown
  for (const sv of gscVariants(cfg.siteUrl || "", cfg.name)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await sc.searchanalytics.query({ siteUrl: sv, auth: authClient as any, requestBody: { startDate, endDate, dimensions, rowLimit } })
      return (r.data.rows || []) as GscRow[]
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function gscPeriod(siteId: string | undefined, days: number, period = 0) {
  const { start, end } = gscRange(days, period)
  const [daily, queries] = await Promise.all([
    runGSC(siteId, start, end, ["date"]),
    runGSC(siteId, start, end, ["query"]),
  ])
  let clicks = 0, impressions = 0, posSum = 0
  const series = daily.map(r => {
    clicks += r.clicks || 0; impressions += r.impressions || 0; posSum += (r.position || 0) * (r.impressions || 0)
    const d = r.keys?.[0] || "" // YYYY-MM-DD
    return { date: `${d.slice(5, 7)}/${d.slice(8, 10)}`, clicks: r.clicks || 0, impressions: r.impressions || 0 }
  })
  const kpis = { clicks, impressions, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, position: impressions > 0 ? posSum / impressions : 0 }
  const topQueries = queries.slice(0, 10).map(r => ({
    query: r.keys?.[0] || "", clicks: r.clicks || 0, impressions: r.impressions || 0,
    ctr: (r.impressions || 0) > 0 ? ((r.clicks || 0) / (r.impressions || 0)) * 100 : 0, position: r.position || 0,
  }))
  return { kpis, series, queries: topQueries }
}

const mapBreakdown = (rep: GA4Report) => (rep.rows || []).map(r => ({
  name: r.dimensionValues[0].value,
  sessions: num(r.metricValues[0]),
  conversions: num(r.metricValues[1]),
  cr: num(r.metricValues[0]) > 0 ? (num(r.metricValues[1]) / num(r.metricValues[0])) * 100 : 0,
}))

// Tổng hợp đầy đủ 1 site: GA4 (KPIs + series + breakdown) + GSC + so sánh kỳ trước (compare).
export async function ga4WebsiteSummary(siteId: string | undefined, days: number, withCompare: boolean) {
  const rel = `${days}daysAgo`
  const [cur, countries, sources, gsc] = await Promise.all([
    ga4Period(siteId, rel, "today"),
    runGA4Report({ siteId, startDate: rel, endDate: "today", dimensions: ["country"], metrics: ["sessions", "conversions"], limit: 8 }),
    runGA4Report({ siteId, startDate: rel, endDate: "today", dimensions: ["sessionSourceMedium"], metrics: ["sessions", "conversions"], limit: 8 }),
    gscPeriod(siteId, days).catch(() => null),
  ])

  let prevKpis = null, prevGsc = null
  if (withCompare) {
    const [pg, pgsc] = await Promise.all([
      ga4Period(siteId, `${2 * days}daysAgo`, `${days + 1}daysAgo`),
      gscPeriod(siteId, days, 1).catch(() => null),
    ])
    prevKpis = pg.kpis
    prevGsc = pgsc?.kpis ?? null
  }

  return {
    kpis: cur.kpis, prevKpis, series: cur.series,
    countries: mapBreakdown(countries), sources: mapBreakdown(sources),
    gsc, prevGsc,
  }
}
