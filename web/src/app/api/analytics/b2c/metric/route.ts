import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { CACHE_HEADERS } from "@/lib/analytics-helpers"
import { runGA4Report, ga4Sites } from "@/lib/ga4"
import { supabaseAdmin } from "@/lib/supabase"

// YTD monthly metrics cho subtab Metric của B2C:
//   Revenue / GP / Orders by web+app từ gohub_dw (sub_group_name)
//   CM1 = GP - OpCost (channel_costs + group_costs) tổng theo tháng
//   Traffic / Users by platform từ GA4 (web=hostName filter, app=platform ios|android)
//   Customers new/returning by web+app từ gohub_dw

type CellWA = { web: number; app: number; other: number; total: number }
type TrafficCell = { web: number; app: number; total: number }
type CustGroup = { new: number; returning: number; total: number }
interface MonthData {
  revenue: CellWA
  grossProfit: CellWA
  orders: CellWA
  cm1: number
  traffic: TrafficCell
  users: TrafficCell
  customers: { web: CustGroup; app: CustGroup }
}

function parseCostValue(v: unknown): { type?: string; value?: number } {
  if (!v) return { type: "amount", value: 0 }
  if (typeof v === "object") return v as { type?: string; value?: number }
  try { return JSON.parse(String(v)) } catch { return { type: "amount", value: 0 } }
}
function costAmount(cv: { type?: string; value?: number }, revenue: number, ratio: number) {
  const n = Number(cv?.value) || 0
  return n === 0 ? 0 : cv?.type === "percent" ? revenue * n / 100 : n * ratio
}

