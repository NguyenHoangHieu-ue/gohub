"use client"

import React, { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, Filter, Calendar, RefreshCw, TrendingUp, Target, ChevronDown, Shield, Building2, BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, formatCompactNumber, formatTruncatedString } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"

const QuarterlyReport = dynamic(() => import("@/components/quarterly-report"), { ssr: false })

// Port "y hệt" gohub-intel DashboardHome. Backend: kpis/revenue-chart/region-chart/performance-source/
// performance-channel/recent-orders/targets-summary + b2b/strategic-performance + config/partner-tiers.
// Adapt: "use client"; cn @/lib/utils; inline getDefaultDateRange/formatDateToISO.

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
  if (today.getDate() <= 7) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0)
    return { startDate: fmt(start), endDate: fmt(end) }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}
const formatDateToISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`

interface KPI { label: string; value: number; lastPeriod: number; change: number; isPositive: boolean; isCurrency?: boolean }
interface ChartData { name: string; b2b: number; b2c: number }
interface RegionData { region: string; revenue: number }
interface PerformanceRow { group: string; business_group?: string; totalOrder: number; unitSold: number; grossRevenue: number; target: number; mom: number }
interface RecentOrder { id: string; customer_name: string; region: string; amount: number; status: string; created_at: string }

export default function DashboardHome() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [prevMonthKpis, setPrevMonthKpis] = useState<KPI[]>([])
  const [revenueData, setRevenueData] = useState<ChartData[]>([])
  const [regionData, setRegionData] = useState<RegionData[]>([])
  const [performanceSource, setPerformanceSource] = useState<PerformanceRow[]>([])
  const [performanceChannel, setPerformanceChannel] = useState<PerformanceRow[]>([])
  const [strategicPerformance, setStrategicPerformance] = useState<any[]>([])
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [targetProgress, setTargetProgress] = useState<{ totalTarget: number; proRataTarget: number; totalActual: number; progress: number; proRataProgress: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthlyKpis, setMonthlyKpis] = useState<{ summary: any[]; channels: any[] } | null>(null)

  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [companyCode, setCompanyCode] = useState<string>("ALL")
  const [showFilters, setShowFilters] = useState(false)
  const [showQuarterly, setShowQuarterly] = useState(false)

  const getProjectionInfo = () => {
    if (kpis.length < 4 || !startDate || !endDate) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const start = new Date(startDate); const end = new Date(endDate)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    const targetDays = isCurrentMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : daysElapsed
    const factor = targetDays / daysElapsed
    if (factor <= 1) return null

    const revenue = kpis[0]?.value || 0
    const orders = kpis[1]?.value || 0
    const units = kpis[3]?.value || 0
    const revenueLast = prevMonthKpis.length > 0 ? (prevMonthKpis[0]?.value || 0) : (kpis[0]?.lastPeriod || 0)
    const ordersLast = prevMonthKpis.length > 0 ? (prevMonthKpis[1]?.value || 0) : (kpis[1]?.lastPeriod || 0)
    const aovLast = prevMonthKpis.length > 0 ? (prevMonthKpis[2]?.value || 0) : (kpis[2]?.lastPeriod || 0)
    const unitsLast = prevMonthKpis.length > 0 ? (prevMonthKpis[3]?.value || 0) : (kpis[3]?.lastPeriod || 0)

    const projectedRevenue = revenue * factor
    const projectedOrders = orders * factor
    const projectedUnits = units * factor
    const projectedAOV = projectedOrders === 0 ? 0 : projectedRevenue / projectedOrders

    const revenueChange = revenueLast === 0 ? 0 : ((projectedRevenue - revenueLast) / revenueLast) * 100
    const ordersChange = ordersLast === 0 ? 0 : ((projectedOrders - ordersLast) / ordersLast) * 100
    const aovChange = aovLast === 0 ? 0 : ((projectedAOV - aovLast) / aovLast) * 100
    const unitsChange = unitsLast === 0 ? 0 : ((projectedUnits - unitsLast) / unitsLast) * 100

    return { factor, daysElapsed, totalDays: targetDays, revenue: projectedRevenue, orders: projectedOrders, units: projectedUnits, aov: projectedAOV, revenueChange, ordersChange, aovChange, unitsChange }
  }

  const projection = getProjectionInfo()

  useEffect(() => { fetchData() }, [dateColumn, companyCode]) // eslint-disable-line react-hooks/exhaustive-deps — ngày chỉ áp khi bấm "Lọc"

  const fetchData = async () => {
    setIsLoading(true); setError(null)
    try {
      const queryParams = `?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&companyCode=${companyCode}`
      const fetchJson = async (url: string, name: string) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText}`)
        return res.json().catch((e: any) => { throw new Error(`${name} JSON error: ${e.message}`) })
      }

      const [kpiData, revData, regData, perfSrcData, perfChanData, recentData, targetData, tiersData, strategicPerfData, monthlyData] = await Promise.all([
        fetchJson(`/api/analytics/kpis${queryParams}`, "KPIs"),
        fetchJson(`/api/analytics/revenue-chart${queryParams}`, "Revenue"),
        fetchJson(`/api/analytics/region-chart${queryParams}`, "Region"),
        fetchJson(`/api/analytics/performance-source${queryParams}`, "Perf Source"),
        fetchJson(`/api/analytics/performance-channel${queryParams}`, "Perf Channel"),
        fetchJson(`/api/analytics/recent-orders`, "Recent Orders"),
        fetchJson(`/api/analytics/targets-summary${queryParams}`, "Targets"),
        fetchJson(`/api/config/partner-tiers`, "Tiers"),
        fetchJson(`/api/analytics/b2b/strategic-performance${queryParams}`, "Strategic"),
        fetchJson(`/api/analytics/monthly-kpis?companyCode=${companyCode}&dateColumn=${dateColumn}`, "Monthly").catch(() => null),
      ])

      setKpis(kpiData)
      setRevenueData(revData)
      setRegionData(regData)
      setPerformanceSource(perfSrcData)
      setPerformanceChannel(perfChanData)
      setRecentOrders(recentData)
      setTargetProgress(targetData)
      setPartnerTiers(tiersData)
      setStrategicPerformance(strategicPerfData)
      if (monthlyData) setMonthlyKpis(monthlyData)

      try {
        const date = new Date(startDate)
        const prevMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0)
        const prevMonthFirstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1)
        const prevMonthKpiRes = await fetch(`/api/analytics/kpis?startDate=${formatDateToISO(prevMonthFirstDay)}&endDate=${formatDateToISO(prevMonthLastDay)}&dateColumn=${dateColumn}`)
        if (prevMonthKpiRes.ok) setPrevMonthKpis(await prevMonthKpiRes.json())
      } catch (e) { console.error("Error fetching prev month KPIs:", e) }
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err)
      setError(`Failed to fetch dashboard data: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const Skeleton = ({ className }: { className?: string }) => (<div className={cn("animate-pulse bg-slate-200 rounded", className)} />)

  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const toggleGroup = (group: string) => setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group])

  const getPartnerTier = (name: string) => {
    for (const [tier, partners] of Object.entries(partnerTiers)) {
      if (partners.some(p => name.toLowerCase().includes(p.toLowerCase()))) return tier
    }
    return null
  }

  const processedPerformanceChannel: (PerformanceRow & { tier?: string })[] = [
    ...strategicPerformance.map(item => ({
      group: item.name, totalOrder: item.orders || 0, unitSold: item.units, grossRevenue: item.revenue,
      mom: item.mom || 0, target: 0, business_group: "B2B-Strategic", tier: item.tier || getPartnerTier(item.name) || "Strategic",
    })),
    ...performanceChannel.map(item => {
      let adjustedRevenue = item.grossRevenue, adjustedUnits = item.unitSold, adjustedOrders = item.totalOrder
      strategicPerformance.forEach(s => {
        if (s.channel_contributions && s.channel_contributions[item.group]) {
          const contrib = s.channel_contributions[item.group]
          adjustedRevenue -= (contrib.revenue || 0); adjustedUnits -= (contrib.units || 0); adjustedOrders -= (contrib.orders || 0)
        }
      })
      if (adjustedRevenue < 1000 && item.business_group?.startsWith("B2B")) return null
      return { ...item, grossRevenue: adjustedRevenue, unitSold: adjustedUnits, totalOrder: adjustedOrders, business_group: item.business_group?.startsWith("B2B") ? "B2B-Non-Strategic" : item.business_group }
    }).filter(Boolean) as PerformanceRow[],
  ]

  const b2bRows = performanceSource.filter(r => r.group?.startsWith("B2B"))
  const b2bTotalSourceOfTruth = b2bRows.length > 0
    ? b2bRows.reduce((acc, curr) => {
        const nextRev = acc.grossRevenue + curr.grossRevenue
        return { totalOrder: acc.totalOrder + curr.totalOrder, unitSold: acc.unitSold + curr.unitSold, grossRevenue: nextRev, mom: nextRev > 0 ? ((acc.mom * acc.grossRevenue) + (curr.mom * curr.grossRevenue)) / nextRev : 0 }
      }, { totalOrder: 0, unitSold: 0, grossRevenue: 0, mom: 0 })
    : { totalOrder: 0, unitSold: 0, grossRevenue: 0, mom: 0 }

  const groupOrder = ["B2B-Strategic", "B2B-Non-Strategic", "B2C"]
  const groupedPerformanceChannel = groupOrder.map(group => {
    let items = processedPerformanceChannel.filter(item => (item.business_group || "Other") === group)
    if (group === "B2B-Non-Strategic" && items.length > 10) {
      items.sort((a, b) => b.grossRevenue - a.grossRevenue)
      const top10 = items.slice(0, 10)
      const other = items.slice(10)
      const totalOtherRevenue = other.reduce((s, i) => s + i.grossRevenue, 0)
      const otherAggregated: PerformanceRow = {
        group: `Other Partners (${other.length} aggregated)`, totalOrder: other.reduce((s, i) => s + i.totalOrder, 0),
        unitSold: other.reduce((s, i) => s + i.unitSold, 0), grossRevenue: totalOtherRevenue,
        mom: totalOtherRevenue > 0 ? other.reduce((s, i) => s + (i.mom || 0) * i.grossRevenue, 0) / totalOtherRevenue : 0,
        target: 0, business_group: "B2B-Non-Strategic",
      }
      items = [...top10, otherAggregated]
    } else {
      items.sort((a, b) => b.grossRevenue - a.grossRevenue)
    }
    return { group, items }
  }).filter(g => g.items.length > 0)

  const businessGroups = ["B2B", "B2C"]
  const processedPerformanceSource = businessGroups.map(group => {
    const isB2B = group === "B2B"
    if (isB2B) {
      const stratItems = processedPerformanceChannel.filter(item => item.business_group === "B2B-Strategic")
      const stratRev = stratItems.reduce((sum, item) => sum + item.grossRevenue, 0)
      const stratOrders = stratItems.reduce((sum, item) => sum + item.totalOrder, 0)
      const stratUnits = stratItems.reduce((sum, item) => sum + item.unitSold, 0)
      const nonStratRev = Math.max(0, b2bTotalSourceOfTruth.grossRevenue - stratRev)
      const nonStratOrders = Math.max(0, b2bTotalSourceOfTruth.totalOrder - stratOrders)
      const nonStratUnits = Math.max(0, b2bTotalSourceOfTruth.unitSold - stratUnits)
      return {
        group: "B2B", totalOrder: b2bTotalSourceOfTruth.totalOrder, unitSold: b2bTotalSourceOfTruth.unitSold,
        grossRevenue: b2bTotalSourceOfTruth.grossRevenue, target: 0, mom: b2bTotalSourceOfTruth.mom,
        subRows: [
          { group: "Strategic Partners", totalOrder: stratOrders, unitSold: stratUnits, grossRevenue: stratRev, mom: 0 },
          { group: "Other Partners", totalOrder: nonStratOrders, unitSold: nonStratUnits, grossRevenue: nonStratRev, mom: 0 },
        ],
      }
    }
    const b2cRow = performanceSource.find(r => r.group === "B2C")
    if (!b2cRow) return null
    return { ...b2cRow, subRows: [] }
  }).filter(Boolean) as (PerformanceRow & { subRows: PerformanceRow[] })[]

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl lg:text-2xl shrink-0">G</div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Monthly Performance</h1>
            <p className="text-xs lg:text-sm text-slate-500">Gohub Business Intelligence</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm shrink-0 h-[42px] items-center">
            <button onClick={() => setDateColumn("fulfiled_date")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all h-full flex items-center", dateColumn === "fulfiled_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>Fulfillment</button>
            <button onClick={() => setDateColumn("created_date")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all h-full flex items-center", dateColumn === "created_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>Created</button>
          </div>
          <div className="flex-1 sm:flex-none flex items-center gap-2 bg-white px-3 lg:px-4 py-2 rounded-lg border border-slate-200 shadow-sm h-[42px]">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs lg:text-sm font-medium whitespace-nowrap">{startDate && endDate ? `${startDate} - ${endDate}` : "Select Date Range"}</span>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg border shadow-sm transition-colors", showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />
            <span className="text-xs lg:text-sm font-medium">Filters</span>
          </button>
          <button onClick={() => setShowQuarterly(true)} className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg border shadow-sm transition-colors bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 h-[42px]">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span className="text-xs lg:text-sm font-medium whitespace-nowrap">Báo cáo Quý</span>
          </button>
        </div>
      </div>

      {/* Market segment tabs — lọc toàn Dashboard theo thị trường (companyCode) */}
      <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm w-full sm:w-fit">
        {([{ code: "ALL", label: "All" }, { code: "VN", label: "VN" }, { code: "US", label: "US" }] as const).map(t => (
          <button
            key={t.code}
            onClick={() => setCompanyCode(t.code)}
            className={cn(
              "flex-1 sm:flex-none px-8 py-2 text-sm font-semibold rounded-md transition-all",
              companyCode === t.code ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} className="sm:self-end" />
          <button onClick={() => fetchData()} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95 sm:self-end">Lọc</button>
          <div className="flex items-center justify-between sm:justify-start gap-4">
            <button onClick={() => {
              const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
              setStartDate(formatDateToISO(new Date(today.getFullYear(), today.getMonth(), 1))); setEndDate(formatDateToISO(yesterday))
            }} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Reset</button>
            <div className="flex items-center gap-2 text-xs text-slate-400 italic">
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />{isLoading ? "Updating..." : "Updated"}
            </div>
          </div>
        </div>
      )}

      {error && (<div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>)}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" />
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-12 rounded-full" /></div>
            </div>
          ))
        ) : (
          kpis.map(kpi => (
            <div key={kpi.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-1">{kpi.label}</p>
              <div className="flex items-baseline gap-2"><h2 className="text-2xl font-bold text-slate-900">{kpi.isCurrency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}</h2></div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[10px] text-slate-400">Last period: <span className="font-medium text-slate-600">{kpi.isCurrency ? formatCurrency(kpi.lastPeriod) : formatNumber(kpi.lastPeriod)}</span></div>
                <div className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", kpi.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                  {kpi.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{(kpi.change || 0).toFixed(1)}%
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Target Progress Section */}
      {targetProgress && targetProgress.totalTarget > 0 && !isLoading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Target className="w-5 h-5 text-blue-600" />Target Progress Tracking</h3>
              <p className="text-sm text-slate-500">Comparing actual revenue vs. planned targets for the selected period.</p>
            </div>
            <div className="flex flex-wrap gap-8">
              <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actual Revenue</p><p className="text-xl font-bold text-slate-900">{formatCurrency(targetProgress.totalActual)}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Target</p><p className="text-xl font-bold text-slate-700">{formatCurrency(targetProgress.totalTarget)}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projected Revenue</p><p className="text-xl font-bold text-blue-600">{projection ? formatCurrency(projection.revenue) : formatCurrency(targetProgress.proRataTarget)}</p></div>
            </div>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-end"><span className="text-sm font-bold text-slate-700">Overall Progress</span><span className="text-sm font-bold text-slate-900">{targetProgress.progress.toFixed(1)}%</span></div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={cn("h-full transition-all duration-1000 ease-out", targetProgress.progress >= 100 ? "bg-emerald-500" : targetProgress.progress >= 70 ? "bg-blue-500" : targetProgress.progress >= 40 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${Math.min(100, targetProgress.progress)}%` }} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2"><span className="text-sm font-bold text-blue-700">Projection Progress</span><span className="text-[10px] text-slate-400 font-normal">(Projected vs. Total Target)</span></div>
                <span className="text-sm font-bold text-blue-900">{targetProgress.proRataProgress.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-blue-50 rounded-full overflow-hidden"><div className={cn("h-full transition-all duration-1000 ease-out", targetProgress.proRataProgress >= 100 ? "bg-emerald-500" : targetProgress.proRataProgress >= 90 ? "bg-blue-600" : targetProgress.proRataProgress >= 75 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${Math.min(100, targetProgress.proRataProgress)}%` }} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Pro-rata Projection */}
      {projection && !isLoading && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><TrendingUp className="w-5 h-5" />Month-End Projection (Pro-rata)</h3>
              <p className="text-sm text-blue-600">Based on <strong>{projection.daysElapsed} days</strong> of performance, projected for <strong>{projection.totalDays} total days</strong>.</p>
            </div>
            <div className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-900/20">{((projection.factor - 1) * 100).toFixed(0)}% Growth Expected</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: "Projected Revenue", val: formatCompactNumber(projection.revenue), chg: projection.revenueChange },
              { label: "Projected Orders", val: Math.round(projection.orders).toLocaleString(), chg: projection.ordersChange },
              { label: "Projected AOV", val: formatCurrency(projection.aov), chg: projection.aovChange },
              { label: "Projected Units", val: Math.round(projection.units).toLocaleString(), chg: projection.unitsChange },
            ]).map(c => (
              <div key={c.label} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{c.label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{c.val}</p>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full", c.chg >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    {c.chg >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{Math.abs(c.chg).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Charts Row */}
      <div className="flex flex-col gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Monthly Gross Revenue by Sources</h3>
            {!isLoading && (
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-blue-600"></span> B2B Strategic</span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-blue-300"></span> B2B Non-Strategic</span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-indigo-800"></span> B2C</span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Other</span>
              </div>
            )}
          </div>
          <div className="h-[350px]">
            {isLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => formatCompactNumber(value)} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatCurrency(value), "Revenue"]} />
                  <Line type="monotone" dataKey="b2b_strategic" name="B2B Strategic" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="b2b_non_strategic" name="B2B Non-Strategic" stroke="#93c5fd" strokeWidth={3} dot={{ r: 4, fill: "#93c5fd", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="b2c" name="B2C" stroke="#312e81" strokeWidth={3} dot={{ r: 4, fill: "#312e81", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="other" name="Other" stroke="#94a3b8" strokeWidth={3} dot={{ r: 4, fill: "#94a3b8", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 mb-6 font-sans">Top Destinations by Gross Revenue</h3>
          <div className="h-[500px]">
            {isLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionData} layout="vertical" margin={{ left: 30, right: 40, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="region" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} width={180} interval={0} tickFormatter={(value) => formatTruncatedString(value, 20)} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [formatCurrency(value), "Revenue"]} labelFormatter={(label) => <span className="font-bold text-slate-800">{label}</span>} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={32}>
                    {regionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={index === 0 ? "#3b82f6" : "#94a3b8"} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Metrics Table — metrics × months (Revenue / GP / CM1 / CM1% / 3HK / %3HK) */}
      {monthlyKpis && monthlyKpis.summary.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Monthly Performance Summary</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />prorata = dự phóng nguyên tháng
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider w-36">Metric</th>
                  {monthlyKpis.summary.map(m => (
                    <th key={m.month} className="px-4 py-2.5 text-right font-bold text-slate-600 whitespace-nowrap">
                      <span>{m.label}/{m.year}</span>
                      {m.isProjected && <span className="ml-1 text-[9px] text-blue-500 font-bold">(×{m.factor})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { key: "revenue",     label: "Revenue",        fmt: (v: number) => formatCompactNumber(v), cls: "font-bold text-slate-900" },
                  { key: "grossMargin", label: "Gross Profit",   fmt: (v: number) => formatCompactNumber(v), cls: "text-emerald-700" },
                  { key: "cm1",         label: "CM1",            fmt: (v: number) => formatCompactNumber(v), cls: "text-indigo-700 font-bold" },
                  { key: "cm1Pct",      label: "CM1 %",          fmt: (v: number) => `${v.toFixed(1)}%`,     cls: "text-indigo-600" },
                  { key: "hk3Revenue",  label: "3HK Revenue",    fmt: (v: number) => formatCompactNumber(v), cls: "text-amber-700" },
                  { key: "hk3Pct",      label: "3HK %",          fmt: (v: number) => `${v.toFixed(1)}%`,     cls: "text-amber-600" },
                ].map(row => (
                  <tr key={row.key} className="hover:bg-slate-50/40">
                    <td className="px-4 py-2.5 font-semibold text-slate-600">{row.label}</td>
                    {monthlyKpis.summary.map(m => {
                      const val = m[row.key] as number
                      const prev = monthlyKpis.summary[monthlyKpis.summary.indexOf(m) - 1]?.[row.key] as number | undefined
                      const trend = prev != null && prev > 0 ? (val - prev) / prev : null
                      return (
                        <td key={m.month} className={cn("px-4 py-2.5 text-right", row.cls, m.isProjected && "bg-blue-50/30")}>
                          <span>{row.fmt(val)}</span>
                          {trend !== null && (
                            <span className={cn("ml-1.5 text-[9px] font-bold", trend >= 0 ? "text-emerald-500" : "text-rose-500")}>
                              {trend >= 0 ? "▲" : "▼"}{Math.abs(trend * 100).toFixed(0)}%
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {/* Strategic channels breakdown */}
                {monthlyKpis.channels.length > 0 && (
                  <>
                    <tr className="bg-slate-50">
                      <td colSpan={monthlyKpis.summary.length + 1} className="px-4 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Strategic Channels</td>
                    </tr>
                    {monthlyKpis.channels.map(ch => (
                      <tr key={ch.name} className="hover:bg-slate-50/40">
                        <td className="px-4 py-2 text-slate-600 pl-6">{ch.name}</td>
                        {ch.months.map((mData: any) => (
                          <td key={mData.month} className={cn("px-4 py-2 text-right text-slate-500", monthlyKpis.summary.find(s => s.month === mData.month)?.isProjected && "bg-blue-50/30")}>
                            {formatCompactNumber(mData.revenue)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tables Row */}
      <div className="flex flex-col gap-6">
        {/* Performance by Business Groups */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Performance by Business Groups</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">B2B / B2C / Other</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3 text-right">Total Order</th>
                  <th className="px-4 py-3 text-right">Unit Sold</th>
                  <th className="px-4 py-3 text-right">Gross Revenue</th>
                  <th className="px-4 py-3 text-right">Doanh thu dự phóng</th>
                  <th className="px-4 py-3 text-right">%MoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3 text-right"><Skeleton className={cn("h-4", j === 0 ? "w-24" : "w-16 ml-auto")} /></td>)}</tr>
                  ))
                ) : (
                  processedPerformanceSource.map((row) => (
                    <React.Fragment key={row.group}>
                      <tr className={cn("hover:bg-slate-50 transition-colors cursor-pointer group", expandedGroups.includes(row.group) && "bg-slate-50")} onClick={() => row.group === "B2B" && toggleGroup("B2B")}>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          <div className="flex items-center gap-2">
                            {row.group === "B2B" && <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedGroups.includes("B2B") && "rotate-180")} />}
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", row.group === "B2B" ? "bg-blue-600 text-white" : row.group === "B2C" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500")}>{row.group}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.totalOrder)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.unitSold)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.grossRevenue)}</td>
                        <td className="px-4 py-3 text-right text-blue-600 font-bold">{projection ? formatCurrency(row.grossRevenue * projection.factor) : "-"}</td>
                        <td className={cn("px-4 py-3 text-right font-bold", row.mom >= 0 ? "text-emerald-600" : "text-rose-600")}>{row.mom > 0 ? "+" : ""}{(row.mom || 0).toFixed(1)}%</td>
                      </tr>
                      {row.group === "B2B" && expandedGroups.includes("B2B") && row.subRows.map((sub) => (
                        <tr key={sub.group} className="bg-slate-50/50 border-l-4 border-blue-200">
                          <td className="px-4 py-3 text-xs font-bold text-slate-500 pl-10">{sub.group}</td>
                          <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatNumber(sub.totalOrder)}</td>
                          <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatNumber(sub.unitSold)}</td>
                          <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatCurrency(sub.grossRevenue)}</td>
                          <td className="px-4 py-3 text-right text-blue-400 text-xs font-bold">{projection ? formatCurrency(sub.grossRevenue * projection.factor) : "-"}</td>
                          <td className={cn("px-4 py-3 text-right font-bold text-xs", sub.mom >= 0 ? "text-emerald-500" : "text-rose-500")}>{sub.mom > 0 ? "+" : ""}{(sub.mom || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance by Channels */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="perf-channels">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Performance by Channels</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Direct vs Affiliate</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3 text-right">Total Order</th>
                  <th className="px-4 py-3 text-right">Unit Sold</th>
                  <th className="px-4 py-3 text-right">Gross Revenue</th>
                  <th className="px-4 py-3 text-right">Doanh thu dự phóng</th>
                  <th className="px-4 py-3 text-right">%MoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  Array(2).fill(0).map((_, i) => (
                    <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3 text-right"><Skeleton className={cn("h-4", j === 0 ? "w-24" : "w-16 ml-auto")} /></td>)}</tr>
                  ))
                ) : (
                  groupedPerformanceChannel.map((groupData) => {
                    const groupTotalRev = groupData.items.reduce((sum, item) => sum + item.grossRevenue, 0)
                    const groupTotalOrders = groupData.items.reduce((sum, item) => sum + item.totalOrder, 0)
                    const groupTotalUnits = groupData.items.reduce((sum, item) => sum + item.unitSold, 0)
                    const displayGroupNames: Record<string, string> = { "B2B-Strategic": "Strategic Partners", "B2B-Non-Strategic": "Other Partners (Non-Strategic)", "B2C": "B2C Channels" }
                    return (
                      <React.Fragment key={groupData.group}>
                        <tr className={cn("group/header", groupData.group === "B2B-Strategic" ? "bg-indigo-50/50" : groupData.group === "B2B-Non-Strategic" ? "bg-slate-50" : "bg-slate-100/80")}>
                          <td colSpan={1} className="px-4 py-2 font-bold text-slate-800 text-[10px] uppercase tracking-widest">
                            <div className="flex items-center gap-2">
                              {groupData.group === "B2B-Strategic" && <Shield className="w-3.5 h-3.5 text-indigo-600" />}
                              {groupData.group === "B2B-Non-Strategic" && <Building2 className="w-3.5 h-3.5 text-slate-500" />}
                              {displayGroupNames[groupData.group] || groupData.group}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatNumber(groupTotalOrders)}</td>
                          <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatNumber(groupTotalUnits)}</td>
                          <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatCurrency(groupTotalRev)}</td>
                          <td className="px-4 py-2 text-right font-bold text-[10px] text-blue-600">{projection ? formatCurrency(groupTotalRev * projection.factor) : "-"}</td>
                          <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-400">SUBTOTAL</td>
                        </tr>
                        {groupData.items.map((row) => (
                          <tr key={`${groupData.group}-${row.group}`} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 font-medium text-slate-700 pl-8 border-l-2 border-transparent group-hover:border-blue-400">
                              <div className="flex flex-col">
                                <span className="text-sm">{row.group}</span>
                                {(row as any).tier && <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">{(row as any).tier}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.totalOrder)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.unitSold)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.grossRevenue)}</td>
                            <td className="px-4 py-3 text-right text-blue-600/70 font-medium">{projection ? formatCurrency(row.grossRevenue * projection.factor) : "-"}</td>
                            <td className={cn("px-4 py-3 text-right font-bold", row.mom >= 0 ? "text-emerald-600" : "text-rose-600")}>{row.mom > 0 ? "+" : ""}{(row.mom || 0).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <QuarterlyReport
        isOpen={showQuarterly}
        onClose={() => setShowQuarterly(false)}
        companyCode={companyCode}
        dateColumn={dateColumn}
      />
    </div>
  )
}
