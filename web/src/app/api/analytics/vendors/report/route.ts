import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, getAnalyticsSource, getStrategicPartnersList, safeDate } from "@/lib/analytics-helpers"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    startDate, endDate,
    dateColumn     = "fulfiled_date",
    vendors        = [] as string[],
    channelGroup   = "",
    channel        = "",
    comparisonType = "none",
  } = body

  if (!vendors.length) return NextResponse.json({ error: "Chọn ít nhất 1 vendor" }, { status: 400 })

  const source   = getAnalyticsSource(dateColumn)
  const vendorList = vendors.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(",")
  const sDate = safeDate(startDate) || "2025-01-01"
  const eDate = safeDate(endDate)   || new Date().toISOString().split("T")[0]

  function buildWhere(sd: string, ed: string) {
    let w = `f.${source.dateCol}::date BETWEEN '${sd}' AND '${ed}'`
    w += ` AND TRIM(f.sku) IN (SELECT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${vendorList}))`
    if (channel) w += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE channel_name = '${channel.replace(/'/g, "''")}')`
    else if (channelGroup) w += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${channelGroup.toUpperCase().replace(/'/g, "''")}')`
    return w
  }

  function getPrevDates() {
    if (comparisonType === "none") return null
    const s = new Date(sDate), e = new Date(eDate)
    if (comparisonType === "previous_year") {
      return { sd: `${s.getFullYear()-1}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,
               ed: `${e.getFullYear()-1}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}` }
    }
    const diff = e.getTime() - s.getTime()
    const pe = new Date(s.getTime() - 86400000)
    const ps = new Date(pe.getTime() - diff)
    return { sd: ps.toISOString().split("T")[0], ed: pe.toISOString().split("T")[0] }
  }

  const where = buildWhere(sDate, eDate)
  const prev  = getPrevDates()
  const prevWhere = prev ? buildWhere(prev.sd, prev.ed) : "1=0"
  const cacheKey = `vendors:${JSON.stringify(body)}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const strategicList = await getStrategicPartnersList()

      const [metrics, prevMetrics, allRev, trend, products, channels, prevMonthMetrics] = await Promise.all([
        // Current period metrics
        queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
          `SELECT SUM(f.${source.revenueCol}) as revenue, COUNT(DISTINCT f.order_code) as orders,
                  SUM(f.${source.quantityCol}) as units, SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f WHERE ${where}`
        ),
        // Previous period metrics
        queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
          `SELECT SUM(f.${source.revenueCol}) as revenue, COUNT(DISTINCT f.order_code) as orders,
                  SUM(f.${source.quantityCol}) as units, SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f WHERE ${prevWhere}`
        ),
        // All vendors revenue (for contribution %)
        queryAnalytics<{ revenue: string }>(
          `SELECT SUM(${source.revenueCol}) as revenue FROM ${source.mainTable} f
           WHERE f.${source.dateCol}::date BETWEEN '${sDate}' AND '${eDate}'`
        ),
        // Daily trend
        queryAnalytics<{ date: string; revenue: string }>(
          `SELECT ${source.dateCol}::date as date, SUM(${source.revenueCol}) as revenue
           FROM ${source.mainTable} f WHERE ${where}
           GROUP BY 1 ORDER BY 1`
        ),
        // Top SKUs
        queryAnalytics<{ sku: string; revenue: string; orders: string; margin: string }>(
          `SELECT TRIM(f.sku) as sku, SUM(f.${source.revenueCol}) as revenue,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f WHERE ${where}
           GROUP BY TRIM(f.sku) ORDER BY revenue DESC`
        ),
        // Channel distribution
        queryAnalytics<{ channel_name: string; group_name: string; revenue: string; orders: string; margin: string }>(
          `SELECT s.channel_name, UPPER(COALESCE(s.group_name,'Other')) as group_name,
                  SUM(f.${source.revenueCol}) as revenue,
                  COUNT(DISTINCT f.order_code) as orders,
                  SUM(f.${source.marginCol}) as margin
           FROM ${source.mainTable} f
           LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${where} GROUP BY 1, 2 ORDER BY revenue DESC`
        ),
        // Previous month full metrics (for projection)
        (async () => {
          const s = new Date(startDate)
          const pmEnd = new Date(s.getFullYear(), s.getMonth(), 0)
          const pmStart = new Date(s.getFullYear(), s.getMonth() - 1, 1)
          const pmW = buildWhere(pmStart.toISOString().split("T")[0], pmEnd.toISOString().split("T")[0])
          const rows = await queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
            `SELECT SUM(f.${source.revenueCol}) as revenue, COUNT(DISTINCT f.order_code) as orders,
                    SUM(f.${source.quantityCol}) as units, SUM(f.${source.marginCol}) as margin
             FROM ${source.mainTable} f WHERE ${pmW}`
          )
          return rows[0] || null
        })(),
      ])

      const cur = metrics[0] || {}, prv = prevMetrics[0] || {}
      const calcChg = (c: number, p: number) => p > 0 ? Math.round(((c - p) / p) * 100) : 0
      const currRev = parseFloat(cur.revenue || "0"), prevRev = parseFloat(prv.revenue || "0")
      const currOrd = parseInt(cur.orders || "0"), prevOrd = parseInt(prv.orders || "0")
      const currUnt = parseInt(cur.units || "0"), prevUnt = parseInt(prv.units || "0")
      const currMar = parseFloat(cur.margin || "0"), prevMar = parseFloat(prv.margin || "0")
      const currAov = currOrd > 0 ? currRev / currOrd : 0, prevAov = prevOrd > 0 ? prevRev / prevOrd : 0

      return {
        metrics: {
          revenue: currRev, revenueChange: calcChg(currRev, prevRev),
          orders: currOrd, ordersChange: calcChg(currOrd, prevOrd),
          units: currUnt, unitsChange: calcChg(currUnt, prevUnt),
          aov: currAov, aovChange: calcChg(currAov, prevAov),
          margin: currMar, marginChange: calcChg(currMar, prevMar),
        },
        allVendorRevenue: parseFloat(allRev[0]?.revenue || "0"),
        prevMonthMetrics: prevMonthMetrics ? {
          revenue: parseFloat(prevMonthMetrics.revenue || "0"),
          orders:  parseInt(prevMonthMetrics.orders  || "0"),
          units:   parseInt(prevMonthMetrics.units   || "0"),
          margin:  parseFloat(prevMonthMetrics.margin || "0"),
        } : null,
        trend: trend.map(t => ({
          date: new Date(t.date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
          revenue: parseFloat(t.revenue),
        })),
        products: products.map(p => ({
          sku: p.sku, revenue: parseFloat(p.revenue),
          orders: parseInt(p.orders), margin: parseFloat(p.margin),
        })),
        channels: channels.map(c => ({
          channel_name: c.channel_name, group_name: c.group_name,
          revenue: parseFloat(c.revenue), orders: parseInt(c.orders), margin: parseFloat(c.margin),
        })),
        comparisonType,
      }
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[vendors/report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
