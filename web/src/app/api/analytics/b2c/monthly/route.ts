import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

// Rolling-month B2C dashboard data (Section 1 + 2 của gohub_b2c spec)
// Trả 6 tháng gần nhất (5 hoàn thành + tháng hiện tại MTD):
//   - market revenue: VN / US / Total theo tháng
//   - customers: New / Returning / Total (revenue + count) theo tháng
// New = tháng = tháng có đơn B2C ĐẦU TIÊN của khách; còn lại = Returning.

interface MarketCell { vn: number; us: number; total: number }
interface CustCell { revenue: number; count: number }
interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
interface ChannelCell { web: number; app: number; other: number }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 6 tháng: tháng hiện tại lùi về 5 tháng
  const now = new Date()
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  const windowStart = `${months[0]}-01`
  const currentMonth = months[months.length - 1]
  const elapsedDays = now.getDate()
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  try {
    const data = await cachedQuery(`b2c-monthly:${windowStart}`, async () => {
      const [marketRows, custRows, channelRows] = await Promise.all([
        queryAnalytics<{ month: string; market: string; revenue: string }>(
          `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
                  COALESCE(f.company_code, 'NA')           AS market,
                  SUM(f.fulfilled_revenue_amount_vnd)      AS revenue
           FROM fact_fulfillment_revenue f
           JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2C'
             AND f.fulfiled_date::date >= $1
           GROUP BY 1, 2`,
          [windowStart]
        ),
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
        ),
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

      return { markets, customers, channels }
    })

    // KPI targets + budget (Supabase app_settings) — đọc riêng (không cache)
    let targets: Record<string, { vn: number; us: number; total: number }> = {}
    let budget: Record<string, number> = {}
    try {
      const { data: rows } = await supabaseAdmin
        .from("app_settings").select("key, value").in("key", ["b2c_kpi_targets", "b2c_budget"])
      for (const r of rows ?? []) {
        if (r.key === "b2c_kpi_targets" && r.value) targets = JSON.parse(r.value)
        if (r.key === "b2c_budget" && r.value) budget = JSON.parse(r.value)
      }
    } catch {}

    // Chi phí marketing B2C theo tháng (Turso channel_group_costs, nhập tay). Lỗi/không cấu hình → bỏ qua (spend rỗng).
    const spend: Record<string, number> = {}
    for (const m of months) spend[m] = 0
    if (tursoConfigured()) {
      try {
        const costRows = await tursoQuery<{ month: string; amt: number }>(
          `SELECT month, SUM(amount) AS amt FROM channel_group_costs
           WHERE group_name = 'B2C' AND month >= ? GROUP BY month`,
          [months[0]]
        )
        for (const r of costRows) {
          if (spend[r.month] !== undefined) spend[r.month] = Number(r.amt) || 0
        }
      } catch (e) { console.error("[b2c/monthly] spend (turso)", (e as Error).message) }
    }

    return NextResponse.json(
      { months, currentMonth, elapsedDays, totalDays, targets, budget, spend, ...data },
      { headers: CACHE_HEADERS }
    )
  } catch (err: any) {
    console.error("[analytics/b2c/monthly]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
