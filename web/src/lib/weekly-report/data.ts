// Weekly Report — gom toàn bộ số liệu cần cho báo cáo "Company Weekly Performance".
// Tái dùng CÙNG công thức/helper các tab đang dùng (getAnalyticsSource/getDateFilter/getProjectionFactor/
// fetchBODGroupMarginData/excludeInactiveCustomers...) để số khớp Dashboard/BOD/B2B/B2C/Vendor Performance —
// KHÔNG viết lại công thức riêng.
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, shipFilter, internalOpsFilterByCode,
  excludeInactiveCustomers, excludeOpsByCode,
} from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData, type BODGroup } from "@/lib/bod-data"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"
import { getReportPeriods, pctChange, addDaysStr, daysBetweenStr, type ReportPeriods } from "./period"

const source = getAnalyticsSource("fulfiled_date") // Weekly Report luôn dùng Fulfillment (khớp mọi tab BOD/Quarter Report)

export interface KpiCard {
  revenue: number; revenuePrev: number
  orders:  number; ordersPrev:  number
  aov:     number; aovPrev:     number
  units:   number; unitsPrev:   number
}

export interface ChannelMoM {
  channel: string
  mtdActual: number
  prevMonthActual: number
  prorata: number
  pctMoM: number
}

export interface GroupTotals { revenue: number; margin: number; gpm2: number; margin_percent: number; gpm2_percent: number }

export interface WeeklyReportData {
  periods: ReportPeriods
  projFactor: number
  weekKpi: KpiCard
  monthKpi: KpiCard
  weeklyWow: {
    rows: { label: string; cur: number; prev: number; pct: number }[]
    totalCur: number; totalPrev: number; totalPct: number
  }
  monthVsPrev: { b2b: GroupTotals & { prevMonthActual: number }; b2c: GroupTotals & { prevMonthActual: number }; total: GroupTotals & { prevMonthActual: number } }
  b2bChannels: ChannelMoM[]
  b2cChannels: ChannelMoM[]
  b2bGpCm1: { gp: number; cm1: number; gpProrata: number; cm1Prorata: number; cm1ProrataPct: number; gpPrevMonth: number; cm1PrevMonth: number }
  b2cGpCm1: { gp: number; cm1: number; gpProrata: number; cm1Prorata: number; cm1ProrataPct: number; gpPrevMonth: number; cm1PrevMonth: number }
  hk3: {
    revenueMtd: number; revenueProrata: number; revenuePrevMonth: number
    pctVsPrevMonth: number; pctContributionOfProrataTotal: number
    ordersMtd: number; unitsMtd: number; aovMtd: number; grossMarginMtd: number
    ordersProrata: number; unitsProrata: number; grossMarginProrata: number
  }
}

// ── KPI card thô (giống hệt /api/analytics/kpis — revenue/orders/AOV/units, KHÔNG lọc ship/internal) ──
async function fetchKpiTotals(startDate: string, endDate: string) {
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const rows = await queryAnalytics<{ revenue: string; orders: string; units: string }>(
    `SELECT SUM(${source.revenueCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${source.quantityCol}) as units
     FROM ${source.mainTable} f WHERE ${filter}`
  )
  const r = rows[0]
  const revenue = parseFloat(r?.revenue || "0")
  const orders  = parseInt(r?.orders || "0", 10)
  const units   = parseInt(r?.units || "0", 10)
  return { revenue, orders, units, aov: orders === 0 ? 0 : revenue / orders }
}

async function fetchKpiCard(curStart: string, curEnd: string, prevStart: string, prevEnd: string): Promise<KpiCard> {
  const [cur, prev] = await Promise.all([fetchKpiTotals(curStart, curEnd), fetchKpiTotals(prevStart, prevEnd)])
  return {
    revenue: cur.revenue, revenuePrev: prev.revenue,
    orders: cur.orders, ordersPrev: prev.orders,
    aov: cur.aov, aovPrev: prev.aov,
    units: cur.units, unitsPrev: prev.units,
  }
}

// ── §1 Weekly WoW — breakdown theo B2B/B2C/Internal-Misc, RAW (không lọc ship/internal — khớp tổng KPI card) ──
async function fetchGroupBreakdown(startDate: string, endDate: string): Promise<Record<string, number>> {
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const rows = await queryAnalytics<{ grp: string; revenue: string }>(
    `SELECT CASE
              WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN 'B2B'
              WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN 'B2C'
              ELSE 'Internal/Misc'
            END as grp,
            SUM(f.${source.revenueCol}) as revenue
     FROM ${source.mainTable} f
     LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     WHERE ${filter}
     GROUP BY 1`
  )
  const map: Record<string, number> = { B2B: 0, B2C: 0, "Internal/Misc": 0 }
  rows.forEach(r => { map[r.grp] = parseFloat(r.revenue || "0") })
  return map
}

