import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p = req.nextUrl.searchParams
  const startDate   = p.get("startDate") || ""
  const endDate     = p.get("endDate") || ""
  const channelGroup = p.get("channelGroup") || "All"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const groupFilter = (channelGroup !== "All")
      ? ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${channelGroup.toUpperCase() === "B2B" || ["WS","WHOLESALES","OD","ON-DEMAND"].includes(channelGroup.toUpperCase()) ? "B2B" : "B2C"}')`
      : ""

    // 1. Units sold from gohub_dw (3 queries in parallel)
    const [totalRows, skuRows, vendorRows, sourceRows, b2bRows, b2cRows] = await Promise.all([
      queryAnalytics<{ units_sold: string }>(
        `SELECT SUM(fulfilled_quantity) as units_sold FROM fact_fulfillment_revenue f
         WHERE fulfiled_date::date BETWEEN $1 AND $2${groupFilter}`, [startDate, endDate]
      ),
      queryAnalytics<{ sku: string; units: string }>(
        `SELECT f.sku, SUM(fulfilled_quantity) as units FROM fact_fulfillment_revenue f
         WHERE fulfiled_date::date BETWEEN $1 AND $2${groupFilter} GROUP BY f.sku`, [startDate, endDate]
      ),
      queryAnalytics<{ vendor: string; units: string }>(
        `SELECT TRIM(s.vendor) as vendor, SUM(f.fulfilled_quantity) as units
         FROM fact_fulfillment_revenue f LEFT JOIN dim_sku s ON f.sku = s.sku
         WHERE f.fulfiled_date::date BETWEEN $1 AND $2${groupFilter} GROUP BY TRIM(s.vendor)`, [startDate, endDate]
      ),
      queryAnalytics<{ source: string; units: string }>(
        `SELECT TRIM(os.sapo_name) as source, SUM(f.fulfilled_quantity) as units
         FROM fact_fulfillment_revenue f JOIN dim_order_source os ON f.order_source_code = os.code
         WHERE f.fulfiled_date::date BETWEEN $1 AND $2 GROUP BY 1`, [startDate, endDate]
      ),
      queryAnalytics<{ name: string }>("SELECT DISTINCT TRIM(channel_name) as name FROM dim_order_source WHERE UPPER(group_name) = 'B2B'"),
      queryAnalytics<{ name: string }>("SELECT DISTINCT TRIM(channel_name) as name FROM dim_order_source WHERE UPPER(group_name) = 'B2C'"),
    ])

    const unitsSold = parseInt(totalRows[0]?.units_sold || "0")
    const skuSalesMap: Record<string, number> = {}
    skuRows.forEach(r => { skuSalesMap[String(r.sku || "").trim()] = parseInt(r.units || "0") })
    const vendorSalesMap: Record<string, number> = {}
    vendorRows.forEach(r => { vendorSalesMap[String(r.vendor || "Unknown").toUpperCase().replace(/[^A-Z0-9]/g, "")] = parseInt(r.units || "0") })
    const sourceSalesMap: Record<string, number> = {}
    sourceRows.forEach(r => { sourceSalesMap[String(r.source || "").trim()] = parseInt(r.units || "0") })
    const b2bSourceNames = new Set(b2bRows.map(r => r.name))
    const b2cSourceNames = new Set(b2cRows.map(r => r.name))

    // 2. Tickets from Supabase lark_cs_tickets
    const startTs = new Date(startDate).getTime()
    const endTs   = new Date(endDate).getTime() + 86400000

    let ticketQuery = supabaseAdmin
      .from("lark_cs_tickets")
      .select("*")
      .gte("creation_date", startTs)
      .lt("creation_date", endTs)

    if (channelGroup !== "All") {
      const grp = ["WS","WHOLESALES","OD","ON-DEMAND","B2B"].includes(channelGroup.toUpperCase()) ? "B2B" : "B2C"
      ticketQuery = ticketQuery.eq("source_1", grp)
    }

    const { data: tickets } = await ticketQuery

    // 3. Aggregate ticket data (mirrors intel logic)
    let replacementCount = 0, refundCount = 0, tbsTicketCount = 0
    let totalHandleTime = 0, handleTimeCount = 0
    const shifts = { "Ca 1 (06h-08h)": 0, "Ca 2 (08h-17h)": 0, "Ca 3 (17h-21h)": 0, "Ca 4 (21h-06h)": 0 }
    const issues: Record<string, number> = {}
    const skuMap: Record<string, { tbs: number; telco: string; refunds: number; issues: Record<string, number>; conclusions: Record<string, number> }> = {}
    const vendorMap: Record<string, { tbs: number; refunds: number; issues: Record<string, number>; conclusions: Record<string, number> }> = {}
    const sourceMap: Record<string, { tbs: number; refunds: number; issues: Record<string, number>; conclusions: Record<string, number> }> = {}
    const groupMap: Record<string, { tbs: number; refunds: number; issues: Record<string, number>; conclusions: Record<string, number> }> = {}
    const invalidTickets: { id: string; orderNo: string; reason: string }[] = []

    ;(tickets || []).forEach(t => {
      const isTBS = String(t.ticket_type || "").toLowerCase().includes("troubleshoot")
      const prodAction = String(t.product_action || "").toLowerCase()
      const monAction  = String(t.money_action  || "").toLowerCase()

      if (prodAction.includes("replacement") || prodAction.includes("replace")) replacementCount++
      if (monAction.includes("refund")) refundCount++

      if (!isTBS) return
      tbsTicketCount++

      const dt = new Date(Number(t.creation_date))
      const h  = dt.getHours()
      if (h >= 6 && h < 8) shifts["Ca 1 (06h-08h)"]++
      else if (h >= 8 && h < 17) shifts["Ca 2 (08h-17h)"]++
      else if (h >= 17 && h < 21) shifts["Ca 3 (17h-21h)"]++
      else shifts["Ca 4 (21h-06h)"]++

      const issue      = String(t.issue_detail   || "Unknown")
      const conclusion = String(t.product_action || "None")
      const sku        = String(t.sku    || "Unknown").trim()
      const telco      = String(t.vendor || "Unknown")
      const src        = String(t.source || "Unknown")
      const grp        = String(t.source_1 || "Unknown")
      const isRefund   = monAction === "gh - full refund" || monAction === "gh - partial refund"

      issues[issue] = (issues[issue] || 0) + 1

      if (!skuMap[sku]) skuMap[sku] = { tbs: 0, telco, refunds: 0, issues: {}, conclusions: {} }
      skuMap[sku].tbs++
      skuMap[sku].issues[issue] = (skuMap[sku].issues[issue] || 0) + 1
      skuMap[sku].conclusions[conclusion] = (skuMap[sku].conclusions[conclusion] || 0) + 1
      if (isRefund) skuMap[sku].refunds++

      if (!vendorMap[telco]) vendorMap[telco] = { tbs: 0, refunds: 0, issues: {}, conclusions: {} }
      vendorMap[telco].tbs++
      vendorMap[telco].issues[issue] = (vendorMap[telco].issues[issue] || 0) + 1
      vendorMap[telco].conclusions[conclusion] = (vendorMap[telco].conclusions[conclusion] || 0) + 1
      if (isRefund) vendorMap[telco].refunds++

      if (!sourceMap[src]) sourceMap[src] = { tbs: 0, refunds: 0, issues: {}, conclusions: {} }
      sourceMap[src].tbs++
      sourceMap[src].issues[issue] = (sourceMap[src].issues[issue] || 0) + 1
      sourceMap[src].conclusions[conclusion] = (sourceMap[src].conclusions[conclusion] || 0) + 1
      if (isRefund) sourceMap[src].refunds++

      if (!groupMap[grp]) groupMap[grp] = { tbs: 0, refunds: 0, issues: {}, conclusions: {} }
      groupMap[grp].tbs++
      groupMap[grp].issues[issue] = (groupMap[grp].issues[issue] || 0) + 1
      groupMap[grp].conclusions[conclusion] = (groupMap[grp].conclusions[conclusion] || 0) + 1
      if (isRefund) groupMap[grp].refunds++

      const isInvalid = !t.sku || sku === "" || sku.toLowerCase().includes("unmatch") || sku.toLowerCase().includes("unknown")
      if (isInvalid) invalidTickets.push({ id: t.ticket_no || t.lark_record_id, orderNo: t.order_no, reason: "SKU is blank or invalid" })

      const ht = Number(t.leadtime_minutes || 0)
      if (ht > 0) { totalHandleTime += ht; handleTimeCount++ }
    })

    function makeBreakdown(m: Record<string, number>, total: number) {
      return Object.entries(m).map(([name, count]) => ({ name, count, percentage: total > 0 ? (count / total) * 100 : 0 })).sort((a, b) => b.count - a.count)
    }

    return NextResponse.json({
      hasTicketData: (tickets || []).length > 0,
      kpis: {
        unitsSold,
        ticketCount:      tbsTicketCount,
        tbsRate:          unitsSold > 0 ? (tbsTicketCount / unitsSold) * 100 : 0,
        avgHandleTime:    handleTimeCount > 0 ? Math.round(totalHandleTime / handleTimeCount) : 0,
        replacementCount,
        refundCount,
      },
      shifts: Object.entries(shifts).map(([shift, tickets]) => ({ shift, tickets })),
      issues: Object.entries(issues).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      skuPerformance: Object.entries(skuMap).map(([sku, v]) => {
        const units = skuSalesMap[sku] || 0
        return {
          sku, telco: v.telco, tbs: v.tbs, unitsSold: units,
          tbsRate:    units > 0 ? (v.tbs / units) * 100 : 0,
          refunds:    v.refunds,
          refundRate: v.tbs > 0 ? (v.refunds / v.tbs) * 100 : 0,
          issueBreakdown:      makeBreakdown(v.issues,      v.tbs),
          conclusionBreakdown: makeBreakdown(v.conclusions, v.tbs),
        }
      }).sort((a, b) => b.tbs - a.tbs),
      vendorPerformance: Object.entries(vendorMap).map(([vendor, v]) => {
        const norm = vendor.toUpperCase().replace(/[^A-Z0-9]/g, "")
        const units = vendorSalesMap[norm] || vendorSalesMap[vendor.toUpperCase()] || 0
        return {
          vendor, tbs: v.tbs, unitsSold: units,
          tbsRate:    units > 0 ? (v.tbs / units) * 100 : 0,
          refunds:    v.refunds,
          refundRate: v.tbs > 0 ? (v.refunds / v.tbs) * 100 : 0,
          issueBreakdown:      makeBreakdown(v.issues,      v.tbs),
          conclusionBreakdown: makeBreakdown(v.conclusions, v.tbs),
        }
      }).sort((a, b) => b.tbs - a.tbs),
      sourcePerformance: Object.entries(sourceMap).map(([source, v]) => {
        const units = sourceSalesMap[source] || 0
        return {
          source, tbs: v.tbs, unitsSold: units,
          tbsRate:    units > 0 ? (v.tbs / units) * 100 : 0,
          refunds:    v.refunds,
          refundRate: v.tbs > 0 ? (v.refunds / v.tbs) * 100 : 0,
          issueBreakdown:      makeBreakdown(v.issues,      v.tbs),
          conclusionBreakdown: makeBreakdown(v.conclusions, v.tbs),
        }
      }).sort((a, b) => b.tbs - a.tbs),
      channelGroupPerformance: Object.entries(groupMap).map(([group, v]) => {
        const isB2B = ["B2B","WS","WHOLESALES","OD","ON-DEMAND"].includes(group.toUpperCase())
        let units = 0
        if (isB2B) b2bSourceNames.forEach(s => { units += sourceSalesMap[s] || 0 })
        else       b2cSourceNames.forEach(s => { units += sourceSalesMap[s] || 0 })
        return {
          group, tbs: v.tbs, unitsSold: units,
          tbsRate:    units > 0 ? (v.tbs / units) * 100 : 0,
          refunds:    v.refunds,
          refundRate: v.tbs > 0 ? (v.refunds / v.tbs) * 100 : 0,
          issueBreakdown:      makeBreakdown(v.issues,      v.tbs),
          conclusionBreakdown: makeBreakdown(v.conclusions, v.tbs),
        }
      }).sort((a, b) => b.tbs - a.tbs),
      invalidTickets,
    })
  } catch (err: any) {
    console.error("[cs-troubleshoot]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
