"use client"

import React, { useState, useEffect } from "react"
import {
  TrendingUp, Download, PieChart, Calendar, DollarSign, Filter, Globe, Package, User, Layout,
} from "lucide-react"
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts"
import { formatCurrency, formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { cn } from "@/lib/utils"

// Port "y hệt" gohub-intel AllTimeReport. Backend /api/analytics/all-time-performance (CM1 = margin − op-cost,
// đã align) + /api/channels. Adapt: "use client"; bỏ motion; inline getDefaultDateRange.

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

interface PerformanceData {
  period: string; group_name: string; revenue: number; margin: number; gpm: number; gpm2_val: number; gpm2: number
}
interface AllTimePerformance { monthly: PerformanceData[]; quarterly: PerformanceData[] }

export default function AllTimeReport() {
  const [data, setData] = useState<AllTimePerformance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<"monthly" | "quarterly">("monthly")
  const [metricView, setMetricView] = useState<"revenue" | "gpm" | "gpm2">("revenue")
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)

  const [channels, setChannels] = useState<string[]>([])
  const [selectedChannel, setSelectedChannel] = useState("")
  const [selectedChannelGroup, setSelectedChannelGroup] = useState("")
  const [selectedCustomerTier, setSelectedCustomerTier] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { fetchChannels() }, [])
  useEffect(() => {
    fetchChannels(selectedChannelGroup, selectedCustomerTier)
    setSelectedChannel("")
  }, [selectedChannelGroup, selectedCustomerTier]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchChannels = async (channelGroup?: string, tier?: string) => {
    try {
      const params = new URLSearchParams()
      if (channelGroup) params.append("channelGroup", channelGroup)
      if (tier && channelGroup === "B2B") params.append("tier", tier)
      const url = `/api/channels${params.toString() ? `?${params.toString()}` : ""}`
      const response = await fetch(url)
      if (response.ok) setChannels(await response.json())
    } catch (err) {
      console.error("Error fetching channels:", err)
    }
  }

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        startDate, endDate,
        ...(selectedChannelGroup && { channelGroup: selectedChannelGroup }),
        ...(selectedCustomerTier && { customerTier: selectedCustomerTier }),
        ...(selectedChannel && { channel: selectedChannel }),
      })
      const response = await fetch(`/api/analytics/all-time-performance?${params}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to fetch performance data")
      setData(result)
    } catch (err: any) {
      console.error("Failed to fetch all-time performance:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [selectedChannelGroup, selectedCustomerTier, selectedChannel]) // eslint-disable-line react-hooks/exhaustive-deps

  const processChartData = (perfData: PerformanceData[]) => {
    if (!perfData) return []
    const periods = Array.from(new Set(perfData.map(d => d.period))).sort()
    return periods.map(period => {
      const b2bStrategic = perfData.find(d => d.period === period && d.group_name === "B2B-Strategic")
      const b2bNonStrategic = perfData.find(d => d.period === period && d.group_name === "B2B-Non-Strategic")
      const b2c = perfData.find(d => d.period === period && d.group_name === "B2C")

      const b2bTotalMetric = Number(b2bStrategic?.[metricView] || 0) + Number(b2bNonStrategic?.[metricView] || 0)
      let b2bWeighted = b2bTotalMetric
      let totalMetric = b2bTotalMetric + Number(b2c?.[metricView] || 0)

      if (metricView === "gpm" || metricView === "gpm2") {
        const b2bTotalRev = Number(b2bStrategic?.revenue || 0) + Number(b2bNonStrategic?.revenue || 0)
        const b2bTotalVal = Number(b2bStrategic?.[metricView === "gpm" ? "margin" : "gpm2_val"] || 0) +
                            Number(b2bNonStrategic?.[metricView === "gpm" ? "margin" : "gpm2_val"] || 0)
        b2bWeighted = b2bTotalRev > 0 ? (b2bTotalVal / b2bTotalRev) * 100 : 0
        const allRev = b2bTotalRev + Number(b2c?.revenue || 0)
        const allVal = b2bTotalVal + Number(b2c?.[metricView === "gpm" ? "margin" : "gpm2_val"] || 0)
        totalMetric = allRev > 0 ? (allVal / allRev) * 100 : 0
      }

      return {
        name: period,
        b2bStrategic: Number(b2bStrategic?.[metricView] || 0),
        b2bNonStrategic: Number(b2bNonStrategic?.[metricView] || 0),
        b2b: b2bWeighted,
        b2c: Number(b2c?.[metricView] || 0),
        total: totalMetric,
      }
    })
  }

  const chartData = data ? processChartData(data[activeView]) : []

  const handleExport = () => {
    if (!data) return
    const periods = Array.from(new Set(data[activeView].map(d => d.period))).sort()
    const headers = [
      "Period", "B2B Strategic Revenue", "B2B Strategic GPM%", "B2B Strategic CM1%",
      "B2B Non-Strategic Revenue", "B2B Non-Strategic GPM%", "B2B Non-Strategic CM1%",
      "B2C Revenue", "B2C GPM%", "B2C CM1%", "Total Revenue",
    ]
    const csvRows = [headers.join(","), ...periods.map(period => {
      const b2bS = data[activeView].find(d => d.period === period && d.group_name === "B2B-Strategic")
      const b2bN = data[activeView].find(d => d.period === period && d.group_name === "B2B-Non-Strategic")
      const b2c = data[activeView].find(d => d.period === period && d.group_name === "B2C")
      const totalRev = (Number(b2bS?.revenue) || 0) + (Number(b2bN?.revenue) || 0) + (Number(b2c?.revenue) || 0)
      return [
        period, b2bS?.revenue || 0, (b2bS?.gpm || 0).toFixed(2), (b2bS?.gpm2 || 0).toFixed(2),
        b2bN?.revenue || 0, (b2bN?.gpm || 0).toFixed(2), (b2bN?.gpm2 || 0).toFixed(2),
        b2c?.revenue || 0, (b2c?.gpm || 0).toFixed(2), (b2c?.gpm2 || 0).toFixed(2), totalRev,
      ].join(",")
    })]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `All_Time_Performance_${activeView}_${startDate}_to_${endDate}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Loading all-time data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl max-w-md w-full text-center">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6 rotate-180" />
          </div>
          <h3 className="text-lg font-bold text-rose-900 mb-2">Failed to Load Data</h3>
          <p className="text-rose-700 text-sm mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all">Retry Loading</button>
        </div>
      </div>
    )
  }

  const totalSum = chartData.reduce((sum, d) => sum + d.total, 0)
  const avgSum = totalSum / (chartData.length || 1)

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All-Time Performance Report</h1>
          <p className="text-slate-500">Historical performance analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
            <button onClick={() => setActiveView("monthly")} className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all", activeView === "monthly" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>Monthly</button>
            <button onClick={() => setActiveView("quarterly")} className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all", activeView === "quarterly" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>Quarterly</button>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm transition-colors text-sm font-bold", showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />Filters
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel Group</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none" value={selectedChannelGroup} onChange={e => setSelectedChannelGroup(e.target.value)}>
                  <option value="">All Groups</option>
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
            </div>
            {selectedChannelGroup === "B2B" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Tier</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none" value={selectedCustomerTier} onChange={e => setSelectedCustomerTier(e.target.value)}>
                    <option value="">All Tiers</option>
                    <option value="Strategic">Strategic</option>
                    <option value="Non-strategic">Non-strategic</option>
                  </select>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{selectedChannelGroup === "B2B" ? "Customer Name" : "Channel"}</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none" value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}>
                  <option value="">All Channels</option>
                  {channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button onClick={() => { setSelectedChannelGroup(""); setSelectedCustomerTier(""); setSelectedChannel(""); setStartDate(getDefaultDateRange().startDate); setEndDate(getDefaultDateRange().endDate) }} className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Reset Filters</button>
            <button onClick={() => { fetchData(); setShowFilters(false) }} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Apply Filters</button>
          </div>
        </div>
      )}

      {/* Metric Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => setMetricView("revenue")} className={cn("p-4 rounded-2xl border transition-all text-left", metricView === "revenue" ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300")}>
          <div className="flex items-center justify-between mb-2">
            <div className={cn("p-2 rounded-xl", metricView === "revenue" ? "bg-blue-500" : "bg-blue-50")}><DollarSign className={cn("w-5 h-5", metricView === "revenue" ? "text-white" : "text-blue-600")} /></div>
          </div>
          <p className={cn("text-sm font-medium", metricView === "revenue" ? "text-blue-100" : "text-slate-500")}>Total Revenue</p>
          <p className="text-xl font-bold">{formatCurrency(totalSum)}</p>
        </button>
        <button onClick={() => setMetricView("gpm")} className={cn("p-4 rounded-2xl border transition-all text-left", metricView === "gpm" ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300")}>
          <div className="flex items-center justify-between mb-2">
            <div className={cn("p-2 rounded-xl", metricView === "gpm" ? "bg-indigo-500" : "bg-indigo-50")}><PieChart className={cn("w-5 h-5", metricView === "gpm" ? "text-white" : "text-indigo-600")} /></div>
          </div>
          <p className={cn("text-sm font-medium", metricView === "gpm" ? "text-indigo-100" : "text-slate-500")}>Avg. GPM %</p>
          <p className="text-xl font-bold">{avgSum.toFixed(2)}%</p>
        </button>
        <button onClick={() => setMetricView("gpm2")} className={cn("p-4 rounded-2xl border transition-all text-left", metricView === "gpm2" ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300")}>
          <div className="flex items-center justify-between mb-2">
            <div className={cn("p-2 rounded-xl", metricView === "gpm2" ? "bg-emerald-500" : "bg-emerald-50")}><TrendingUp className={cn("w-5 h-5", metricView === "gpm2" ? "text-white" : "text-emerald-600")} /></div>
          </div>
          <p className={cn("text-sm font-medium", metricView === "gpm2" ? "text-emerald-100" : "text-slate-500")}>Avg. CM1 %</p>
          <p className="text-xl font-bold">{avgSum.toFixed(2)}%</p>
        </button>
      </div>

      {/* Visual Analytics */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Historical Trend</h2>
            <p className="text-sm text-slate-500 capitalize">{activeView} {metricView} comparison</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-600"></div><span className="text-xs font-bold text-slate-600">B2B Strat</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-300"></div><span className="text-xs font-bold text-slate-600">B2B Non-Strat</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-indigo-800"></div><span className="text-xs font-bold text-slate-600">B2C</span></div>
          </div>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorB2BStrat" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                <linearGradient id="colorB2BNonStrat" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#93c5fd" stopOpacity={0.1} /><stop offset="95%" stopColor="#93c5fd" stopOpacity={0} /></linearGradient>
                <linearGradient id="colorB2C" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#312e81" stopOpacity={0.1} /><stop offset="95%" stopColor="#312e81" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }} tickFormatter={(val) => metricView === "revenue" ? formatCompactNumber(val) : `${val.toFixed(1)}%`} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(value: number) => [metricView === "revenue" ? formatCurrency(value) : `${value.toFixed(2)}%`, ""]} />
              <Area type="monotone" dataKey="b2bStrategic" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorB2BStrat)" />
              <Area type="monotone" dataKey="b2bNonStrategic" stroke="#93c5fd" strokeWidth={3} fillOpacity={1} fill="url(#colorB2BNonStrat)" />
              <Area type="monotone" dataKey="b2c" stroke="#312e81" strokeWidth={3} fillOpacity={1} fill="url(#colorB2C)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Data Breakdown</h2>
            <p className="text-sm text-slate-500">Detailed metrics by {activeView} and segment</p>
          </div>
          <Layout className="w-5 h-5 text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100" rowSpan={2}>Period</th>
                <th className="px-6 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center" colSpan={3}>B2B Strategic</th>
                <th className="px-6 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center" colSpan={3}>B2B Non-Strategic</th>
                <th className="px-6 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center" colSpan={3}>B2C Performance</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right" rowSpan={2}>Total Revenue</th>
              </tr>
              <tr className="bg-slate-50/30">
                {["bg-blue-50/30", "bg-sky-50/30", "bg-indigo-50/30"].flatMap(bg => ["Rev", "GPM", "CM1"].map((h, i) => (
                  <th key={`${bg}-${i}`} className={cn("px-2 py-2 text-[10px] font-bold text-slate-400 uppercase text-right border-b border-slate-100", bg)}>{h}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {chartData.slice().reverse().map((row) => {
                const b2bS = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2B-Strategic")
                const b2bN = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2B-Non-Strategic")
                const b2c = data?.[activeView].find(d => d.period === row.name && d.group_name === "B2C")
                const totalRev = (Number(b2bS?.revenue) || 0) + (Number(b2bN?.revenue) || 0) + (Number(b2c?.revenue) || 0)
                return (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 border-b border-slate-100 font-bold text-slate-800">{row.name}</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-blue-600 font-medium whitespace-nowrap">{formatCompactNumber(b2bS?.revenue || 0)}</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2bS?.gpm || 0).toFixed(1)}%</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2bS?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-sky-700 font-medium whitespace-nowrap">{formatCompactNumber(b2bN?.revenue || 0)}</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2bN?.gpm || 0).toFixed(1)}%</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2bN?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-indigo-800 font-medium whitespace-nowrap">{formatCompactNumber(b2c?.revenue || 0)}</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2c?.gpm || 0).toFixed(1)}%</td>
                    <td className="px-2 py-4 border-b border-slate-100 text-right text-slate-600">{(b2c?.gpm2 || 0).toFixed(1)}%</td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right font-bold text-slate-900 whitespace-nowrap">{formatCurrency(totalRev)}</td>
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
