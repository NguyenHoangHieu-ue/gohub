import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { CACHE_HEADERS, cachedQuery, isLocalPreviewReq } from "@/lib/analytics-helpers"
import { ga4Configured, ga4Sites, runGA4Report } from "@/lib/ga4"

type CategoryRow = {
  category: string
  traffic: number
  purchases: number
  cr: number
  prevTraffic: number
  trafficDelta: number | null
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function monthRange(month: string, elapsedDays: number) {
  const [year, monthIndex] = month.split("-").map(Number)
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  const endDay = Math.max(1, Math.min(elapsedDays, lastDay))
  return {
    startDate: ymd(new Date(Date.UTC(year, monthIndex - 1, 1))),
    endDate: ymd(new Date(Date.UTC(year, monthIndex - 1, endDay))),
  }
}

function previousMonth(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number)
  const prev = new Date(Date.UTC(year, monthIndex - 2, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`
}

function classifySite(site: { id: string; name: string; siteUrl?: string }) {
  const text = `${site.id} ${site.name} ${site.siteUrl ?? ""}`.toLowerCase()
  if (text.includes("app")) return "app"
  if (text.includes("gohub.vn")) return "web"
  if (text.includes("gohub.com")) return "web"
  return "other"
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

async function categoryRows(siteId: string, month: string, elapsedDays: number): Promise<CategoryRow[]> {
  const currentRange = monthRange(month, elapsedDays)
  const prevRange = monthRange(previousMonth(month), elapsedDays)
  const [cur, prev] = await Promise.all([
    runGA4Report({
      siteId,
      ...currentRange,
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "ecommercePurchases"],
      limit: 12,
    }),
    runGA4Report({
      siteId,
      ...prevRange,
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "ecommercePurchases"],
      limit: 50,
    }),
  ])

  const prevTraffic = new Map<string, number>()
  for (const row of prev.rows ?? []) {
    prevTraffic.set(row.dimensionValues[0]?.value || "(not set)", Number(row.metricValues[0]?.value || 0))
  }

  return (cur.rows ?? []).map(row => {
    const category = row.dimensionValues[0]?.value || "(not set)"
    const traffic = Number(row.metricValues[0]?.value || 0)
    const purchases = Number(row.metricValues[1]?.value || 0)
    const prevSessions = prevTraffic.get(category) ?? 0
    return {
      category,
      traffic,
      purchases,
      cr: traffic > 0 ? (purchases / traffic) * 100 : 0,
      prevTraffic: prevSessions,
      trafficDelta: pct(traffic, prevSessions),
    }
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const localPreview = isLocalPreviewReq(req)
  if (!session && !localPreview) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const now = new Date()
  const month = req.nextUrl.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const elapsedDays = Number(req.nextUrl.searchParams.get("elapsedDays") || now.getDate())

  try {
    if (!(await ga4Configured())) return NextResponse.json({ web: [], app: [], error: "GA4 chưa cấu hình" }, { headers: CACHE_HEADERS })
    const sites = await ga4Sites()
    const selected = sites.filter(site => classifySite(site) !== "other")
    const payload = await cachedQuery(`b2c-ga4-categories:v1:${month}:${elapsedDays}`, async () => {
      const groups = { web: [] as any[], app: [] as any[] }
      await Promise.all(selected.map(async site => {
        try {
          const rows = await categoryRows(site.id, month, elapsedDays)
          groups[classifySite(site) as "web" | "app"].push({ siteId: site.id, name: site.name, siteUrl: site.siteUrl, rows })
        } catch (e) {
          groups[classifySite(site) as "web" | "app"].push({ siteId: site.id, name: site.name, siteUrl: site.siteUrl, rows: [], error: (e as Error).message })
        }
      }))
      return groups
    }, 30)
    return NextResponse.json({ month, elapsedDays, prevMonth: previousMonth(month), ...payload }, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error("[analytics/b2c/ga4-categories]", (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
