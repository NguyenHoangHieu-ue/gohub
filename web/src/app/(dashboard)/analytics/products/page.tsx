"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import {
  ShoppingBag, TrendingUp, TrendingDown, Calendar, Download, Package,
  DollarSign, ShoppingCart, LayoutDashboard, MapPin, Search, ChevronDown, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber, formatNumber, getDefaultDateRange, formatTruncatedString } from "@/lib/analytics-formatters"
import { SourceBadge } from "@/components/dashboard-kit"
import { Pager, PAGE_ROWS } from "@/components/pager"

interface Metrics {
  revenue: number; revenueChange: number
  orders: number; ordersChange: number
  units: number; unitsChange: number
  aov: number; aovChange: number
  margin: number; marginChange: number
}
interface ChannelRow { channel_name: string; group_name: string; revenue: number; units_sold: number; orders: number; margin: number }
interface SkuRow { sku: string; category: string; vendor: string; region: string; region_name: string; revenue: number; units: number; orders: number; margin: number }

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
}

function ChangeTag({ change, visible }: { change: number; visible: boolean }) {
  if (!visible) return null
  const pos = change >= 0
  return (
    <span className={cn("text-xs font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-full",
      pos ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500")}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(change)}%
    </span>
  )
}

export default function ProductsPage() {
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [regions, setRegions] = useState<any[]>([])
  const [skus, setSkus] = useState<SkuRow[]>([])
  const [skuPage, setSkuPage] = useState(1)

  // Filters
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("previous_period")
  const [channelGroup, setChannelGroup] = useState("all")
  const [selectedChannel, setSelectedChannel] = useState("all")
  const [channelList, setChannelList] = useState<string[]>([])
  const [category, setCategory] = useState("all")
  const [categories, setCategories] = useState<string[]>([])
  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDrop, setShowVendorDrop] = useState(false)
  const [destination, setDestination] = useState("all")
  const [countryMap, setCountryMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // reset trang khi danh sách SKU đổi (fetch mới)
  useEffect(() => { setSkuPage(1) }, [skus])
  const pagedSkus = skus.slice((skuPage - 1) * PAGE_ROWS, skuPage * PAGE_ROWS)

  // Load categories, vendors from dim_sku meta
  useEffect(() => {
    Promise.all([
      fetch("/api/analytics/schema").then(r => r.json()).catch(() => null),
    ]).catch(() => {})
  }, [])

  // Load channels when group changes
  useEffect(() => {
    fetch(`/api/channels?channelGroup=${channelGroup === "all" ? "" : channelGroup}`)
      .then(r => r.ok ? r.json() : [])
      .then(setChannelList)
      .catch(() => {})
  }, [channelGroup])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/products/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate, endDate, dateColumn, comparisonType,
          category, vendors: selectedVendors,
          channelGroup, channel: selectedChannel,
          destination,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi tải dữ liệu")
      const d = await res.json()
      setMetrics(d.metrics)
      setTrend(d.trend || [])
      setChannels(d.channels || [])
      setRegions(d.regions || [])
      setSkus(d.skus || [])
      // Build country map from regions
      const cm: Record<string, string> = {}
      ;(d.regions || []).forEach((r: any) => { if (r.region_code) cm[r.region_code] = r.region })
      ;(d.skus || []).forEach((s: any) => { if (s.region) cm[s.region] = s.region_name || s.region })
      setCountryMap(cm)
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, dateColumn, comparisonType, category, selectedVendors, channelGroup, selectedChannel, destination])

  const groupedChannels = useMemo(() => ({
    b2c: channels.filter(c => c.group_name?.toUpperCase() === "B2C"),
    b2b: channels.filter(c => c.group_name?.toUpperCase() === "B2B"),
  }), [channels])

  const getProjection = () => {
    if (!metrics) return null
    const e = new Date(endDate), now = new Date()
    if (e.getMonth() !== now.getMonth() || e.getFullYear() !== now.getFullYear()) return null
    const s = new Date(startDate)
    const elapsed = Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1
    const total = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate()
    if (elapsed >= total || elapsed <= 0) return null
    return { revenue: metrics.revenue * (total / elapsed), units: metrics.units * (total / elapsed), elapsed, total }
  }
  const proj = getProjection()

  const exportCsv = (data: any[], filename: string, cols: string[]) => {
    const rows = [cols.join(","), ...data.map(r => cols.map(c => {
      const v = r[c] ?? ""
      return typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v
    }).join(","))]
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `${filename}_${startDate}_${endDate}.csv`; a.click()
  }

  const kpiCards = [
    { label: "Doanh thu", value: metrics?.revenue ?? 0, change: metrics?.revenueChange ?? 0, icon: DollarSign, currency: true, color: "blue" },
    { label: "Units", value: metrics?.units ?? 0, change: metrics?.unitsChange ?? 0, icon: Package, color: "purple" },
    { label: "Đơn hàng", value: metrics?.orders ?? 0, change: metrics?.ordersChange ?? 0, icon: ShoppingCart, color: "indigo" },
    { label: "ASP", value: metrics?.aov ?? 0, change: metrics?.aovChange ?? 0, icon: TrendingUp, currency: true, color: "emerald" },
    { label: "Gross Margin", value: metrics?.margin ?? 0, change: metrics?.marginChange ?? 0, icon: LayoutDashboard, currency: true, color: "amber" },
  ]

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
            {(["fulfiled_date", "created_date"] as const).map(dc => (
              <button key={dc} onClick={() => setDateColumn(dc)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  dateColumn === dc ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
                {dc === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Product Performance</h1>
            <div className="flex items-center gap-2">
              <p className="text-slate-500 text-sm">Phân tích theo SKU, kênh và địa điểm</p>
              <SourceBadge source="admin" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Từ ngày</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đến ngày</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nhóm kênh</label>
            <select value={channelGroup} onChange={e => { setChannelGroup(e.target.value); setSelectedChannel("all") }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Tất cả</option>
              <option value="B2C">B2C</option>
              <option value="B2B">B2B</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kênh</label>
            <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Tất cả</option>
              {channelList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">So sánh</label>
            <select value={comparisonType} onChange={e => setComparisonType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="none">Không so sánh</option>
              <option value="previous_period">Kỳ trước</option>
              <option value="previous_year">Năm trước</option>
            </select>
          </div>

          <div className="flex items-end">
            <button onClick={fetchData} disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200">
              {loading ? "Đang tải..." : "Áp dụng"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 px-4 py-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((card, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div className={cn("p-2 rounded-xl",
                card.color === "blue" ? "bg-blue-50 text-blue-600" :
                card.color === "purple" ? "bg-purple-50 text-purple-600" :
                card.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                card.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                <card.icon className="w-5 h-5" />
              </div>
              {loading ? <Skeleton className="h-5 w-12" /> :
                <ChangeTag change={card.change} visible={comparisonType !== "none"} />}
            </div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            {loading ? <Skeleton className="h-7 w-28 mt-1" /> : (
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                {card.currency ? formatCompactNumber(card.value) : formatNumber(card.value)}
              </h3>
            )}
          </div>
        ))}
      </div>

      {/* Projection */}
      {proj && !loading && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900 text-sm">Dự báo cuối tháng</h3>
              <p className="text-xs text-blue-600">Dựa trên {proj.elapsed}/{proj.total} ngày thực tế</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-slate-400 uppercase">Doanh thu dự báo</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(proj.revenue)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-slate-400 uppercase">Units dự báo</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatNumber(Math.round(proj.units))}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {(trend.length > 0 || loading) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-900">Xu hướng doanh thu & units</h2>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Doanh thu</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Units</span>
            </div>
          </div>
          <div className="h-72">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }}
                    tickFormatter={v => formatCompactNumber(v)} />
                  <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#10b981", fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Area yAxisId="l" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2}
                    fill="url(#revGrad)" name="Doanh thu" />
                  <Area yAxisId="r" type="monotone" dataKey="units" stroke="#10b981" strokeWidth={2}
                    fill="transparent" name="Units" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Top Regions */}
      {(regions.length > 0 || loading) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-900">Top điểm đến</h2>
          </div>
          <div className="h-64">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regions} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="region" type="category" axisLine={false} tickLine={false}
                    tick={{ fill: "#475569", fontSize: 11 }} width={130}
                    tickFormatter={v => formatTruncatedString(v, 18)} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none" }}
                    formatter={(v: number) => [formatCompactNumber(v), "Doanh thu"]} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Channel Tables */}
      {([
        { key: "b2b", title: "B2B Performance", data: groupedChannels.b2b, color: "blue" },
        { key: "b2c", title: "B2C Performance", data: groupedChannels.b2c, color: "indigo" },
      ] as const).map(group => (
        (group.data.length > 0 || loading) && (
          <div key={group.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">{group.title}</h2>
              <button onClick={() => exportCsv(group.data, group.key, ["channel_name", "revenue", "units_sold", "orders", "margin"])}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["Kênh", "Doanh thu", "Units", "Đơn", "Margin", "Margin %"].map(h => (
                      <th key={h} className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider",
                        h !== "Kênh" ? "text-right" : "")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? Array(3).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array(6).fill(0).map((_, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>)}
                    </tr>
                  )) : group.data.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">Không có dữ liệu</td></tr>
                  ) : group.data.map((ch, idx) => {
                    const mp = ch.revenue > 0 ? (ch.margin / ch.revenue) * 100 : 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-slate-700">{ch.channel_name}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCompactNumber(ch.revenue)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{formatNumber(ch.units_sold)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{formatNumber(ch.orders)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600">{formatCompactNumber(ch.margin)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold",
                            mp > 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                            {mp.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ))}

      {/* SKU Breakdown */}
      {(skus.length > 0 || loading) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">SKU Breakdown</h2>
              <span className="text-xs text-slate-400">Top 50 SKU theo doanh thu</span>
            </div>
            <button onClick={() => exportCsv(skus, "SKU_Performance", ["sku", "category", "vendor", "region", "revenue", "units", "orders"])}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
              <Download className="w-3.5 h-3.5" />CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["SKU", "Quốc gia", "Category", "Vendor", "Doanh thu", "Units", "Đơn", "Margin %"].map(h => (
                    <th key={h} className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider",
                      !["SKU", "Quốc gia", "Category", "Vendor"].includes(h) ? "text-right" : "")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array(8).fill(0).map((_, j) => <td key={j} className="px-5 py-3"><div className="h-4 bg-slate-100 rounded" /></td>)}
                  </tr>
                )) : pagedSkus.map((s, idx) => {
                  const mp = s.revenue > 0 ? (s.margin / s.revenue) * 100 : 0
                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm font-medium text-slate-700">{s.sku}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{s.region}</span>
                          <span className="text-xs text-slate-400 truncate max-w-[90px]">{s.region_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600">{s.category || "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{s.vendor || "—"}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCompactNumber(s.revenue)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{formatNumber(s.units)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{formatNumber(s.orders)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold",
                          mp > 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                          {mp.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={skuPage} total={skus.length} onPage={setSkuPage} label="SKU" />
        </div>
      )}
    </div>
  )
}
