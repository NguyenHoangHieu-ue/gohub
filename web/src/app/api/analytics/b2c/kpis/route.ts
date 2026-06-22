import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getBODFilters } from "@/lib/analytics-helpers"

// Port intel /api/analytics/b2c/kpis: 7 KPI [Revenue, Units, Gross Profit, Margin %, Total Orders, GPM2, GPM2 %].
// GPM2 = margin − operational cost (channel_costs ads/platform/sponsor/media + group_costs B2C), prorate theo ngày.
// Cost lấy từ Supabase analytics_channel_costs / analytics_channel_group_costs (đã có từ Channels).

const B2C_FILTER = "UPPER(s.group_name) = 'B2C'"

function getDaysInMonth(month: string) {
  const d = new Date(`${month}-01`)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
function getDaysInRange(startDate: string, endDate: string, month: string) {
  const rangeStart = new Date(startDate)
  const rangeEnd = new Date(endDate)
  const mStart = new Date(`${month}-01`)
  const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0)
  const iStart = rangeStart > mStart ? rangeStart : mStart
  const iEnd = rangeEnd < mEnd ? rangeEnd : mEnd
  if (iStart <= iEnd) return Math.ceil((iEnd.getTime() - iStart.getTime()) / 86400000) + 1
  return 0
}
function monthsBetween(s: Date, e: Date) {
  const m: string[] = []
  let curr = new Date(s.getFullYear(), s.getMonth(), 1)
  while (curr <= e) { m.push(curr.toISOString().slice(0, 7)); curr.setMonth(curr.getMonth() + 1) }
  return m
}
const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const comparisonType = searchParams.get("comparisonType") || "none"
  const dateColumn     = searchParams.get("dateColumn") || "fulfiled_date"
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const source         = getAnalyticsSource(dateColumn)
  const filter         = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter     = getPrevDateFilter(startDate, endDate, comparisonType, source.dateCol)
  const advancedFilter = getBODFilters(searchParams)

  try {
    const [aggRows, channelRows] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `WITH current_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.quantityCol}) as units
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${B2C_FILTER} AND ${filter} ${advancedFilter}
         ),
         previous_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.quantityCol}) as units
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${B2C_FILTER} AND ${prevFilter} ${advancedFilter}
         )
         SELECT c.revenue as current_revenue, p.revenue as prev_revenue,
                c.margin as current_margin, p.margin as prev_margin,
                c.orders as current_orders, p.orders as prev_orders,
                c.units as current_units, p.units as prev_units
         FROM current_period c, previous_period p`
      ),
      // Revenue theo channel (current/prev) cho phân bổ cost theo %
      queryAnalytics<Record<string, string>>(
        `SELECT TRIM(s.channel_name) as channel,
                SUM(CASE WHEN ${filter} THEN f.${source.revenueCol} ELSE 0 END) as current_revenue,
                SUM(CASE WHEN ${prevFilter} THEN f.${source.revenueCol} ELSE 0 END) as prev_revenue
         FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${B2C_FILTER} AND (${filter} OR ${prevFilter}) ${advancedFilter}
         GROUP BY 1`
      ),
    ])

    // Khoảng tháng hiện tại + kỳ trước (cho cost)
    const start = new Date(startDate)
    const end = new Date(endDate)
    const duration = end.getTime() - start.getTime()
    const prevStart = new Date(start.getTime() - duration - 86400000)
    const prevEnd = new Date(start.getTime() - 86400000)
    const currentMonths = monthsBetween(start, end)
    const prevMonths = monthsBetween(prevStart, prevEnd)
    const allMonths = Array.from(new Set([...currentMonths, ...prevMonths]))

    let totalOpCost = 0, prevTotalOpCost = 0
    if (allMonths.length > 0) {
      const [{ data: ccData }, { data: gcData }] = await Promise.all([
        supabaseAdmin.from("analytics_channel_costs").select("channel, month, ads, platform_fee, sponsor_products, media").in("month", allMonths),
        supabaseAdmin.from("analytics_channel_group_costs").select("month, amount").eq("group_name", "B2C").in("month", allMonths),
      ])
      const channelCosts = (ccData || []).map((r: any) => ({
        channel: r.channel, month: r.month,
        ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
      }))
      const pStartStr = prevStart.toISOString().split("T")[0]
      const pEndStr = prevEnd.toISOString().split("T")[0]

      channelRows.forEach(row => {
        const apply = (months: string[], rangeStart: string, rangeEnd: string, rev: number, add: (v: number) => void) => {
          channelCosts.filter((c: any) => c.channel === row.channel && months.includes(String(c.month))).forEach((c: any) => {
            const ratio = getDaysInMonth(String(c.month)) > 0 ? getDaysInRange(rangeStart, rangeEnd, String(c.month)) / getDaysInMonth(String(c.month)) : 0
            ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
              const v = c[key]
              if (v) add(v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100 * ratio)
            })
          })
        }
        apply(currentMonths, startDate, endDate, parseFloat(row.current_revenue || "0"), v => { totalOpCost += v })
        apply(prevMonths, pStartStr, pEndStr, parseFloat(row.prev_revenue || "0"), v => { prevTotalOpCost += v })
      })

      // Group-level B2C costs
      ;(gcData || []).forEach((r: any) => {
        const month = String(r.month)
        const amount = parseFloat(r.amount || "0")
        if (currentMonths.includes(month)) {
          const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(startDate, endDate, month) / getDaysInMonth(month) : 0
          totalOpCost += amount * ratio
        }
        if (prevMonths.includes(month)) {
          const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(pStartStr, pEndStr, month) / getDaysInMonth(month) : 0
          prevTotalOpCost += amount * ratio
        }
      })
    }

    const d = aggRows[0] || {}
    const current_revenue = parseFloat(d.current_revenue || "0")
    const prev_revenue    = parseFloat(d.prev_revenue || "0")
    const current_margin  = parseFloat(d.current_margin || "0")
    const prev_margin     = parseFloat(d.prev_margin || "0")
    const current_gpm2    = current_margin - totalOpCost
    const prev_gpm2       = prev_margin - prevTotalOpCost
    const current_gpm2_percent = current_revenue > 0 ? (current_gpm2 / current_revenue) * 100 : 0
    const prev_gpm2_percent    = prev_revenue > 0 ? (prev_gpm2 / prev_revenue) * 100 : 0
    const currentMarginPercent = current_revenue > 0 ? (current_margin / current_revenue) * 100 : 0
    const prevMarginPercent    = prev_revenue > 0 ? (prev_margin / prev_revenue) * 100 : 0
    const chg = (curr: number, prev: number) => (!prev || prev === 0) ? 0 : ((curr - prev) / prev) * 100

    return NextResponse.json([
      { label: "Total Revenue", value: current_revenue, lastPeriod: prev_revenue, change: chg(current_revenue, prev_revenue), isPositive: current_revenue >= prev_revenue, isCurrency: true },
      { label: "Units Sold", value: parseFloat(d.current_units || "0"), lastPeriod: parseFloat(d.prev_units || "0"), change: chg(parseFloat(d.current_units || "0"), parseFloat(d.prev_units || "0")), isPositive: parseFloat(d.current_units || "0") >= parseFloat(d.prev_units || "0"), isCurrency: false },
      { label: "Gross Profit", value: current_margin, lastPeriod: prev_margin, change: chg(current_margin, prev_margin), isPositive: current_margin >= prev_margin, isCurrency: true },
      { label: "Margin %", value: currentMarginPercent, lastPeriod: prevMarginPercent, change: currentMarginPercent - prevMarginPercent, isPositive: currentMarginPercent >= prevMarginPercent, isCurrency: false },
      { label: "Total Orders", value: parseInt(d.current_orders || "0"), lastPeriod: parseInt(d.prev_orders || "0"), change: chg(parseInt(d.current_orders || "0"), parseInt(d.prev_orders || "0")), isPositive: parseInt(d.current_orders || "0") >= parseInt(d.prev_orders || "0"), isCurrency: false },
      { label: "GPM2", value: current_gpm2, lastPeriod: prev_gpm2, change: chg(current_gpm2, prev_gpm2), isPositive: current_gpm2 >= prev_gpm2, isCurrency: true },
      { label: "GPM2 %", value: current_gpm2_percent, lastPeriod: prev_gpm2_percent, change: current_gpm2_percent - prev_gpm2_percent, isPositive: current_gpm2_percent >= prev_gpm2_percent, isCurrency: false },
    ])
  } catch (err: any) {
    console.error("[analytics/b2c/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
