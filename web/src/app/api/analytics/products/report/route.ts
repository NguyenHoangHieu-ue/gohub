import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, getAnalyticsSource, getSkuDestinationRule, getCountryMappings } from "@/lib/analytics-helpers"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    startDate, endDate,
    dateColumn = "fulfiled_date",
    skus = [] as string[],
    category = "all",
    vendors = [] as string[],
    channelGroup = "all",
    channel = "all",
    destination = "all",
    comparisonType = "none",
  } = body

  try {
    const source = getAnalyticsSource(dateColumn)
    const rule = await getSkuDestinationRule()

    // Canonical regionExpr — khớp getDestinationSQL trong analytics-helpers.ts
    const regionExpr = `UPPER(CASE
      WHEN f.sku ~ '^[1-6]'            THEN SUBSTRING(f.sku, 3, 3)
      WHEN f.sku ~ '^E'               THEN SUBSTRING(f.sku, 2, 3)
      WHEN f.sku ~ '^[A-DF-Z]{3}[0-9]' THEN SUBSTRING(f.sku, 1, 3)
      ELSE SUBSTRING(f.sku, 1, 3)
    END)`

    // Build WHERE clause
    function buildWhere(sd: string, ed: string) {
      let w = `f.${source.dateCol}::date BETWEEN '${sd}' AND '${ed}'`
      if (skus.length > 0) w += ` AND f.sku IN (${skus.map((s: string) => `'${s.replace(/'/g, "''")}'`).join(",")})`
      if (category !== "all") w += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE category_name = '${category.replace(/'/g, "''")}')`
      if (vendors.length > 0) w += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE vendor IN (${vendors.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(",")}))`
      if (destination !== "all") w += ` AND ${regionExpr} = '${destination}'`
      if (channel !== "all") w += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '${channel.replace(/'/g, "''")}')`
      else if (channelGroup !== "all") w += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${channelGroup === "B2B" ? "B2B" : "B2C"}')`
      return w
    }

    function getPrevDates() {
      if (comparisonType === "none") return null
      const s = new Date(startDate), e = new Date(endDate)
      if (comparisonType === "previous_year") {
        return {
          sd: `${s.getFullYear() - 1}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`,
          ed: `${e.getFullYear() - 1}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`,
        }
      }
      const diff = e.getTime() - s.getTime()
      const pe = new Date(s.getTime() - 86400000)
      const ps = new Date(pe.getTime() - diff)
      return { sd: ps.toISOString().split("T")[0], ed: pe.toISOString().split("T")[0] }
    }

    const where = buildWhere(startDate, endDate)
    const prev = getPrevDates()
    const prevWhere = prev ? buildWhere(prev.sd, prev.ed) : "1=0"

    const cacheKey = `products:${startDate}:${endDate}:${dateColumn}:${JSON.stringify(body)}`

    const data = await cachedQuery(cacheKey, async () => {
      const [m, pm, trend, channelRows, regions, skuRows, countryMap] = await Promise.all([
        queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
          `SELECT SUM(${source.revenueCol}) as revenue, COUNT(DISTINCT order_code) as orders,
                  SUM(${source.quantityCol}) as units, SUM(${source.marginCol}) as margin
           FROM ${source.mainTable} f WHERE ${where}`
        ),
        queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
          `SELECT SUM(${source.revenueCol}) as revenue, COUNT(DISTINCT order_code) as orders,
                  SUM(${source.quantityCol}) as units, SUM(${source.marginCol}) as margin
           FROM ${source.mainTable} f WHERE ${prevWhere}`
        ),
        queryAnalytics<{ date: string; revenue: string; units: string }>(
          `SELECT ${source.dateCol}::date as date, SUM(${source.revenueCol}) as revenue,
                  SUM(${source.quantityCol}) as units
           FROM ${source.mainTable} f WHERE ${where}
           GROUP BY 1 ORDER BY 1`
        ),
        queryAnalytics<{ channel_name: string; group_name: string; revenue: string; units_sold: string; orders: string; margin: string }>(
          `SELECT s.channel_name, s.group_name,
                  SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.quantityCol}) as units_sold,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f
           LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${where} GROUP BY 1, 2 ORDER BY revenue DESC`
        ),
        queryAnalytics<{ region_code: string; revenue: string; units: string }>(
          `SELECT ${regionExpr} as region_code, SUM(${source.revenueCol}) as revenue,
                  SUM(${source.quantityCol}) as units
           FROM ${source.mainTable} f WHERE ${where}
           GROUP BY 1 ORDER BY revenue DESC LIMIT 10`
        ),
        queryAnalytics<{ sku: string; category: string; vendor: string; region: string; revenue: string; units: string; orders: string; margin: string }>(
          `SELECT f.sku, v.category_name as category, v.vendor,
                  ${regionExpr} as region,
                  SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.quantityCol}) as units,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f
           LEFT JOIN dim_sku v ON f.sku = v.sku
           WHERE ${where} GROUP BY 1, 2, 3, 4 ORDER BY revenue DESC LIMIT 50`
        ),
        getCountryMappings(),
      ])

      const cur = m[0] || {}
      const prv = pm[0] || {}
      const calcChange = (c: number, p: number) => p > 0 ? Math.round(((c - p) / p) * 100) : 0
      const currRev = parseFloat(cur.revenue || "0"), prevRev = parseFloat(prv.revenue || "0")
      const currOrd = parseInt(cur.orders || "0"), prevOrd = parseInt(prv.orders || "0")
      const currUnt = parseInt(cur.units || "0"), prevUnt = parseInt(prv.units || "0")
      const currMar = parseFloat(cur.margin || "0"), prevMar = parseFloat(prv.margin || "0")
      const currAov = currOrd > 0 ? currRev / currOrd : 0
      const prevAov = prevOrd > 0 ? prevRev / prevOrd : 0

      return {
        metrics: {
          revenue: currRev, revenueChange: calcChange(currRev, prevRev),
          orders: currOrd, ordersChange: calcChange(currOrd, prevOrd),
          units: currUnt, unitsChange: calcChange(currUnt, prevUnt),
          aov: currAov, aovChange: calcChange(currAov, prevAov),
          margin: currMar, marginChange: calcChange(currMar, prevMar),
        },
        trend: trend.map(t => ({
          date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          revenue: parseFloat(t.revenue), units: parseInt(t.units),
        })),
        channels: channelRows.map(c => ({
          channel_name: c.channel_name, group_name: c.group_name,
          revenue: parseFloat(c.revenue), units_sold: parseInt(c.units_sold),
          orders: parseInt(c.orders), margin: parseFloat(c.margin),
        })),
        regions: regions.map(r => ({
          region: countryMap[r.region_code] || r.region_code,
          region_code: r.region_code,
          revenue: parseFloat(r.revenue), units: parseInt(r.units),
        })),
        skus: skuRows.map(s => ({
          sku: s.sku, category: s.category, vendor: s.vendor, region: s.region,
          region_name: countryMap[s.region] || s.region,
          revenue: parseFloat(s.revenue), units: parseInt(s.units),
          orders: parseInt(s.orders), margin: parseFloat(s.margin),
        })),
        comparisonType,
      }
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[products/report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
