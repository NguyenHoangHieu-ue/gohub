"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts"
import {
  Users, Calendar, Download, Search, Filter, Check,
  ChevronDown, ShoppingBag, DollarSign, TrendingUp, Activity,
  UserPlus, Package, RefreshCw, AlertCircle, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber, formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"
import { useSession } from "next-auth/react"

interface KPI { label: string; value: number; lastPeriod: number; change: number; isPositive: boolean; isCurrency?: boolean }
interface TrendRow { name: string; revenue: number; prev_revenue: number; margin: number; active_customers: number }
interface CustomerRow { name: string; revenue: number; margin: number; margin_percent: number; orders: number; units: number; last_order: string }
interface ProductRow { sku: string; product_name: string; revenue: number; quantity: number; orders: number }
interface OrderRow { order_code: string; customer_name: string; product_name: string; order_date: string; revenue: number; items: number }

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"]

const KPI_ICONS: Record<string, React.ElementType> = {
  Revenue: DollarSign,
  "Total Orders": ShoppingBag,
  "Units Sold": Package,
  "Average Order Value": Activity,
  "Total Margin": TrendingUp,
}

export default function CustomersPage() {
  const { data: session } = useSession()
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [period, setPeriod] = useState<"day" | "week" | "month">("month")

  const [searchQuery, setSearchQuery] = useState("")
  const [customers, setCustomers] = useState<string[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)

  const [kpis, setKpis] = useState<KPI[]>([])
  const [trendData, setTrendData] = useState<TrendRow[]>([])
  const [performanceData, setPerformanceData] = useState<CustomerRow[]>([])
  const [productData, setProductData] = useState<ProductRow[]>([])
  const [orderData, setOrderData] = useState<OrderRow[]>([])
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced customer search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}`)
        if (res.ok) setCustomers(await res.json())
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch partner tiers once
  useEffect(() => {
    fetch("/api/config/partner-tiers")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPartnerTiers(d) })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (!selectedCustomers.length) return
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/customer/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dateColumn, period, customers: selectedCustomers }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi khi tải dữ liệu")
      const d = await res.json()
      setKpis(d.kpis || [])
      setTrendData(d.trend || [])
      setPerformanceData(d.performance || [])
      setProductData(d.products || [])
      setOrderData(d.orders || [])
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, dateColumn, period, selectedCustomers])

  const toggleCustomer = (name: string) => {
    setSelectedCustomers(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  const handleExport = () => {
    if (!performanceData.length) return
    const headers = ["Tên khách", "Doanh thu", "Margin", "Margin %", "Đơn", "Units", "AOV", "Đơn cuối"]
    const rows = [headers.join(",")]
    performanceData.forEach(r => {
      const aov = r.orders > 0 ? r.revenue / r.orders : 0
      rows.push([
        `"${r.name}"`, r.revenue.toFixed(0), r.margin.toFixed(0),
        r.margin_percent.toFixed(1), r.orders, r.units.toFixed(0),
        aov.toFixed(0),
        `"${r.last_order ? new Date(r.last_order).toLocaleDateString("vi-VN") : ""}"`,
      ].join(","))
    })
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `Customer_Performance_${startDate}_${endDate}.csv`; a.click()
  }

  const strategicPartners = new Set((partnerTiers["Strategic"] || []).map(s => s.toLowerCase()))
  const isStrategic = (name: string) => [...strategicPartners].some(p => name.toLowerCase().includes(p))

  return (
    <div className="p-4 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Hiệu Suất Khách Hàng</h1>
            <p className="text-xs text-slate-500">Phân tích hành vi và doanh thu khách B2B</p>
          </div>
          {loading && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />}
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          {/* Customer selector */}
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-indigo-600 hover:bg-slate-50 min-w-[180px]">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="truncate flex-1 text-left">
                {selectedCustomers.length === 0 ? "Chọn khách hàng *" :
                 selectedCustomers.length === 1 ? selectedCustomers[0] :
                 `${selectedCustomers.length} đã chọn`}
              </span>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showDropdown && "rotate-180")} />
            </button>

            {showDropdown && (
              <div className="absolute z-50 top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 min-w-72 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tìm khách hàng</span>
                  <button onClick={() => setSelectedCustomers([])}
                    className="text-[10px] font-bold text-rose-500 hover:underline">Xóa tất cả</button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Gõ để tìm..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
                  {selectedCustomers.filter(c => !customers.includes(c)).map((cust, i) => (
                    <div key={`sel-${i}`} onClick={() => toggleCustomer(cust)}
                      className="px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between bg-indigo-50 text-indigo-700">
                      <span className="text-xs font-bold truncate">{cust}</span>
                      <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    </div>
                  ))}
                  {customers.map((cust, i) => (
                    <div key={i} onClick={() => toggleCustomer(cust)}
                      className={cn("px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-colors",
                        selectedCustomers.includes(cust) ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600")}>
                      <span className="text-xs font-medium truncate">{cust}</span>
                      {selectedCustomers.includes(cust) && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </div>
                  ))}
                  {searching && <div className="py-4 flex justify-center"><RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /></div>}
                  {!searching && !customers.length && searchQuery && (
                    <div className="py-6 text-center text-xs text-slate-400">Không tìm thấy khách hàng</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-2 px-3 py-2 border-r border-slate-100">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none" />
            <span className="text-slate-300">/</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none" />
          </div>

          {/* Data source */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            {(["fulfiled_date", "created_date"] as const).map(dc => (
              <button key={dc} onClick={() => setDateColumn(dc)}
                className={cn("px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                  dateColumn === dc ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}>
                {dc === "fulfiled_date" ? "Fulfilled" : "Created"}
              </button>
            ))}
          </div>

          <button onClick={fetchData} disabled={!selectedCustomers.length || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-200">
            Áp dụng
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={fetchData} className="ml-auto text-xs font-bold bg-rose-100 px-3 py-1 rounded-lg">Thử lại</button>
        </div>
      )}

      {/* Empty state — no customer selected */}
      {!selectedCustomers.length && !loading && !error && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
            <Users className="w-9 h-9 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Chọn khách hàng để xem báo cáo</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">Dùng bộ lọc phía trên để chọn 1 hoặc nhiều khách hàng, sau đó nhấn Áp dụng.</p>
          </div>
        </div>
      )}

      {/* Dashboard — shown after selecting customers */}
      {selectedCustomers.length > 0 && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(loading ? Array(5).fill(null) : kpis).map((kpi, idx) => {
              const Icon = kpi ? (KPI_ICONS[kpi.label] || TrendingUp) : TrendingUp
              const colors = ["blue", "emerald", "amber", "indigo", "rose"]
              const color = colors[idx % colors.length]
              return (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  {loading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-8 w-8 bg-slate-100 rounded-xl" />
                      <div className="h-3 bg-slate-100 rounded w-20 mt-3" />
                      <div className="h-7 bg-slate-100 rounded w-28 mt-1" />
                    </div>
                  ) : kpi ? (
                    <>
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3",
                        color === "blue" ? "bg-blue-50 text-blue-600" :
                        color === "emerald" ? "bg-emerald-50 text-emerald-600" :
                        color === "amber" ? "bg-amber-50 text-amber-600" :
                        color === "indigo" ? "bg-indigo-50 text-indigo-600" : "bg-rose-50 text-rose-600")}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                      <h3 className="text-xl font-black text-slate-900 mt-0.5">
                        {kpi.isCurrency ? formatCompactNumber(kpi.value) : formatNumber(kpi.value)}
                      </h3>
                      {kpi.lastPeriod > 0 && (
                        <p className={cn("text-[10px] font-bold mt-1", kpi.isPositive ? "text-emerald-600" : "text-rose-500")}>
                          {kpi.isPositive ? "+" : ""}{formatCompactNumber(kpi.change)} vs kỳ trước
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Trend Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-900">Xu hướng doanh thu khách hàng</h3>
                <p className="text-xs text-slate-400 mt-0.5">So sánh kỳ hiện tại vs kỳ trước</p>
              </div>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                {(["day", "week", "month"] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                      period === p ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}>
                    {p === "day" ? "Ngày" : p === "week" ? "Tuần" : "Tháng"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72">
              {loading ? <div className="w-full h-full bg-slate-100 animate-pulse rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}
                      tickFormatter={v => formatCompactNumber(v)} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                      formatter={(v: any) => formatCurrency(v)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Bar dataKey="prev_revenue" name="Kỳ trước" fill="#e2e8f0" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="revenue" name="Kỳ này" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Products + Orders grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-xl"><ShoppingBag className="w-4 h-4 text-amber-600" /></div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Top sản phẩm mua</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Theo doanh thu</p>
                </div>
              </div>
              <div className="overflow-auto max-h-80">
                {loading ? (
                  <div className="p-5 space-y-3 animate-pulse">
                    {Array(5).fill(0).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
                  </div>
                ) : productData.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">Không có dữ liệu</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100">
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sản phẩm</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">SL</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {productData.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{p.product_name || p.sku}</div>
                            <div className="font-mono text-[10px] text-slate-400">{p.sku}</div>
                          </td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-slate-600">{formatNumber(p.quantity)}</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatCompactNumber(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Orders */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-xl"><Activity className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Lịch sử đơn hàng</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">50 đơn gần nhất</p>
                </div>
              </div>
              <div className="overflow-auto max-h-80">
                {loading ? (
                  <div className="p-5 space-y-3 animate-pulse">
                    {Array(5).fill(0).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl" />)}
                  </div>
                ) : orderData.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">Không có đơn hàng</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đơn</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">SP</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ngày</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">DT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {orderData.map((o, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-black text-slate-900 whitespace-nowrap">{o.order_code}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[140px]" title={o.product_name}>{o.product_name}</td>
                          <td className="px-4 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                            {o.order_date ? new Date(o.order_date).toLocaleDateString("vi-VN") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-indigo-600">{formatCompactNumber(o.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Strategic Partners section */}
          {Object.entries(partnerTiers).map(([tierName, partners]) => {
            if (!partners.length) return null
            const tierData = performanceData.filter(p =>
              partners.some(partner => p.name.toLowerCase().includes(partner.toLowerCase()))
            )
            if (!tierData.length) return null
            return (
              <div key={tierName} className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-indigo-50 bg-gradient-to-r from-indigo-50/60 to-white flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-xl"><Sparkles className="w-4 h-4 text-white" /></div>
                  <div>
                    <h2 className="font-bold text-slate-900">{tierName} Partners Performance</h2>
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Priority Business</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-indigo-50/20 border-b border-indigo-100">
                        {["Partner", "Doanh thu", "Margin %", "Đơn", "Đơn cuối"].map(h => (
                          <th key={h} className={cn("px-6 py-4 text-xs font-bold text-indigo-600 uppercase tracking-wider",
                            h !== "Partner" ? "text-right" : "")}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-50">
                      {tierData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900">{row.name}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-800">{formatCurrency(row.revenue)}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-lg",
                              row.margin_percent >= 15 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                              {row.margin_percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-600">{row.orders}</td>
                          <td className="px-6 py-4 text-right text-xs text-slate-400">
                            {row.last_order ? new Date(row.last_order).toLocaleDateString("vi-VN") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Full breakdown table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Breakdown toàn bộ khách hàng</h3>
                <p className="text-xs text-slate-400 mt-0.5">Metrics chi tiết theo từng khách</p>
              </div>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["Khách hàng", "Doanh thu", "Gross Profit", "Units", "Đơn", "AOV"].map(h => (
                      <th key={h} className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider",
                        h !== "Khách hàng" ? "text-right" : "")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array(6).fill(0).map((_, j) => (
                          <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : performanceData.filter(p => !isStrategic(p.name)).length === 0 && performanceData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                        Không có dữ liệu trong khoảng thời gian này
                      </td>
                    </tr>
                  ) : (
                    performanceData
                      .filter(p => !isStrategic(p.name))
                      .map((row, idx) => {
                        const aov = row.orders > 0 ? row.revenue / row.orders : 0
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-black flex-shrink-0">
                                  {row.name.charAt(0)}
                                </div>
                                <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{row.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(row.revenue)}</td>
                            <td className="px-5 py-3 text-right">
                              <span className={cn("text-sm font-bold", row.margin >= 0 ? "text-emerald-600" : "text-rose-500")}>
                                {formatCurrency(row.margin)}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-sm text-slate-500">{formatNumber(row.units)}</td>
                            <td className="px-5 py-3 text-right text-sm font-medium text-slate-600">{row.orders}</td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">
                                {formatCompactNumber(aov)}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
