"use client"

import React, { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import { ArrowUpRight, ArrowDownRight, Filter, Download, RefreshCw, Shield } from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"

function getDefaultDateRange() {
  const today = new Date(); const d = today.getDate()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  if (d <= 7) return { startDate: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) }
  return { startDate: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), d - 1)) }
}

function cn(...c: (string | boolean | undefined)[]) { return c.filter(Boolean).join(" ") }
const Sk = ({ className }: { className?: string }) => <div className={cn("animate-pulse bg-slate-200 rounded", className)} />

interface PerformanceRow { name: string; revenue: number; margin: number; margin_percent: number; gpm2: number; gpm2_percent: number; units: number; prev_revenue?: number }
interface TrendRow { name: string; revenue: number; margin: number; margin_percent: number }
interface KPI { label: string; value: number; lastPeriod: number; change: number; isPositive: boolean; isCurrency?: boolean }

export default function B2BPerformancePage() {
  const [kpis, setKpis]       = useState<KPI[]>([])
  const [trend, setTrend]     = useState<TrendRow[]>([])
  const [perf, setPerf]       = useState<PerformanceRow[]>([])
  const [strategic, setStrategic] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [startDate, setStartDate] = useState(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate]     = useState(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("week")
  const [groupBy, setGroupBy]         = useState<"channel" | "vendor">("channel")
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [showFilters, setShowFilters]       = useState(false)

  const fetchData = async () => {
    setLoading(true); setError(null)
    const q  = `?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&comparisonType=${comparisonType}&granularity=${granularity}&groupBy=${groupBy}`
    const fj = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
    try {
      // Phase 1: KPIs (show immediately)
      const k = await fj(`/api/analytics/b2b/kpis${q}`)
      setKpis(k); setLoading(false)
      // Phase 2: charts + tables + strategic (parallel)
      const [t, p, s] = await Promise.all([
        fj(`/api/analytics/b2b/trend${q}`),
        fj(`/api/analytics/b2b/performance${q}`),
        fj(`/api/analytics/b2b/strategic-performance${q}`).catch(() => []),
      ])
      setTrend(t); setPerf(p); setStrategic(s)
    } catch (err: any) { setError(err.message); setLoading(false) }
  }

  useEffect(() => { fetchData() }, [dateColumn, granularity, groupBy, comparisonType])

  const exportCSV = () => {
    if (!perf.length) return
    const h = ["Name", "Revenue", "Margin", "Margin%", "GPM2", "GPM2%", "Units"]
    const rows = perf.map(r => [`"${r.name}"`, r.revenue, r.margin, `${r.margin_percent.toFixed(2)}%`, r.gpm2, `${r.gpm2_percent.toFixed(2)}%`, r.units].join(","))
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" }))
    a.download = `b2b_${startDate}_${endDate}.csv`; a.click()
  }

  const getProjectionFactor = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const end = new Date(endDate); const start = new Date(startDate)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    if (!isCurrentMonth) return null
    const targetDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const factor = targetDays / daysElapsed
    return factor > 1 ? factor : null
  }
  const projFactor = getProjectionFactor()

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">B2B Performance</h1>
          <p className="text-sm text-slate-500">Strategic Partners và Other Partners — {startDate} đến {endDate}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[38px] items-center">
            {(["fulfiled_date", "created_date"] as const).map(col => (
              <button key={col} onClick={() => setDateColumn(col)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", dateColumn === col ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {col === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[38px] items-center">
            {(["day", "week", "month"] as const).map(g => (
              <button key={g} onClick={() => setGranularity(g)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md capitalize transition-all", granularity === g ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>{g}</button>
            ))}
          </div>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none shadow-sm">
            <option value="channel">Group by Channel</option>
            <option value="vendor">Group by Vendor</option>
          </select>
          <select value={comparisonType} onChange={e => setComparisonType(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none shadow-sm">
            <option value="none">No comparison</option>
            <option value="previous_period">vs Previous Period</option>
            <option value="previous_year">vs Previous Year</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium shadow-sm", showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700")}>
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
          {[{ label: "Start Date", val: startDate, set: setStartDate }, { label: "End Date", val: endDate, set: setEndDate }].map(({ label, val, set }) => (
            <div key={label} className="flex-1 space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
              <input type="date" value={val} onChange={e => set(e.target.value)} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => { const r = getDefaultDateRange(); setStartDate(r.startDate); setEndDate(r.endDate) }} className="px-4 py-2 text-sm text-slate-500">Reset</button>
            <button onClick={() => { fetchData(); setShowFilters(false) }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Apply</button>
            {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin self-center" />}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">Lỗi: {error}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? Array(3).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3"><Sk className="h-4 w-24" /><Sk className="h-8 w-32" /></div>
        )) : kpis.slice(0, 3).map(kpi => (
          <div key={kpi.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-1">{kpi.label}</p>
            <h2 className="text-2xl font-bold text-slate-900">{kpi.isCurrency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}</h2>
            <div className={cn("mt-2 flex items-center gap-1 text-xs font-bold", kpi.isPositive ? "text-emerald-600" : "text-rose-600")}>
              {kpi.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(kpi.change).toFixed(1)}% vs prev
            </div>
          </div>
        ))}
      </div>

      {/* Strategic Partners */}
      {strategic.length > 0 && !loading && (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-5">
          <h3 className="font-bold text-indigo-900 flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5" /> Strategic Partners
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {strategic.map(s => (
              <div key={s.name} className="bg-white rounded-xl border border-indigo-100 p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{s.name}</p>
                    <p className="text-[10px] text-indigo-500 font-bold uppercase">{s.tier}</p>
                  </div>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full", s.mom >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    {s.mom >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(s.mom || 0).toFixed(1)}%
                  </div>
                </div>
                <p className="text-xl font-bold text-slate-900 mt-2">{formatCurrency(s.revenue)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{formatNumber(s.orders || 0)} orders · {formatNumber(s.units || 0)} units</p>
                {projFactor && <p className="text-xs text-blue-600 mt-1 font-medium">Projected: {formatCurrency(s.revenue * projFactor)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-6">B2B Revenue Trend</h3>
        <div className="h-[240px]">
          {loading ? <Sk className="w-full h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number, n: string) => [n === "margin_percent" ? `${v.toFixed(1)}%` : formatCurrency(v), n]} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="margin"  name="Margin"  stroke="#10b981" strokeWidth={2}   dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Performance by {groupBy === "channel" ? "Channel" : "Vendor"}</h3>
          {projFactor && <span className="text-xs text-blue-600 font-medium">Projection factor: ×{projFactor.toFixed(2)}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
              <tr>
                {["Name", "Revenue", ...(projFactor ? ["Dự phóng"] : []), "Margin", "Margin %", "GPM2", "GPM2 %", "Units"].map(h => (
                  <th key={h} className={cn("px-4 py-3", h !== "Name" && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Sk className="h-4 w-20 ml-auto" /></td>)}</tr>
              )) : perf.map(r => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {r.name}
                    {r.prev_revenue !== undefined && r.prev_revenue > 0 && comparisonType !== "none" && (
                      <span className={cn("ml-2 text-[10px] font-bold",
                        r.revenue >= r.prev_revenue ? "text-emerald-600" : "text-rose-600")}>
                        {r.revenue >= r.prev_revenue ? "▲" : "▼"} {Math.abs(((r.revenue - r.prev_revenue) / r.prev_revenue) * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.revenue)}</td>
                  {projFactor && <td className="px-4 py-3 text-right text-blue-600/80">{formatCurrency(r.revenue * projFactor)}</td>}
                  <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(r.margin)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{r.margin_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(r.gpm2)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{r.gpm2_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatNumber(r.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
