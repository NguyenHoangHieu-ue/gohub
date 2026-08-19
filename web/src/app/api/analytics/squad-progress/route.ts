import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { analyticsGuard } from "@/lib/analytics-helpers"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const year    = parseInt(p.get("year")    || String(new Date().getFullYear()))
  const quarter = p.get("quarter") || "Q3"
  const companyCode = p.get("companyCode") || "ALL"
  const q = parseInt(quarter.replace("Q", ""))

  const today   = new Date()
  const asOf    = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const qStartM = (q - 1) * 3 + 1
  const qStart  = `${year}-${String(qStartM).padStart(2, "0")}-01`
  const qEndDate = new Date(year, q * 3, 0)
  const qEnd    = (qEndDate < asOf ? qEndDate : asOf).toISOString().split("T")[0]

  // Pro-rata: days elapsed vs quarter total
  const qTotalDays    = Math.round((qEndDate.getTime() - new Date(qStart).getTime()) / 86400000) + 1
  const elapsedDays   = Math.max(1, Math.round((new Date(qEnd).getTime() - new Date(qStart).getTime()) / 86400000) + 1)
  const prFactor      = qTotalDays / elapsedDays
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  try {
    // 1. Load squad config
    const { data: cfgRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "squad_config").maybeSingle()
    const squadsConfig: { name: string; sales_pics: string[] }[] = cfgRow?.value
      ? (JSON.parse(cfgRow.value).squads ?? [])
      : []

    // 2. Revenue + GP + 3HK per customer WITH sales_pic_code từ gohub_dw
    const [custRows, picRows] = await Promise.all([
      queryAnalytics<{
        customer_code: string; customer_name: string; sales_pic_code: string | null
        revenue: string; gm: string; hk3: string
      }>(`
        SELECT
          TRIM(f.customer_code)                               AS customer_code,
          COALESCE(c.name, TRIM(f.customer_code))             AS customer_name,
          TRIM(c.sales_pic_code)                              AS sales_pic_code,
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
      // Available sales_pics để dùng trong config UI
      queryAnalytics<{ code: string; name: string }>(`
        SELECT DISTINCT
          TRIM(c.sales_pic_code)                              AS code,
          COALESCE(st.name, TRIM(c.sales_pic_code))          AS name
        FROM dim_customer c
        LEFT JOIN dim_staff st ON TRIM(c.sales_pic_code) = TRIM(st.code)
        WHERE c.sales_pic_code IS NOT NULL AND TRIM(c.sales_pic_code) != ''
          AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
        ORDER BY 2
      `),
    ])

    // 3. Load targets per customer từ Supabase b2b_customer_targets
    const custCodes = [...new Set(custRows.map(r => r.customer_code))]
    let targetMap: Record<string, { rev: number; cm1: number; hk3rev: number }> = {}
    if (custCodes.length > 0) {
      const { data: tgts } = await supabaseAdmin
        .from("b2b_customer_targets")
        .select("customer_code, target_rev, target_cm1, target_3hk_rev")
        .eq("quarter", quarter)
        .eq("year", String(year))
        .in("customer_code", custCodes)
      for (const t of tgts ?? []) {
        targetMap[t.customer_code] = {
          rev:    Number(t.target_rev)     || 0,
          cm1:    Number(t.target_cm1)     || 0,
          hk3rev: Number(t.target_3hk_rev) || 0,
        }
      }
    }

    // 4. Build customer map
    const custMap: Record<string, {
      customer_name: string; sales_pic: string
      revenue: number; gm: number; hk3: number
      tgt_rev: number; tgt_cm1: number; tgt_hk3: number
    }> = {}
    for (const r of custRows) {
      custMap[r.customer_code] = {
        customer_name: r.customer_name,
        sales_pic:  r.sales_pic_code || "",
        revenue:    Number(r.revenue) || 0,
        gm:         Number(r.gm)     || 0,
        hk3:        Number(r.hk3)    || 0,
        tgt_rev:    targetMap[r.customer_code]?.rev    || 0,
        tgt_cm1:    targetMap[r.customer_code]?.cm1    || 0,
        tgt_hk3:    targetMap[r.customer_code]?.hk3rev || 0,
      }
    }

    // 5. Aggregate per squad
    const squads = squadsConfig.map(sq => {
      const members = custRows.filter(r => sq.sales_pics.includes(r.sales_pic_code || ""))
      const codes   = members.map(m => m.customer_code)

      let rev = 0, gm = 0, hk3 = 0, tgtRev = 0, tgtCm1 = 0, tgtHk3 = 0
      for (const code of codes) {
        const c = custMap[code]
        if (!c) continue
        rev    += c.revenue
        gm     += c.gm
        hk3    += c.hk3
        tgtRev += c.tgt_rev
        tgtCm1 += c.tgt_cm1
        tgtHk3 += c.tgt_hk3
      }

      const revPr = Math.round(rev * prFactor)
      const gmPr  = Math.round(gm  * prFactor)

      return {
        name:           sq.name,
        sales_pics:     sq.sales_pics,
        customer_count: codes.length,
        // Revenue
        revenue:    rev,
        revenue_pr: revPr,
        target_rev: tgtRev,
        rev_pct:    tgtRev > 0 ? Math.round(revPr / tgtRev * 100) : null,
        // GP (proxy cho CM1 — chưa trừ phí kênh/nhóm)
        gp:         gm,
        gp_pr:      gmPr,
        target_cm1: tgtCm1,
        gp_cm1_pct: tgtCm1 > 0 ? Math.round(gmPr / tgtCm1 * 100) : null,
        gp_pct:     rev > 0 ? Math.round(gm / rev * 100 * 10) / 10 : 0,
        // 3HK
        hk3,
        hk3_pct:    rev > 0 ? Math.round(hk3 / rev * 100 * 10) / 10 : 0,
        target_hk3: tgtHk3,
        hk3_tgt_pct: tgtHk3 > 0 ? Math.round(hk3 / tgtHk3 * 100) : null,
      }
    })

    // Tổng toàn bộ (tất cả customer trong các squad)
    const allCodes = [...new Set(squads.flatMap(s => {
      const sq = squadsConfig.find(c => c.name === s.name)
      return custRows.filter(r => sq?.sales_pics.includes(r.sales_pic_code || "")).map(r => r.customer_code)
    }))]
    const totRev = squads.reduce((s, sq) => s + sq.revenue, 0)
    const totGp  = squads.reduce((s, sq) => s + sq.gp, 0)
    const totHk3 = squads.reduce((s, sq) => s + sq.hk3, 0)

    return NextResponse.json({
      quarter, year, elapsed_days: elapsedDays, quarter_days: qTotalDays, pr_factor: prFactor,
      squads,
      totals: {
        revenue: totRev, revenue_pr: Math.round(totRev * prFactor),
        gp: totGp, gp_pr: Math.round(totGp * prFactor),
        hk3: totHk3, hk3_pct: totRev > 0 ? Math.round(totHk3 / totRev * 100 * 10) / 10 : 0,
      },
      available_pics: picRows,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
