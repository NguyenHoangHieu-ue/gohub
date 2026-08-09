import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { alertCronFailure } from "@/lib/cron-alert"

// Cron: refresh analytics_monthly_kpis (snapshot CM1/GP/3HK theo tháng cho chatbot query).
// Vercel cron hoặc gọi thủ công từ Settings: POST /api/cron/refresh-monthly-kpis

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
}
function daysInMonth(m: string) {
  const d = new Date(`${m}-01`)
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()
}

async function computeMonthlyKpis(month: string, companyCode: string) {
  const startDate = `${month}-01`
  const today = new Date()
  const mDate = new Date(`${month}-01`)
  const isCurrent = mDate.getFullYear() === today.getFullYear() && mDate.getMonth() === today.getMonth()
  const dim = daysInMonth(month)
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
  const actualOpCost = isCurrent ? totalBudget * (elapsed / dim) : totalBudget
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
