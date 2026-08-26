import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { analyticsGuard } from "@/lib/analytics-helpers"
import { fetchCustomerCosts, calcRecordCostProjected } from "@/lib/b2b-customer-cost"
import { fetchCosts } from "@/lib/bod-data"
import { buildQuarterMonthMeta } from "@/lib/analytics-engine/quarter-projection"
import { fetchQuarterlySettings, makeExcludeSql } from "@/lib/quarterly-settings"

export const dynamic = "force-dynamic"

type RiskLevel = "very_safe" | "safe" | "safe_low" | "danger_low" | "danger_high" | "no_target"

function classifyTier(priceListName: string | null): string {
  const p = (priceListName || "").toUpperCase()
  if (p.includes("VIP"))    return "VIP"
  if (p.includes("GOLD"))   return "Gold"
  if (p.includes("SILVER")) return "Silver"
  return "Strategic"
}
function classifyRegion(priceListName: string | null, currencyCode: string | null): string {
  const p = (priceListName || "").toUpperCase()
  const c = (currencyCode  || "").toUpperCase()
  if (c === "USD" || p.includes(" US") || p.startsWith("US ")) return "US"
  return "VN"
}

function getRiskLevel(cm1Pct: number | null, hk3Pct: number | null): RiskLevel {
  const hasCm1 = cm1Pct != null
  const hasHk3 = hk3Pct != null
  if (!hasCm1 && !hasHk3) return "no_target"

  if (!hasCm1 || !hasHk3) {
    const v = (cm1Pct ?? hk3Pct)!
    if (v >= 100) return "safe"
    if (v >= 85)  return "safe_low"
    return "danger_high"
  }

  // Ưu tiên từ dưới lên (mức xấu nhất thắng): 1 cột rơi vào nguy hiểm thì cả cặp
  // bị kéo xuống nguy hiểm, dù cột còn lại vượt target (tránh 1 metric cao che mất metric thấp).
  const c = cm1Pct!, h = hk3Pct!
  if (c < 85  && h < 85)  return "danger_high"  // Nguy hiểm nhiều: cả 2 < 85%
  if (c < 85  || h < 85)  return "danger_low"   // Nguy hiểm ít:    ít nhất 1 < 85%
  if (c < 100 && h < 100) return "safe_low"     // An toàn ít:      cả 2 trong [85%, 100%)
  if (c < 100 || h < 100) return "safe"         // An toàn:         ít nhất 1 chưa đạt 100% (còn lại đều >= 85%)
  return "very_safe"                             // Rất an toàn:     cả 2 >= 100%
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const year    = parseInt(p.get("year")    || String(new Date().getFullYear()))
  const quarter = p.get("quarter") || "Q3"
  const companyCode = p.get("companyCode") || "ALL"
  const q = parseInt(quarter.replace("Q", ""))

  const today = new Date()
  const asOf  = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]

  const qStartM   = (q - 1) * 3 + 1
  const qStart    = `${year}-${String(qStartM).padStart(2, "0")}-01`
  const qLastMonth = `${year}-${String(q * 3).padStart(2, "0")}`
  const qEndDateObj = new Date(year, q * 3, 0)  // last day of quarter
  const qEnd = qEndDateObj < asOf ? qEndDateObj.toISOString().split("T")[0] : todayStr

  // Tháng trong quý (đến hiện tại) — dùng chung cho per-month projection + fetchCustomerCosts
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const m = `${year}-${String(qStartM + i).padStart(2, "0")}`
    const mStart = new Date(year, qStartM - 1 + i, 1)
    if (mStart <= asOf) months.push(m)
  }

  // Per-month projection metadata — CÙNG logic với quarterly-report (buildQuarterMonthMeta).
  const monthMeta = buildQuarterMonthMeta(months, asOf, todayStr)
  const qTotalDays   = Math.round((qEndDateObj.getTime() - new Date(qStart).getTime()) / 86400000) + 1
  const elapsedDays  = Math.max(1, Math.round((new Date(qEnd).getTime() - new Date(qStart).getTime()) / 86400000) + 1)

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  try {
    // Load song song: squad config, squad targets, excluded customers (quarterly-settings)
    const [cfgRes, tgtRes, { excludedCustomers }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("value").eq("key", "squad_config").maybeSingle(),
      supabaseAdmin.from("app_settings").select("value").eq("key", "squad_targets").maybeSingle(),
      fetchQuarterlySettings(),
    ])
    const squadsConfig: { name: string; leader?: string; sales_pics: string[] }[] =
      cfgRes.data?.value ? (JSON.parse(cfgRes.data.value).squads ?? []) : []
    let squadTargets: Record<string, { rev?: number; cm1?: number; hk3rev?: number }> = {}
    try {
      const allTgt = tgtRes.data?.value ? JSON.parse(tgtRes.data.value) : {}
      squadTargets = allTgt[`${quarter}_${year}`] ?? {}
    } catch { squadTargets = {} }

    // EXCLUDE_CUST: dùng cùng nguồn với quarterly-report (dynamic từ Supabase quarterly-settings)
    const EXCLUDE_CUST_SQL = makeExcludeSql(excludedCustomers)

    // Per-month CASE WHEN columns — để áp đúng factor theo tháng (khớp buildQuarterMonthMeta)
    const monthCols = months.map((m, i) => `
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) AS rev_m${i},
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' THEN f.gross_profit_vnd             ELSE 0 END) AS gm_m${i},
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' AND sk.sku IS NOT NULL
               THEN f.fulfilled_revenue_amount_vnd ELSE 0 END)                              AS hk3_m${i}`).join(",")

    // Revenue + GP + 3HK per customer, tách theo tháng
    const [custRows, picRows, { groupCosts }] = await Promise.all([
      queryAnalytics<Record<string, string>>(`
        SELECT
          TRIM(f.customer_code)                               AS customer_code,
          COALESCE(c.name, TRIM(f.customer_code))             AS customer_name,
          TRIM(c.sales_pic_code)                              AS sales_pic_code,
          c.price_list_name,
          c.currency_code,
          SUM(f.fulfilled_revenue_amount_vnd)                 AS revenue,
          SUM(f.gross_profit_vnd)                             AS gm,
          SUM(CASE WHEN sk.sku IS NOT NULL
                   THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) AS hk3,
          ${monthCols}
        FROM fact_fulfillment_revenue f
        LEFT JOIN dim_order_source s  ON f.order_source_code = s.code
        LEFT JOIN dim_customer    c   ON TRIM(f.customer_code) = TRIM(c.code::text)
        LEFT JOIN (
          SELECT DISTINCT TRIM(sku) AS sku FROM dim_sku
          WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
        ) sk ON TRIM(f.sku) = sk.sku
        WHERE f.fulfiled_date >= '${qStart}'
          AND f.fulfiled_date <= '${qEnd}'
          ${companyFilter}
          AND f.sku != 'SHIPPINGFEE0'
          AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
          AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
          ${EXCLUDE_CUST_SQL}
        GROUP BY 1, 2, 3, c.price_list_name, c.currency_code
      `),
      queryAnalytics<{ code: string; name: string }>(`
        SELECT DISTINCT
          TRIM(c.sales_pic_code)                       AS code,
          COALESCE(st.name, TRIM(c.sales_pic_code))    AS name
        FROM dim_customer c
        LEFT JOIN dim_staff st ON TRIM(c.sales_pic_code) = TRIM(st.code)
        WHERE c.sales_pic_code IS NOT NULL AND TRIM(c.sales_pic_code) != ''
          AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
        ORDER BY 2
      `),
      fetchCosts(months),
    ])

    // Load targets + chi phí KH song song
    const custCodes = [...new Set(custRows.map(r => r.customer_code))]
    let targetMap: Record<string, { rev: number; cm1: number; hk3rev: number; hk3pct: number }> = {}
    let costMap = new Map<string, import("@/lib/b2b-customer-cost").CostRecord>()
    await Promise.all([
      custCodes.length > 0
        ? supabaseAdmin
            .from("b2b_customer_targets")
            .select("customer_code, target_rev, target_cm1, target_3hk_rev, target_3hk_pct")
            .eq("quarter", quarter).eq("year", String(year)).in("customer_code", custCodes)
            .then(({ data: tgts }) => {
              for (const t of tgts ?? []) {
                targetMap[t.customer_code] = {
                  rev:    Number(t.target_rev)     || 0,
                  cm1:    Number(t.target_cm1)     || 0,
                  hk3rev: Number(t.target_3hk_rev) || 0,
                  hk3pct: Number(t.target_3hk_pct) || 0,
                }
              }
            })
        : Promise.resolve(),
      fetchCustomerCosts(months).then(m => { costMap = m }).catch(() => {}),
    ])

    // Helper: CM1 thực + PR dùng per-month data để áp đúng factor (khớp quarterly-report)
    const calcCustCm1AndPr = (r: Record<string, string>, code: string) => {
      let cm1Act = 0, cm1Pr = 0
      for (let i = 0; i < months.length; i++) {
        const mRev = Number(r[`rev_m${i}`]) || 0
        const mGm  = Number(r[`gm_m${i}`])  || 0
        const rec  = costMap.get(`${months[i]}_${code}`)
        const mCost = rec ? calcRecordCostProjected(rec, mRev, 1, 1) : 0
        const mCm1 = mGm - mCost
        cm1Act += mCm1
        cm1Pr  += mCm1 * monthMeta[i].factor
      }
      return { cm1Act, cm1Pr: Math.round(cm1Pr) }
    }

    // Helper: projected revenue/hk3 dùng per-month factors
    const calcPrByMonth = (r: Record<string, string>, field: string) =>
      Math.round(months.reduce((s, _, i) => s + (Number(r[`${field}_m${i}`]) || 0) * monthMeta[i].factor, 0))

    // Group Cost B2B — phân bổ theo revenue-share (khớp #4 NHẤT QUÁN GROUP COST trong quarterly-b2b-customers,
    // trước đây Squad Progress KHÔNG trừ khoản này → CM1 lệch cao hơn Tổng quan/tier).
    const grandTotalRevAct = custRows.reduce((s, r) => s + (Number(r.revenue) || 0), 0)
    const grandTotalRevPr  = custRows.reduce((s, r) => s + calcPrByMonth(r, "rev"), 0)
    let totalB2BGCAct = 0, totalB2BGCPr = 0
    months.forEach((m, i) => {
      const budget = groupCosts.filter((g: any) => g.group_name === "B2B" && g.month === m).reduce((s: number, g: any) => s + (g.amount || 0), 0)
      const mr = monthMeta[i]
      const gcRatio = (mr.elapsed > 0 && mr.elapsed < mr.dim) ? mr.elapsed / mr.dim : 1
      totalB2BGCAct += budget * gcRatio
      totalB2BGCPr  += mr.isProjected ? budget : budget * gcRatio
    })

    // Aggregate per squad
    const squads = squadsConfig.map(sq => {
      const members = custRows.filter(r => sq.sales_pics.includes(r.sales_pic_code || ""))
      const codes   = members.map(m => m.customer_code)

      let rev = 0, cm1 = 0, hk3 = 0, tgtRev = 0, tgtCm1 = 0, tgtHk3 = 0

      const customers = codes.map(code => {
        const r = custRows.find(x => x.customer_code === code)
        if (!r) return null

        const revenue    = Number(r.revenue) || 0
        const hk3Act     = Number(r.hk3) || 0
        const { cm1Act, cm1Pr } = calcCustCm1AndPr(r, code)
        const revPr      = calcPrByMonth(r, "rev")
        const hk3Pr      = calcPrByMonth(r, "hk3")
        const hk3ActPct  = revenue > 0 ? Math.round(hk3Act / revenue * 1000) / 10 : 0

        const tgt = targetMap[code] ?? { rev: 0, cm1: 0, hk3rev: 0, hk3pct: 0 }
        rev    += revenue
        cm1    += cm1Act
        hk3    += hk3Act
        tgtRev += tgt.rev
        tgtCm1 += tgt.cm1
        tgtHk3 += tgt.hk3rev

        const cm1TgtPct: number | null  = tgt.cm1 > 0 ? Math.round(cm1Pr / tgt.cm1 * 100) : null
        const hk3TgtPct: number | null  = tgt.hk3pct > 0 ? Math.round(hk3ActPct / tgt.hk3pct * 100) : null

        return {
          customer_code: code,
          customer_name: r.customer_name,
          sales_pic: r.sales_pic_code || "",
          tier:   classifyTier(r.price_list_name),
          region: classifyRegion(r.price_list_name, r.currency_code),
          revenue, revenue_pr: revPr, target_rev: tgt.rev,
          rev_pct: tgt.rev > 0 ? Math.round(revPr / tgt.rev * 100) : null,
          cm1: cm1Act, cm1_pr: cm1Pr, target_cm1: tgt.cm1,
          cm1_pct: revenue > 0 ? Math.round(cm1Act / revenue * 1000) / 10 : 0,
          cm1_tgt_pct: cm1TgtPct,
          hk3: hk3Act, hk3_pct: hk3ActPct, target_hk3pct: tgt.hk3pct,
          hk3_tgt_pct: hk3TgtPct,
          risk_level: getRiskLevel(cm1TgtPct, hk3TgtPct),
        }
      }).filter(Boolean) as any[]

      // Squad-level projected values: dùng per-month factors (giống monthly-breakdown trong quarterly-report)
      const revPr = Math.round(months.reduce((s, _, i) =>
        s + members.reduce((ms, r) => ms + (Number(r[`rev_m${i}`]) || 0), 0) * monthMeta[i].factor, 0))
      let cm1Pr = 0
      for (let i = 0; i < months.length; i++) {
        for (const r of members) {
          const mRev = Number(r[`rev_m${i}`]) || 0
          const mGm  = Number(r[`gm_m${i}`])  || 0
          const rec  = costMap.get(`${months[i]}_${r.customer_code}`)
          const mCost = rec ? calcRecordCostProjected(rec, mRev, 1, 1) : 0
          cm1Pr += (mGm - mCost) * monthMeta[i].factor
        }
      }
      const groupShareAct = grandTotalRevAct > 0 ? (rev / grandTotalRevAct) * totalB2BGCAct : 0
      const groupSharePr  = grandTotalRevPr  > 0 ? (revPr / grandTotalRevPr)  * totalB2BGCPr  : 0
      cm1 = Math.round(cm1 - groupShareAct)
      cm1Pr = Math.round(cm1Pr - groupSharePr)

      const mt = squadTargets[sq.name] ?? {}
      const effTgtRev = Number(mt.rev)    > 0 ? Number(mt.rev)    : tgtRev
      const effTgtCm1 = Number(mt.cm1)    > 0 ? Number(mt.cm1)    : tgtCm1
      const effTgtHk3 = Number(mt.hk3rev) > 0 ? Number(mt.hk3rev) : tgtHk3

      const riskCounts: Record<RiskLevel, number> = {
        very_safe: 0, safe: 0, safe_low: 0, danger_low: 0, danger_high: 0, no_target: 0,
      }
      customers.forEach(c => { if (c?.risk_level) riskCounts[c.risk_level as RiskLevel]++ })

      return {
        name: sq.name, leader: sq.leader, sales_pics: sq.sales_pics,
        customer_count: codes.length,
        manual_target: { rev: Number(mt.rev) || 0, cm1: Number(mt.cm1) || 0, hk3rev: Number(mt.hk3rev) || 0 },
        revenue: rev,  revenue_pr: revPr,  target_rev: effTgtRev,
        rev_pct: effTgtRev > 0 ? Math.round(revPr / effTgtRev * 100) : null,
        cm1,           cm1_pr: cm1Pr,      target_cm1: effTgtCm1,
        cm1_pct: rev > 0 ? Math.round(cm1 / rev * 1000) / 10 : 0,
        cm1_tgt_pct: effTgtCm1 > 0 ? Math.round(cm1Pr / effTgtCm1 * 100) : null,
        hk3, hk3_pct: rev > 0 ? Math.round(hk3 / rev * 1000) / 10 : 0,
        target_hk3: effTgtHk3,
        hk3_tgt_pct: effTgtHk3 > 0 ? Math.round(hk3 / effTgtHk3 * 100) : null,
        risk_counts: riskCounts,
        customers,
      }
    })

    const totRev = squads.reduce((s, sq) => s + sq.revenue, 0)
    const totCm1 = squads.reduce((s, sq) => s + sq.cm1,     0)
    const totHk3 = squads.reduce((s, sq) => s + sq.hk3,     0)
    const totRevPr = squads.reduce((s, sq) => s + sq.revenue_pr, 0)
    const totCm1Pr = squads.reduce((s, sq) => s + sq.cm1_pr,    0)

    return NextResponse.json({
      quarter, year, elapsed_days: elapsedDays, quarter_days: qTotalDays, pr_factor: monthMeta[monthMeta.length - 1]?.factor ?? 1,
      squads,
      totals: {
        revenue: totRev, revenue_pr: totRevPr,
        cm1: totCm1, cm1_pr: totCm1Pr,
        cm1_pct: totRev > 0 ? Math.round(totCm1 / totRev * 1000) / 10 : 0,
        hk3: totHk3, hk3_pct: totRev > 0 ? Math.round(totHk3 / totRev * 1000) / 10 : 0,
      },
      available_pics: picRows,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
