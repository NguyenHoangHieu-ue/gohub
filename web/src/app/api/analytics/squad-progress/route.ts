import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { analyticsGuard } from "@/lib/analytics-helpers"

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

  // Nếu chỉ có 1 metric, dùng metric đó
  if (!hasCm1 || !hasHk3) {
    const v = (cm1Pct ?? hk3Pct)!
    if (v >= 100) return "safe"
    if (v >= 85)  return "safe_low"
    return "danger_high"
  }

  const c = cm1Pct!, h = hk3Pct!
  if (c >= 100 && h >= 100) return "very_safe"   // Rất an toàn: cả 2 >= 100%
  if (c >= 100 || h >= 100) return "safe"         // An toàn: 1 trong 2 >= 100%
  if (c >= 85  && h >= 85)  return "safe_low"     // An toàn ít: cả 2 >= 85%
  if (c >= 85  || h >= 85)  return "danger_low"   // Nguy hiểm ít: 1 trong 2 >= 85%
  return "danger_high"                             // Nguy hiểm nhiều: cả 2 < 85%
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

  const today    = new Date()
  const asOf     = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const qStartM  = (q - 1) * 3 + 1
  const qStart   = `${year}-${String(qStartM).padStart(2, "0")}-01`
  const qEndDate = new Date(year, q * 3, 0)
  const qEnd     = (qEndDate < asOf ? qEndDate : asOf).toISOString().split("T")[0]

  const qTotalDays  = Math.round((qEndDate.getTime() - new Date(qStart).getTime()) / 86400000) + 1
  const elapsedDays = Math.max(1, Math.round((new Date(qEnd).getTime() - new Date(qStart).getTime()) / 86400000) + 1)
  const prFactor    = qTotalDays / elapsedDays
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  try {
    // 1. Load squad config
    const { data: cfgRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "squad_config").maybeSingle()
    const squadsConfig: { name: string; leader?: string; sales_pics: string[] }[] =
      cfgRow?.value ? (JSON.parse(cfgRow.value).squads ?? []) : []

    // 2. Revenue + GP + 3HK per customer WITH sales_pic_code
    const [custRows, picRows] = await Promise.all([
      queryAnalytics<{
        customer_code: string; customer_name: string; sales_pic_code: string | null
        price_list_name: string | null; currency_code: string | null
        revenue: string; gm: string; hk3: string
      }>(`
        SELECT
          TRIM(f.customer_code)                               AS customer_code,
          COALESCE(c.name, TRIM(f.customer_code))             AS customer_name,
          TRIM(c.sales_pic_code)                              AS sales_pic_code,
          c.price_list_name,
          c.currency_code,
          SUM(f.fulfilled_revenue_amount_vnd)                 AS revenue,
          SUM(f.gross_profit_vnd)                             AS gm,
          SUM(CASE WHEN sk.sku IS NOT NULL
                   THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) AS hk3
        FROM fact_fulfillment_revenue f
        LEFT JOIN dim_order_source s  ON f.order_source_code = s.code
        LEFT JOIN dim_customer    c   ON TRIM(f.customer_code) = TRIM(c.code::text)
        LEFT JOIN (
          SELECT DISTINCT TRIM(sku) AS sku FROM dim_sku
          WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
        ) sk ON TRIM(f.sku) = sk.sku
        WHERE f.fulfiled_date::date >= '${qStart}'
          AND f.fulfiled_date::date <= '${qEnd}'
          ${companyFilter}
          AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
          AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
          AND COALESCE(c.name, TRIM(f.customer_code))
              NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')
        GROUP BY 1, 2, 3
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
    ])

    // 3. Load targets per customer từ Supabase
    const custCodes = [...new Set(custRows.map(r => r.customer_code))]
    let targetMap: Record<string, { rev: number; cm1: number; hk3rev: number; hk3pct: number }> = {}
    if (custCodes.length > 0) {
      const { data: tgts } = await supabaseAdmin
        .from("b2b_customer_targets")
        .select("customer_code, target_rev, target_cm1, target_3hk_rev, target_3hk_pct")
        .eq("quarter", quarter)
        .eq("year", String(year))
        .in("customer_code", custCodes)
      for (const t of tgts ?? []) {
        targetMap[t.customer_code] = {
          rev:    Number(t.target_rev)      || 0,
          cm1:    Number(t.target_cm1)      || 0,
          hk3rev: Number(t.target_3hk_rev)  || 0,
          hk3pct: Number(t.target_3hk_pct)  || 0,
        }
      }
    }

    // 4. Build customer map with risk
    const custMap: Record<string, {
      customer_name: string; sales_pic: string; tier: string; region: string
      revenue: number; gm: number; hk3: number
      tgt_rev: number; tgt_cm1: number; tgt_hk3: number; tgt_hk3pct: number
    }> = {}
    for (const r of custRows) {
      custMap[r.customer_code] = {
        customer_name: r.customer_name,
        sales_pic:  r.sales_pic_code || "",
        tier:       classifyTier(r.price_list_name),
        region:     classifyRegion(r.price_list_name, r.currency_code),
        revenue:    Number(r.revenue) || 0,
        gm:         Number(r.gm)     || 0,
        hk3:        Number(r.hk3)    || 0,
        tgt_rev:    targetMap[r.customer_code]?.rev    || 0,
        tgt_cm1:    targetMap[r.customer_code]?.cm1    || 0,
        tgt_hk3:    targetMap[r.customer_code]?.hk3rev || 0,
        tgt_hk3pct: targetMap[r.customer_code]?.hk3pct || 0,
      }
    }

    // 5. Aggregate per squad + per-customer detail
    const squads = squadsConfig.map(sq => {
      const members = custRows.filter(r => sq.sales_pics.includes(r.sales_pic_code || ""))
      const codes   = members.map(m => m.customer_code)

      let rev = 0, gm = 0, hk3 = 0, tgtRev = 0, tgtCm1 = 0, tgtHk3 = 0

      const customers = codes.map(code => {
        const c = custMap[code]
        if (!c) return null
        rev    += c.revenue
        gm     += c.gm
        hk3    += c.hk3
        tgtRev += c.tgt_rev
        tgtCm1 += c.tgt_cm1
        tgtHk3 += c.tgt_hk3

        const revPr   = Math.round(c.revenue * prFactor)
        const gpPr    = Math.round(c.gm      * prFactor)
        const hk3ActPct = c.revenue > 0 ? Math.round(c.hk3 / c.revenue * 1000) / 10 : 0

        // %Tgt CM1 = pro-rata GP vs target CM1
        const cm1Pct: number | null = c.tgt_cm1 > 0 ? Math.round(gpPr / c.tgt_cm1 * 100) : null
        // %Tgt 3HK = actual 3HK% vs target 3HK%
        const hk3TgtPct: number | null = c.tgt_hk3pct > 0 ? Math.round(hk3ActPct / c.tgt_hk3pct * 100) : null

        return {
          customer_code: code,
          customer_name: c.customer_name,
          sales_pic: c.sales_pic,
          tier:   c.tier,
          region: c.region,
          revenue: c.revenue, revenue_pr: revPr, target_rev: c.tgt_rev,
          rev_pct: c.tgt_rev > 0 ? Math.round(revPr / c.tgt_rev * 100) : null,
          gp: c.gm, gp_pr: gpPr, target_cm1: c.tgt_cm1,
          cm1_pct: cm1Pct,
          hk3: c.hk3, hk3_pct: hk3ActPct, target_hk3pct: c.tgt_hk3pct,
          hk3_tgt_pct: hk3TgtPct,
          risk_level: getRiskLevel(cm1Pct, hk3TgtPct),
        }
      }).filter(Boolean) as any[]

      const revPr = Math.round(rev * prFactor)
      const gmPr  = Math.round(gm  * prFactor)
      const cm1PctSquad = tgtCm1 > 0 ? Math.round(gmPr / tgtCm1 * 100) : null

      // Risk summary
      const riskCounts: Record<RiskLevel, number> = {
        very_safe: 0, safe: 0, safe_low: 0, danger_low: 0, danger_high: 0, no_target: 0,
      }
      customers.forEach(c => { if (c?.risk_level) riskCounts[c.risk_level as RiskLevel]++ })

      return {
        name: sq.name, leader: sq.leader,
        sales_pics: sq.sales_pics,
        customer_count: codes.length,
        revenue: rev,   revenue_pr: revPr,   target_rev: tgtRev,
        rev_pct: tgtRev > 0 ? Math.round(revPr / tgtRev * 100) : null,
        gp: gm,         gp_pr: gmPr,         target_cm1: tgtCm1,
        gp_cm1_pct: cm1PctSquad,
        gp_pct: rev > 0 ? Math.round(gm / rev * 1000) / 10 : 0,
        hk3, hk3_pct: rev > 0 ? Math.round(hk3 / rev * 1000) / 10 : 0,
        target_hk3: tgtHk3,
        risk_counts: riskCounts,
        customers,
      }
    })

    const totRev = squads.reduce((s, sq) => s + sq.revenue, 0)
    const totGp  = squads.reduce((s, sq) => s + sq.gp,      0)
    const totHk3 = squads.reduce((s, sq) => s + sq.hk3,     0)

    return NextResponse.json({
      quarter, year, elapsed_days: elapsedDays, quarter_days: qTotalDays, pr_factor: prFactor,
      squads,
      totals: {
        revenue: totRev, revenue_pr: Math.round(totRev * prFactor),
        gp: totGp, gp_pr: Math.round(totGp * prFactor),
        hk3: totHk3, hk3_pct: totRev > 0 ? Math.round(totHk3 / totRev * 1000) / 10 : 0,
      },
      available_pics: picRows,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
