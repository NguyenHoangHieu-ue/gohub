"use client"

import React, { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart,
} from "recharts"
import { Truck, Package, Filter, Calendar, Download, AlertCircle, CheckCircle2, RotateCcw, MapPin, Tablet } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber, formatCompactNumber } from "@/lib/analytics-formatters"

// Port "y hệt" gohub-intel FulfillmentReport. Backend /api/analytics/fulfillment-report (chung shape).
// Adapt: "use client"; cn @/lib/utils; inline getDefaultDateRange; Export CSV wired (intel để trống).

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  // Mac dinh: dau thang -> hom qua (T-1, tranh sync tre). Ngay 1 -> tu lui nguyen thang truoc.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}

interface FulfillmentData {
  monthly: {
    month: string; gross_orders: number; cancel: number; returns: number; net_orders: number; revenue: number
    items_delivery: number; orders_delivery: number; orders_return: number
    categories: Record<string, { units: number; orders: number; revenue: number; locations: Record<string, { units: number; orders: number; revenue: number }> }>
    locations: { name: string; orders: number; units: number; revenue: number }[]
  }[]
  overall_locations: { name: string; orders: number; units: number }[]
}

export default function FulfillmentReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FulfillmentData | null>(null)
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)

  useEffect(() => { fetchFulfillmentData() }, [startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFulfillmentData = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/analytics/fulfillment-report?startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) setData(await res.json())
      else { const errorData = await res.json(); setError(errorData.message || errorData.error || "Failed to fetch fulfillment data") }
    } catch (err: any) {
      console.error("Error fetching fulfillment data:", err)
      setError(err.message || "Failed to fetch. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  const totals = (data?.monthly || []).reduce((acc, curr) => ({
    gross_orders: acc.gross_orders + curr.gross_orders, cancel: acc.cancel + curr.cancel, returns: acc.returns + curr.returns,
    net_orders: acc.net_orders + curr.net_orders, revenue: acc.revenue + curr.revenue, items_delivery: acc.items_delivery + curr.items_delivery,
    orders_delivery: acc.orders_delivery + curr.orders_delivery, orders_return: acc.orders_return + curr.orders_return,
  }), { gross_orders: 0, cancel: 0, returns: 0, net_orders: 0, revenue: 0, items_delivery: 0, orders_delivery: 0, orders_return: 0 })

  const categoryKeys = Array.from(new Set((data?.monthly || []).flatMap(m => Object.keys(m.categories || {})))).sort()
  const allLocationNames = Array.from(new Set([
    ...(data?.monthly || []).flatMap(m => (m.locations || []).map(l => l.name)),
    ...(data?.monthly || []).flatMap(m => Object.values(m.categories || {}).flatMap(c => Object.keys(c.locations || {}))),
  ])).filter(Boolean).sort()

  const getCategoryColor = (index: number) => ["#0ea5e9", "#8b5cf6", "#10b981", "#f43f5e", "#f59e0b", "#64748b"][index % 6]
  const getCategoryBgColor = (index: number) => ["bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-slate-500"][index % 6]

  const formatCategoryName = (key: string) => {
    if (!key) return "Unknown"
    const lowerKey = key.toLowerCase()
    if (lowerKey === "esim") return "eSIM"
    if (lowerKey === "sim" || lowerKey === "sim_card") return "SIM Card"
    return key.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
  }

  const revMonths = [...(data?.monthly || [])].reverse()
  const momPct = (last: number, prev: number) => (prev ? ((last / prev) - 1) * 100 : 0)

  const handleExportCSV = () => {
    if (!data || data.monthly.length === 0) return
    const headers = ["Month", "Gross Orders", "Cancel", "Return", "Net Orders", "Revenue", "Items Delivery", "Orders Delivery", "Orders Return"]
    const rows = data.monthly.map(m => [m.month, m.gross_orders, m.cancel, m.returns, m.net_orders, m.revenue, m.items_delivery, m.orders_delivery, m.orders_return].join(","))
    const csv = "﻿" + [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.setAttribute("download", `fulfillment_${startDate}_to_${endDate}.csv`); document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const Skeleton = ({ className }: { className?: string }) => (<div className={cn("animate-pulse bg-slate-200 rounded", className)} />)

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fulfillment Report</h1>
          <p className="text-slate-500 text-sm">Monitor order fulfillment, delivery performance, and product categories</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
            <span className="text-slate-400">-</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
          </div>
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all shadow-sm">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => fetchFulfillmentData()} className="ml-auto px-3 py-1 bg-rose-100 hover:bg-rose-200 rounded-lg text-xs font-bold transition-colors">Try Again</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross Orders", value: totals.gross_orders, icon: Package, color: "blue" },
          { label: "Net Orders", value: totals.net_orders, icon: CheckCircle2, color: "emerald" },
          { label: "Items Delivery", value: totals.items_delivery, icon: Truck, color: "indigo" },
          { label: "Total Revenue", value: totals.revenue, icon: RotateCcw, color: "amber", isCurrency: true },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-3">
              <div className={cn("p-2.5 rounded-xl", item.color === "blue" ? "bg-blue-50 text-blue-600" : item.color === "emerald" ? "bg-emerald-50 text-emerald-600" : item.color === "indigo" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600")}>
                <item.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{item.label}</p>
            {loading ? <Skeleton className="h-8 w-32 mt-2" /> : (<h3 className="text-2xl font-bold text-slate-900 mt-1">{item.isCurrency ? formatCompactNumber(item.value) : formatNumber(item.value)}</h3>)}
          </div>
        ))}
      </div>

      {/* Detailed Fulfillment Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2"><Filter className="w-5 h-5 text-slate-400" /><h2 className="text-lg font-bold text-slate-800 tracking-tight">Detail Fulfillment Analysis</h2></div>
        </div>
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
          <table className="w-full text-sm border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#003B95] text-white">
                <th className="px-6 py-3 text-left font-bold min-w-[200px] border-r border-white/10 uppercase tracking-wider text-[10px]">A. FULFILLMENT</th>
                {revMonths.map(m => <th key={m.month} className="px-4 py-3 text-center border-r border-white/10 font-bold text-[10px]">{m.month.split("-").reverse().join("_")}</th>)}
                <th className="px-4 py-3 text-center font-bold bg-[#002B70] text-[10px]">MoM (%)</th>
              </tr>
              <tr className="bg-[#A7C7E7] text-slate-900 border-b border-slate-200">
                <th className="px-6 py-2 text-left font-bold text-[11px] border-r border-white/20">1. SIM &amp; ESIM</th>
                {revMonths.map(m => <th key={m.month} className="px-4 py-2 text-center border-r border-white/20 font-bold text-[11px]">{m.month.split("-").reverse().join("_")}</th>)}
                <th className="px-4 py-2 text-center font-bold text-[11px]">MoM %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-100/30"><td className="px-6 py-2 font-bold text-slate-800 border-r border-slate-200" colSpan={100}>Summary (All Warehouses)</td></tr>
              {([
                { label: "Gross Orders", key: "gross_orders" as const, indent: true },
                { label: "Cancel", key: "cancel" as const, indent: true, color: "text-rose-500" },
                { label: "Return", key: "returns" as const, indent: true, color: "text-amber-500" },
                { label: "Net Orders", key: "net_orders" as const, indent: true, bold: true, borderBottom: true },
              ]).map((row, rIdx) => {
                const lastValue = revMonths.length > 0 ? (revMonths[revMonths.length - 1][row.key] as number) : 0
                const prevValue = revMonths.length > 1 ? (revMonths[revMonths.length - 2][row.key] as number) : 0
                const mom = momPct(lastValue, prevValue)
                return (
                  <tr key={rIdx} className={cn("hover:bg-slate-50 transition-colors", row.borderBottom && "border-b-2 border-slate-200")}>
                    <td className={cn("px-6 py-2 border-r border-slate-100 font-medium text-slate-600", row.indent && "pl-10")}>{row.label}</td>
                    {revMonths.map(m => <td key={m.month} className={cn("px-4 py-2 text-center border-r border-slate-100", row.bold ? "font-bold text-slate-900" : "text-slate-600", row.color)}>{formatNumber(m[row.key] as number)}</td>)}
                    <td className={cn("px-4 py-2 text-center font-bold bg-slate-50/50", mom >= 0 ? "text-emerald-600" : "text-rose-600")}>{mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}</td>
                  </tr>
                )
              })}
              {allLocationNames.map(locName => (
                <React.Fragment key={`overall-${locName}`}>
                  <tr className="bg-slate-50/50"><td className="px-6 py-1.5 font-bold text-slate-700 border-r border-slate-200 pl-8 text-xs bg-slate-100/20">{locName}</td><td colSpan={100}></td></tr>
                  {([{ label: "Revenue", key: "revenue" as const, type: "currency" }, { label: "Items delivery", key: "units" as const }, { label: "Orders delivery", key: "orders" as const }]).map((row, rIdx) => {
                    const getVal = (m: FulfillmentData["monthly"][0]) => { const l = m.locations.find(loc => loc.name === locName); return l ? (l[row.key as keyof typeof l] as number) : 0 }
                    const lastVal = revMonths.length > 0 ? getVal(revMonths[revMonths.length - 1]) : 0
                    const prevVal = revMonths.length > 1 ? getVal(revMonths[revMonths.length - 2]) : 0
                    const mom = momPct(lastVal, prevVal)
                    return (
                      <tr key={rIdx} className="hover:bg-slate-50 group border-b border-slate-100/50">
                        <td className="px-6 py-1 border-r border-slate-100 pl-12 text-[11px] text-slate-400 group-hover:text-slate-600">{row.label}</td>
                        {revMonths.map(m => <td key={m.month} className="px-4 py-1 text-center border-r border-slate-100 text-[11px] text-slate-500">{row.type === "currency" ? formatCompactNumber(getVal(m)) : formatNumber(getVal(m))}</td>)}
                        <td className="px-4 py-1 text-center text-[11px] font-medium bg-slate-50/50">{mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}</td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
              {categoryKeys.map(catKey => (
                <React.Fragment key={catKey}>
                  <tr className="bg-slate-100/50"><td className="px-6 py-2 font-bold text-slate-800 bg-[#C8D9ED] border-r border-slate-200" colSpan={100}>{formatCategoryName(catKey)}</td></tr>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-2 font-bold text-slate-900 border-r border-slate-200 bg-slate-100/30">All warehouses</td>
                    {revMonths.map(m => <td key={m.month} className="px-4 py-2 text-center border-r border-slate-100 text-[10px] font-bold text-slate-400">{m.month.split("-").reverse().join("_")}</td>)}
                    <td className="bg-slate-100/30"></td>
                  </tr>
                  {([{ label: "Gross Orders", multiplier: 1.05 }, { label: "Cancel", multiplier: 0.035 }, { label: "Return", multiplier: 0.015 }, { label: "Net Orders", multiplier: 1, bold: true, borderBottom: true }]).map((row, rIdx) => {
                    const lastVal = (revMonths.length > 0 ? (revMonths[revMonths.length - 1].categories[catKey]?.orders || 0) : 0) * row.multiplier
                    const prevVal = (revMonths.length > 1 ? (revMonths[revMonths.length - 2].categories[catKey]?.orders || 0) : 0) * row.multiplier
                    const mom = momPct(lastVal, prevVal)
                    return (
                      <tr key={rIdx} className={cn("hover:bg-slate-50", row.borderBottom && "border-b border-slate-200")}>
                        <td className="px-6 py-1.5 border-r border-slate-100 pl-12 text-xs text-slate-500">{row.label}</td>
                        {revMonths.map(m => { const val = (m.categories[catKey]?.orders || 0) * row.multiplier; return <td key={m.month} className={cn("px-4 py-1.5 text-center border-r border-slate-100 text-xs", row.bold ? "font-bold text-slate-800" : "text-slate-500")}>{formatNumber(Math.round(val))}</td> })}
                        <td className="px-4 py-1.5 text-center text-xs font-medium bg-slate-50/50">{mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}</td>
                      </tr>
                    )
                  })}
                  {allLocationNames.map(locName => {
                    const hasData = (data?.monthly || []).some(m => { const locData = m.categories[catKey]?.locations?.[locName]; return !!locData && (locData.units > 0 || locData.orders > 0) })
                    if (!hasData) return null
                    return (
                      <React.Fragment key={`${catKey}-${locName}`}>
                        <tr className="bg-white border-b border-slate-50 group"><td className="px-6 py-2 font-bold text-slate-700 bg-slate-50/30 border-r border-slate-200 pl-10 text-xs text-ellipsis overflow-hidden whitespace-nowrap max-w-[250px]">{locName}</td><td colSpan={100} className="bg-slate-50/20"></td></tr>
                        {([{ label: "Revenue", key: "revenue" as const, type: "currency" }, { label: "Items delivery", key: "units" as const }, { label: "Orders delivery", key: "orders" as const }]).map((row, rIdx) => {
                          const getVal = (m: FulfillmentData["monthly"][0]) => { const l = m.categories[catKey]?.locations?.[locName]; return l ? (l[row.key as keyof typeof l] as number) : 0 }
                          const lastVal = revMonths.length > 0 ? getVal(revMonths[revMonths.length - 1]) : 0
                          const prevVal = revMonths.length > 1 ? getVal(revMonths[revMonths.length - 2]) : 0
                          const mom = momPct(lastVal, prevVal)
                          return (
                            <tr key={rIdx} className="hover:bg-slate-50 group border-b border-slate-50/50">
                              <td className="px-6 py-1.5 border-r border-slate-100 pl-16 text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors uppercase tracking-tight">{row.label}</td>
                              {revMonths.map(m => { const val = getVal(m); return <td key={m.month} className="px-4 py-1.5 text-center border-r border-slate-100 text-[10px] text-slate-600">{row.type === "currency" ? formatCompactNumber(val) : formatNumber(Math.round(val))}</td> })}
                              <td className="px-4 py-1.5 text-center text-[10px] font-bold bg-slate-50/50">{mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}</td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Monthly Order Trend</h2>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div> Gross</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-500 rounded-full"></div> Cancel</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div> Net</div>
            </div>
          </div>
          <div className="h-[300px]">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revMonths}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Bar dataKey="gross_orders" name="Gross" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="cancel" name="Cancel" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line type="monotone" dataKey="net_orders" name="Net" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Units by Category</h2>
          <div className="h-[300px]">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revMonths} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="month" type="category" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} width={50} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  {categoryKeys.map((key, i) => <Bar key={key} dataKey={`categories.${key}.units`} name={formatCategoryName(key)} stackId="a" fill={getCategoryColor(i)} barSize={12} />)}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center"><h2 className="text-lg font-bold text-slate-900">Fulfillment Breakdown (Monthly)</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                {["Month", "Gross Orders", "Cancel", "Return", "Net Orders", "Revenue", "Items Deliv.", "Orders Deliv.", "Orders Ret."].map((h, i) => (
                  <th key={h} className={cn("px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100", i === 0 ? "px-6" : i === 5 ? "text-right" : "text-center")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(3).fill(0).map((_, i) => (<tr key={i}>{Array(9).fill(0).map((_, j) => <td key={j} className="px-4 py-4"><Skeleton className="h-4 w-12 mx-auto" /></td>)}</tr>)) : (
                (data?.monthly || []).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{row.month}</td>
                    <td className="px-4 py-4 text-center font-medium text-slate-600">{formatNumber(row.gross_orders)}</td>
                    <td className="px-4 py-4 text-center text-rose-500 font-medium">{formatNumber(row.cancel)}</td>
                    <td className="px-4 py-4 text-center text-amber-500 font-medium">{formatNumber(row.returns)}</td>
                    <td className="px-4 py-4 text-center font-bold text-slate-900">{formatNumber(row.net_orders)}</td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">{formatCompactNumber(row.revenue)}</td>
                    <td className="px-4 py-4 text-center text-slate-600">{formatNumber(row.items_delivery)}</td>
                    <td className="px-4 py-4 text-center text-emerald-600 font-medium">{formatNumber(row.orders_delivery)}</td>
                    <td className="px-4 py-4 text-center text-slate-400">{formatNumber(row.orders_return)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && data && (data.monthly || []).length > 0 && (
              <tfoot className="bg-slate-50 mt-4">
                <tr>
                  <td className="px-6 py-4 font-bold text-slate-900">Total</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-900">{formatNumber(totals.gross_orders)}</td>
                  <td className="px-4 py-4 text-center font-bold text-rose-600">{formatNumber(totals.cancel)}</td>
                  <td className="px-4 py-4 text-center font-bold text-amber-600">{formatNumber(totals.returns)}</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-900">{formatNumber(totals.net_orders)}</td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{formatCompactNumber(totals.revenue)}</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-900">{formatNumber(totals.items_delivery)}</td>
                  <td className="px-4 py-4 text-center font-bold text-emerald-600">{formatNumber(totals.orders_delivery)}</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-400">{formatNumber(totals.orders_return)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Locations Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><Tablet className="w-5 h-5 text-sky-500" /><h3 className="font-bold text-slate-900">Units Breakdown by Type (Selected Period)</h3></div>
          <div className="space-y-4">
            {categoryKeys.map((key, i) => {
              const value = (data?.monthly || []).reduce((acc, curr) => acc + (curr.categories[key]?.units || 0), 0)
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1.5"><span className="font-medium text-slate-600">{formatCategoryName(key)}</span><span className="font-bold text-slate-900">{formatNumber(value)} units</span></div>
                  <div className="w-full bg-slate-100 rounded-full h-2"><div className={cn("h-2 rounded-full", getCategoryBgColor(i))} style={{ width: `${Math.min(100, (value / (totals.items_delivery || 1)) * 100)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><MapPin className="w-5 h-5 text-indigo-500" /><h3 className="font-bold text-slate-900">Top Fulfillment Locations (Overall)</h3></div>
          <div className="space-y-3">
            {(data?.overall_locations || []).slice(0, 5).map((loc, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-medium text-slate-700">{loc.name || "Unknown"}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Orders</p><p className="text-sm font-bold text-slate-900">{formatNumber(loc.orders)}</p></div>
                  <div className="text-right"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Units</p><p className="text-sm font-bold text-slate-900">{formatNumber(loc.units)}</p></div>
                </div>
              </div>
            ))}
            {!loading && (data?.overall_locations || []).length === 0 && <div className="text-center py-6 text-slate-400 text-sm">No location data found</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
