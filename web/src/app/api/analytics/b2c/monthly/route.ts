import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, isCronReq, noCache, flushAnalyticsCacheByPrefixes } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { chatwootLeadsBreakdown, chatwootConfigured } from "@/lib/chatwoot"
import { omniConfigured, omniLeadsBreakdown } from "@/lib/omni-leads"
import { adminGohubConfigured, adminGohubCustomerRows } from "@/lib/admin-gohub"
import { readB2CMonthlySnapshots, snapshotsToMonthlyResponse } from "@/lib/b2c-report-snapshot"
import { tursoLeadsBreakdown, tursoLeadsConfigured } from "@/lib/turso-leads"
import { B2C_CHANNELS } from "@/lib/b2c-channel-budget"

// YTD B2C dashboard data (Section 1 + 2 của gohub_b2c spec)
// Trả dữ liệu từ tháng 1 đến tháng hiện tại MTD:
//   - market revenue: VN / US / Total theo tháng
//   - customers: New / Returning / Total (revenue + count) theo tháng
// New = tháng = tháng có đơn B2C ĐẦU TIÊN của khách; còn lại = Returning.

interface MarketCell { vn: number; us: number; total: number }
interface CustCell { revenue: number; count: number }
interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
interface ChannelCell { web: number; app: number; other: number }
interface ProfitCell { revenue: number; cogs: number; grossProfit: number; opCost: number; cm1: number }
type CostValue = { type?: string; value?: number }

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const
const localPreviewAllowed = (req: NextRequest) =>
  process.env.NODE_ENV === "development" && req.nextUrl.searchParams.get("localPreview") === "1"

function parseCostValue(value: unknown): CostValue {
  if (!value) return { type: "amount", value: 0 }
  if (typeof value === "object") return value as CostValue
  try { return JSON.parse(String(value)) as CostValue } catch { return { type: "amount", value: 0 } }
}

function costAmount(value: CostValue, revenue: number, ratio: number): number {
  const n = Number(value?.value) || 0
  if (!n) return 0
  return value?.type === "percent" ? revenue * n / 100 : n * ratio
}

