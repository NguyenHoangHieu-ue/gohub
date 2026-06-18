"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  BarChart3, Calendar, TrendingUp, Download, PieChart,
  DollarSign, Filter, Globe, Package, User, RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber, getDefaultDateRange } from "@/lib/analytics-formatters"

interface PerformanceData {
  period: string; group_name: string
  revenue: number; margin: number; gpm: number; gpm2_val: number; gpm2: number
}
interface AllTimeData { monthly: PerformanceData[]; quarterly: PerformanceData[] }

type View   = "monthly" | "quarterly"
type Metric = "revenue" | "gpm" | "gpm2"

export default function AllTimePage() {
  const [data, setData] = useState<AllTimeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<View>("monthly")
  const [metricView, setMetricView] = useState<Metric>("revenue")
  const [startDate, setStartDate] = useState("2025-01-01")
  const [endDate,   setEndDate]   = useState(getDefaultDateRange().endDate)
  const [channelGroup, setChannelGroup] = useState("")
  const [customerTier, setCustomerTier] = useState("")
  const [channel, setChannel] = useState("")
  const [channels, setChannels] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetch(`/api/channels?channelGroup=${channelGroup}`)
      .then(r => r.ok ? r.json() : [])
      .then(setChannels)
      .catch(() => {})
  }, [channelGroup])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ startDate, endDate })
      if (channelGroup) p.set("channelGroup", channelGroup)
      if (customerTier) p.set("customerTier", customerTier)
      if (channel)      p.set("channel", channel)
      const res = await fetch(`/api/analytics/all-time-performance?${p}`)
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi tải dữ liệu")
      setData(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, channelGroup, customerTier, channel])

  useEffect(() => { fetchData() }, [channelGroup, customerTier, channel])

  // Build chart data from period rows
  const buildChart = (rows: PerformanceData[]) => {
    const periods = Array.from(new Set(rows.map(d => d.period))).sort()
    return periods.map(period => {
      const b2bS  = rows.find(d => d.period === period && d.group_name === "B2B-Strategic")
      const b2bN  = rows.find(d => d.period === period && d.group_name === "B2B-Non-Strategic")
      const b2c   = rows.find(d => d.period === period && d.group_name === "B2C")
      const b2bSV = Number(b2bS?.[metricView] || 0)
      const b2bNV = Number(b2bN?.[metricView] || 0)
      const b2cV  = Number(b2c?.[metricView]  || 0)
      return { name: period, b2bStrategic: b2bSV, b2bNonStrategic: b2bNV, b2c: b2cV, total: b2bSV + b2bNV + b2cV }
    })
  }

  const chartData = data ? buildChart(data[activeView]) : []
  const totalMetric = chartData.reduce((s, d) => s + d.total, 0)
  const avgMetric   = chartData.length > 0 ? totalMetric / chartData.length : 0

  const handleExport = () => {
    if (!data) return
    const rows = data[activeView]
    const periods = Array.from(new Set(rows.map(d => d.period))).sort()
    const headers = ["Period","B2B-Strat Rev","B2B-Strat GPM%","B2B-NonStrat Rev","B2B-NonStrat GPM%","B2C Rev","B2C GPM%","Total Rev"]
    const csvRows = [headers.join(","), ...periods.map(period => {
      const b2bS = rows.find(d => d.period === period && d.group_name === "B2B-Strategic")
      const b2bN = rows.find(d => d.period === period && d.group_name === "B2B-Non-Strategic")
      const b2c  = rows.find(d => d.period === period && d.group_name === "B2C")
      const total = (b2bS?.revenue || 0) + (b2bN?.revenue || 0) + (b2c?.revenue || 0)
      return [period, b2bS?.revenue||0, (b2bS?.gpm||0).toFixed(2), b2bN?.revenue||0, (b2bN?.gpm||0).toFixed(2), b2c?.revenue||0, (b2c?.gpm||0).toFixed(2), total].join(",")
    })]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `All_Time_${activeView}_${startDate}_${endDate}.csv`; a.click()
  }

  const fmtVal = (v: number) => metricView === "revenue" ? formatCurrency(v) : `${v.toFixed(2)}%`

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All-Time Performance Report</h1>
          <p className="text-slate-500 text-sm">Phân tích lịch sử doanh thu theo tháng và quý</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Monthly / Quarterly toggle */}
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
            {(["monthly", "quarterly"] as const).map(v => (
              <button key={v} onClick={() => setActiveView(v)}
                className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  activeView === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {v === "monthly" ? "Tháng" : "Quý"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm text-sm font-bold",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className="w-4 h-4" />
            Lọc
          </button>
          <button onClick={fetchData} disabled={loading}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
          </button>
          <button onClick={handleExport} disabled={!data}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-40">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Từ ngày</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Đến ngày</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhóm kênh</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select value={channelGroup} onChange={e => { setChannelGroup(e.target.value); setChannel("") }}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                  <option value="">Tất cả</option>
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
            </div>
            {channelGroup === "B2B" && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Customer Tier</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select value={customerTier} onChange={e => setCustomerTier(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                    <option value="">Tất cả</option>
                    <option value="Strategic">Strategic</option>
                    <option value="Non-Strategic">Non-Strategic</option>
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Kênh</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select value={channel} onChange={e => setChannel(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                  <option value="">Tất cả</option>
                  {channels.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button onClick={() => { setChannelGroup(""); setCustomerTier(""); setChannel(""); setStartDate("2025-01-01"); setEndDate(getDefaultDateRange().endDate) }}
              className="text-sm text-slate-500 hover:text-slate-700">
              Reset filter
            </button>
            <button onClick={() => { fetchData(); setShowFilters(false) }}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200">
              Áp dụng
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl text-sm">{error}</div>
      )}

      {/* Metric Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: "revenue" as Metric, label: "Tổng Doanh Thu", icon: DollarSign, color: "blue",    val: metricView === "revenue" ? formatCompactNumber(totalMetric) : "—" },
          { key: "gpm"     as Metric, label: "Avg. GPM %",     icon: PieChart,   color: "indigo",  val: metricView === "gpm"     ? `${avgMetric.toFixed(2)}%` : "—" },
          { key: "gpm2"    as Metric, label: "Avg. GPM2 %",    icon: TrendingUp, color: "emerald", val: metricView === "gpm2"    ? `${avgMetric.toFixed(2)}%` : "—" },
        ].map(m => (
          <button key={m.key} onClick={() => setMetricView(m.key)}
            className={cn("p-5 rounded-2xl border transition-all text-left",
              metricView === m.key
                ? m.color === "blue"   ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                : m.color === "indigo" ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200"
                :                        "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}>
            <div className={cn("p-2 rounded-xl w-fit mb-3",
              metricView === m.key
                ? m.color === "blue" ? "bg-blue-500" : m.color === "indigo" ? "bg-indigo-500" : "bg-emerald-500"
                : m.color === "blue" ? "bg-blue-50 text-blue-600" : m.color === "indigo" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600")}>
              <m.icon className="w-5 h-5" />
            </div>
            <p className={cn("text-sm font-medium", metricView === m.key ? "text-white/70" : "text-slate-500")}>{m.label}</p>
            <p className="text-xl font-bold mt-0.5">
              {loading ? "..." : metricView === m.key ? m.val : (
                m.key === "revenue"
                  ? formatCompactNumber(chartData.reduce((s, d) => s + d.total, 0))
                  : `${(chartData.length > 0 ? chartData.reduce((s, d) => s + d.total, 0) / chartData.length : 0).toFixed(2)}%`
              )}
            </p>
          </button>
        ))}
      </div>

      {/* Area Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-slate-900">Historical Trend</h2>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{activeView === "monthly" ? "Theo tháng" : "Theo quý"} — {metricView === "revenue" ? "Doanh thu" : metricView.toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />B2B Strategic</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-400 inline-block" />B2B Non-Strat</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-800 inline-block" />B2C</span>
          </div>
        </div>
        <div className="h-96">
          {loading ? <div className="w-full h-full bg-slate-100 animate-pulse rounded-xl" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {[["B2B Strat","#2563eb"], ["B2B Non","#38bdf8"], ["B2C","#312e81"]].map(([id, c]) => (
                    <linearGradient key={id} id={`grad${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={v => metricView === "revenue" ? formatCompactNumber(v) : `${v.toFixed(1)}%`} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                  formatter={(v: number) => [fmtVal(v), ""]} />
                <Area type="monotone" dataKey="b2bStrategic"    stroke="#2563eb" strokeWidth={2} fill="url(#gradB2B Strat)" name="B2B Strategic" />
                <Area type="monotone" dataKey="b2bNonStrategic" stroke="#38bdf8" strokeWidth={2} fill="url(#gradB2B Non)"   name="B2B Non-Strategic" />
                <Area type="monotone" dataKey="b2c"             stroke="#312e81" strokeWidth={2} fill="url(#gradB2C)"       name="B2C" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Data Breakdown</h2>
          <p className="text-xs text-slate-400 mt-0.5">Chi tiết theo {activeView === "monthly" ? "tháng" : "quý"} và phân khúc</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider" rowSpan={2}>Kỳ</th>
                <th className="px-3 py-2 text-[10px] font-bold text-blue-600 uppercase tracking-wider text-center border-b border-slate-100" colSpan={3}>B2B Strategic</th>
                <th className="px-3 py-2 text-[10px] font-bold text-sky-600 uppercase tracking-wider text-center border-b border-slate-100" colSpan={3}>B2B Non-Strategic</th>
                <th className="px-3 py-2 text-[10px] font-bold text-indigo-700 uppercase tracking-wider text-center border-b border-slate-100" colSpan={3}>B2C</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right" rowSpan={2}>Total</th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Rev","GPM%","GPM2%", "Rev","GPM%","GPM2%", "Rev","GPM%","GPM2%"].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                  {Array(10).fill(0).map((_, j) => <td key={j} className="px-2 py-3"><div className="h-4 bg-slate-100 rounded" /></td>)}
                </tr>
              )) : chartData.slice().reverse().map(row => {
                const b2bS = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2B-Strategic")
                const b2bN = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2B-Non-Strategic")
                const b2c  = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2C")
                const total = (b2bS?.revenue || 0) + (b2bN?.revenue || 0) + (b2c?.revenue || 0)
                return (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-800">{row.name}</td>
                    <td className="px-2 py-3 text-right text-blue-600 font-medium text-sm">{formatCompactNumber(b2bS?.revenue || 0)}</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2bS?.gpm  || 0).toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2bS?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right text-sky-700  font-medium text-sm">{formatCompactNumber(b2bN?.revenue || 0)}</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2bN?.gpm  || 0).toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2bN?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right text-indigo-800 font-medium text-sm">{formatCompactNumber(b2c?.revenue || 0)}</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2c?.gpm  || 0).toFixed(1)}%</td>
                    <td className="px-2 py-3 text-right text-slate-500 text-xs">{(b2c?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCompactNumber(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
