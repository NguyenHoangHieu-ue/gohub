import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { CACHE_HEADERS, cachedQuery } from "@/lib/analytics-helpers"
import { getSafeReportDate } from "@/lib/analytics-engine/date-math"
import { ga4Configured, ga4Sites, runGA4Report } from "@/lib/ga4"

// Traffic theo category (sessionDefaultChannelGroup) cho báo cáo B2C — dùng ở /analytics/b2c, KHÔNG phải
// mở rộng tab Website Analytics chung (đặt trong b2c/ đúng chỗ). Port từ nhánh Minh (PR #2), sửa lại
// classify site theo `GA4Site.kind` ("web"/"app") thay vì đoán qua tên/URL — kind là field HEAD đã thêm
// s194+1 để tách property Web/App (Firebase riêng), tránh port nguyên code cũ sẽ phân loại sai/mất toggle.

const localPreviewAllowed = (req: NextRequest) =>
  process.env.NODE_ENV === "development" && req.nextUrl.searchParams.get("localPreview") === "1"

interface CategoryRow {
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

function pct(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

async function categoryRows(siteId: string, month: string, elapsedDays: number, platform?: "app"): Promise<CategoryRow[]> {
  const currentRange = monthRange(month, elapsedDays)
  const prevRange = monthRange(previousMonth(month), elapsedDays)
  const [cur, prev] = await Promise.all([
    runGA4Report({ siteId, ...currentRange, dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "ecommercePurchases"], limit: 12, platform }),
    runGA4Report({ siteId, ...prevRange, dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "ecommercePurchases"], limit: 50, platform }),
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
      category, traffic, purchases,
      cr: traffic > 0 ? (purchases / traffic) * 100 : 0,
      prevTraffic: prevSessions,
      trafficDelta: pct(traffic, prevSessions),
    }
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session && !localPreviewAllowed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cutoff = getSafeReportDate(1)
  const [cy, cm, cd] = cutoff.split("-").map(Number)
  const month = req.nextUrl.searchParams.get("month") || `${cy}-${String(cm).padStart(2, "0")}`
  const elapsedDays = Number(req.nextUrl.searchParams.get("elapsedDays") || cd)

  try {
    if (!(await ga4Configured())) return NextResponse.json({ web: [], app: [], error: "GA4 chưa cấu hình" }, { headers: CACHE_HEADERS })
    const sites = await ga4Sites()
    const payload = await cachedQuery(`b2c-ga4-categories:v1:${month}:${elapsedDays}`, async () => {
      const groups: { web: unknown[]; app: unknown[] } = { web: [], app: [] }
      await Promise.all(sites.map(async site => {
        const group = site.kind === "app" ? "app" : "web"
        const platform = group === "app" ? "app" as const : undefined
        try {
          const rows = await categoryRows(site.id, month, elapsedDays, platform)
          groups[group].push({ siteId: site.id, name: site.name, siteUrl: site.siteUrl, rows })
        } catch (e) {
          groups[group].push({ siteId: site.id, name: site.name, siteUrl: site.siteUrl, rows: [], error: (e as Error).message })
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