async function readTargets() {
  let targets: Record<string, { vn: number; us: number; total: number }> = {}
  try {
    const { data: rows } = await supabaseAdmin
      .from("app_settings").select("key, value").eq("key", "b2c_kpi_targets")
    for (const r of rows ?? []) {
      if (r.key === "b2c_kpi_targets" && r.value) targets = JSON.parse(r.value)
    }
  } catch {}
  return targets
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session && !localPreviewAllowed(req) && !isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // YTD: từ tháng 1 đến tháng hiện tại
  const now = new Date()
  const forceRefresh = noCache(req)

  // Ngày tham chiếu: T-1 (hôm qua) khi forceRefresh (Advanced live mode), hôm nay khi cron/snapshot.
  // Advanced tab luôn dùng T-1 để số liệu đầy đủ (data hôm nay chưa close hết).
  const refDate = forceRefresh
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    : now
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const windowEnd = fmtDate(refDate)   // T-1 khi live, hôm nay khi cron

  const months: string[] = []
  for (let i = 0; i <= refDate.getMonth(); i++) {
    months.push(`${refDate.getFullYear()}-${String(i + 1).padStart(2, "0")}`)
  }
  const windowStart = `${months[0]}-01`
  const currentMonth = months[months.length - 1]
  const elapsedDays = refDate.getDate()   // ngày của refDate (T-1 khi live)
  const totalDays = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate()
  const skipLeads = req.nextUrl.searchParams.get("skipLeads") === "1"
  const onlyLeads = req.nextUrl.searchParams.get("onlyLeads") === "1"

  try {
    // Skip snapshot khi nocache=1 (user muốn data live, tránh lệch với Performance tab).
    try {
      const snapshots = forceRefresh ? [] : await readB2CMonthlySnapshots(months)
      if (snapshots.length === months.length) {
        const snapshotData = snapshotsToMonthlyResponse(snapshots, months)
        if (onlyLeads) {
          return NextResponse.json(
            { leads: snapshotData.leads, leadsByChannel: snapshotData.leadsByChannel, snapshotStatus: snapshotData.snapshotStatus },
            { headers: CACHE_HEADERS },
          )
        }
        return NextResponse.json(
          {
            months,
            currentMonth,
            elapsedDays,
            totalDays,
            targets: await readTargets(),
            customerSource: "admin-gohub-snapshot",
            customerBreakdown: "new-returning",
            refreshTimestamp: snapshots[snapshots.length - 1]?.refreshed_at ?? new Date().toISOString(),
            ...snapshotData,
          },
          { headers: CACHE_HEADERS },
        )
      }
    } catch (e) {
      console.error("[b2c/monthly] snapshots", (e as Error).message)
    }

    const loadLeads = async () => {
      let leads: Record<string, number> = {}
      let leadsByChannel: { label: string; byMonth: Record<string, number> }[] = []
      for (const m of months) leads[m] = 0
      if (tursoLeadsConfigured()) {
        try {
          const lb = await cachedQuery(`b2c-leads:turso:v1:${windowStart}`, () => tursoLeadsBreakdown(months), 60)
          return { leads: lb.total, leadsByChannel: lb.channels }
        } catch (e) { console.error("[b2c/monthly] leads (turso)", (e as Error).message) }
      }
      if (omniConfigured()) {
        try {
          const lb = await cachedQuery(`b2c-leads:omni:v1:${windowStart}`, () => omniLeadsBreakdown(months), 60)
          return { leads: lb.total, leadsByChannel: lb.channels }
        } catch (e) { console.error("[b2c/monthly] leads (omni)", (e as Error).message) }
      }
      if (chatwootConfigured()) {
        try {
          const lb = await cachedQuery(`b2c-leads:v2:${windowStart}`, () => chatwootLeadsBreakdown(months), 60)
          leads = lb.total
          leadsByChannel = lb.channels
        } catch (e) { console.error("[b2c/monthly] leads (chatwoot)", (e as Error).message) }
      }
      return { leads, leadsByChannel }
    }

    if (onlyLeads) {
      return NextResponse.json(await loadLeads(), { headers: CACHE_HEADERS })
    }

    const customerRowsFromDb = () =>
      queryAnalytics<{ month: string; type: string; revenue: string; count: string }>(
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
                  f.customer_code,
                  SUM(f.fulfilled_revenue_amount_vnd) AS revenue
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
             AND f.customer_code IS NOT NULL
           GROUP BY 1, 2
         )
         SELECT m.month,
                CASE WHEN m.month = fo.first_month THEN 'new' ELSE 'returning' END AS type,
                SUM(m.revenue)                  AS revenue,
                COUNT(DISTINCT m.customer_code) AS count
         FROM monthly m
         JOIN first_order fo ON m.customer_code = fo.customer_code
         GROUP BY 1, 2`,
        [windowStart]
      )

    let customerSource: "admin-gohub" | "analytics-db" = adminGohubConfigured() ? "admin-gohub" : "analytics-db"
    let customerBreakdown: "new-returning" | "total-only" = "new-returning"
    let customerError: string | undefined
    const loadCustomerRows = async () => {
      if (!adminGohubConfigured()) return customerRowsFromDb()
      try {
        return await adminGohubCustomerRows(months)
      } catch (e) {
        customerError = (e as Error).message
        console.error("[b2c/monthly] customers (admin-gohub)", customerError)
        return months.map(month => ({ month, type: "total", revenue: "0", count: "0" }))
      }
    }

    // Cache key khác nhau khi live (windowEnd = T-1) vs cron (windowEnd = today)
    const cacheKey = `b2c-monthly:v7:${windowStart}:${windowEnd}:${adminGohubConfigured() ? "admin-summary" : "db"}`
    const data = await cachedQuery(cacheKey, async () => {
      // Khi forceRefresh: dùng windowEnd (T-1) làm upper bound để số ngày hiện tại khớp T-1.
      const endClause = `AND f.fulfiled_date::date <= '${windowEnd}'::date`
      const [marketRows, custRows, channelRows, profitRows] = await Promise.all([
        queryAnalytics<{ month: string; market: string; revenue: string }>(
          `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
                  COALESCE(f.company_code, 'NA')           AS market,
                  SUM(f.fulfilled_revenue_amount_vnd)      AS revenue
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
             ${endClause}
          GROUP BY 1, 2`,
          [windowStart]
        ),
        loadCustomerRows(),
        // Channel-type breakdown: Web (Websites) / App (Mobile-App) / Khác (còn lại)
        queryAnalytics<{ month: string; ctype: string; revenue: string }>(
          `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
                  CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                       WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                       ELSE 'other' END                     AS ctype,
                  SUM(f.fulfilled_revenue_amount_vnd)       AS revenue
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
             ${endClause}
           GROUP BY 1, 2`,
          [windowStart]
        ),
        queryAnalytics<{ month: string; channel: string; revenue: string; cogs: string; gross_profit: string }>(
          `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM')        AS month,
                  COALESCE(NULLIF(TRIM(s.channel_name), ''), 'Khác') AS channel,
                  SUM(COALESCE(f.fulfilled_revenue_amount_vnd, 0)) AS revenue,
                  SUM(COALESCE(f.cogs_amount_vnd, 0))              AS cogs,
                  SUM(COALESCE(f.gross_profit_vnd, COALESCE(f.fulfilled_revenue_amount_vnd, 0) - COALESCE(f.cogs_amount_vnd, 0), 0)) AS gross_profit
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
             ${endClause}
           GROUP BY 1, 2`,
          [windowStart]
        ),
      ])

      // ── Market: VN / US / Total per month ──
      const markets: Record<string, MarketCell> = {}
      for (const m of months) markets[m] = { vn: 0, us: 0, total: 0 }
      for (const r of marketRows) {
        const cell = markets[r.month]
        if (!cell) continue
        const rev = parseFloat(r.revenue || "0")
        if (r.market === "VN") cell.vn += rev
        else if (r.market === "US") cell.us += rev
        cell.total += rev
      }

      // ── Customers: New / Returning / Total per month ──
      const customers: Record<string, CustRow> = {}
      for (const m of months) {
        customers[m] = {
          new:       { revenue: 0, count: 0 },
          returning: { revenue: 0, count: 0 },
          total:     { revenue: 0, count: 0 },
        }
      }
      for (const r of custRows) {
        const row = customers[r.month]
        if (!row) continue
        const rev = parseFloat(r.revenue || "0")
        const cnt = parseInt(r.count || "0")
        if (r.type === "total") {
          customerBreakdown = "total-only"
          row.total.revenue += rev
          row.total.count += cnt
          continue
        }
        const bucket = r.type === "new" ? row.new : row.returning
        bucket.revenue += rev
        bucket.count += cnt
        row.total.revenue += rev
        row.total.count += cnt
      }

      // ── Channels: Web / App / Khác per month ──
      const channels: Record<string, ChannelCell> = {}
      for (const m of months) channels[m] = { web: 0, app: 0, other: 0 }
      for (const r of channelRows) {
        const cell = channels[r.month]
        if (!cell) continue
        const rev = parseFloat(r.revenue || "0")
        if (r.ctype === "web") cell.web += rev
        else if (r.ctype === "app") cell.app += rev
        else cell.other += rev
      }

      // ── Profit trend: Revenue / COGS / GP / CM1 by real source channel ──
      const profitByChannel: Record<string, Record<string, ProfitCell>> = {}
      for (const m of months) profitByChannel[m] = {}
      for (const r of profitRows) {
        const month = r.month
        if (!profitByChannel[month]) continue
        const channel = r.channel || "Khác"
        const revenue = parseFloat(r.revenue || "0")
        const cogs = parseFloat(r.cogs || "0")
        const grossProfit = parseFloat(r.gross_profit || "0")
        profitByChannel[month][channel] = { revenue, cogs, grossProfit, opCost: 0, cm1: grossProfit }
      }

      try {
        const { data: costRows, error } = await supabaseAdmin
          .from("analytics_channel_costs")
          .select("channel, month, ads, platform_fee, sponsor_products, media")
          .in("month", months)
          .in("channel", B2C_CHANNELS)   // chỉ kênh B2C — loại chi phí kênh B2B/ecom khỏi profit trend
        if (error) throw new Error(error.message)

        for (const row of costRows ?? []) {
          const month = String(row.month)
          const channel = String(row.channel || "Khác")
          const monthCells = profitByChannel[month]
          if (!monthCells) continue
          const cell = monthCells[channel] ?? { revenue: 0, cogs: 0, grossProfit: 0, opCost: 0, cm1: 0 }
          const ratio = month === currentMonth ? elapsedDays / totalDays : 1
          const costs = {
            ads: parseCostValue(row.ads),
            platformFee: parseCostValue(row.platform_fee),
            sponsorProducts: parseCostValue(row.sponsor_products),
            media: parseCostValue(row.media),
          }
          cell.opCost += COST_KEYS.reduce((sum, key) => sum + costAmount(costs[key], cell.revenue, ratio), 0)
          cell.cm1 = cell.grossProfit - cell.opCost
          monthCells[channel] = cell
        }
      } catch (e) {
        console.error("[b2c/monthly] profit channel costs", (e as Error).message)
      }

      return { markets, customers, channels, profitByChannel, customerSource, customerBreakdown, customerError }
    }, undefined, forceRefresh)

    // KPI targets + Budget: đều nhập trong tab KPI/Target.
    // budget = ngân sách marketing B2C kế hoạch (app_settings key b2c_budget, nhập ở B2CMarketingBudgetSection).
    let targets: Record<string, { vn: number; us: number; total: number }> = {}
    let budget = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>
    try {
      const { data: rows } = await supabaseAdmin
        .from("app_settings").select("key, value").in("key", ["b2c_kpi_targets", "b2c_budget"])
      for (const r of rows ?? []) {
        if (r.key === "b2c_kpi_targets" && r.value) targets = JSON.parse(r.value)
        if (r.key === "b2c_budget" && r.value) {
          const saved: Record<string, number> = JSON.parse(r.value)
          for (const m of months) if (saved[m]) budget[m] = saved[m]
        }
      }
    } catch (e) { console.error("[b2c/monthly] targets/budget (app_settings)", (e as Error).message) }

    // Chi phí marketing B2C theo tháng (Supabase analytics_channel_group_costs)
    const spend: Record<string, number> = {}
    for (const m of months) spend[m] = 0
    try {
      const { data: costRows } = await supabaseAdmin
        .from("analytics_channel_group_costs")
        .select("month, amount")
        .eq("group_name", "B2C")
        .gte("month", months[0])
      for (const r of costRows ?? []) {
        if (spend[r.month] !== undefined) spend[r.month] += Number(r.amount) || 0
      }
    } catch (e) { console.error("[b2c/monthly] spend (supabase)", (e as Error).message) }

    // Leads marketing theo tháng + breakdown kênh. Ưu tiên Turso chat center, fallback Omni/Chatwoot.
    const { leads, leadsByChannel } = skipLeads
      ? { leads: Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>, leadsByChannel: [] as { label: string; byMonth: Record<string, number> }[] }
      : await loadLeads()

    return NextResponse.json(
      {
        months, currentMonth, elapsedDays, totalDays,
        targets, budget, spend, leads, leadsByChannel,
        dataAsOf: windowEnd,  // ngày T-1 khi live, hôm nay khi cron
        isLive: forceRefresh,
        refreshTimestamp: new Date().toISOString(),
        ...data
      },
      { headers: CACHE_HEADERS }
    )
  } catch (err: any) {
    console.error("[analytics/b2c/monthly]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
