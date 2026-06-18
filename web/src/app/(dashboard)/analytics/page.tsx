"use client"

import React, { useState, useEffect } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts"
import { ArrowUpRight, ArrowDownRight, Filter, Calendar, TrendingUp, Target, ChevronDown, Shield, Building2, RefreshCw } from "lucide-react"
import { formatCurrency, formatNumber, formatCompactNumber, getDefaultDateRange } from "@/lib/analytics-formatters"
import { cn } from "@/lib/utils"

// ─── helpers ───────────────────────────────────────────────────────────────

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
)

// ─── types ─────────────────────────────────────────────────────────────────

interface KPI { label: string; value: number; lastPeriod: number; change: number; isPositive: boolean; isCurrency?: boolean }
interface PerformanceRow { group: string; totalOrder: number; unitSold: number; grossRevenue: number; mom: number; target?: number; business_group?: string; tier?: string }
interface RecentOrder { id: string; region: string; amount: number; created_at: string }

// ─── main component ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [kpis, setKpis]                       = useState<KPI[]>([])
  const [prevMonthKpis, setPrevMonthKpis]     = useState<KPI[]>([])
  const [revenueData, setRevenueData]         = useState<any[]>([])
  const [regionData, setRegionData]           = useState<any[]>([])
  const [performanceSource, setPerformanceSource] = useState<PerformanceRow[]>([])
  const [performanceChannel, setPerformanceChannel] = useState<PerformanceRow[]>([])
  const [strategicPerformance, setStrategicPerformance] = useState<any[]>([])
  const [partnerTiers, setPartnerTiers]       = useState<Record<string, string[]>>({ Strategic: [] })
  const [recentOrders, setRecentOrders]       = useState<RecentOrder[]>([])
  const [targetProgress, setTargetProgress]   = useState<{ totalTarget: number; proRataTarget: number; totalActual: number; progress: number; proRataProgress: number } | null>(null)
  const [isLoading, setIsLoading]             = useState(true)
  const [error, setError]                     = useState<string | null>(null)

  const [startDate, setStartDate]   = useState(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate]       = useState(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [companyCode, setCompanyCode] = useState("ALL")
  const [showFilters, setShowFilters] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  const toggleGroup = (g: string) =>
    setExpandedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const getProjectionInfo = () => {
    if (kpis.length < 4 || !startDate || !endDate) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const end   = new Date(endDate)
    const start = new Date(startDate)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    const targetDays = isCurrentMonth
      ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      : daysElapsed
    const factor = targetDays / daysElapsed
    if (factor <= 1) return null

    const rev = kpis[0]?.value || 0
    const ord = kpis[1]?.value || 0
    const uni = kpis[3]?.value || 0
    const revL = prevMonthKpis.length > 0 ? prevMonthKpis[0]?.value || 0 : kpis[0]?.lastPeriod || 0
    const ordL = prevMonthKpis.length > 0 ? prevMonthKpis[1]?.value || 0 : kpis[1]?.lastPeriod || 0
    const uniL = prevMonthKpis.length > 0 ? prevMonthKpis[3]?.value || 0 : kpis[3]?.lastPeriod || 0
    const aovL = prevMonthKpis.length > 0 ? prevMonthKpis[2]?.value || 0 : kpis[2]?.lastPeriod || 0

    const pRev = rev * factor
    const pOrd = ord * factor
    const pUni = uni * factor
    const pAOV = pOrd === 0 ? 0 : pRev / pOrd
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    return {
      factor, daysElapsed, totalDays: targetDays,
      revenue: pRev, orders: pOrd, units: pUni, aov: pAOV,
      revenueChange: pct(pRev, revL),
      ordersChange:  pct(pOrd, ordL),
      aovChange:     pct(pAOV, aovL),
      unitsChange:   pct(pUni, uniL),
    }
  }

  const projection = getProjectionInfo()

  const fetchData = async () => {
    setIsLoading(true); setError(null)

    const q  = `?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&companyCode=${companyCode}`
    const fj = async (url: string) => {
      const r = await fetch(url, { cache: "default" })
      if (!r.ok) throw new Error(`${r.status}`)
      return r.json()
    }

    try {
      // ── Phase 1: KPI cards (show first, ~1s) ─────────────────────────────
      const [kpiData, tiersData] = await Promise.all([
        fj(`/api/analytics/kpis${q}`),
        fj(`/api/config/partner-tiers`),
      ])
      setKpis(kpiData)
      setPartnerTiers(tiersData)
      setIsLoading(false) // show KPI cards immediately

      // ── Phase 2: Charts + tables (load in background) ────────────────────
      const [revData, regData, perfSrc, perfChan, targetData] = await Promise.all([
        fj(`/api/analytics/revenue-chart${q}`),
        fj(`/api/analytics/region-chart${q}`),
        fj(`/api/analytics/performance-source${q}`),
        fj(`/api/analytics/performance-channel${q}`),
        fj(`/api/analytics/targets-summary?startDate=${startDate}&endDate=${endDate}`).catch(() => null),
      ])
      setRevenueData(revData)
      setRegionData(regData)
      setPerformanceSource(perfSrc)
      setPerformanceChannel(perfChan)
      if (targetData) setTargetProgress(targetData)

      // ── Phase 3: Secondary data (non-blocking) ────────────────────────────
      const [strategicData, recentData] = await Promise.all([
        fj(`/api/analytics/b2b/strategic-performance${q}`).catch(() => []),
        fj(`/api/analytics/recent-orders?companyCode=${companyCode}`).catch(() => []),
      ])
      setStrategicPerformance(strategicData)
      setRecentOrders(recentData)

      // prev month KPIs for projection (fire-and-forget)
      try {
        const d = new Date(startDate)
        const pm1 = new Date(d.getFullYear(), d.getMonth() - 1, 1)
        const pm  = new Date(d.getFullYear(), d.getMonth(), 0)
        const r = await fetch(`/api/analytics/kpis?startDate=${pm1.toISOString().split("T")[0]}&endDate=${pm.toISOString().split("T")[0]}&dateColumn=${dateColumn}`)
        if (r.ok) setPrevMonthKpis(await r.json())
      } catch {}
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [dateColumn])

  // ── processed channel data ───────────────────────────────────────────────

  const processedChannel: (PerformanceRow & { tier?: string })[] = [
    ...strategicPerformance.map(s => ({
      group: s.name, totalOrder: s.orders || 0, unitSold: s.units || 0,
      grossRevenue: s.revenue, mom: s.mom || 0, target: 0,
      business_group: "B2B-Strategic", tier: s.tier || "Strategic",
    })),
    ...performanceChannel.map(item => {
      let adjRev = item.grossRevenue, adjUnits = item.unitSold, adjOrd = item.totalOrder
      strategicPerformance.forEach(s => {
        if (s.channel_contributions?.[item.group]) {
          const c = s.channel_contributions[item.group]
          adjRev -= c.revenue || 0; adjUnits -= c.units || 0; adjOrd -= c.orders || 0
        }
      })
      if (adjRev < 1000 && item.business_group?.startsWith("B2B")) return null
      return {
        ...item, grossRevenue: adjRev, unitSold: adjUnits, totalOrder: adjOrd,
        business_group: item.business_group?.startsWith("B2B") ? "B2B-Non-Strategic" : item.business_group,
      }
    }).filter(Boolean) as PerformanceRow[],
  ]

  const b2bSourceOfTruth = performanceSource.filter(r => r.group?.startsWith("B2B"))
    .reduce((acc, cur) => ({ ...acc, totalOrder: acc.totalOrder + cur.totalOrder, unitSold: acc.unitSold + cur.unitSold, grossRevenue: acc.grossRevenue + cur.grossRevenue }), { totalOrder: 0, unitSold: 0, grossRevenue: 0 })

  const stratRev    = processedChannel.filter(r => r.business_group === "B2B-Strategic").reduce((s, r) => s + r.grossRevenue, 0)
  const stratOrders = processedChannel.filter(r => r.business_group === "B2B-Strategic").reduce((s, r) => s + r.totalOrder, 0)
  const stratUnits  = processedChannel.filter(r => r.business_group === "B2B-Strategic").reduce((s, r) => s + r.unitSold, 0)

  const processedSource = [
    {
      group: "B2B", totalOrder: b2bSourceOfTruth.totalOrder, unitSold: b2bSourceOfTruth.unitSold,
      grossRevenue: b2bSourceOfTruth.grossRevenue, mom: performanceSource.find(r => r.group === "B2B")?.mom || 0,
      subRows: [
        { group: "Strategic Partners",  totalOrder: stratOrders, unitSold: stratUnits, grossRevenue: stratRev, mom: 0 },
        { group: "Other Partners", totalOrder: b2bSourceOfTruth.totalOrder - stratOrders, unitSold: b2bSourceOfTruth.unitSold - stratUnits, grossRevenue: Math.max(0, b2bSourceOfTruth.grossRevenue - stratRev), mom: 0 },
      ],
    },
    ...(performanceSource.find(r => r.group === "B2C") ? [{ ...performanceSource.find(r => r.group === "B2C")!, subRows: [] }] : []),
  ]

  const groupOrder = ["B2B-Strategic", "B2B-Non-Strategic", "B2C"]
  const groupedChannel = groupOrder.map(grp => {
    let items = processedChannel.filter(r => r.business_group === grp)
    if (grp === "B2B-Non-Strategic" && items.length > 10) {
      items.sort((a, b) => b.grossRevenue - a.grossRevenue)
      const other = items.slice(10)
      items = [
        ...items.slice(0, 10),
        { group: `Other Partners (${other.length})`, totalOrder: other.reduce((s, r) => s + r.totalOrder, 0), unitSold: other.reduce((s, r) => s + r.unitSold, 0), grossRevenue: other.reduce((s, r) => s + r.grossRevenue, 0), mom: 0, business_group: grp },
      ]
    } else {
      items.sort((a, b) => b.grossRevenue - a.grossRevenue)
    }
    return { group: grp, items }
  }).filter(g => g.items.length > 0)

  const displayGroupNames: Record<string, string> = {
    "B2B-Strategic":     "Strategic Partners",
    "B2B-Non-Strategic": "Other Partners (Non-Strategic)",
    "B2C":               "B2C Channels",
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">G</div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Monthly Performance</h1>
            <p className="text-sm text-slate-500">Gohub Business Intelligence</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
          {/* Date column toggle */}
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[42px] items-center">
            {(["fulfiled_date", "created_date"] as const).map(col => (
              <button key={col} onClick={() => setDateColumn(col)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all h-full flex items-center",
                  dateColumn === col ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                )}>
                {col === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm h-[42px]">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium whitespace-nowrap">{startDate} - {endDate}</span>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg border shadow-sm transition-colors",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}>
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters</span>
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Company</label>
            <select value={companyCode} onChange={e => setCompanyCode(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ALL">All Companies</option>
              <option value="VN">VN</option>
              <option value="US">US</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { const r = getDefaultDateRange(); setStartDate(r.startDate); setEndDate(r.endDate) }}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Reset</button>
            <button onClick={() => { fetchData(); setShowFilters(false) }}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200">
              Apply
            </button>
            {isLoading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" />
            <div className="pt-4 border-t border-slate-100 flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-12 rounded-full" /></div>
          </div>
        )) : kpis.map(kpi => (
          <div key={kpi.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-1">{kpi.label}</p>
            <h2 className="text-2xl font-bold text-slate-900">
              {kpi.isCurrency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}
            </h2>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-[10px] text-slate-400">
                Last period: <span className="font-medium text-slate-600">
                  {kpi.isCurrency ? formatCurrency(kpi.lastPeriod) : formatNumber(kpi.lastPeriod)}
                </span>
              </div>
              <div className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                kpi.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                {kpi.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {(kpi.change || 0).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Target Progress */}
      {targetProgress && targetProgress.totalTarget > 0 && !isLoading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" /> Target Progress
              </h3>
            </div>
            <div className="flex flex-wrap gap-8">
              {[
                { label: "Actual Revenue",    val: targetProgress.totalActual },
                { label: "Total Target",      val: targetProgress.totalTarget },
                { label: "Projected Revenue", val: projection ? projection.revenue : targetProgress.proRataTarget },
              ].map(({ label, val }) => (
                <div key={label} className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(val)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 pb-6 space-y-4">
            {[
              { label: "Overall Progress", pct: targetProgress.progress, color: (p: number) => p >= 100 ? "bg-emerald-500" : p >= 70 ? "bg-blue-500" : p >= 40 ? "bg-amber-500" : "bg-rose-500", bg: "bg-slate-100" },
              { label: "Projection Progress", pct: targetProgress.proRataProgress, color: (p: number) => p >= 100 ? "bg-emerald-500" : p >= 90 ? "bg-blue-600" : p >= 75 ? "bg-amber-500" : "bg-rose-500", bg: "bg-blue-50" },
            ].map(({ label, pct, color, bg }) => (
              <div key={label} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <span className="text-sm font-bold text-slate-900">{pct.toFixed(1)}%</span>
                </div>
                <div className={cn("h-3 rounded-full overflow-hidden", bg)}>
                  <div className={cn("h-full transition-all duration-1000", color(pct))} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projection */}
      {projection && !isLoading && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" /> Month-End Projection
              </h3>
              <p className="text-sm text-blue-600">
                Based on <strong>{projection.daysElapsed} days</strong> → projected for <strong>{projection.totalDays} days</strong>
              </p>
            </div>
            <div className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-900/20">
              ×{projection.factor.toFixed(2)} factor
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Projected Revenue", val: projection.revenue, chg: projection.revenueChange, fmt: formatCompactNumber },
              { label: "Projected Orders",  val: Math.round(projection.orders), chg: projection.ordersChange, fmt: (v: number) => formatNumber(v) },
              { label: "Projected AOV",     val: projection.aov,     chg: projection.aovChange,     fmt: formatCompactNumber },
              { label: "Projected Units",   val: Math.round(projection.units),  chg: projection.unitsChange,  fmt: (v: number) => formatNumber(v) },
            ].map(({ label, val, chg, fmt }) => (
              <div key={label} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{fmt(val)}</p>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    chg >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    {chg >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(chg).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="flex flex-col gap-6">
        {/* Revenue line chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Monthly Gross Revenue by Sources</h3>
            {!isLoading && (
              <div className="flex gap-2 flex-wrap">
                {[{ label: "B2B Strategic", color: "#2563eb" }, { label: "B2B Non-Strategic", color: "#93c5fd" }, { label: "B2C", color: "#312e81" }, { label: "Other", color: "#94a3b8" }].map(({ label, color }) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} /> {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="h-[300px]">
            {isLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={v => formatCompactNumber(v)} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0/0.1)" }}
                    formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                  {[
                    { key: "b2b_strategic",     color: "#2563eb" },
                    { key: "b2b_non_strategic",  color: "#93c5fd" },
                    { key: "b2c",               color: "#312e81" },
                    { key: "other",             color: "#94a3b8" },
                  ].map(({ key, color }) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2.5}
                      dot={{ r: 3, fill: color, strokeWidth: 1.5, stroke: "#fff" }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top destinations bar chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Top Destinations by Gross Revenue</h3>
          <div className="h-[400px]">
            {isLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionData} layout="vertical" margin={{ left: 30, right: 40, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="region" type="category" axisLine={false} tickLine={false}
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} width={180} interval={0} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none" }}
                    formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={28}>
                    {regionData.map((_, i) => <Cell key={i} fill={i === 0 ? "#3b82f6" : "#94a3b8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="flex flex-col gap-6">
        {/* Performance by Business Groups */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Performance by Business Groups</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">B2B / B2C</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  {["Group", "Total Order", "Unit Sold", "Gross Revenue", "Doanh thu dự phóng", "%MoM"].map(h => (
                    <th key={h} className={cn("px-4 py-3", h !== "Group" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? Array(2).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className={cn("h-4", j === 0 ? "w-20" : "w-16 ml-auto")} /></td>)}</tr>
                )) : processedSource.map(row => (
                  <React.Fragment key={row.group}>
                    <tr className={cn("hover:bg-slate-50 transition-colors cursor-pointer", expandedGroups.includes(row.group) && "bg-slate-50")}
                      onClick={() => row.group === "B2B" && toggleGroup("B2B")}>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          {row.group === "B2B" && <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedGroups.includes("B2B") && "rotate-180")} />}
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold",
                            row.group === "B2B" ? "bg-blue-600 text-white" : row.group === "B2C" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500")}>
                            {row.group}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.totalOrder)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.unitSold)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.grossRevenue)}</td>
                      <td className="px-4 py-3 text-right text-blue-600 font-bold">{projection ? formatCurrency(row.grossRevenue * projection.factor) : "-"}</td>
                      <td className={cn("px-4 py-3 text-right font-bold", row.mom >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {row.mom > 0 ? "+" : ""}{(row.mom || 0).toFixed(1)}%
                      </td>
                    </tr>
                    {row.group === "B2B" && expandedGroups.includes("B2B") && (row as any).subRows?.map((sub: any) => (
                      <tr key={sub.group} className="bg-slate-50/50 border-l-4 border-blue-200">
                        <td className="px-4 py-3 text-xs font-bold text-slate-500 pl-10">{sub.group}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatNumber(sub.totalOrder)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatNumber(sub.unitSold)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatCurrency(sub.grossRevenue)}</td>
                        <td className="px-4 py-3 text-right text-blue-400 text-xs font-bold">{projection ? formatCurrency(sub.grossRevenue * projection.factor) : "-"}</td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs">-</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance by Channels */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Performance by Channels</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Strategic / Non-Strategic / B2C</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  {["Channel", "Total Order", "Unit Sold", "Gross Revenue", "Doanh thu dự phóng", "%MoM"].map(h => (
                    <th key={h} className={cn("px-4 py-3", h !== "Channel" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className={cn("h-4", j === 0 ? "w-28" : "w-16 ml-auto")} /></td>)}</tr>
                )) : groupedChannel.map(gd => {
                  const gTotalRev = gd.items.reduce((s, r) => s + r.grossRevenue, 0)
                  const gTotalOrd = gd.items.reduce((s, r) => s + r.totalOrder, 0)
                  const gTotalUni = gd.items.reduce((s, r) => s + r.unitSold, 0)
                  return (
                    <React.Fragment key={gd.group}>
                      <tr className={cn(
                        gd.group === "B2B-Strategic" ? "bg-indigo-50/50" :
                        gd.group === "B2B-Non-Strategic" ? "bg-slate-50" : "bg-slate-100/80"
                      )}>
                        <td className="px-4 py-2 font-bold text-slate-800 text-[10px] uppercase tracking-widest">
                          <div className="flex items-center gap-2">
                            {gd.group === "B2B-Strategic"     && <Shield className="w-3.5 h-3.5 text-indigo-600" />}
                            {gd.group === "B2B-Non-Strategic" && <Building2 className="w-3.5 h-3.5 text-slate-500" />}
                            {displayGroupNames[gd.group] || gd.group}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatNumber(gTotalOrd)}</td>
                        <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatNumber(gTotalUni)}</td>
                        <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-600">{formatCurrency(gTotalRev)}</td>
                        <td className="px-4 py-2 text-right font-bold text-[10px] text-blue-600">{projection ? formatCurrency(gTotalRev * projection.factor) : "-"}</td>
                        <td className="px-4 py-2 text-right font-bold text-[10px] text-slate-400">SUBTOTAL</td>
                      </tr>
                      {gd.items.map(row => (
                        <tr key={`${gd.group}-${row.group}`} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 font-medium text-slate-700 pl-8 border-l-2 border-transparent group-hover:border-blue-400">
                            <div className="flex flex-col">
                              <span>{row.group}</span>
                              {row.tier && <span className="text-[9px] font-bold text-indigo-500 uppercase">{row.tier}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.totalOrder)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.unitSold)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.grossRevenue)}</td>
                          <td className="px-4 py-3 text-right text-blue-600/70 font-medium">{projection ? formatCurrency(row.grossRevenue * projection.factor) : "-"}</td>
                          <td className={cn("px-4 py-3 text-right font-bold", row.mom >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {row.mom > 0 ? "+" : ""}{(row.mom || 0).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
