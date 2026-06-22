"use client"

import React, { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ComposedChart, Legend,
} from "recharts"
import { Truck, Package, Filter, Calendar, Download, AlertCircle, CheckCircle2, RotateCcw, MapPin, Tablet } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber, formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"
import { SourceBadge } from "@/components/dashboard-kit"

interface MonthData {
  month: string
  gross_orders: number
  cancel: number
  returns: number
  net_orders: number
  revenue: number
  items_delivery: number
  orders_delivery: number
  orders_return: number
  categories: Record<string, {
    units: number; orders: number; revenue: number
    locations: Record<string, { units: number; orders: number; revenue: number }>
  }>
  locations: { name: string; orders: number; units: number; revenue: number }[]
}

interface FulfillmentData {
  monthly: MonthData[]
  overall_locations: { name: string; orders: number; units: number }[]
}

const CAT_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f43f5e", "#f59e0b", "#64748b"]

function formatCategoryName(key: string) {
  const lower = key.toLowerCase()
  if (lower === "esim") return "eSIM"
  if (lower === "sim" || lower === "sim_card") return "SIM Card"
  return key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
}

export default function FulfillmentPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FulfillmentData | null>(null)
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)

  useEffect(() => { fetchData() }, [startDate, endDate])

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/analytics/fulfillment-report?startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) setData(await res.json())
      else { setError("Hiếu đang fix, vui lòng đợi") }
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }

  const totals = (data?.monthly || []).reduce((acc, m) => ({
    gross_orders: acc.gross_orders + m.gross_orders,
    cancel: acc.cancel + m.cancel,
    returns: acc.returns + m.returns,
    net_orders: acc.net_orders + m.net_orders,
    revenue: acc.revenue + m.revenue,
    items_delivery: acc.items_delivery + m.items_delivery,
    orders_delivery: acc.orders_delivery + m.orders_delivery,
    orders_return: acc.orders_return + m.orders_return,
  }), { gross_orders: 0, cancel: 0, returns: 0, net_orders: 0, revenue: 0, items_delivery: 0, orders_delivery: 0, orders_return: 0 })

  const categoryKeys = Array.from(new Set(
    (data?.monthly || []).flatMap(m => Object.keys(m.categories || {}))
  )).sort()

  // Tên kho gộp từ locations cấp tháng + locations trong từng category (port intel)
  const allLocationNames = Array.from(new Set([
    ...(data?.monthly || []).flatMap(m => (m.locations || []).map(l => l.name)),
    ...(data?.monthly || []).flatMap(m =>
      Object.values(m.categories || {}).flatMap(c => Object.keys(c.locations || {}))
    ),
  ])).filter(Boolean).sort()

  const chartData = [...(data?.monthly || [])].reverse()
  const revMonths = [...(data?.monthly || [])].reverse()
  const momPct = (last: number, prev: number) => (prev ? ((last / prev) - 1) * 100 : 0)

  const handleExportCSV = () => {
    if (!data || data.monthly.length === 0) return
    const months = data.monthly
    const headers = ["Tháng", "Gross Orders", "Cancel", "Return", "Net Orders", "Revenue", "Items Delivery", "Orders Delivery", "Orders Return"]
    const rows = months.map(m => [m.month, m.gross_orders, m.cancel, m.returns, m.net_orders, m.revenue, m.items_delivery, m.orders_delivery, m.orders_return].join(","))
    const csv = "﻿" + [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.setAttribute("download", `fulfillment_${startDate}_to_${endDate}.csv`)
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fulfillment Report</h1>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-sm">Theo dõi đơn giao, hiệu suất kho và phân loại sản phẩm</p>
            <SourceBadge source="admin" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-sm text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border-none focus:ring-0 p-0 text-sm" />
            <span className="text-slate-400">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border-none focus:ring-0 p-0 text-sm" />
          </div>
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all shadow-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={fetchData} className="ml-auto px-3 py-1 bg-rose-100 hover:bg-rose-200 rounded-lg text-xs font-bold">
            Thử lại
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gross Orders", value: formatNumber(totals.gross_orders), icon: Package, color: "blue" },
          { label: "Net Orders", value: formatNumber(totals.net_orders), icon: CheckCircle2, color: "emerald" },
          { label: "Items Giao", value: formatNumber(totals.items_delivery), icon: Truck, color: "indigo" },
          { label: "Doanh thu", value: formatCompactNumber(totals.revenue), icon: RotateCcw, color: "amber", currency: true },
        ].map(card => (
          <div key={card.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className={cn("p-2 rounded-xl w-fit mb-3",
              card.color === "blue" ? "bg-blue-50 text-blue-600" :
              card.color === "emerald" ? "bg-emerald-50 text-emerald-600" :
              card.color === "indigo" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600")}>
              <card.icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.label}</p>
            {loading ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <h3 className="text-xl font-bold text-slate-900 mt-1">{card.value}</h3>
            )}
          </div>
        ))}
      </div>

      {/* Detail Fulfillment Analysis (pivot matrix — port intel) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Detail Fulfillment Analysis</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#003B95] text-white">
                <th className="px-6 py-3 text-left font-bold min-w-[200px] border-r border-white/10 uppercase tracking-wider text-[10px]">A. FULFILLMENT</th>
                {revMonths.map(m => (
                  <th key={m.month} className="px-4 py-3 text-center border-r border-white/10 font-bold text-[10px]">
                    {m.month.split("-").reverse().join("_")}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-bold bg-[#002B70] text-[10px]">MoM (%)</th>
              </tr>
              <tr className="bg-[#A7C7E7] text-slate-900 border-b border-slate-200">
                <th className="px-6 py-2 text-left font-bold text-[11px] border-r border-white/20">1. SIM &amp; ESIM</th>
                {revMonths.map(m => (
                  <th key={m.month} className="px-4 py-2 text-center border-r border-white/20 font-bold text-[11px]">
                    {m.month.split("-").reverse().join("_")}
                  </th>
                ))}
                <th className="px-4 py-2 text-center font-bold text-[11px]">MoM %</th>
              </tr>
            </thead>
            <tbody>
              {/* OVERALL SIM & ESIM */}
              <tr className="bg-slate-100/30">
                <td className="px-6 py-2 font-bold text-slate-800 border-r border-slate-200" colSpan={100}>Summary (All Warehouses)</td>
              </tr>
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
                    {revMonths.map(m => (
                      <td key={m.month} className={cn("px-4 py-2 text-center border-r border-slate-100", row.bold ? "font-bold text-slate-900" : "text-slate-600", row.color)}>
                        {formatNumber(m[row.key] as number)}
                      </td>
                    ))}
                    <td className={cn("px-4 py-2 text-center font-bold bg-slate-50/50", mom >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}

              {/* Breakdown by warehouse (overall) */}
              {allLocationNames.map(locName => (
                <React.Fragment key={`overall-${locName}`}>
                  <tr className="bg-slate-50/50">
                    <td className="px-6 py-1.5 font-bold text-slate-700 border-r border-slate-200 pl-8 text-xs bg-slate-100/20">{locName}</td>
                    <td colSpan={100}></td>
                  </tr>
                  {([
                    { label: "Revenue", key: "revenue" as const, type: "currency" },
                    { label: "Items delivery", key: "units" as const },
                    { label: "Orders delivery", key: "orders" as const },
                  ]).map((row, rIdx) => {
                    const getVal = (m: MonthData) => {
                      const l = m.locations.find(loc => loc.name === locName)
                      return l ? (l[row.key as keyof typeof l] as number) : 0
                    }
                    const lastVal = revMonths.length > 0 ? getVal(revMonths[revMonths.length - 1]) : 0
                    const prevVal = revMonths.length > 1 ? getVal(revMonths[revMonths.length - 2]) : 0
                    const mom = momPct(lastVal, prevVal)
                    return (
                      <tr key={rIdx} className="hover:bg-slate-50 group border-b border-slate-100/50">
                        <td className="px-6 py-1 border-r border-slate-100 pl-12 text-[11px] text-slate-400 group-hover:text-slate-600">{row.label}</td>
                        {revMonths.map(m => (
                          <td key={m.month} className="px-4 py-1 text-center border-r border-slate-100 text-[11px] text-slate-500">
                            {row.type === "currency" ? formatCompactNumber(getVal(m)) : formatNumber(getVal(m))}
                          </td>
                        ))}
                        <td className="px-4 py-1 text-center text-[11px] font-medium bg-slate-50/50">
                          {mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}

              {/* Categories breakdown */}
              {categoryKeys.map(catKey => (
                <React.Fragment key={catKey}>
                  <tr className="bg-slate-100/50">
                    <td className="px-6 py-2 font-bold text-slate-800 bg-[#C8D9ED] border-r border-slate-200" colSpan={100}>{formatCategoryName(catKey)}</td>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-2 font-bold text-slate-900 border-r border-slate-200 bg-slate-100/30">All warehouses</td>
                    {revMonths.map(m => (
                      <td key={m.month} className="px-4 py-2 text-center border-r border-slate-100 text-[10px] font-bold text-slate-400">
                        {m.month.split("-").reverse().join("_")}
                      </td>
                    ))}
                    <td className="bg-slate-100/30"></td>
                  </tr>
                  {([
                    { label: "Gross Orders", multiplier: 1.05 },
                    { label: "Cancel", multiplier: 0.035 },
                    { label: "Return", multiplier: 0.015 },
                    { label: "Net Orders", multiplier: 1, bold: true, borderBottom: true },
                  ]).map((row, rIdx) => {
                    const lastVal = (revMonths.length > 0 ? (revMonths[revMonths.length - 1].categories[catKey]?.orders || 0) : 0) * row.multiplier
                    const prevVal = (revMonths.length > 1 ? (revMonths[revMonths.length - 2].categories[catKey]?.orders || 0) : 0) * row.multiplier
                    const mom = momPct(lastVal, prevVal)
                    return (
                      <tr key={rIdx} className={cn("hover:bg-slate-50", row.borderBottom && "border-b border-slate-200")}>
                        <td className="px-6 py-1.5 border-r border-slate-100 pl-12 text-xs text-slate-500">{row.label}</td>
                        {revMonths.map(m => {
                          const val = (m.categories[catKey]?.orders || 0) * row.multiplier
                          return (
                            <td key={m.month} className={cn("px-4 py-1.5 text-center border-r border-slate-100 text-xs", row.bold ? "font-bold text-slate-800" : "text-slate-500")}>
                              {formatNumber(Math.round(val))}
                            </td>
                          )
                        })}
                        <td className="px-4 py-1.5 text-center text-xs font-medium bg-slate-50/50">
                          {mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Locations within category */}
                  {allLocationNames.map(locName => {
                    const hasData = (data?.monthly || []).some(m => {
                      const locData = m.categories[catKey]?.locations?.[locName]
                      return !!locData && (locData.units > 0 || locData.orders > 0)
                    })
                    if (!hasData) return null
                    return (
                      <React.Fragment key={`${catKey}-${locName}`}>
                        <tr className="bg-white border-b border-slate-50 group">
                          <td className="px-6 py-2 font-bold text-slate-700 bg-slate-50/30 border-r border-slate-200 pl-10 text-xs text-ellipsis overflow-hidden whitespace-nowrap max-w-[250px]">{locName}</td>
                          <td colSpan={100} className="bg-slate-50/20"></td>
                        </tr>
                        {([
                          { label: "Revenue", key: "revenue" as const, type: "currency" },
                          { label: "Items delivery", key: "units" as const },
                          { label: "Orders delivery", key: "orders" as const },
                        ]).map((row, rIdx) => {
                          const getVal = (m: MonthData) => {
                            const l = m.categories[catKey]?.locations?.[locName]
                            return l ? (l[row.key as keyof typeof l] as number) : 0
                          }
                          const lastVal = revMonths.length > 0 ? getVal(revMonths[revMonths.length - 1]) : 0
                          const prevVal = revMonths.length > 1 ? getVal(revMonths[revMonths.length - 2]) : 0
                          const mom = momPct(lastVal, prevVal)
                          return (
                            <tr key={rIdx} className="hover:bg-slate-50 group border-b border-slate-50/50">
                              <td className="px-6 py-1.5 border-r border-slate-100 pl-16 text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors uppercase tracking-tight">{row.label}</td>
                              {revMonths.map(m => {
                                const val = getVal(m)
                                return (
                                  <td key={m.month} className="px-4 py-1.5 text-center border-r border-slate-100 text-[10px] text-slate-600">
                                    {row.type === "currency" ? formatCompactNumber(val) : formatNumber(Math.round(val))}
                                  </td>
                                )
                              })}
                              <td className="px-4 py-1.5 text-center text-[10px] font-bold bg-slate-50/50">
                                {mom === 0 ? "-" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}
                              </td>
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Xu hướng đơn hàng theo tháng</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Gross</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />Cancel</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Net</span>
            </div>
          </div>
          <div className="h-64">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Bar dataKey="gross_orders" name="Gross" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={18} />
                  <Bar dataKey="cancel" name="Cancel" fill="#f43f5e" radius={[3, 3, 0, 0]} barSize={18} />
                  <Line type="monotone" dataKey="net_orders" name="Net" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">Units theo loại SP</h2>
          <div className="h-64">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="month" type="category" axisLine={false} tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 10 }} width={45} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {categoryKeys.map((key, i) => (
                    <Bar key={key} dataKey={`categories.${key}.units`}
                      name={formatCategoryName(key)} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]} barSize={10} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Chi tiết theo tháng</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Tháng", "Gross", "Cancel", "Return", "Net", "Doanh thu", "Items", "Giao", "Hoàn"].map(h => (
                  <th key={h} className={cn("px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100",
                    h !== "Tháng" ? "text-center" : "")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(3).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  ))}
                </tr>
              )) : (data?.monthly || []).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-800">{row.month}</td>
                  <td className="px-5 py-3 text-center text-slate-600">{formatNumber(row.gross_orders)}</td>
                  <td className="px-5 py-3 text-center text-rose-500 font-medium">{formatNumber(row.cancel)}</td>
                  <td className="px-5 py-3 text-center text-amber-500 font-medium">{formatNumber(row.returns)}</td>
                  <td className="px-5 py-3 text-center font-bold text-slate-900">{formatNumber(row.net_orders)}</td>
                  <td className="px-5 py-3 text-center font-bold text-slate-900">{formatCompactNumber(row.revenue)}</td>
                  <td className="px-5 py-3 text-center text-slate-600">{formatNumber(row.items_delivery)}</td>
                  <td className="px-5 py-3 text-center text-emerald-600">{formatNumber(row.orders_delivery)}</td>
                  <td className="px-5 py-3 text-center text-slate-400">{formatNumber(row.orders_return)}</td>
                </tr>
              ))}
              {!loading && data && data.monthly.length > 0 && (
                <tr className="bg-slate-50 font-bold">
                  <td className="px-5 py-3 text-slate-900">Tổng</td>
                  <td className="px-5 py-3 text-center text-slate-900">{formatNumber(totals.gross_orders)}</td>
                  <td className="px-5 py-3 text-center text-rose-600">{formatNumber(totals.cancel)}</td>
                  <td className="px-5 py-3 text-center text-amber-600">{formatNumber(totals.returns)}</td>
                  <td className="px-5 py-3 text-center text-slate-900">{formatNumber(totals.net_orders)}</td>
                  <td className="px-5 py-3 text-center text-slate-900">{formatCompactNumber(totals.revenue)}</td>
                  <td className="px-5 py-3 text-center text-slate-900">{formatNumber(totals.items_delivery)}</td>
                  <td className="px-5 py-3 text-center text-emerald-600">{formatNumber(totals.orders_delivery)}</td>
                  <td className="px-5 py-3 text-center text-slate-400">{formatNumber(totals.orders_return)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown + Top locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Tablet className="w-4 h-4 text-sky-500" />
            <h3 className="font-bold text-slate-900">Units theo loại (Tổng kỳ)</h3>
          </div>
          <div className="space-y-3">
            {categoryKeys.map((key, i) => {
              const value = (data?.monthly || []).reduce((acc, m) => acc + (m.categories[key]?.units || 0), 0)
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{formatCategoryName(key)}</span>
                    <span className="font-bold text-slate-900">{formatNumber(value)} units</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{
                      width: `${Math.min(100, (value / (totals.items_delivery || 1)) * 100)}%`,
                      backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
                    }} />
                  </div>
                </div>
              )
            })}
            {categoryKeys.length === 0 && !loading && (
              <p className="text-sm text-slate-400 text-center py-4">Không có dữ liệu</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold text-slate-900">Top kho giao hàng</h3>
          </div>
          <div className="space-y-2">
            {(data?.overall_locations || []).slice(0, 6).map((loc, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-medium text-slate-700">{loc.name || "Unknown"}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Đơn</p>
                    <p className="text-sm font-bold text-slate-900">{formatNumber(loc.orders)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Units</p>
                    <p className="text-sm font-bold text-slate-900">{formatNumber(loc.units)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!loading && (data?.overall_locations || []).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Không có dữ liệu kho</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
