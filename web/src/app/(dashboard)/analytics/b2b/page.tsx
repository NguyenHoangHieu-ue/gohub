"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts"
import {
  TrendingUp, DollarSign, PieChart as PieChartIcon,
  AlertCircle, ArrowUpRight, ArrowDownRight, Filter,
  Calendar, Download, ChevronDown, Globe,
  ArrowUpDown, ShoppingBag, Settings, Check, Zap, Building2, Shield, FileText,
} from "lucide-react"
import { domToCanvas } from "modern-screenshot"
import { cn } from "@/lib/utils"
import { CostManagementModal } from "@/components/cost-management-modal"
import { DatePresets } from "@/components/date-presets"
import { exportToExcel } from "@/lib/export-excel"
import { useDbRole } from "@/lib/use-role-guard"

// Port "y hệt" gohub-intel B2BPerformance. Backend (đã có op-cost CM1): b2b/kpis|trend|performance|
// strategic-performance + channels-with-platform-fee + channel-costs + config/partner-tiers.
// Adapt: "use client"; bỏ motion (motion.div→div); cn @/lib/utils; inline getDefaultDateRange/formatDateToISO.

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
  // Port intel-main: nếu ngày ≤ 7 → tháng trước (data tháng hiện tại chưa đủ);
  // ngày > 7 → MTD tháng hiện tại đến hôm qua (T-1).
  if (today.getDate() <= 7) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0)   // last day of prev month
    return { startDate: fmt(start), endDate: fmt(end) }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}
const formatDateToISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`

interface KPI {
  label: string; value: number; actualValue?: number; lastPeriod: number; change: number
  isPositive: boolean; isCurrency?: boolean; icon?: React.ReactNode
}
interface PerformanceData {
  name: string; channel?: string; sub_group_name?: string; source_code?: string
  revenue: number; margin: number; margin_percent: number
  gpm2: number; gpm2_percent: number; units: number; prev_revenue?: number
  sub_channels?: PerformanceData[]; cost_breakdown?: Record<string, number>
}

export default function B2BPerformance() {
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("week")

  const [showCostModal, setShowCostModal] = useState(false)
  const [monthlyCosts, setMonthlyCosts] = useState<Record<string, any>>({})
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const dbRole = useDbRole()   // ẩn "Manage Costs" — chỉ creator thấy (tạm thời)

  const [combinedKpis, setCombinedKpis] = useState<KPI[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [wholesaleCustomers, setWholesaleCustomers] = useState<PerformanceData[]>([])
  const [strategicPerformance, setStrategicPerformance] = useState<(PerformanceData & { tier: string })[]>([])
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })
  const [channelsWithPlatformFee, setChannelsWithPlatformFee] = useState<string[]>([])

  const [wholesaleSort, setWholesaleSort] = useState<{ key: keyof PerformanceData; direction: "asc" | "desc" }>({ key: "revenue", direction: "desc" })

  const reportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const getProjectionFactor = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const start = new Date(startDate); const end = new Date(endDate)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    const targetDays = isCurrentMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : daysElapsed
    const factor = targetDays / daysElapsed
    return Math.min(10, Math.max(1, factor))
  }

  const projectionFactor = getProjectionFactor()
  const isProjectable = projectionFactor > 1

  const fetchCosts = async (month: string) => {
    try {
      const res = await fetch(`/api/channel-costs?month=${month}`)
      if (res.ok) setMonthlyCosts(await res.json())
    } catch (err) {
      console.error("Error fetching costs:", err)
    }
  }

  const exportToCSV = (data: any[], filename: string, columns: { label: string; key: keyof PerformanceData | string }[]) => {
    exportToExcel(data as Record<string, unknown>[], columns.map(c => ({ label: c.label, key: String(c.key) })),
      `${filename}_${startDate}_to_${endDate}`)
  }

  const exportToPDF = async () => {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const canvas = await domToCanvas(reportRef.current, { scale: 2, backgroundColor: "#f8fafc" })
      const imgData = canvas.toDataURL("image/png")
      const { jsPDF } = await import("jspdf")   // nạp động: chỉ tải jspdf khi user xuất PDF
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`B2B_Performance_Report_${startDate}_to_${endDate}.pdf`)
    } catch (err) {
      console.error("Failed to export PDF:", err)
    } finally {
      setExporting(false)
    }
  }

  const fetchData = async (fresh = false) => {
    setLoading(true); setError(null)
    try {
      const queryParams = new URLSearchParams()
      if (startDate) queryParams.append("startDate", startDate)
      if (endDate) queryParams.append("endDate", endDate)
      queryParams.append("dateColumn", dateColumn)
      queryParams.append("comparisonType", "previous_period")
      // fresh=true (sau khi lưu Cost/Target) → bỏ qua cache server, lấy số tươi ngay.
      if (fresh) queryParams.append("nocache", "1")
      const nc = fresh ? "&nocache=1" : ""

      const [b2bKpis, b2bPerfCustomer, strategicPerf, trend, feeChannels, tiersData] = await Promise.all([
        fetch(`/api/analytics/b2b/kpis?${queryParams.toString()}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/analytics/b2b/performance?${queryParams.toString()}&groupBy=customer`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/analytics/b2b/strategic-performance?${queryParams.toString()}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/analytics/b2b/trend?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&granularity=${granularity}${nc}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/analytics/channels-with-platform-fee?startDate=${startDate}&endDate=${endDate}${nc}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/config/partner-tiers`).then(r => r.ok ? r.json() : { Strategic: ["Traveloka", "Momo"] }).catch(() => ({ Strategic: ["Traveloka", "Momo"] })),
      ])

      const safeB2BKpis = Array.isArray(b2bKpis) ? b2bKpis : []
      const safeB2BPerfCustomer = Array.isArray(b2bPerfCustomer) ? b2bPerfCustomer : []
      const safeStrategicPerf = Array.isArray(strategicPerf) ? strategicPerf : []
      const safeTrend = Array.isArray(trend) ? trend : []
      const safeFeeChannels = Array.isArray(feeChannels) ? feeChannels : []

      setPartnerTiers(tiersData)
      setWholesaleCustomers(safeB2BPerfCustomer)
      setStrategicPerformance(safeStrategicPerf)
      setTrendData(safeTrend)
      setChannelsWithPlatformFee(safeFeeChannels)

      fetchCosts(startDate.slice(0, 7))

      const findKPI = (kpis: any[], label: string) => kpis.find(k => k.label === label)
      const b2bRev = findKPI(safeB2BKpis, "Total Revenue")?.value || 0
      const b2bPrevRev = findKPI(safeB2BKpis, "Total Revenue")?.lastPeriod || 0
      const b2bGP = findKPI(safeB2BKpis, "Gross Profit")?.value || 0
      const b2bPrevGP = findKPI(safeB2BKpis, "Gross Profit")?.lastPeriod || 0
      const b2bGpm2 = findKPI(safeB2BKpis, "CM1")?.value || 0
      const b2bPrevGpm2 = findKPI(safeB2BKpis, "CM1")?.lastPeriod || 0

      const calculateChange = (curr: number, prev: number) => (!prev || prev === 0) ? 0 : ((curr - prev) / prev) * 100

      const totalRevActual = b2bRev
      const totalRevProjected = totalRevActual * (isProjectable ? projectionFactor : 1)
      const prevTotalRev = b2bPrevRev
      const totalGPActual = b2bGP
      const totalGPProjected = totalGPActual * (isProjectable ? projectionFactor : 1)
      const prevTotalGP = b2bPrevGP
      const totalGpm2Actual = b2bGpm2
      const fullMonthB2BOpCost = totalGPActual - totalGpm2Actual
      const totalGpm2Projected = isProjectable ? totalGPProjected - fullMonthB2BOpCost : totalGpm2Actual
      const prevTotalGpm2 = b2bPrevGpm2

      const kpis: any[] = [
        { label: "B2B Revenue", value: totalRevProjected, actualValue: totalRevActual, lastPeriod: prevTotalRev, change: calculateChange(totalRevProjected, prevTotalRev), isPositive: totalRevProjected >= prevTotalRev, isCurrency: true, icon: <Globe className="w-5 h-5" /> },
        { label: "Gross Profit", value: totalGPProjected, actualValue: totalGPActual, lastPeriod: prevTotalGP, change: calculateChange(totalGPProjected, prevTotalGP), isPositive: totalGPProjected >= prevTotalGP, isCurrency: true, icon: <TrendingUp className="w-5 h-5" /> },
        { label: "CM1", value: totalGpm2Projected, actualValue: totalGpm2Actual, lastPeriod: prevTotalGpm2, change: calculateChange(totalGpm2Projected, prevTotalGpm2), isPositive: totalGpm2Projected >= prevTotalGpm2, isCurrency: true, icon: <DollarSign className="w-5 h-5" /> },
        { label: "B2B Margin %", value: totalRevProjected > 0 ? (totalGPProjected / totalRevProjected) * 100 : 0, actualValue: totalRevActual > 0 ? (totalGPActual / totalRevActual) * 100 : 0, lastPeriod: prevTotalRev > 0 ? (prevTotalGP / prevTotalRev) * 100 : 0, change: (totalRevProjected > 0 ? (totalGPProjected / totalRevProjected) * 100 : 0) - (prevTotalRev > 0 ? (prevTotalGP / prevTotalRev) * 100 : 0), isPositive: (totalRevProjected > 0 ? (totalGPProjected / totalRevProjected) * 100 : 0) >= (prevTotalRev > 0 ? (prevTotalGP / prevTotalRev) * 100 : 0), isCurrency: false, icon: <ShoppingBag className="w-5 h-5" /> },
        { label: "B2B CM1 %", value: totalRevProjected > 0 ? (totalGpm2Projected / totalRevProjected) * 100 : 0, actualValue: totalRevActual > 0 ? (totalGpm2Actual / totalRevActual) * 100 : 0, lastPeriod: prevTotalRev > 0 ? (prevTotalGpm2 / prevTotalRev) * 100 : 0, change: (totalRevProjected > 0 ? (totalGpm2Projected / totalRevProjected) * 100 : 0) - (prevTotalRev > 0 ? (prevTotalGpm2 / prevTotalRev) * 100 : 0), isPositive: (totalRevProjected > 0 ? (totalGpm2Projected / totalRevProjected) * 100 : 0) >= (prevTotalRev > 0 ? (prevTotalGpm2 / prevTotalRev) * 100 : 0), isCurrency: false, icon: <PieChartIcon className="w-5 h-5" /> },
      ]
      setCombinedKpis(kpis)
    } catch (err: any) {
      console.error("Error fetching B2B data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [dateColumn, granularity]) // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value)
  const formatNumber = (value: number) => new Intl.NumberFormat("vi-VN").format(value)

  const SortIcon = ({ sort, column }: { sort: any, column: string }) => {
    if (sort.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
    return sort.direction === "asc" ? <ArrowUpRight className="w-3 h-3 ml-1 text-blue-600" /> : <ArrowDownRight className="w-3 h-3 ml-1 text-blue-600" />
  }

  const sortData = (data: PerformanceData[], config: any) => [...data].sort((a: any, b: any) => {
    if (config.direction === "asc") return a[config.key] > b[config.key] ? 1 : -1
    return a[config.key] < b[config.key] ? 1 : -1
  })

  const getFilteredOtherTiers = () => {
    const combined = [...wholesaleCustomers]
    const tieredPartnersFound = Object.values(partnerTiers).flat()
    const strategicNamesLower = [
      ...tieredPartnersFound.map(t => t.trim().toLowerCase()),
      ...strategicPerformance.map(s => s.name.trim().toLowerCase()),
    ]
    const uniqueStrategicFilters = Array.from(new Set(strategicNamesLower)).filter(n => n.length > 0)

    const nonStrategicRaw = combined.map(p => {
      const subChannels = p.sub_channels || []
      const filteredSubs = subChannels.filter(sub => {
        const subName = sub.name.toLowerCase()
        return !uniqueStrategicFilters.some(t => {
          if (subName.includes(t)) return true
          if (t.includes(subName) && subName.length > 3) return true
          return false
        })
      })
      if (filteredSubs.length < subChannels.length) {
        const rev = filteredSubs.reduce((a, b) => a + b.revenue, 0)
        const mar = filteredSubs.reduce((a, b) => a + b.margin, 0)
        const uni = filteredSubs.reduce((a, b) => a + (b.units || 0), 0)
        const gp2 = filteredSubs.reduce((a, b) => a + (b.gpm2 || 0), 0)
        return { ...p, revenue: rev, margin: mar, units: uni, gpm2: gp2, sub_channels: filteredSubs }
      }
      return p
    }).filter(p => {
      if (!p || p.revenue <= 0) return false
      const pName = (p.name || p.channel || "").trim().toLowerCase()
      const pChannel = (p.channel || "").trim().toLowerCase()
      const isStrategic = uniqueStrategicFilters.some(t => {
        if (pName.includes(t)) return true
        if (pChannel.includes(t)) return true
        return false
      })
      return !isStrategic
    }) as PerformanceData[]

    const nonStrategicMap = new Map<string, PerformanceData>()
    nonStrategicRaw.forEach(p => {
      const key = p.name
      const existing = nonStrategicMap.get(key)
      if (existing) {
        existing.revenue += (p.revenue || 0); existing.margin += (p.margin || 0); existing.units += (p.units || 0); existing.gpm2 += (p.gpm2 || 0)
        if (p.sub_channels && p.sub_channels.length > 0) {
          if (!existing.sub_channels) existing.sub_channels = []
          p.sub_channels.forEach(sub => {
            const existingSub = existing.sub_channels?.find(s => s.name === sub.name)
            if (existingSub) {
              existingSub.revenue += (sub.revenue || 0); existingSub.margin += (sub.margin || 0); existingSub.units += (sub.units || 0); existingSub.gpm2 += (sub.gpm2 || 0)
            } else {
              existing.sub_channels?.push({ ...sub })
            }
          })
        }
      } else {
        nonStrategicMap.set(key, { ...p })
      }
    })

    return Array.from(nonStrategicMap.values()).map(d => ({
      ...d,
      margin_percent: d.revenue > 0 ? (d.margin / d.revenue) * 100 : 0,
      gpm2_percent: d.revenue > 0 ? (d.gpm2 / d.revenue) * 100 : 0,
      sub_channels: d.sub_channels ? d.sub_channels.map(sc => ({
        ...sc,
        margin_percent: sc.revenue > 0 ? (sc.margin / sc.revenue) * 100 : 0,
        gpm2_percent: sc.revenue > 0 ? (sc.gpm2 / sc.revenue) * 100 : 0,
      })) : undefined,
    }))
  }

  // nonStrategicMemo sau getFilteredOtherTiers (tránh temporal dead zone với const)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nonStrategicMemo = useMemo(() => getFilteredOtherTiers(), [wholesaleCustomers, strategicPerformance, partnerTiers])

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8" ref={reportRef}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-sans tracking-tight">B2B Performance Summary</h1>
            <p className="text-slate-500 font-medium tracking-tight">Main consolidated report for all B2B activities and tier-based performance.</p>
          </div>
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 px-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer" />
              <span className="text-slate-300">|</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer" />
            </div>
            <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} variant="dropdown" />
            <div className="h-4 w-px bg-slate-200 mx-2"></div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setDateColumn("fulfiled_date")} className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all", dateColumn === "fulfiled_date" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>Fulfillment</button>
              <button onClick={() => setDateColumn("created_date")} className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all", dateColumn === "created_date" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>Created</button>
            </div>
            {dbRole === "creator" && (
              <button onClick={() => setShowCostModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-bold text-xs">
                <Settings className="w-3.5 h-3.5" />Manage Costs
              </button>
            )}
            <button onClick={() => fetchData()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95">
              <Filter className="w-3.5 h-3.5" />Apply Filters
            </button>
            <button onClick={exportToPDF} disabled={exporting} className={cn("flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95 disabled:opacity-50", exporting && "animate-pulse")}>
              <FileText className="w-3.5 h-3.5" />{exporting ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" /><p className="text-sm font-medium tracking-tight">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-32 rounded-3xl bg-white border border-slate-200">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-slate-500 font-medium animate-pulse">Loading data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Combined KPIs */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>MTD Performance (Actual)
                </h3>
                {projectionFactor > 1 && <span className="text-[10px] font-bold text-slate-400 italic">Historical data up to {endDate}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {combinedKpis.map((kpi, idx) => (
                  <div key={`actual-${idx}`} className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className={cn("p-2 rounded-xl", idx === 0 ? "bg-blue-50 text-blue-600" : idx === 1 ? "bg-emerald-50 text-emerald-600" : idx === 2 ? "bg-purple-50 text-purple-600" : idx === 3 ? "bg-orange-50 text-orange-600" : "bg-indigo-50 text-indigo-600")}>{kpi.icon}</div>
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">{kpi.label}</p>
                    <div className="flex items-baseline gap-1 overflow-hidden">
                      <span className="text-base lg:text-lg font-black text-slate-900 tracking-tighter truncate">
                        {kpi.isCurrency ? Math.round(kpi.actualValue || 0).toLocaleString("vi-VN") : (kpi.actualValue || 0).toLocaleString() + (kpi.label.includes("%") ? "%" : "")}
                      </span>
                      {kpi.isCurrency && <span className="text-[9px] font-bold text-slate-400">VND</span>}
                    </div>
                  </div>
                ))}
              </div>

              {isProjectable && (
                <>
                  <div className="flex items-center justify-between px-2 pt-4 border-t border-slate-200">
                    <h3 className="text-xs font-black text-blue-700 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 fill-blue-500 text-blue-500" />Full Period Forecast (Projected)
                    </h3>
                    <span className="text-[10px] font-bold text-blue-500/60 italic">Projection Factor: {projectionFactor.toFixed(2)}x</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {combinedKpis.map((kpi, idx) => (
                      <div key={`projected-${idx}`} className="bg-blue-50/50 p-4 lg:p-5 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity"><Zap className="w-12 h-12 text-blue-600" /></div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200/50">{kpi.icon}</div>
                          {kpi.change !== 0 && (
                            <div className={cn("flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-lg shadow-sm bg-white", kpi.isPositive ? "text-emerald-600" : "text-rose-600")}>
                              {kpi.isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{Math.abs(kpi.change).toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-1 truncate">Proj. {kpi.label}</p>
                        <div className="flex items-baseline gap-1 overflow-hidden">
                          <span className="text-base lg:text-lg font-black text-blue-800 tracking-tighter truncate">
                            {kpi.isCurrency ? Math.round(kpi.value).toLocaleString("vi-VN") : kpi.value.toLocaleString() + (kpi.label.includes("%") ? "%" : "")}
                          </span>
                          {kpi.isCurrency && <span className="text-[9px] font-bold text-blue-400">VND</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* B2B Performance Trend Chart */}
            {trendData.length > 0 && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">Revenue & CM1 Trend</h3>
                    <p className="text-xs text-slate-500 font-medium tracking-tight">Performance tracking across B2B channels</p>
                    <div className="flex items-center gap-1 mt-4 p-1 bg-slate-100 rounded-xl w-fit">
                      {(["day", "week", "month"] as const).map(g => (
                        <button key={g} onClick={() => setGranularity(g)} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all", granularity === g ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><div className="w-3 h-1.5 rounded-full bg-blue-600"></div><span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Revenue (Bar)</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-indigo-600"></div><span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">CM1 (Line)</span></div>
                  </div>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }} tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", padding: "12px" }} formatter={(value: any) => [formatCurrency(value).replace("₫", "VND"), ""]} />
                      <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} name="Revenue" barSize={trendData.length > 20 ? 12 : 24} opacity={0.8} />
                      <Line type="monotone" dataKey="gpm2" stroke="#4f46e5" strokeWidth={3} dot={{ fill: "#4f46e5", r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} name="CM1" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Strategic Partners Table */}
            {partnerTiers.Strategic && partnerTiers.Strategic.length > 0 && (
              <div className="bg-white rounded-3xl border-2 border-indigo-100 shadow-lg shadow-indigo-100/20 overflow-hidden">
                <div className="px-8 py-6 border-b border-indigo-50 flex items-center justify-between bg-indigo-50/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200"><Shield className="w-5 h-5 text-white" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-sans tracking-tight">Strategic Partners Performance</h2>
                      <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">High Priority Partners Tracking</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => {
                      const columns: { label: string; key: string }[] = [{ label: "Partner", key: "name" }, { label: "Tier", key: "tier" }, { label: "Revenue", key: "revenue" }]
                      if (isProjectable) { columns.push({ label: "Projected Revenue", key: "projected_revenue" }, { label: "Projected GP", key: "projected_margin" }, { label: "Projected CM1", key: "projected_gpm2" }) }
                      columns.push({ label: "Units", key: "units" }, { label: "GP", key: "margin" }, { label: "Margin %", key: "margin_percent" }, { label: "CM1", key: "gpm2" }, { label: "CM1 %", key: "gpm2_percent" })
                      const exportData = strategicPerformance.map(d => ({ ...d, projected_revenue: Math.round(d.revenue * projectionFactor), projected_margin: Math.round(d.margin * projectionFactor), projected_gpm2: Math.round(d.margin * projectionFactor - (d.margin - d.gpm2)) }))
                      exportToCSV(exportData, "Strategic_Partners_Performance", columns)
                    }} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all font-bold text-[10px]">
                      <Download className="w-3 h-3" />Export
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold"><Zap className="w-3 h-3" />PRIORITY TRACKING</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-indigo-50/20">
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Partner</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">Revenue</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">Units</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">GP</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">Margin %</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">CM1</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-indigo-600 uppercase tracking-widest text-right">CM1 %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-50">
                      {(() => {
                        const tiers = Array.from(new Set(strategicPerformance.map(p => p.tier))).sort()
                        return (
                          <>
                            {tiers.map((tier, tierIdx) => {
                              const tierData = strategicPerformance.filter(p => p.tier === tier)
                              if (tierData.length === 0) return null
                              return (
                                <React.Fragment key={tier}>
                                  <tr className="bg-indigo-50/30 border-y border-indigo-100">
                                    <td colSpan={7} className="px-8 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{tier}</td>
                                  </tr>
                                  {tierData.map((row, idx) => {
                                    const isExpanded = expandedRow === row.name
                                    return (
                                      <React.Fragment key={`${tierIdx}-${idx}`}>
                                        <tr className={cn("hover:bg-indigo-50/30 transition-colors group cursor-pointer", isExpanded && "bg-indigo-50/50")} onClick={() => setExpandedRow(isExpanded ? null : row.name)}>
                                          <td className="px-8 py-4">
                                            <div className="flex items-center gap-2">
                                              <Check className="w-3 h-3 text-indigo-500" />
                                              <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{row.name}</span>
                                                <span className="text-[9px] text-indigo-500 font-bold flex items-center gap-0.5">{isExpanded ? "Hide details" : "View details"}<ChevronDown className={cn("w-2.5 h-2.5 transition-transform", isExpanded && "rotate-180")} /></span>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-8 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                              <span className="text-sm font-bold text-slate-800 tracking-tight">{formatCurrency(row.revenue).replace("₫", "VND")}</span>
                                              {isProjectable && <span className="text-[10px] font-bold text-blue-500 mt-0.5">Est. {formatCurrency(row.revenue * projectionFactor).replace("₫", "")}</span>}
                                            </div>
                                          </td>
                                          <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600 tracking-tight">{formatNumber(row.units)}</span></td>
                                          <td className="px-8 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                              <span className={cn("text-sm font-bold tracking-tight", row.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(row.margin).replace("₫", "VND")}</span>
                                              {isProjectable && <span className="text-[10px] font-bold text-emerald-600/70 mt-0.5">Est. {formatCurrency(row.margin * projectionFactor).replace("₫", "")}</span>}
                                            </div>
                                          </td>
                                          <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600">{row.margin_percent.toFixed(1)}%</span></td>
                                          <td className="px-8 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                              <span className={cn("text-sm font-bold tracking-tight", row.gpm2 >= 0 ? "text-indigo-600" : "text-rose-600")}>{formatCurrency(row.gpm2).replace("₫", "VND")}</span>
                                              {isProjectable && <span className="text-[10px] font-bold text-indigo-600/70 mt-0.5">Est. {formatCurrency(row.gpm2 * projectionFactor).replace("₫", "")}</span>}
                                            </div>
                                          </td>
                                          <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600">{row.gpm2_percent.toFixed(1)}%</span></td>
                                        </tr>
                                        {isExpanded && (
                                          <tr className="bg-indigo-50/10">
                                            <td colSpan={7} className="px-8 py-3">
                                              <div className="space-y-4">
                                                {row.sub_channels && row.sub_channels.length > 0 && (
                                                  <div className="bg-white/40 border border-indigo-50 rounded-xl overflow-hidden backdrop-blur-sm">
                                                    <table className="w-full text-[10px]">
                                                      <thead>
                                                        <tr className="bg-indigo-50/50">
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-left">Sub-channel</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">Revenue</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">Units</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">GP</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">Margin%</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">CM1</th>
                                                          <th className="px-3 py-1.5 font-bold text-indigo-400 uppercase tracking-wider text-right">CM1%</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-indigo-50/30">
                                                        {row.sub_channels.map((sc, scIdx) => (
                                                          <tr key={scIdx}>
                                                            <td className="px-3 py-1.5 font-bold text-slate-700">{sc.name}</td>
                                                            <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(Math.round(sc.revenue))}</td>
                                                            <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(sc.units)}</td>
                                                            <td className="px-3 py-1.5 text-right font-bold text-emerald-600">{formatNumber(Math.round(sc.margin))}</td>
                                                            <td className="px-3 py-1.5 text-right font-medium text-slate-600">{sc.margin_percent.toFixed(1)}%</td>
                                                            <td className="px-3 py-1.5 text-right font-bold text-indigo-600">{formatNumber(Math.round(sc.gpm2))}</td>
                                                            <td className="px-3 py-1.5 text-right font-medium text-indigo-500 font-bold">{sc.gpm2_percent.toFixed(1)}%</td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                )}
                                                <div className="grid grid-cols-4 gap-4">
                                                  {(["ads", "platformFee", "sponsorProducts", "media"] as const).map(category => {
                                                    const amount = row.cost_breakdown?.[category] || 0
                                                    return (
                                                      <div key={category} className="bg-white/60 p-2.5 rounded-xl border border-indigo-100 shadow-sm backdrop-blur-sm">
                                                        <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">{category.replace(/([A-Z])/g, " $1")}</p>
                                                        <div className="flex items-baseline justify-between"><p className="text-xs font-bold text-slate-700">{formatNumber(Math.round(amount))}</p></div>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    )
                                  })}
                                </React.Fragment>
                              )
                            })}
                            {strategicPerformance.length > 0 && (() => {
                              const totals = strategicPerformance.reduce((acc, curr) => ({ revenue: acc.revenue + curr.revenue, units: acc.units + curr.units, margin: acc.margin + curr.margin, gpm2: acc.gpm2 + curr.gpm2 }), { revenue: 0, units: 0, margin: 0, gpm2: 0 })
                              const margin_percent = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0
                              const gpm2_percent = totals.revenue > 0 ? (totals.gpm2 / totals.revenue) * 100 : 0
                              return (
                                <tr className="bg-indigo-50/80 font-bold border-t-2 border-indigo-100 italic">
                                  <td className="px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-indigo-700">TOTAL STRATEGIC</td>
                                  <td className="px-8 py-4 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm font-black text-slate-900">{formatCurrency(Math.round(totals.revenue)).replace("₫", "VND")}</span>
                                      {isProjectable && <span className="text-[10px] font-bold text-blue-600 mt-0.5">Est. {formatCurrency(Math.round(totals.revenue * projectionFactor)).replace("₫", "")}</span>}
                                    </div>
                                  </td>
                                  <td className="px-8 py-4 text-right text-sm text-slate-800">{formatNumber(Math.round(totals.units))}</td>
                                  <td className="px-8 py-4 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm font-black text-emerald-700">{formatCurrency(Math.round(totals.margin)).replace("₫", "VND")}</span>
                                      {isProjectable && <span className="text-[10px] font-bold text-emerald-600/90 mt-0.5">Est. {formatCurrency(Math.round(totals.margin * projectionFactor)).replace("₫", "")}</span>}
                                    </div>
                                  </td>
                                  <td className="px-8 py-4 text-right text-sm text-slate-700">{margin_percent.toFixed(1)}%</td>
                                  <td className="px-8 py-4 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm font-black text-indigo-700">{formatCurrency(Math.round(totals.gpm2)).replace("₫", "VND")}</span>
                                      {isProjectable && <span className="text-[10px] font-bold text-indigo-600/90 mt-0.5">Est. {formatCurrency(Math.round(totals.gpm2 * projectionFactor)).replace("₫", "")}</span>}
                                    </div>
                                  </td>
                                  <td className="px-8 py-4 text-right text-sm text-slate-700">{gpm2_percent.toFixed(1)}%</td>
                                </tr>
                              )
                            })()}
                            {strategicPerformance.length === 0 && (
                              <tr><td colSpan={7} className="px-8 py-12 text-center text-slate-400 italic">No strategic partners tracking data available for the selected period.</td></tr>
                            )}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              {/* Other Tiers Customers Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 rounded-xl"><Building2 className="w-5 h-5 text-white" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-sans tracking-tight">Other Tiers Customers</h2>
                      <p className="text-xs text-slate-500 font-medium">Performance by individual non-strategic customers.</p>
                    </div>
                  </div>
                  <button onClick={() => {
                    const nonStrategic = getFilteredOtherTiers()
                    const columns: { label: string; key: string }[] = [{ label: "Customer Name", key: "name" }, { label: "Revenue", key: "revenue" }]
                    if (isProjectable) { columns.push({ label: "Projected Revenue", key: "projected_revenue" }, { label: "Projected GP", key: "projected_margin" }, { label: "Projected CM1", key: "projected_gpm2" }) }
                    columns.push({ label: "Units Sold", key: "units" }, { label: "Gross Profit", key: "margin" }, { label: "Margin %", key: "margin_percent" }, { label: "CM1", key: "gpm2" }, { label: "CM1 %", key: "gpm2_percent" })
                    const exportData = nonStrategic.map(d => ({ ...d, projected_revenue: Math.round(d.revenue * projectionFactor), projected_margin: Math.round(d.margin * projectionFactor), projected_gpm2: Math.round(d.margin * projectionFactor - (d.margin - d.gpm2)) }))
                    exportToCSV(exportData, "Other_Tiers_Customers", columns)
                  }} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px]">
                    <Download className="w-3 h-3" />CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        {([["name", "Customer Name"], ["revenue", "Revenue"], ["units", "Units Sold"], ["margin", "Gross Profit"], ["margin_percent", "Margin %"], ["gpm2", "CM1"], ["gpm2_percent", "CM1 %"]] as [keyof PerformanceData, string][]).map(([key, label], i) => (
                          <th key={key} className={cn("px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors", i > 0 && "text-right")} onClick={() => setWholesaleSort({ key, direction: wholesaleSort.key === key && wholesaleSort.direction === "desc" ? "asc" : "desc" })}>
                            <div className={cn("flex items-center", i > 0 && "justify-end")}>{label}<SortIcon sort={wholesaleSort} column={key} /></div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(() => {
                        const nonStrategic = nonStrategicMemo
                        const sorted = sortData(nonStrategic, wholesaleSort)
                        const totals = sorted.reduce((acc, curr) => ({ revenue: acc.revenue + curr.revenue, units: acc.units + curr.units, margin: acc.margin + curr.margin, gpm2: acc.gpm2 + curr.gpm2 }), { revenue: 0, units: 0, margin: 0, gpm2: 0 })
                        const margin_percent = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0
                        const gpm2_percent = totals.revenue > 0 ? (totals.gpm2 / totals.revenue) * 100 : 0

                        // Group by sub_group_name (from dim_order_source)
                        const hasGroups = sorted.some(r => r.sub_group_name)
                        const groups = new Map<string, PerformanceData[]>()
                        sorted.forEach(row => {
                          const grp = row.sub_group_name || (hasGroups ? "Khác" : "__flat__")
                          if (!groups.has(grp)) groups.set(grp, [])
                          groups.get(grp)!.push(row)
                        })

                        const renderRow = (row: PerformanceData, idx: number) => {
                              const isExpanded = expandedRow === row.name
                              const costs = monthlyCosts[row.name]
                              return (
                                <React.Fragment key={idx}>
                                  <tr className={cn("hover:bg-slate-50/50 transition-colors group cursor-pointer", isExpanded && "bg-blue-50/30")} onClick={() => setExpandedRow(isExpanded ? null : row.name)}>
                                    <td className="px-8 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{row.name}</span>
                                        <span className="text-[9px] text-blue-500 font-bold flex items-center gap-0.5">{isExpanded ? "Hide details" : "View details"}<ChevronDown className={cn("w-2.5 h-2.5 transition-transform", isExpanded && "rotate-180")} /></span>
                                      </div>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                      <div className="flex flex-col items-end">
                                        <span className="text-sm font-bold text-slate-800 tracking-tight">{formatCurrency(row.revenue).replace("₫", "VND")}</span>
                                        {isProjectable && <span className="text-[10px] font-bold text-blue-500 mt-0.5">Est. {formatCurrency(row.revenue * projectionFactor).replace("₫", "")}</span>}
                                      </div>
                                    </td>
                                    <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600 tracking-tight">{formatNumber(row.units)}</span></td>
                                    <td className="px-8 py-4 text-right">
                                      <div className="flex flex-col items-end">
                                        <span className={cn("text-sm font-bold tracking-tight", row.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(row.margin).replace("₫", "VND")}</span>
                                        {isProjectable && <span className="text-[10px] font-bold text-emerald-600/70 mt-0.5">Est. {formatCurrency(row.margin * projectionFactor).replace("₫", "")}</span>}
                                      </div>
                                    </td>
                                    <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600">{row.margin_percent.toFixed(1)}%</span></td>
                                    <td className="px-8 py-4 text-right">
                                      <div className="flex flex-col items-end">
                                        <span className={cn("text-sm font-bold tracking-tight", row.gpm2 >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(row.gpm2).replace("₫", "VND")}</span>
                                        {isProjectable && <span className="text-[10px] font-bold text-emerald-600/70 mt-0.5">Est. {formatCurrency(row.gpm2 * projectionFactor).replace("₫", "")}</span>}
                                      </div>
                                    </td>
                                    <td className="px-8 py-4 text-right"><span className="text-sm font-bold text-slate-600">{row.gpm2_percent.toFixed(1)}%</span></td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-slate-50/80">
                                      <td colSpan={7} className="px-8 py-3">
                                        <div className="space-y-4">
                                          {row.sub_channels && row.sub_channels.length > 0 && (
                                            <div className="bg-white/60 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                              <table className="w-full text-[10px]">
                                                <thead>
                                                  <tr className="bg-slate-100">
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-left">Sub-channel</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">Units</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">GP</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">Margin%</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">CM1</th>
                                                    <th className="px-3 py-1.5 font-bold text-slate-500 uppercase tracking-wider text-right">CM1%</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {row.sub_channels.map((sc, scIdx) => (
                                                    <tr key={scIdx}>
                                                      <td className="px-3 py-1.5 font-bold text-slate-700">{sc.name}</td>
                                                      <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(Math.round(sc.revenue))}</td>
                                                      <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(sc.units)}</td>
                                                      <td className="px-3 py-1.5 text-right font-bold text-emerald-600">{formatNumber(Math.round(sc.margin))}</td>
                                                      <td className="px-3 py-1.5 text-right font-medium text-slate-600">{sc.margin_percent.toFixed(1)}%</td>
                                                      <td className="px-3 py-1.5 text-right font-bold text-blue-600">{formatNumber(Math.round(sc.gpm2))}</td>
                                                      <td className="px-3 py-1.5 text-right font-medium text-blue-500 font-bold">{sc.gpm2_percent.toFixed(1)}%</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                          <div className="grid grid-cols-4 gap-4">
                                            {(["ads", "platformFee", "sponsorProducts", "media"] as const).map(category => {
                                              const amount = row.cost_breakdown?.[category] || costs?.[category] || 0
                                              return (
                                                <div key={category} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{category.replace(/([A-Z])/g, " $1")}</p>
                                                  <div className="flex items-baseline justify-between"><p className="text-xs font-bold text-slate-700">{formatNumber(Math.round(amount))}</p></div>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                        }

                        return (
                          <>
                            {Array.from(groups.entries()).map(([grpName, grpRows]) => {
                              if (grpName === "__flat__") {
                                // No sub_group_name data — render flat (backward compat)
                                return grpRows.map((row, idx) => renderRow(row, idx))
                              }
                              const gT = grpRows.reduce((a, c) => ({ revenue: a.revenue + c.revenue, units: a.units + c.units, margin: a.margin + c.margin, gpm2: a.gpm2 + c.gpm2 }), { revenue: 0, units: 0, margin: 0, gpm2: 0 })
                              return (
                                <React.Fragment key={grpName}>
                                  {/* Group header */}
                                  <tr className="bg-blue-50/40 border-y border-blue-100">
                                    <td colSpan={7} className="px-8 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{grpName}</td>
                                  </tr>
                                  {grpRows.map((row, idx) => renderRow(row, idx))}
                                  {/* Group total */}
                                  <tr className="bg-blue-50/20 border-t border-blue-100">
                                    <td className="px-8 py-2.5 text-[10px] font-black text-blue-700 uppercase tracking-wider pl-10">↳ Tổng {grpName}</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-black text-slate-800">{formatCurrency(Math.round(gT.revenue)).replace("₫","VND")}</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-bold text-slate-600">{formatNumber(Math.round(gT.units))}</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-black text-emerald-700">{formatCurrency(Math.round(gT.margin)).replace("₫","VND")}</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-bold text-slate-600">{gT.revenue > 0 ? ((gT.margin/gT.revenue)*100).toFixed(1) : "0.0"}%</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-black text-indigo-700">{formatCurrency(Math.round(gT.gpm2)).replace("₫","VND")}</td>
                                    <td className="px-8 py-2.5 text-right text-xs font-bold text-slate-600">{gT.revenue > 0 ? ((gT.gpm2/gT.revenue)*100).toFixed(1) : "0.0"}%</td>
                                  </tr>
                                </React.Fragment>
                              )
                            })}
                            <tr className="bg-slate-100/80 font-black border-t-2 border-slate-200 italic">
                              <td className="px-8 py-4 text-[11px] uppercase tracking-[0.2em] text-slate-700 font-bold">TOTAL OTHERS</td>
                              <td className="px-8 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-slate-900">{formatCurrency(Math.round(totals.revenue)).replace("₫", "VND")}</span>
                                  {isProjectable && <span className="text-[10px] font-bold text-blue-600 mt-0.5">Est. {formatCurrency(Math.round(totals.revenue * projectionFactor)).replace("₫", "")}</span>}
                                </div>
                              </td>
                              <td className="px-8 py-4 text-right text-sm text-slate-800">{formatNumber(Math.round(totals.units))}</td>
                              <td className="px-8 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-emerald-700">{formatCurrency(Math.round(totals.margin)).replace("₫", "VND")}</span>
                                  {isProjectable && <span className="text-[10px] font-bold text-emerald-600/90 mt-0.5">Est. {formatCurrency(Math.round(totals.margin * projectionFactor)).replace("₫", "")}</span>}
                                </div>
                              </td>
                              <td className="px-8 py-4 text-right text-sm text-slate-700">{margin_percent.toFixed(1)}%</td>
                              <td className="px-8 py-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-indigo-700">{formatCurrency(Math.round(totals.gpm2)).replace("₫", "VND")}</span>
                                  {isProjectable && <span className="text-[10px] font-bold text-indigo-600/90 mt-0.5">Est. {formatCurrency(Math.round(totals.gpm2 * projectionFactor)).replace("₫", "")}</span>}
                                </div>
                              </td>
                              <td className="px-8 py-4 text-right text-sm text-slate-700">{gpm2_percent.toFixed(1)}%</td>
                            </tr>
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <CostManagementModal isOpen={showCostModal} onClose={() => setShowCostModal(false)} onSave={() => fetchData(true)} initialMonth={startDate.slice(0, 7)} />
    </div>
  )
}
