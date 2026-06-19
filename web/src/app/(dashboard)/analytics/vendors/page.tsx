"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  Truck, Calendar, Download, Filter, Search, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, Package, LayoutDashboard, ChevronLeft,
  ChevronRight, Check, ChevronDown, RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber, formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"
import { SourceBadge } from "@/components/dashboard-kit"

interface Metrics {
  revenue: number; revenueChange: number; orders: number; ordersChange: number
  units: number; unitsChange: number; aov: number; aovChange: number
  margin: number; marginChange: number
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

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
}

const PAGE_SIZE = 20

export default function VendorsPage() {
  const [allVendors, setAllVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDrop, setShowVendorDrop] = useState(false)
  const [vendorSearch, setVendorSearch] = useState("")

  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate,   setEndDate]   = useState(getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn]    = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [channelGroup, setChannelGroup] = useState("")
  const [channel, setChannel]    = useState("")
  const [channels, setChannels]  = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [allVendorRevenue, setAllVendorRevenue] = useState(0)
  const [prevMonthMetrics, setPrevMonthMetrics] = useState<any>(null)
  const [trend, setTrend]       = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [chDist, setChDist]     = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [skuSearch, setSkuSearch] = useState("")
  const [skuSort, setSkuSort]     = useState<{ key: string; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" })
  const [skuPage, setSkuPage]     = useState(1)

  // Load vendors list
  useEffect(() => {
    fetch("/api/analytics/vendors/list")
      .then(r => r.ok ? r.json() : [])
      .then((list: string[]) => {
        setAllVendors(list)
        if (list.length && !selectedVendors.length) {
          const def = list.includes("3HKDATAPOOL") ? "3HKDATAPOOL" : list[0]
          setSelectedVendors([def])
        }
      })
      .catch(() => {})
  }, [])

  // Load channels when group changes
  useEffect(() => {
    fetch(`/api/channels?channelGroup=${channelGroup}`)
      .then(r => r.ok ? r.json() : [])
      .then(setChannels)
      .catch(() => {})
  }, [channelGroup])

  const fetchData = useCallback(async () => {
    if (!selectedVendors.length) return
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/vendors/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dateColumn, vendors: selectedVendors, channelGroup, channel, comparisonType }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi tải dữ liệu")
      const d = await res.json()
      setMetrics(d.metrics)
      setAllVendorRevenue(d.allVendorRevenue)
      setPrevMonthMetrics(d.prevMonthMetrics)
      setTrend(d.trend || [])
      setProducts(d.products || [])
      setChDist(d.channels || [])
    } catch (err: any) { console.error(err); setError("Hiếu đang fix, vui lòng đợi") }
    finally { setLoading(false) }
  }, [startDate, endDate, dateColumn, selectedVendors, channelGroup, channel, comparisonType])

  useEffect(() => { if (selectedVendors.length) fetchData() }, [dateColumn])

  // Projection
  const projection = useMemo(() => {
    if (!metrics?.revenue) return null
    const s = new Date(startDate), e = new Date(endDate), now = new Date()
    if (s.getMonth() !== e.getMonth() || s.getFullYear() !== e.getFullYear()) return null
    if (e.getMonth() !== now.getMonth() || e.getFullYear() !== now.getFullYear()) return null
    const elapsed = Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1
    const total = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate()
    if (elapsed >= total || elapsed <= 0) return null
    const f = total / elapsed
    return { revenue: metrics.revenue * f, units: metrics.units * f, elapsed, total }
  }, [metrics, startDate, endDate])

  // Sorted + filtered SKUs
  const filteredSkus = useMemo(() => {
    let rows = products.filter(p => p.sku.toLowerCase().includes(skuSearch.toLowerCase()))
    rows = [...rows].sort((a, b) => {
      const av = parseFloat(a[skuSort.key] || 0), bv = parseFloat(b[skuSort.key] || 0)
      return skuSort.dir === "asc" ? av - bv : bv - av
    })
    return rows
  }, [products, skuSearch, skuSort])
  const paginatedSkus = filteredSkus.slice((skuPage - 1) * PAGE_SIZE, skuPage * PAGE_SIZE)
  const totalSkuPages = Math.ceil(filteredSkus.length / PAGE_SIZE)

  const toggleVendor = (v: string) =>
    setSelectedVendors(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  const exportCsv = () => {
    const headers = ["SKU", "Doanh thu", "Đơn", "Margin"]
    const rows = [headers.join(","), ...filteredSkus.map(p =>
      [`"${p.sku}"`, p.revenue, p.orders, p.margin].join(",")
    )]
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `Vendor_${selectedVendors.join("_")}_${startDate}.csv`; a.click()
  }

  const visibleVendors = allVendors.filter(v => v.toLowerCase().includes(vendorSearch.toLowerCase()))
  const showComparison = comparisonType !== "none"

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
            {(["fulfiled_date", "created_date"] as const).map(dc => (
              <button key={dc} onClick={() => setDateColumn(dc)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  dateColumn === dc ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {dc === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vendor Performance</h1>
            <div className="flex items-center gap-2">
              <p className="text-slate-500 text-sm">Phân tích doanh thu theo vendor NCC</p>
              <SourceBadge source="admin" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm text-sm font-bold",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className="w-4 h-4" />Lọc
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm">
            <Download className="w-4 h-4" />Export
          </button>
        </div>
      </div>

      {/* Vendor + Date + Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Vendor multi-select */}
          <div className="relative">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Vendor *</label>
            <button onClick={() => setShowVendorDrop(!showVendorDrop)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-indigo-600 hover:bg-slate-100">
              <span className="truncate">{selectedVendors.length === 0 ? "Chọn vendor" : selectedVendors.length === 1 ? selectedVendors[0] : `${selectedVendors.length} vendors`}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {showVendorDrop && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowVendorDrop(false)} />
              <div className="absolute top-full left-0 z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-2 max-h-56 overflow-auto">
                <input type="text" placeholder="Search..." value={vendorSearch}
                  onChange={e => setVendorSearch(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs mb-1 focus:outline-none" />
                <button onClick={() => setSelectedVendors([])}
                  className="text-[10px] font-bold text-rose-500 px-2 py-1 w-full text-left hover:bg-rose-50 rounded-md mb-1">
                  Xóa chọn
                </button>
                {visibleVendors.map(v => (
                  <div key={v} onClick={() => toggleVendor(v)}
                    className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors",
                      selectedVendors.includes(v) ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600")}>
                    <span className="font-medium">{v}</span>
                    {selectedVendors.includes(v) && <Check className="w-3.5 h-3.5" />}
                  </div>
                ))}
              </div>
              </>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Khoảng ngày</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-transparent focus:outline-none text-xs font-medium" />
              <span className="text-slate-300">—</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-transparent focus:outline-none text-xs font-medium" />
            </div>
          </div>

          {/* Comparison */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">So sánh</label>
            <select value={comparisonType} onChange={e => setComparisonType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="none">Không so sánh</option>
              <option value="previous_period">Kỳ trước</option>
              <option value="previous_year">Năm trước</option>
            </select>
          </div>

          {/* Apply */}
          <div className="flex items-end">
            <button onClick={fetchData} disabled={!selectedVendors.length || loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Áp dụng"}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhóm kênh</label>
              <select value={channelGroup} onChange={e => { setChannelGroup(e.target.value); setChannel("") }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Kênh</label>
              <select value={channel} onChange={e => setChannel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                {channels.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {error && <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl text-sm">{error}</div>}

      {/* KPI Cards */}
      {(metrics || loading) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Doanh thu", val: metrics?.revenue ?? 0, chg: metrics?.revenueChange ?? 0, icon: DollarSign, currency: true, color: "blue" },
            { label: "Units", val: metrics?.units ?? 0, chg: metrics?.unitsChange ?? 0, icon: Package, color: "purple" },
            { label: "Đơn hàng", val: metrics?.orders ?? 0, chg: metrics?.ordersChange ?? 0, icon: ShoppingCart, color: "indigo" },
            { label: "ASP", val: metrics?.aov ?? 0, chg: metrics?.aovChange ?? 0, icon: TrendingUp, currency: true, color: "emerald" },
            { label: "Gross Margin", val: metrics?.margin ?? 0, chg: metrics?.marginChange ?? 0, icon: LayoutDashboard, currency: true, color: "amber" },
          ].map((card, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className={cn("p-2 rounded-xl",
                  card.color === "blue" ? "bg-blue-50 text-blue-600" :
                  card.color === "purple" ? "bg-purple-50 text-purple-600" :
                  card.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                  card.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                  <card.icon className="w-5 h-5" />
                </div>
                {loading ? <Skeleton className="h-5 w-10" /> : <ChangeTag change={card.chg} visible={showComparison} />}
              </div>
              <p className="text-xs text-slate-500 font-medium">{card.label}</p>
              {loading ? <Skeleton className="h-7 w-28 mt-1" /> : (
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {card.currency ? formatCompactNumber(card.val) : formatNumber(card.val)}
                </h3>
              )}
              {!loading && allVendorRevenue > 0 && card.label === "Doanh thu" && (
                <p className="text-xs text-slate-400 mt-1">{((card.val / allVendorRevenue) * 100).toFixed(1)}% tổng doanh thu</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Projection */}
      {projection && !loading && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Dự báo cuối tháng ({projection.elapsed}/{projection.total} ngày)</p>
            <p className="text-xl font-bold text-blue-800">{formatCurrency(projection.revenue)}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Units dự báo</p>
            <p className="text-xl font-bold text-blue-800">{formatNumber(Math.round(projection.units))}</p>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {(trend.length > 0 || loading) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-4">Xu hướng doanh thu</h2>
          <div className="h-64">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }}
                    tickFormatter={v => formatCompactNumber(v)} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none" }}
                    formatter={(v: number) => [formatCurrency(v), "Doanh thu"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2}
                    fill="url(#vGrad)" name="Doanh thu" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Channel distribution */}
      {(chDist.length > 0 || loading) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-4">Phân bổ theo kênh</h2>
          <div className="h-56">
            {loading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chDist.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="channel_name" type="category" axisLine={false} tickLine={false}
                    tick={{ fill: "#475569", fontSize: 10 }} width={110}
                    tickFormatter={v => v ? v.slice(0, 18) : "—"} />
                  <Tooltip contentStyle={{ borderRadius: "10px", border: "none" }}
                    formatter={(v: number) => [formatCompactNumber(v), "Doanh thu"]} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} name="Doanh thu" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* SKU Breakdown */}
      {(products.length > 0 || loading) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">SKU Breakdown</h2>
              <span className="text-xs text-slate-400">{filteredSkus.length} SKUs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="text" placeholder="Tìm SKU..." value={skuSearch}
                  onChange={e => { setSkuSearch(e.target.value); setSkuPage(1) }}
                  className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    { label: "SKU", key: "sku" },
                    { label: "Doanh thu", key: "revenue", right: true },
                    { label: "Đơn", key: "orders", right: true },
                    { label: "Margin", key: "margin", right: true },
                    { label: "Margin %", key: "marginPct", right: true },
                  ].map(h => (
                    <th key={h.key}
                      onClick={() => { setSkuSort(s => ({ key: h.key, dir: s.key === h.key && s.dir === "desc" ? "asc" : "desc" })); setSkuPage(1) }}
                      className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700",
                        h.right && "text-right")}>
                      {h.label}
                      {skuSort.key === h.key && <span className="ml-1">{skuSort.dir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array(5).fill(0).map((_, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>)}
                  </tr>
                )) : paginatedSkus.map((p, i) => {
                  const mp = p.revenue > 0 ? (p.margin / p.revenue) * 100 : 0
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{p.sku}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCompactNumber(p.revenue)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{formatNumber(p.orders)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600">{formatCompactNumber(p.margin)}</td>
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
          {totalSkuPages > 1 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">{(skuPage - 1) * PAGE_SIZE + 1}–{Math.min(skuPage * PAGE_SIZE, filteredSkus.length)} / {filteredSkus.length} SKUs</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setSkuPage(p => Math.max(1, p - 1))} disabled={skuPage === 1}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs px-2">Trang {skuPage}/{totalSkuPages}</span>
                <button onClick={() => setSkuPage(p => Math.min(totalSkuPages, p + 1))} disabled={skuPage >= totalSkuPages}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