// ── §2 per-channel MoM (pro-rata tháng này vs actual tháng trước) — B2B hoặc B2C ──
async function fetchChannelMoM(
  group: "B2B" | "B2C",
  monthStart: string, cutoffDate: string,
  prevMonthStart: string, prevMonthEnd: string,
  projFactor: number,
  excludedCustomers: string[],
): Promise<ChannelMoM[]> {
  const sfx = `${shipFilter(false)} ${internalOpsFilterByCode(false)} ${excludeOpsByCode(excludedCustomers)} ${excludeInactiveCustomers()}`
  const mtdFilter  = getDateFilter(monthStart, cutoffDate, source.dateCol)
  const prevFilter = getDateFilter(prevMonthStart, prevMonthEnd, source.dateCol)

  const query = (filter: string) => queryAnalytics<{ channel: string; revenue: string }>(
    `SELECT TRIM(s.channel_name) as channel, SUM(f.${source.revenueCol}) as revenue
     FROM ${source.mainTable} f
     LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     WHERE UPPER(COALESCE(s.group_name,'')) = '${group}' AND ${filter} ${sfx}
     GROUP BY 1
     HAVING SUM(f.${source.revenueCol}) != 0`
  )

  const [mtdRows, prevRows] = await Promise.all([query(mtdFilter), query(prevFilter)])
  const mtdMap  = new Map(mtdRows.map(r => [r.channel, parseFloat(r.revenue || "0")]))
  const prevMap = new Map(prevRows.map(r => [r.channel, parseFloat(r.revenue || "0")]))
  const allChannels = new Set([...mtdMap.keys(), ...prevMap.keys()])

  const out: ChannelMoM[] = []
  allChannels.forEach(channel => {
    if (!channel) return
    const mtdActual = mtdMap.get(channel) || 0
    const prevMonthActual = prevMap.get(channel) || 0
    const prorata = mtdActual * projFactor
    out.push({ channel, mtdActual, prevMonthActual, prorata, pctMoM: pctChange(prorata, prevMonthActual) })
  })
  return out.sort((a, b) => b.prorata - a.prorata)
}

function sumB2B(g: BODGroup[]): GroupTotals {
  const rows = g.filter(r => r.group.startsWith("B2B"))
  const revenue = rows.reduce((s, r) => s + r.revenue, 0)
  const margin  = rows.reduce((s, r) => s + r.margin, 0)
  const gpm2    = rows.reduce((s, r) => s + r.gpm2, 0)
  return { revenue, margin, gpm2, margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0 }
}
function findB2C(g: BODGroup[]): GroupTotals {
  const row = g.find(r => r.group === "B2C")
  return row
    ? { revenue: row.revenue, margin: row.margin, gpm2: row.gpm2, margin_percent: row.margin_percent, gpm2_percent: row.gpm2_percent }
    : { revenue: 0, margin: 0, gpm2: 0, margin_percent: 0, gpm2_percent: 0 }
}

// ── §5 3HK Contribution ──
async function fetchHk3Totals(startDate: string, endDate: string) {
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const rows = await queryAnalytics<{ revenue: string; orders: string; units: string; margin: string }>(
    `SELECT SUM(f.${source.revenueCol}) as revenue, COUNT(DISTINCT f.order_code) as orders,
            SUM(f.${source.quantityCol}) as units, SUM(f.${source.marginCol}) as margin
     FROM ${source.mainTable} f
     WHERE ${filter}
       AND f.sku IN (SELECT sku FROM dim_sku WHERE REPLACE(UPPER(vendor),' ','') = '3HKDATAPOOL')`
  )
  const r = rows[0]
  const revenue = parseFloat(r?.revenue || "0")
  const orders  = parseInt(r?.orders || "0", 10)
  return {
    revenue, orders,
    units: parseInt(r?.units || "0", 10),
    margin: parseFloat(r?.margin || "0"),
    aov: orders === 0 ? 0 : revenue / orders,
  }
}

