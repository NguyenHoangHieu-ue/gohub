"use client"

import React, { useState, useEffect } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
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

interface ChannelRow { channel: string; group_name: string; is_strategic: boolean; revenue: number; margin: number; margin_percent: number; gpm2: number; gpm2_percent: number; units: number; orders: number; mom: number }

export default function ChannelPerformancePage() {
  const [metrics, setMetrics]   = useState<any>(null)
  const [trend, setTrend]       = useState<any[]>([])
  const [perf, setPerf]         = useState<ChannelRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [startDate, setStartDate] = useState(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate]     = useState(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [channelGroup, setChannelGroup] = useState<"All" | "B2B" | "B2C">("All")
  const [showFilters, setShowFilters]   = useState(false)

  const fetchData = async () => {
    setLoading(true); setError(null)
    const q  = `?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&channelGroup=${channelGroup}`
    const fj = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
    try {
      const m = await fj(`/api/analytics/channels/kpis${q}`)
      setMetrics(m); setLoading(false)
      const [t, p] = await Promise.all([
        fj(`/api/analytics/channels/trend${q}`),
        fj(`/api/analytics/channels/performance${q}`),
      ])
      setTrend(t); setPerf(p)
    } catch (err: any) { console.error(err); setError("Hiếu đang fix, vui lòng đợi"); setLoading(false) }
  }

  useEffect(() => { fetchData() }, [dateColumn, channelGroup])

  const exportCSV = () => {
    if (!perf.length) return
    const h = ["Channel", "Group", "Strategic", "Revenue", "Margin", "Margin%", "Orders", "Units", "MoM%"]
    const rows = perf.map(r => [`"${r.channel}"`, r.group_name, r.is_strategic, r.revenue, r.margin, `${r.margin_percent.toFixed(2)}%`, r.orders, r.units, `${r.mom.toFixed(2)}%`].join(","))
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" }))
    a.download = `channels_${startDate}_${endDate}.csv`; a.click()
  }

  const KpiCard = ({ label, value, change, isCurrency = true }: { label: string; value: number; change?: number; isCurrency?: boolean }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
      <h2 className="text-2xl font-bold text-slate-900">{isCurrency ? formatCurrency(value) : formatNumber(value)}</h2>
      {change !== undefined && (
        <div className={cn("mt-2 flex items-center gap-1 text-xs font-bold", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
          {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(change).toFixed(1)}% MoM
        </div>
      )}
    </div>
  )

  const b2bRows = perf.filter(r => r.group_name === "B2B").sort((a, b) => b.revenue - a.revenue)
  const b2cRows = perf.filter(r => r.group_name === "B2C").sort((a, b) => b.revenue - a.revenue)
  const otherRows = perf.filter(r => r.group_name !== "B2B" && r.group_name !== "B2C").sort((a, b) => b.revenue - a.revenue)

  const groups = [
    ...(channelGroup === "All" || channelGroup === "B2B") && b2bRows.length > 0 ? [{ label: "B2B", rows: b2bRows, color: "bg-blue-50" }] : [],
    ...(channelGroup === "All" || channelGroup === "B2C") && b2cRows.length > 0 ? [{ label: "B2C", rows: b2cRows, color: "bg-pink-50" }] : [],
    ...otherRows.length > 0 ? [{ label: "Other", rows: otherRows, color: "bg-slate-50" }] : [],
  ]

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Channel Performance</h1>
          <p className="text-sm text-slate-500">Hiệu suất từng kênh bán — B2B, B2C, Wholesale</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[38px] items-center">
            {(["All", "B2B", "B2C"] as const).map(g => (
              <button key={g} onClick={() => setChannelGroup(g)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", channelGroup === g ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>{g}</button>
            ))}
          </div>
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[38px] items-center">
            {(["fulfiled_date", "created_date"] as const).map(col => (
              <button key={col} onClick={() => setDateColumn(col)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", dateColumn === col ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {col === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
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

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3"><Sk className="h-4 w-24" /><Sk className="h-8 w-32" /></div>
        )) : metrics ? [
          { label: "Total Revenue",  value: metrics.revenue,        change: metrics.revenue_change  },
          { label: "Gross Margin",   value: metrics.margin,         change: metrics.margin_change   },
          { label: "Total Orders",   value: metrics.orders,         change: metrics.orders_change,  isCurrency: false },
          { label: "Margin %",       value: metrics.margin_percent, isCurrency: false },
        ].map(({ label, value, change, isCurrency }) => (
          <KpiCard key={label} label={label} value={value} change={change} isCurrency={isCurrency !== false} />
        )) : null}
      </div>

      {/* Trend Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-6">Revenue Trend</h3>
        <div className="h-[240px]">
          {loading ? <Sk className="w-full h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Channel Performance Table */}
      {groups.map(({ label, rows, color }) => (
        <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={cn("p-4 border-b border-slate-100 flex justify-between items-center", color)}>
            <h3 className="font-bold text-slate-800">{label} Channels</h3>
            <span className="text-sm text-slate-500">{formatCurrency(rows.reduce((s, r) => s + r.revenue, 0))} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
                <tr>
                  {["Channel", "Revenue", "Margin", "Margin %", "GPM2", "GPM2 %", "Orders", "Units", "%MoM"].map(h => (
                    <th key={h} className={cn("px-4 py-3", h !== "Channel" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Sk className="h-4 w-16 ml-auto" /></td>)}</tr>
                )) : rows.map(r => (
                  <tr key={r.channel} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {r.channel}
                      {r.is_strategic && <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[9px] font-bold rounded uppercase">Strategic</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.revenue)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(r.margin)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{r.margin_percent.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(r.gpm2)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{r.gpm2_percent.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatNumber(r.orders)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatNumber(r.units)}</td>
                    <td className={cn("px-4 py-3 text-right font-bold", r.mom >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {r.mom > 0 ? "+" : ""}{r.mom.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase">SUBTOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(rows.reduce((s, r) => s + r.revenue, 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCurrency(rows.reduce((s, r) => s + r.margin, 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">
                    {(() => { const rev = rows.reduce((s, r) => s + r.revenue, 0); const mar = rows.reduce((s, r) => s + r.margin, 0); return rev > 0 ? `${((mar/rev)*100).toFixed(1)}%` : "-" })()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(rows.reduce((s, r) => s + r.gpm2, 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
