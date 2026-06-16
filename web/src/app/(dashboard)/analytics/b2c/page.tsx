"use client"

import React, { useState, useEffect } from "react"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { ArrowUpRight, ArrowDownRight, Filter, Download, RefreshCw } from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"

function getDefaultDateRange() {
  const today = new Date(); const d = today.getDate()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  if (d <= 7) return { startDate: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) }
  return { startDate: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), d - 1)) }
}

function cn(...c: (string | boolean | undefined)[]) { return c.filter(Boolean).join(" ") }
const Sk = ({ className }: { className?: string }) => <div className={cn("animate-pulse bg-slate-200 rounded", className)} />

interface KPI { label: string; value: number; lastPeriod: number; change: number; isPositive: boolean; isCurrency?: boolean }
interface PerformanceRow { name: string; revenue: number; margin: number; margin_percent: number; gpm2: number; gpm2_percent: number; units: number; prev_revenue?: number }

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"]

export default function B2CPerformancePage() {
  const [kpis, setKpis]     = useState<KPI[]>([])
  const [trend, setTrend]   = useState<any[]>([])
  const [perf, setPerf]     = useState<PerformanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [startDate, setStartDate] = useState(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate]     = useState(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [groupBy, setGroupBy]       = useState<"channel" | "vendor" | "destination">("channel")
  const [period, setPeriod]         = useState<"month" | "quarter">("month")
  const [showFilters, setShowFilters] = useState(false)

  const fetchData = async () => {
    setLoading(true); setError(null)
    const q  = `?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&groupBy=${groupBy}&period=${period}`
    const fj = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
    try {
      const k = await fj(`/api/analytics/b2c/kpis${q}`)
      setKpis(k); setLoading(false)
      const [t, p] = await Promise.all([
        fj(`/api/analytics/b2c/trend${q}`),
        fj(`/api/analytics/b2c/performance${q}`),
      ])
      setTrend(t); setPerf(p)
    } catch (err: any) { setError(err.message); setLoading(false) }
  }

  useEffect(() => { fetchData() }, [dateColumn, groupBy, period])

  const exportCSV = () => {
    if (!perf.length) return
    const h = ["Name", "Revenue", "Margin", "Margin%", "Units"]
    const rows = perf.map(r => [`"${r.name}"`, r.revenue, r.margin, `${r.margin_percent.toFixed(2)}%`, r.units].join(","))
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" }))
    a.download = `b2c_${groupBy}_${startDate}_${endDate}.csv`; a.click()
  }

  const top5 = perf.slice(0, 5)
  const totalRev = perf.reduce((s, r) => s + r.revenue, 0)

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">B2C Performance</h1>
          <p className="text-sm text-slate-500">Shopee, TikTok, Momo, ngân hàng, kênh B2C — {startDate} đến {endDate}</p>
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
            {(["month", "quarter"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md capitalize transition-all", period === p ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>{p}</button>
            ))}
          </div>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none shadow-sm">
            <option value="channel">By Channel</option>
            <option value="vendor">By Vendor</option>
            <option value="destination">By Destination</option>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? Array(5).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3"><Sk className="h-4 w-24" /><Sk className="h-8 w-32" /></div>
        )) : kpis.map(kpi => (
          <div key={kpi.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500 mb-1">{kpi.label}</p>
            <h2 className="text-xl font-bold text-slate-900">{kpi.isCurrency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}</h2>
            <div className={cn("mt-2 flex items-center gap-1 text-xs font-bold", kpi.isPositive ? "text-emerald-600" : "text-rose-600")}>
              {kpi.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(kpi.change).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">B2C Revenue Trend ({period})</h3>
          <div className="h-[220px]">
            {loading ? <Sk className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="b2cRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#ec4899" strokeWidth={2.5} fill="url(#b2cRev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top 5 Bar Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Top 5 by {groupBy === "channel" ? "Channel" : groupBy === "vendor" ? "Vendor" : "Destination"}</h3>
          <div className="h-[220px]">
            {loading ? <Sk className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} width={140} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={22} fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">
            B2C Performance by {groupBy === "channel" ? "Channel" : groupBy === "vendor" ? "Vendor" : "Destination"}
          </h3>
          <span className="text-sm text-slate-500">Total: {formatCurrency(totalRev)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
              <tr>
                {["Name", "Revenue", "Share %", "Margin", "Margin %", "GPM2", "GPM2 %", "Units"].map(h => (
                  <th key={h} className={cn("px-4 py-3", h !== "Name" && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Sk className="h-4 w-20 ml-auto" /></td>)}</tr>
              )) : perf.map((r, i) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {r.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${totalRev > 0 ? (r.revenue / totalRev) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-slate-500 text-xs">{totalRev > 0 ? ((r.revenue / totalRev) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </td>
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