export async function buildWeeklyReportData(): Promise<WeeklyReportData> {
  const periods = getReportPeriods()
  const { monthStart, cutoffDate, prevMonthStart, prevMonthEnd, lastWeekStart, lastWeekEnd, prevWeekStart, prevWeekEnd } = periods
  const projFactor = getProjectionFactor(monthStart, cutoffDate)

  const { excludedCustomers } = await fetchQuarterlySettings()

  // "Overall tháng" card so với cửa sổ liền trước cùng độ dài ngày (giống getPrevDateFilter mặc định của kpis route).
  const mtdDays = daysBetweenStr(monthStart, cutoffDate)
  const monthKpiPrevEnd = addDaysStr(monthStart, -1)
  const monthKpiPrevStart = addDaysStr(monthKpiPrevEnd, -(mtdDays - 1))

  const [
    weekKpi, monthKpi,
    weekGroupCur, weekGroupPrev,
    mtdBod, prevMonthBod,
    b2bChannels, b2cChannels,
    totalMtd, totalPrevMonth,
    hk3Mtd, hk3PrevMonth,
  ] = await Promise.all([
    fetchKpiCard(lastWeekStart, lastWeekEnd, prevWeekStart, prevWeekEnd),
    fetchKpiCard(monthStart, cutoffDate, monthKpiPrevStart, monthKpiPrevEnd),
    fetchGroupBreakdown(lastWeekStart, lastWeekEnd),
    fetchGroupBreakdown(prevWeekStart, prevWeekEnd),
    fetchBODGroupMarginData(monthStart, cutoffDate, "fulfiled_date", "", false, false),
    fetchBODGroupMarginData(prevMonthStart, prevMonthEnd, "fulfiled_date", "", false, false),
    fetchChannelMoM("B2B", monthStart, cutoffDate, prevMonthStart, prevMonthEnd, projFactor, excludedCustomers),
    fetchChannelMoM("B2C", monthStart, cutoffDate, prevMonthStart, prevMonthEnd, projFactor, excludedCustomers),
    fetchKpiTotals(monthStart, cutoffDate),
    fetchKpiTotals(prevMonthStart, prevMonthEnd),
    fetchHk3Totals(monthStart, cutoffDate),
    fetchHk3Totals(prevMonthStart, prevMonthEnd),
  ])

  const weeklyWowRows = ["B2B", "B2C", "Internal/Misc"].map(label => ({
    label, cur: weekGroupCur[label] || 0, prev: weekGroupPrev[label] || 0,
    pct: pctChange(weekGroupCur[label] || 0, weekGroupPrev[label] || 0),
  }))
  const totalCur  = weeklyWowRows.reduce((s, r) => s + r.cur, 0)
  const totalPrev = weeklyWowRows.reduce((s, r) => s + r.prev, 0)

  const b2bMtd = sumB2B(mtdBod.groups)
  const b2bPrevMonth = sumB2B(prevMonthBod.groups)
  const b2cMtd = findB2C(mtdBod.groups)
  const b2cPrevMonth = findB2C(prevMonthBod.groups)

  const projectG = (g: GroupTotals): GroupTotals => ({
    revenue: g.revenue * projFactor, margin: g.margin * projFactor, gpm2: g.gpm2 * projFactor,
    margin_percent: g.margin_percent, gpm2_percent: g.gpm2_percent, // % không đổi khi scale đều
  })
  const b2bProrata = projectG(b2bMtd)
  const b2cProrata = projectG(b2cMtd)
  const totalMtdRev = b2bMtd.revenue + b2cMtd.revenue
  const totalPrevMonthRev = b2bPrevMonth.revenue + b2cPrevMonth.revenue
  const totalMargin = b2bMtd.margin + b2cMtd.margin
  const totalGpm2 = b2bMtd.gpm2 + b2cMtd.gpm2

  return {
    periods, projFactor, weekKpi, monthKpi,
    weeklyWow: { rows: weeklyWowRows, totalCur, totalPrev, totalPct: pctChange(totalCur, totalPrev) },
    monthVsPrev: {
      b2b: { ...b2bMtd, prevMonthActual: b2bPrevMonth.revenue },
      b2c: { ...b2cMtd, prevMonthActual: b2cPrevMonth.revenue },
      total: {
        revenue: totalMtdRev, margin: totalMargin, gpm2: totalGpm2,
        margin_percent: totalMtdRev > 0 ? (totalMargin / totalMtdRev) * 100 : 0,
        gpm2_percent: totalMtdRev > 0 ? (totalGpm2 / totalMtdRev) * 100 : 0,
        prevMonthActual: totalPrevMonthRev,
      },
    },
    b2bChannels, b2cChannels,
    b2bGpCm1: {
      gp: b2bMtd.margin, cm1: b2bMtd.gpm2,
      gpProrata: b2bProrata.margin, cm1Prorata: b2bProrata.gpm2, cm1ProrataPct: b2bProrata.gpm2_percent,
      gpPrevMonth: b2bPrevMonth.margin, cm1PrevMonth: b2bPrevMonth.gpm2,
    },
    b2cGpCm1: {
      gp: b2cMtd.margin, cm1: b2cMtd.gpm2,
      gpProrata: b2cProrata.margin, cm1Prorata: b2cProrata.gpm2, cm1ProrataPct: b2cProrata.gpm2_percent,
      gpPrevMonth: b2cPrevMonth.margin, cm1PrevMonth: b2cPrevMonth.gpm2,
    },
    hk3: {
      revenueMtd: hk3Mtd.revenue, revenueProrata: hk3Mtd.revenue * projFactor, revenuePrevMonth: hk3PrevMonth.revenue,
      pctVsPrevMonth: pctChange(hk3Mtd.revenue * projFactor, hk3PrevMonth.revenue),
      pctContributionOfProrataTotal: totalMtd.revenue * projFactor > 0 ? ((hk3Mtd.revenue * projFactor) / (totalMtd.revenue * projFactor)) * 100 : 0,
      ordersMtd: hk3Mtd.orders, unitsMtd: hk3Mtd.units, aovMtd: hk3Mtd.aov, grossMarginMtd: hk3Mtd.margin,
      ordersProrata: hk3Mtd.orders * projFactor, unitsProrata: hk3Mtd.units * projFactor, grossMarginProrata: hk3Mtd.margin * projFactor,
    },
  }
}
