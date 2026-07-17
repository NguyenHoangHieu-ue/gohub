"use client"

import React, { useState, useEffect } from "react"
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Area,
} from "recharts"
import {
  TrendingUp, TrendingDown, DollarSign, PieChart,
  ArrowUpRight, ArrowDownRight, Calendar, Filter, Download,
  RefreshCw, ChevronDown, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { exportAOA } from "@/lib/export-excel"

// Port "y hệt" gohub-intel BODReport. Backend: bod-summary/bod-report/bod-group-margin/bod-channel-performance
// (CM1 = margin − op-cost, lib/bod-data) + b2b/strategic-performance + config/partner-tiers.
// Adapt: "use client"; /api/query→/api/analytics/query; cn @/lib/utils; inline getDefaultDateRange/formatDateToISO.

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

interface BODSummary {
  total_revenue: number; total_cogs: number; total_margin: number; total_units: number
  avg_margin_percent: number; total_gpm2: number; avg_gpm2_percent: number
  total_3hk_revenue?: number; total_3hk_contribution?: number
  total_target_revenue?: number; previous_period?: BODSummary; previous_year?: BODSummary
}
interface BODDataPoint {
  date: string; revenue: number; cogs: number; margin: number; margin_percent: number
  gpm2: number; gpm2_percent: number; prev_revenue?: number
}
interface BODGroupMargin {
  group: string; revenue: number; cogs: number; margin: number; units: number; orders: number
  margin_percent: number; gpm2: number; gpm2_percent: number; prev_revenue?: number
}
interface BODChannelPerformance {
  group: string; channel: string; revenue: number; cogs: number; margin: number; units: number; orders: number
  margin_percent: number; gpm2: number; gpm2_percent: number; prev_revenue?: number
}

export default function BODReport() {
  const [summary, setSummary] = useState<BODSummary | null>(null)
  const [prevMonthSummary, setPrevMonthSummary] = useState<BODSummary | null>(null)
  const [data, setData] = useState<BODDataPoint[]>([])
  const [groupMargins, setGroupMargins] = useState<BODGroupMargin[]>([])
  const [strategicPerformance, setStrategicPerformance] = useState<any[]>([])
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })
  const [channelPerformance, setChannelPerformance] = useState<BODChannelPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(() => {
    const defaultRange = getDefaultDateRange()
    return { start: defaultRange.startDate, end: defaultRange.endDate }
  })

  const [showFilters, setShowFilters] = useState(false)
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")

  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  const [subChannels, setSubChannels] = useState<string[]>([])
  const [selectedSubChannels, setSelectedSubChannels] = useState<string[]>([])
  const [showSubChannelDropdown, setShowSubChannelDropdown] = useState(false)

  const [channelGroups, setChannelGroups] = useState<string[]>([])
  const [selectedChannelGroups, setSelectedChannelGroups] = useState<string[]>([])
  const [showChannelGroupDropdown, setShowChannelGroupDropdown] = useState(false)

  const [productTypes, setProductTypes] = useState<string[]>([])
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
  const [showProductTypeDropdown, setShowProductTypeDropdown] = useState(false)

  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group])
  }

  useEffect(() => { fetchFilterOptions() }, [])

  const runQuery = async (sql: string) => {
    const res = await fetch("/api/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })
    return res.ok ? res.json() : []
  }

  const fetchFilterOptions = async () => {
    try {
      const [v, sc, pt] = await Promise.all([
        runQuery("SELECT DISTINCT vendor FROM dim_sku WHERE vendor IS NOT NULL AND vendor != '' ORDER BY 1"),
        runQuery("SELECT DISTINCT sapo_name FROM dim_order_source WHERE sapo_name IS NOT NULL AND sapo_name != '' ORDER BY 1"),
        runQuery("SELECT DISTINCT category_name FROM dim_sku WHERE category_name IS NOT NULL AND category_name != '' ORDER BY 1"),
      ])
      setVendors(v.map((r: any) => r.vendor))
      setSubChannels(sc.map((r: any) => r.sapo_name))
      setChannelGroups(["B2B", "B2C"])
      setProductTypes(pt.map((r: any) => r.category_name))
    } catch (err) {
      console.error("Error fetching filter options:", err)
    }
  }

  const toggleItem = (item: string, selected: string[], setSelected: (val: string[]) => void) => {
    setSelected(selected.includes(item) ? selected.filter(i => i !== item) : [...selected, item])
  }

  const getProjectionInfo = () => {
    if (!summary || !dateRange.start || !dateRange.end) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const start = new Date(dateRange.start); const end = new Date(dateRange.end)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    const targetDays = isCurrentMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : daysElapsed
    const factor = targetDays / daysElapsed
    if (factor <= 1) return null

    const fullMonthOpCost = (summary.total_margin || 0) - (summary.total_gpm2 || 0)
    const projectedRevenue = (summary.total_revenue || 0) * factor
    const projectedMargin = (summary.total_margin || 0) * factor
    const projectedGpm2 = projectedMargin - fullMonthOpCost
    const projectedUnits = (summary.total_units || 0) * factor

    const prevRevenue = prevMonthSummary?.total_revenue || 0
    const prevUnits = prevMonthSummary?.total_units || 0
    const prevMargin = prevMonthSummary?.total_margin || 0
    const prevGpm2 = prevMonthSummary?.total_gpm2 || 0

    const revenueChange = prevRevenue > 0 ? ((projectedRevenue - prevRevenue) / prevRevenue) * 100 : 0
    const unitsChange = prevUnits > 0 ? ((projectedUnits - prevUnits) / prevUnits) * 100 : 0
    const marginChange = prevMargin > 0 ? ((projectedMargin - prevMargin) / prevMargin) * 100 : 0
    const gpm2Change = prevGpm2 > 0 ? ((projectedGpm2 - prevGpm2) / prevGpm2) * 100 : 0

    return {
      factor, daysElapsed, totalDays: targetDays,
      revenue: projectedRevenue, units: projectedUnits, margin: projectedMargin, gpm2: projectedGpm2,
      gpm2Percent: projectedRevenue > 0 ? (projectedGpm2 / projectedRevenue) * 100 : 0,
      revenueChange, unitsChange, marginChange, gpm2Change,
    }
  }

  const projection = getProjectionInfo()

  useEffect(() => { fetchData() }, [dateColumn]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportChannelPerformanceCSV = () => {
    if (!channelPerformance.length) return
    const headers = ["Group", "Channel", "Units", "Revenue", "COGS", "Margin", "Margin %", "CM1", "CM1 %"]
    if (projection) headers.splice(4, 0, "Projected Revenue")
    const rows: (string | number)[][] = channelPerformance.map(row => {
      const d: (string | number)[] = [
        row.group, row.channel, row.units, row.revenue, row.cogs, row.margin,
        `${(row.margin_percent || 0).toFixed(2)}%`, row.gpm2, `${(row.gpm2_percent || 0).toFixed(2)}%`,
      ]
      if (projection) d.splice(4, 0, Number((row.revenue * projection.factor).toFixed(0)))
      return d
    })
    exportAOA(headers, rows, `channel_performance_${dateRange.start}_${dateRange.end}`, "Channel Perf")
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        startDate: dateRange.start, endDate: dateRange.end, comparisonType,
        vendors: selectedVendors.join(","), subChannels: selectedSubChannels.join(","),
        channelGroups: selectedChannelGroups.join(","), productTypes: selectedProductTypes.join(","), dateColumn,
      })
      const fetchJson = async (url: string, name: string) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.statusText}`)
        return res.json()
      }
      const [summaryData, reportData, groupData, channelData, stratData, tiersData] = await Promise.all([
        fetchJson(`/api/analytics/bod-summary?${queryParams}`, "Summary"),
        fetchJson(`/api/analytics/bod-report?${queryParams}`, "Report"),
        fetchJson(`/api/analytics/bod-group-margin?${queryParams}`, "Group"),
        fetchJson(`/api/analytics/bod-channel-performance?${queryParams}`, "Channel"),
        fetch(`/api/analytics/b2b/strategic-performance?${queryParams}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/config/partner-tiers`).then(r => r.ok ? r.json() : { Strategic: [] }).catch(() => ({ Strategic: [] })),
      ])

      setSummary(summaryData)
      setData(reportData)
      setGroupMargins(groupData)
      setChannelPerformance(channelData)
      setStrategicPerformance(stratData)
      setPartnerTiers(tiersData)

      try {
        const date = new Date(dateRange.start)
        const prevMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0)
        const prevMonthFirstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1)
        const prevQueryParams = new URLSearchParams({
          startDate: formatDateToISO(prevMonthFirstDay), endDate: formatDateToISO(prevMonthLastDay), comparisonType: "none",
          vendors: selectedVendors.join(","), subChannels: selectedSubChannels.join(","),
          channelGroups: selectedChannelGroups.join(","), productTypes: selectedProductTypes.join(","), dateColumn,
        })
        const prevSummaryRes = await fetch(`/api/analytics/bod-summary?${prevQueryParams}`)
        if (prevSummaryRes.ok) setPrevMonthSummary(await prevSummaryRes.json())
      } catch (e) { console.error("Error fetching prev month summary:", e) }
    } catch (error) {
      console.error("Error fetching BOD data:", error)
    } finally {
      setLoading(false)
    }
  }

  const Skeleton = ({ className }: { className?: string }) => (
    <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
  )

  const processedGroupMargins = (() => {
    const businessGroups = ["B2B", "B2C", "Other"]
    const b2bRows = groupMargins.filter(r => r.group?.startsWith("B2B"))
    const b2bTotalSourceOfTruth = b2bRows.length > 0
      ? b2bRows.reduce((acc, curr) => ({
          orders: acc.orders + curr.orders, units: acc.units + curr.units, revenue: acc.revenue + curr.revenue,
          cogs: acc.cogs + curr.cogs, margin: acc.margin + curr.margin, gpm2: acc.gpm2 + curr.gpm2,
        }), { orders: 0, units: 0, revenue: 0, cogs: 0, margin: 0, gpm2: 0 })
      : { orders: 0, units: 0, revenue: 0, cogs: 0, margin: 0, gpm2: 0 }

    return businessGroups.map(group => {
      if (group === "B2B") {
        const stratRev = strategicPerformance.reduce((sum, item) => sum + item.revenue, 0)
        const stratOrders = strategicPerformance.reduce((sum, item) => sum + (item.orders || 0), 0)
        const stratUnits = strategicPerformance.reduce((sum, item) => sum + item.units, 0)
        const stratMargin = strategicPerformance.reduce((sum, item) => sum + (item.margin || 0), 0)
        const stratCogs = strategicPerformance.reduce((sum, item) => sum + (item.revenue - (item.margin || 0)), 0)
        const stratGpm2 = strategicPerformance.reduce((sum, item) => sum + (item.gpm2 || 0), 0)

        const nonStratRev = Math.max(0, b2bTotalSourceOfTruth.revenue - stratRev)
        const nonStratOrders = Math.max(0, b2bTotalSourceOfTruth.orders - stratOrders)
        const nonStratUnits = Math.max(0, b2bTotalSourceOfTruth.units - stratUnits)
        const nonStratCogs = Math.max(0, b2bTotalSourceOfTruth.cogs - stratCogs)
        const nonStratMargin = Math.max(0, b2bTotalSourceOfTruth.margin - stratMargin)
        const nonStratGpm2 = Math.max(0, b2bTotalSourceOfTruth.gpm2 - stratGpm2)

        return {
          group: "B2B", orders: b2bTotalSourceOfTruth.orders, units: b2bTotalSourceOfTruth.units,
          revenue: b2bTotalSourceOfTruth.revenue, cogs: b2bTotalSourceOfTruth.cogs, margin: b2bTotalSourceOfTruth.margin,
          margin_percent: b2bTotalSourceOfTruth.revenue > 0 ? (b2bTotalSourceOfTruth.margin / b2bTotalSourceOfTruth.revenue) * 100 : 0,
          gpm2: b2bTotalSourceOfTruth.gpm2,
          gpm2_percent: b2bTotalSourceOfTruth.revenue > 0 ? (b2bTotalSourceOfTruth.gpm2 / b2bTotalSourceOfTruth.revenue) * 100 : 0,
          subRows: [
            { group: "Strategic Partners", orders: stratOrders, units: stratUnits, revenue: stratRev, cogs: stratCogs, margin: stratMargin, margin_percent: stratRev > 0 ? (stratMargin / stratRev) * 100 : 0, gpm2: stratGpm2, gpm2_percent: stratRev > 0 ? (stratGpm2 / stratRev) * 100 : 0 },
            { group: "Other Partners", orders: nonStratOrders, units: nonStratUnits, revenue: nonStratRev, cogs: nonStratCogs, margin: nonStratMargin, margin_percent: nonStratRev > 0 ? (nonStratMargin / nonStratRev) * 100 : 0, gpm2: nonStratGpm2, gpm2_percent: nonStratRev > 0 ? (nonStratGpm2 / nonStratRev) * 100 : 0 },
          ],
        }
      }
      const row = groupMargins.find(r => r.group?.toUpperCase() === group.toUpperCase() || (group === "B2C" && r.group?.toUpperCase() === "RETAIL"))
      if (!row) return null
      return { ...row, subRows: [] as any[] }
    }).filter(Boolean) as any[]
  })()

  const ComparisonBadge = ({ current, previous, label }: { current: number, previous?: number, label: string }) => {
    if (previous === undefined || previous === 0) return null
    const diff = ((current - previous) / previous) * 100
    const isPositive = diff >= 0
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md", isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(diff).toFixed(1)}%
        </div>
        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">{label}</span>
      </div>
    )
  }

  const SummaryCard = ({ title, value, icon: Icon, color, prevPeriod, prevYear, target, format = "currency" }: {
    title: string, value: number, icon: any, color: string, prevPeriod?: number, prevYear?: number, target?: number, format?: "currency" | "number" | "percent"
  }) => {
    const formattedValue = format === "currency" ? formatCurrency(value) : format === "percent" ? `${value.toFixed(2)}%` : formatCompactNumber(value)
    const colorClasses: Record<string, string> = {
      blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", orange: "bg-orange-50 text-orange-600",
      purple: "bg-purple-50 text-purple-600", indigo: "bg-indigo-50 text-indigo-600", pink: "bg-pink-50 text-pink-600", slate: "bg-slate-50 text-slate-600", teal: "bg-teal-50 text-teal-600",
    }
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div className={cn("p-2.5 rounded-xl", colorClasses[color] || colorClasses.slate)}><Icon className="w-5 h-5" /></div>
          {target !== undefined && target > 0 && (
            <div className={cn("px-2 py-1 rounded-lg text-[10px] font-bold", (value / target) >= 1 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
              {((value / target) * 100).toFixed(1)}% of Target
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{formattedValue}</h3>
          {target !== undefined && target > 0 && (
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Goal: <span className="text-slate-600">{formatCurrency(target)}</span></p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-50 space-y-2">
          <ComparisonBadge current={value} previous={prevPeriod} label="vs Prev Period" />
          <ComparisonBadge current={value} previous={prevYear} label="vs Prev Year" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Board of Directors Report</h1>
          <p className="text-slate-500">Financial performance overview and margin analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm shrink-0 items-center h-[42px]">
            <button onClick={() => setDateColumn("fulfiled_date")} className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center", dateColumn === "fulfiled_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>Fulfillment</button>
            <button onClick={() => setDateColumn("created_date")} className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center", dateColumn === "created_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>Created</button>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-[42px]">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium whitespace-nowrap">{dateRange.start} - {dateRange.end}</span>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm transition-all text-sm font-medium", showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />Filters
          </button>
          <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <RefreshCw className={cn("w-5 h-5 text-slate-600", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <DatePresets onSelect={(s, e) => setDateRange(prev => ({ ...prev, start: s, end: e }))} />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
              <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
              <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comparison</label>
              <select value={comparisonType} onChange={(e: any) => setComparisonType(e.target.value)} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                <option value="none">No Comparison</option>
                <option value="previous_period">Previous Period</option>
                <option value="previous_year">Previous Year</option>
              </select>
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendors</label>
              <div className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all" onClick={() => setShowVendorDropdown(!showVendorDropdown)}>
                <span className="truncate max-w-[150px]">{selectedVendors.length === 0 ? "All Vendors" : selectedVendors.length === 1 ? selectedVendors[0] : `${selectedVendors.length} Vendors`}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showVendorDropdown && "rotate-180")} />
              </div>
              {showVendorDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                  <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Select Vendors</span>
                    <button onClick={() => setSelectedVendors([])} className="text-[10px] text-blue-600 font-bold">Clear</button>
                  </div>
                  {vendors.map(v => (
                    <div key={v} onClick={() => toggleItem(v, selectedVendors, setSelectedVendors)} className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer", selectedVendors.includes(v) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50")}>
                      <span className="text-sm">{v}</span>{selectedVendors.includes(v) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel Groups</label>
              <div className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all" onClick={() => setShowChannelGroupDropdown(!showChannelGroupDropdown)}>
                <span className="truncate max-w-[150px]">{selectedChannelGroups.length === 0 ? "All Groups" : selectedChannelGroups.length === 1 ? selectedChannelGroups[0] : `${selectedChannelGroups.length} Groups`}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showChannelGroupDropdown && "rotate-180")} />
              </div>
              {showChannelGroupDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                  {channelGroups.map(cg => (
                    <div key={cg} onClick={() => toggleItem(cg, selectedChannelGroups, setSelectedChannelGroups)} className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer", selectedChannelGroups.includes(cg) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50")}>
                      <span className="text-sm">{cg}</span>{selectedChannelGroups.includes(cg) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sub Channels</label>
              <div className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all" onClick={() => setShowSubChannelDropdown(!showSubChannelDropdown)}>
                <span className="truncate max-w-[150px]">{selectedSubChannels.length === 0 ? "All Sub Channels" : selectedSubChannels.length === 1 ? selectedSubChannels[0] : `${selectedSubChannels.length} Sub Channels`}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showSubChannelDropdown && "rotate-180")} />
              </div>
              {showSubChannelDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                  {subChannels.map(sc => (
                    <div key={sc} onClick={() => toggleItem(sc, selectedSubChannels, setSelectedSubChannels)} className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer", selectedSubChannels.includes(sc) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50")}>
                      <span className="text-sm">{sc}</span>{selectedSubChannels.includes(sc) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Type</label>
              <div className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all" onClick={() => setShowProductTypeDropdown(!showProductTypeDropdown)}>
                <span className="truncate max-w-[150px]">{selectedProductTypes.length === 0 ? "All Types" : selectedProductTypes.length === 1 ? selectedProductTypes[0] : `${selectedProductTypes.length} Types`}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showProductTypeDropdown && "rotate-180")} />
              </div>
              {showProductTypeDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                  {productTypes.map(pt => (
                    <div key={pt} onClick={() => toggleItem(pt, selectedProductTypes, setSelectedProductTypes)} className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer", selectedProductTypes.includes(pt) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50")}>
                      <span className="text-sm">{pt}</span>{selectedProductTypes.includes(pt) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button onClick={fetchData} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Apply Filters</button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          Array(8).fill(0).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-32" /></div>
              <div className="pt-4 border-t border-slate-50 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
            </div>
          ))
        ) : (
          <>
            <SummaryCard title="Total Revenue" value={summary?.total_revenue || 0} icon={DollarSign} color="blue" target={summary?.total_target_revenue} prevPeriod={summary?.previous_period?.total_revenue} prevYear={summary?.previous_year?.total_revenue} />
            <SummaryCard title="Units Sold" value={summary?.total_units || 0} icon={PieChart} color="slate" format="number" prevPeriod={summary?.previous_period?.total_units} prevYear={summary?.previous_year?.total_units} />
            <SummaryCard title="Total COGS" value={summary?.total_cogs || 0} icon={TrendingDown} color="orange" prevPeriod={summary?.previous_period?.total_cogs} prevYear={summary?.previous_year?.total_cogs} />
            <SummaryCard title="Gross Margin" value={summary?.total_margin || 0} icon={TrendingUp} color="emerald" prevPeriod={summary?.previous_period?.total_margin} prevYear={summary?.previous_year?.total_margin} />
            <SummaryCard title="Margin %" value={summary?.avg_margin_percent || 0} icon={PieChart} color="purple" format="percent" prevPeriod={summary?.previous_period?.avg_margin_percent} prevYear={summary?.previous_year?.avg_margin_percent} />
            <SummaryCard title="Total CM1" value={summary?.total_gpm2 || 0} icon={TrendingUp} color="indigo" prevPeriod={summary?.previous_period?.total_gpm2} prevYear={summary?.previous_year?.total_gpm2} />
            <SummaryCard title="CM1 %" value={summary?.avg_gpm2_percent || 0} icon={PieChart} color="pink" format="percent" prevPeriod={summary?.previous_period?.avg_gpm2_percent} prevYear={summary?.previous_year?.avg_gpm2_percent} />
            <SummaryCard title="3HK Contribution %" value={summary?.total_3hk_contribution || 0} icon={PieChart} color="teal" format="percent" prevPeriod={summary?.previous_period?.total_3hk_contribution} prevYear={summary?.previous_year?.total_3hk_contribution} />
          </>
        )}
      </div>

      {/* Pro-rata Projection */}
      {projection && !loading && (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><TrendingUp className="w-5 h-5" />Month-End Projection (Pro-rata)</h3>
              <p className="text-sm text-indigo-600">Based on <strong>{projection.daysElapsed} days</strong> of performance, projected for <strong>{projection.totalDays} total days</strong>.</p>
            </div>
            <div className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-900/20">{((projection.factor - 1) * 100).toFixed(0)}% Growth Expected</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {([
              { label: "Projected Revenue", val: formatCompactNumber(projection.revenue), chg: projection.revenueChange },
              { label: "Projected Units", val: formatCompactNumber(projection.units), chg: projection.unitsChange },
              { label: "Projected Margin", val: formatCompactNumber(projection.margin), chg: projection.marginChange },
              { label: "Projected CM1", val: formatCompactNumber(projection.gpm2), chg: projection.gpm2Change },
            ]).map(c => (
              <div key={c.label} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{c.label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-indigo-600">{c.val}</p>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full", c.chg >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    {c.chg >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{Math.abs(c.chg).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
            ))}
            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected CM1 %</p>
              <p className="text-lg font-bold text-indigo-600">{projection.gpm2Percent.toFixed(2)}%</p>
              <p className="text-[9px] text-slate-400 mt-1">Full Month Estimate</p>
            </div>
          </div>
        </div>
      )}

      {/* Revenue vs COGS chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Revenue vs COGS</h3>
            <button className="text-slate-400 hover:text-slate-600"><Download className="w-4 h-4" /></button>
          </div>
          <div className="h-[300px]">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={formatCompactNumber} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [formatCurrency(val), ""]} />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
                  <Line type="monotone" dataKey="cogs" name="COGS" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
                  <Line type="monotone" dataKey="gpm2" name="CM1" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Margin by Channel Group Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Performance by Channel Group</h3>
            <p className="text-sm text-slate-500">Revenue, Orders, Units and Margin analysis by business unit</p>
          </div>
          <button onClick={exportChannelPerformanceCSV} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" />Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Channel Group</th>
                <th className="px-6 py-4 text-right font-semibold">Orders</th>
                <th className="px-6 py-4 text-right font-semibold">Units Sold</th>
                <th className="px-6 py-4 text-right font-semibold">Revenue</th>
                <th className="px-6 py-4 text-right font-semibold">Gross Margin</th>
                <th className="px-6 py-4 text-right font-semibold">Margin %</th>
                <th className="px-6 py-4 text-right font-semibold">CM1</th>
                <th className="px-6 py-4 text-right font-semibold">CM1 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j} className="px-6 py-4 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>)}</tr>
                ))
              ) : (
                <>
                  {processedGroupMargins.map((gm) => (
                    <React.Fragment key={gm.group}>
                      <tr className={cn("transition-colors", gm.group === "B2B" ? "cursor-pointer hover:bg-slate-50" : "hover:bg-slate-50")} onClick={() => gm.group === "B2B" && toggleGroup("B2B")}>
                        <td className="px-6 py-4 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            {gm.group === "B2B" && <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expandedGroups.includes("B2B") && "rotate-180")} />}
                            {gm.group}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600 font-mono">{formatCompactNumber(gm.orders)}</td>
                        <td className="px-6 py-4 text-right text-slate-600 font-mono">{formatCompactNumber(gm.units)}</td>
                        <td className="px-6 py-4 text-right"><div className="font-semibold text-slate-900">{formatCurrency(gm.revenue)}</div></td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">{formatCurrency(gm.margin)}</td>
                        <td className="px-6 py-4 text-right"><span className={`px-2 py-1 rounded-full text-xs font-bold ${gm.margin_percent > 30 ? "bg-emerald-50 text-emerald-600" : gm.margin_percent > 15 ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>{(gm.margin_percent || 0).toFixed(1)}%</span></td>
                        <td className="px-6 py-4 text-right font-bold text-indigo-600">{formatCurrency(gm.gpm2)}</td>
                        <td className="px-6 py-4 text-right"><span className={`px-2 py-1 rounded-full text-xs font-bold ${gm.gpm2_percent > 20 ? "bg-indigo-50 text-indigo-600" : gm.gpm2_percent > 10 ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"}`}>{(gm.gpm2_percent || 0).toFixed(1)}%</span></td>
                      </tr>
                      {gm.group === "B2B" && expandedGroups.includes("B2B") && gm.subRows.map((sub: any) => (
                        <tr key={sub.group} className="bg-slate-50/50 border-l-4 border-blue-400">
                          <td className="px-6 py-3 text-xs font-bold text-slate-500 pl-12">{sub.group}</td>
                          <td className="px-6 py-3 text-right text-slate-500 text-xs font-mono">{formatCompactNumber(sub.orders)}</td>
                          <td className="px-6 py-3 text-right text-slate-500 text-xs font-mono">{formatCompactNumber(sub.units)}</td>
                          <td className="px-6 py-3 text-right text-slate-500 text-xs font-semibold">{formatCurrency(sub.revenue)}</td>
                          <td className="px-6 py-3 text-right text-emerald-600/70 text-xs font-bold">{formatCurrency(sub.margin)}</td>
                          <td className="px-6 py-3 text-right"><span className="text-[10px] font-bold text-slate-400">{(sub.margin_percent || 0).toFixed(1)}%</span></td>
                          <td className="px-6 py-3 text-right text-indigo-600/70 text-xs font-bold">{formatCurrency(sub.gpm2)}</td>
                          <td className="px-6 py-3 text-right"><span className="text-[10px] font-bold text-slate-400">{(sub.gpm2_percent || 0).toFixed(1)}%</span></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {groupMargins.length > 0 && (
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                      <td className="px-6 py-4 text-slate-900">GRAND TOTAL</td>
                      <td className="px-6 py-4 text-right font-mono">{formatCompactNumber(groupMargins.reduce((sum, g) => sum + g.orders, 0))}</td>
                      <td className="px-6 py-4 text-right font-mono">{formatCompactNumber(groupMargins.reduce((sum, g) => sum + g.units, 0))}</td>
                      <td className="px-6 py-4 text-right text-blue-600 font-bold">{formatCurrency(groupMargins.reduce((sum, g) => sum + g.revenue, 0))}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-bold">{formatCurrency(groupMargins.reduce((sum, g) => sum + g.margin, 0))}</td>
                      <td className="px-6 py-4 text-right"><span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs">{(groupMargins.reduce((sum, g) => sum + g.margin, 0) / groupMargins.reduce((sum, g) => sum + Math.max(1, g.revenue), 0) * 100).toFixed(1)}%</span></td>
                      <td className="px-6 py-4 text-right text-indigo-600 font-bold">{formatCurrency(groupMargins.reduce((sum, g) => sum + g.gpm2, 0))}</td>
                      <td className="px-6 py-4 text-right"><span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs">{(groupMargins.reduce((sum, g) => sum + g.gpm2, 0) / groupMargins.reduce((sum, g) => sum + Math.max(1, g.revenue), 0) * 100).toFixed(1)}%</span></td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Margin Analysis chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Margin Analysis (%)</h3>
            <button className="text-slate-400 hover:text-slate-600"><Download className="w-4 h-4" /></button>
          </div>
          <div className="h-[300px]">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => `${val}%`} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [`${(val || 0).toFixed(2)}%`, "Margin %"]} />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="margin_percent" name="Margin %" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="gpm2_percent" name="CM1 %" stroke="#ec4899" strokeWidth={3} dot={{ r: 4, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Daily Financial Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Daily Financial Breakdown</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Gross Margin</th>
                <th className="px-4 py-3 text-right">Margin %</th>
                <th className="px-4 py-3 text-right">CM1</th>
                <th className="px-4 py-3 text-right">CM1 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3 text-right"><Skeleton className="h-4 w-24 ml-auto" /></td>)}</tr>
                ))
              ) : (
                data.slice().reverse().map((row) => (
                  <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{row.date}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono text-slate-600">{formatCurrency(row.revenue)}</div>
                      {row.prev_revenue !== undefined && row.prev_revenue > 0 && (
                        <div className="flex justify-end mt-0.5 scale-90 origin-right">
                          <ComparisonBadge current={row.revenue} previous={row.prev_revenue} label={comparisonType === "previous_period" ? "vs L.Period" : "vs L.Year"} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(row.cogs)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(row.margin)}</td>
                    <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${row.margin_percent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}`}>{(row.margin_percent || 0).toFixed(2)}%</span></td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatCurrency(row.gpm2)}</td>
                    <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${row.gpm2_percent > 15 ? "bg-indigo-50 text-indigo-600" : "bg-pink-50 text-pink-600"}`}>{(row.gpm2_percent || 0).toFixed(2)}%</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel Performance Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Channel Performance Breakdown</h3>
            <p className="text-sm text-slate-500">Detailed metrics by channel grouped by business unit</p>
          </div>
          <button onClick={exportChannelPerformanceCSV} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" />Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 text-right font-semibold">Units</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                {projection && <th className="px-4 py-3 text-right font-semibold">Doanh thu dự phóng</th>}
                <th className="px-4 py-3 text-right font-semibold">COGS</th>
                <th className="px-4 py-3 text-right font-semibold">Gross Margin</th>
                <th className="px-4 py-3 text-right font-semibold">Margin %</th>
                <th className="px-4 py-3 text-right font-semibold">CM1</th>
                {projection && <th className="px-4 py-3 text-right font-semibold">CM1 dự phóng</th>}
                <th className="px-4 py-3 text-right font-semibold">CM1 %</th>
                {projection && <th className="px-4 py-3 text-right font-semibold">CM1 % dự phóng</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j} className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>)}</tr>
                ))
              ) : (
                ["B2B-Strategic", "B2B-Non-Strategic", "B2C", "Other"].map(groupName => {
                  let groupChannels: any[]
                  if (groupName === "B2B-Strategic") {
                    groupChannels = strategicPerformance.map(s => ({
                      channel: s.name, orders: s.orders || 0, units: s.units, revenue: s.revenue,
                      cogs: s.revenue - (s.margin || 0), margin: s.margin || 0, margin_percent: s.margin_percent,
                      gpm2: s.gpm2 || 0, gpm2_percent: s.gpm2_percent, prev_revenue: s.prev_revenue, mom: s.mom || 0,
                    }))
                  } else if (groupName === "B2B-Non-Strategic") {
                    groupChannels = channelPerformance
                      .filter(cp => cp.group === "B2B-Non-Strategic" || cp.group?.startsWith("B2B"))
                      .map(cp => {
                        let adjRevenue = cp.revenue, adjUnits = cp.units, adjOrders = cp.orders || 0, adjMargin = cp.margin, adjGpm2 = cp.gpm2
                        strategicPerformance.forEach(s => {
                          if (s.channel_contributions && s.channel_contributions[cp.channel]) {
                            const contrib = s.channel_contributions[cp.channel]
                            adjRevenue -= (contrib.revenue || 0); adjUnits -= (contrib.units || 0); adjOrders -= (contrib.orders || 0)
                            adjMargin -= (contrib.margin || 0); adjGpm2 -= (contrib.margin || 0)
                          }
                        })
                        if (adjRevenue < 5000 && adjOrders < 1) return null
                        return {
                          ...cp, revenue: Math.max(0, adjRevenue), units: Math.max(0, adjUnits), orders: Math.max(0, adjOrders),
                          margin: adjMargin, gpm2: adjGpm2,
                          margin_percent: adjRevenue > 0 ? (adjMargin / adjRevenue) * 100 : 0,
                          gpm2_percent: adjRevenue > 0 ? (adjGpm2 / adjRevenue) * 100 : 0,
                        }
                      })
                      .filter(Boolean) as BODChannelPerformance[]
                  } else if (groupName === "B2C") {
                    groupChannels = channelPerformance.filter(cp => cp.group === "B2C" || cp.group === "RETAIL")
                  } else {
                    groupChannels = channelPerformance.filter(cp => cp.group === groupName)
                  }

                  if (groupChannels.length === 0) return null

                  return (
                    <React.Fragment key={groupName}>
                      <tr className="bg-slate-50/80">
                        <td colSpan={projection ? 11 : 8} className="px-4 py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">{groupName}</td>
                      </tr>
                      {groupChannels.map((row, idx) => (
                        <tr key={`${groupName}-${row.channel}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{row.channel}</td>
                          <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCompactNumber(row.units)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-slate-600">{formatCurrency(row.revenue)}</div>
                            {row.prev_revenue !== undefined && row.prev_revenue > 0 && (
                              <div className="flex justify-end mt-0.5 scale-90 origin-right">
                                <ComparisonBadge current={row.revenue} previous={row.prev_revenue} label={comparisonType === "previous_period" ? "vs L.Period" : "vs L.Year"} />
                              </div>
                            )}
                          </td>
                          {projection && <td className="px-4 py-3 text-right text-indigo-600 font-bold">{formatCurrency(row.revenue * projection.factor)}</td>}
                          <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(row.cogs)}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(row.margin)}</td>
                          <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.margin_percent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}`}>{(row.margin_percent || 0).toFixed(1)}%</span></td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatCurrency(row.gpm2)}</td>
                          {projection && <td className="px-4 py-3 text-right font-bold text-blue-600 bg-blue-50/30">{formatCurrency(row.gpm2 * projection.factor)}</td>}
                          <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.gpm2_percent > 15 ? "bg-indigo-50 text-indigo-600" : "bg-pink-50 text-pink-600"}`}>{(row.gpm2_percent || 0).toFixed(1)}%</span></td>
                          {projection && <td className="px-4 py-3 text-right"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">{(row.gpm2_percent || 0).toFixed(1)}%</span></td>}
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
  )
}
