import { NextRequest, NextResponse } from "next/server"
import { isCronReq, shipFilter, internalOpsFilter, excludeOpsByCode } from "@/lib/analytics-helpers"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { alertCronFailure } from "@/lib/cron-alert"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"
import { getDaysInMonth } from "@/lib/analytics-engine/date-math"

// Cron: refresh analytics_monthly_kpis (snapshot CM1/GP/3HK theo tháng cho chatbot query).
// Vercel cron hoặc gọi thủ công từ Settings: POST /api/cron/refresh-monthly-kpis

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
}
// s183 Phase 2: `daysInMonth` cục bộ (đã xoá) parse `new Date(`${m}-01`)` (UTC) rồi đọc lại
// `.getFullYear()/.getMonth()` (LOCAL) — cùng lớp bug đã fix ở bod-data.ts, giờ dùng
// `getDaysInMonth` từ date-math.ts (thuần, không phụ thuộc timezone máy chạy).

async function computeMonthlyKpis(month: string, companyCode: string) {
  const startDate = `${month}-01`
  const today = new Date()
  const mDate = new Date(`${month}-01`)
  const isCurrent = mDate.getFullYear() === today.getFullYear() && mDate.getMonth() === today.getMonth()
  const dim = getDaysInMonth(month)
  const endDate = isCurrent
    ? today.toISOString().split("T")[0]
    : `${month}-${String(dim).padStart(2,"0")}`
  const elapsed = isCurrent ? today.getDate() : dim

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  const rows = await queryAnalytics<{ revenue: string; gp: string; hk3: string }>(`
    SELECT
      SUM(f.fulfilled_revenue_amount_vnd) as revenue,
      SUM(f.gross_profit_vnd) as gp,
      SUM(CASE WHEN TRIM(f.sku) IN (
            SELECT DISTINCT TRIM(sku) FROM dim_sku
            WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
          ) THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as hk3
    FROM fact_fulfillment_revenue f
    WHERE f.fulfiled_date::date >= '${startDate}' AND f.fulfiled_date::date <= '${endDate}'
      ${companyFilter}
  `)

  const revenue = parseFloat(rows[0]?.revenue || "0")
  const gp      = parseFloat(rows[0]?.gp      || "0")
  const hk3     = parseFloat(rows[0]?.hk3     || "0")

  const { data: gcData } = await supabaseAdmin
    .from("analytics_channel_group_costs").select("amount").eq("month", month)
  const totalBudget = (gcData || []).reduce((s, c: any) => s + parseFloat(c.amount || "0"), 0)
  const dayRatio = isCurrent ? elapsed / dim : 1

  // B2B per-customer cost (Turso b2b_customer_cost_monthly) — khớp Quarter Report/b2b-kpis,
  // KHÔNG dùng analytics_channel_costs cho B2B (tránh double-count).
  const { excludedCustomers } = await fetchQuarterlySettings()
  const b2bSfx = `${shipFilter(false)} ${internalOpsFilter(false)} ${excludeOpsByCode(excludedCustomers)}`
  const [custRevRows, customerCostMap] = await Promise.all([
    queryAnalytics<{ customer_code: string; revenue: string }>(`
      SELECT TRIM(f.customer_code) as customer_code, SUM(f.fulfilled_revenue_amount_vnd) as revenue
      FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      WHERE f.fulfiled_date::date >= '${startDate}' AND f.fulfiled_date::date <= '${endDate}'
        AND UPPER(COALESCE(s.group_name,'')) = 'B2B' ${companyFilter} ${b2bSfx}
      GROUP BY 1
    `),
    fetchCustomerCosts([month]),
  ])
  const custRevMap = new Map<string, number>()
  custRevRows.forEach(r => custRevMap.set(r.customer_code, parseFloat(r.revenue || "0")))
  let b2bCustCost = 0
  customerCostMap.forEach((rec, key) => {
    if (key.slice(0, 7) !== month) return
    const custRev = custRevMap.get(key.slice(8)) || 0
    if (custRev === 0) return
    b2bCustCost += calcChCostForPeriod(rec, custRev, dayRatio)
  })

  const actualOpCost = totalBudget * dayRatio + b2bCustCost
  const cm1 = gp - actualOpCost

  return {
    month, company_code: companyCode,
    revenue: Math.round(revenue),
    gross_margin: Math.round(gp),
    op_cost: Math.round(actualOpCost),
    cm1: Math.round(cm1),
    cm1_pct: revenue > 0 ? Math.round(cm1 / revenue * 10000) / 100 : 0,
    hk3_revenue: Math.round(hk3),
    hk3_pct: revenue > 0 ? Math.round(hk3 / revenue * 10000) / 100 : 0,
    refreshed_at: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const today = new Date()
  const months = [-2, -1, 0].map(off => {
    const d = new Date(today.getFullYear(), today.getMonth() + off, 1)
    return getMonthStr(d)
  })
  const companies = ["ALL", "VN", "US"]

  const rows = []
  for (const company of companies) {
    for (const month of months) {
      try {
        rows.push(await computeMonthlyKpis(month, company))
      } catch (e) {
        console.error(`[monthly-kpis cron] ${month}/${company}:`, e)
      }
    }
  }

  if (rows.length > 0) {
    await supabaseAdmin.from("analytics_monthly_kpis")
      .upsert(rows, { onConflict: "month,company_code" })
  } else {
    await alertCronFailure("refresh-monthly-kpis", new Error("0 rows refreshed — all queries failed"))
  }

  console.log(`[monthly-kpis cron] refreshed ${rows.length} rows`)
  return NextResponse.json({ ok: rows.length > 0, refreshed: rows.length })
}