function initMonth(): MonthData {
  return {
    revenue:     { web: 0, app: 0, other: 0, total: 0 },
    grossProfit: { web: 0, app: 0, other: 0, total: 0 },
    orders:      { web: 0, app: 0, other: 0, total: 0 },
    cm1: 0,
    traffic:   { web: 0, app: 0, total: 0 },
    users:     { web: 0, app: 0, total: 0 },
    customers: {
      web: { new: 0, returning: 0, total: 0 },
      app: { new: 0, returning: 0, total: 0 },
    },
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const now = new Date()
  const year = now.getFullYear()
  const months: string[] = []
  for (let i = 0; i <= now.getMonth(); i++) {
    months.push(`${year}-${String(i + 1).padStart(2, "0")}`)
  }
  const windowStart = `${months[0]}-01`
  const elapsedDays = now.getDate()
  const totalDays = new Date(year, now.getMonth() + 1, 0).getDate()
  const currentMonth = months[months.length - 1]
  const windowEnd = `${currentMonth}-${String(elapsedDays).padStart(2, "0")}`
  const yearStart = `${year}-01-01`

  const result: Record<string, MonthData> = {}
  for (const m of months) result[m] = initMonth()

  try {
    // 1. gohub_dw: Revenue, GP, Orders by month + sub_group_name (web/app/other)
    const [businessRows, customerRows] = await Promise.all([
      queryAnalytics<{ month: string; ctype: string; revenue: string; gross_profit: string; orders: string }>(
        `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
                CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                     WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                     ELSE 'other' END                     AS ctype,
                SUM(f.fulfilled_revenue_amount_vnd)       AS revenue,
                SUM(COALESCE(f.gross_profit_vnd,
                    COALESCE(f.fulfilled_revenue_amount_vnd, 0) - COALESCE(f.cogs_amount_vnd, 0), 0)) AS gross_profit,
                COUNT(DISTINCT f.order_code)              AS orders
         FROM fact_fulfillment_revenue f
         JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2C'
           AND f.fulfiled_date::date >= $1
           AND f.fulfiled_date::date <= $2
         GROUP BY 1, 2`,
        [windowStart, windowEnd]
      ),
      // gohub_dw: Customers new/returning by month + sub_group_name
      queryAnalytics<{ month: string; ctype: string; type: string; count: string }>(
        `WITH first_order AS (
           SELECT f.customer_code,
                  MIN(to_char(f.fulfiled_date::date, 'YYYY-MM')) AS first_month
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C' AND f.customer_code IS NOT NULL
           GROUP BY 1
         ),
         monthly AS (
           SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
                  CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                       WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                       ELSE 'other' END                     AS ctype,
                  f.customer_code
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
             AND f.fulfiled_date::date <= $2
             AND f.customer_code IS NOT NULL
         )
         SELECT m.month, m.ctype,
                CASE WHEN m.month = fo.first_month THEN 'new' ELSE 'returning' END AS type,
                COUNT(DISTINCT m.customer_code) AS count
         FROM monthly m
         JOIN first_order fo ON m.customer_code = fo.customer_code
         GROUP BY 1, 2, 3`,
        [windowStart, windowEnd]
      ),
    ])

    for (const r of businessRows) {
      const m = result[r.month]
      if (!m) continue
      const rev = parseFloat(r.revenue || "0")
      const gp  = parseFloat(r.gross_profit || "0")
      const ord = parseInt(r.orders || "0")
      const ct  = r.ctype as "web" | "app" | "other"
      if (ct === "web" || ct === "app" || ct === "other") {
        m.revenue[ct] += rev; m.grossProfit[ct] += gp; m.orders[ct] += ord
      }
      m.revenue.total += rev; m.grossProfit.total += gp; m.orders.total += ord
    }

    for (const r of customerRows) {
      const m = result[r.month]
      if (!m) continue
      const cnt = parseInt(r.count || "0")
      const ct  = r.ctype as "web" | "app" | "other"
      if (ct === "web" || ct === "app") {
        const bucket = r.type === "new" ? "new" : "returning"
        m.customers[ct][bucket] += cnt
        m.customers[ct].total   += cnt
      }
    }

    // 2. CM1 = total GP - OpCost từ Supabase (channel_costs + group_costs) per month
    try {
      const { data: chCosts } = await supabaseAdmin
        .from("analytics_channel_costs")
        .select("channel, month, ads, platform_fee, sponsor_products, media")
        .in("month", months)
      const { data: gcRows } = await supabaseAdmin
        .from("analytics_channel_group_costs")
        .select("month, amount")
        .eq("group_name", "B2C")
        .in("month", months)

      for (const m of months) {
        const d = result[m]
        const ratio = m === currentMonth ? elapsedDays / totalDays : 1
        let opCost = 0

        for (const r of chCosts ?? []) {
          if (String(r.month) !== m) continue
          const rev = d.revenue.total
          opCost += costAmount(parseCostValue(r.ads), rev, ratio)
          opCost += costAmount(parseCostValue(r.platform_fee), rev, ratio)
          opCost += costAmount(parseCostValue(r.sponsor_products), rev, ratio)
          opCost += costAmount(parseCostValue(r.media), rev, ratio)
        }
        for (const r of gcRows ?? []) {
          if (String(r.month) !== m) continue
          opCost += Number(r.amount || 0) * ratio
        }

        d.cm1 = d.grossProfit.total - opCost
      }
    } catch (e) {
      console.error("[b2c/metric] cm1", (e as Error).message)
      for (const m of months) result[m].cm1 = result[m].grossProfit.total
    }

    // 3. GA4: Traffic (sessions) + Users (activeUsers) by yearMonth, cả web và app
    try {
      const sites = await ga4Sites()
      // App = property RIÊNG (Firebase), KHÔNG chung với web property — không thể filter platform=app
      // trên site web (mainSite) như trước, property đó không có row nào platform=ios/android.
      const mainSite = sites.find(s => (s.kind || "web") === "web") || sites[0]
      const appSite = sites.find(s => s.kind === "app")
      if (mainSite) {
        const dateOpts = { startDate: yearStart, endDate: windowEnd, dimensions: ["yearMonth"], metrics: ["sessions", "activeUsers"] }
        const [webRep, appRep] = await Promise.allSettled([
          runGA4Report({ ...dateOpts, siteId: mainSite.id }),
          appSite ? runGA4Report({ ...dateOpts, siteId: appSite.id, platform: "app" }) : Promise.reject(new Error("GA4 app site chưa cấu hình")),
        ])

        const applyGA4 = (rep: typeof webRep, key: "web" | "app") => {
          if (rep.status !== "fulfilled") return
          for (const row of rep.value.rows ?? []) {
            const ym = row.dimensionValues[0].value // YYYYMM
            const month = `${ym.slice(0, 4)}-${ym.slice(4, 6)}`
            const d = result[month]
            if (!d) continue
            d.traffic[key] = parseInt(row.metricValues[0].value || "0")
            d.users[key]   = parseInt(row.metricValues[1].value || "0")
          }
        }
        applyGA4(webRep, "web")
        applyGA4(appRep, "app")
        for (const m of months) {
          result[m].traffic.total = result[m].traffic.web + result[m].traffic.app
          result[m].users.total   = result[m].users.web   + result[m].users.app
        }
      }
    } catch (e) {
      console.error("[b2c/metric] ga4", (e as Error).message)
    }

    return NextResponse.json(
      { months, currentMonth, elapsedDays, totalDays, data: result },
      { headers: CACHE_HEADERS }
    )
  } catch (err: any) {
    console.error("[b2c/metric]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
