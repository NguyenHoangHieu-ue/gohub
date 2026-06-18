"use client"

import { useState, useEffect, useCallback } from "react"
import { Users, Calendar, Download, Search, ChevronLeft, ChevronRight, ShoppingBag, Package, TrendingUp, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"

interface StaffMetric {
  staff_name: string
  staff_code: string
  total_orders: string
  total_units: string
  total_revenue: string
}

interface Order {
  order_code: string
  company_code: string
  fulfiled_date: string
  product_name: string
  sku: string
  fulfilled_quantity: number
  fulfilled_revenue_amount_vnd: number
  channel_name: string
  staff_name: string
  customer_name: string
  order_source: string
}

export default function StaffPage() {
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [channelGroup, setChannelGroup] = useState<"All" | "B2B" | "B2C">("All")
  const [selectedChannel, setSelectedChannel] = useState("")
  const [companyCode, setCompanyCode] = useState("ALL")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [staffList, setStaffList] = useState<{ code: string; name: string }[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [staffMetrics, setStaffMetrics] = useState<StaffMetric[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"fulfilled" | "created">("fulfilled")
  const [page, setPage] = useState(1)
  const [showStaffDropdown, setShowStaffDropdown] = useState(false)
  const [staffSearch, setStaffSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const baseParams = new URLSearchParams({
        startDate, endDate,
        channelGroup: channelGroup === "All" ? "" : channelGroup,
        channel: selectedChannel, companyCode, dataSource: viewMode,
        staff: selectedStaff.join(","),
        search: selectedStaff.length === 0 ? searchTerm : "",
      })

      const [perfRes, ordersRes] = await Promise.all([
        fetch(`/api/staff-performance?${baseParams}`),
        fetch(`/api/orders?${baseParams}&page=${page}&pageSize=10`),
      ])

      if (perfRes.ok) setStaffMetrics(await perfRes.json())
      else setError("Hiếu đang fix, vui lòng đợi")
      if (ordersRes.ok) {
        const d = await ordersRes.json()
        setOrders(d.orders || [])
      }
    } catch (err) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, channelGroup, selectedChannel, companyCode, viewMode, selectedStaff, searchTerm, page])

  const fetchChannelsAndStaff = useCallback(async () => {
    const [chRes, stRes] = await Promise.all([
      fetch(`/api/channels?channelGroup=${channelGroup === "All" ? "" : channelGroup}`),
      fetch(`/api/staff-list?channelGroup=${channelGroup === "All" ? "" : channelGroup}&channel=${selectedChannel}&companyCode=${companyCode}&dataSource=${viewMode}`),
    ])
    if (chRes.ok) setChannels(await chRes.json())
    if (stRes.ok) setStaffList(await stRes.json())
  }, [channelGroup, selectedChannel, companyCode, viewMode])

  useEffect(() => { fetchChannelsAndStaff() }, [viewMode, channelGroup, selectedChannel, companyCode])
  useEffect(() => { fetchAll() }, [viewMode, page])

  const totalRevenue = staffMetrics.reduce((s, m) => s + parseFloat(m.total_revenue), 0)
  const totalUnits   = staffMetrics.reduce((s, m) => s + parseInt(m.total_units), 0)
  const totalOrders  = staffMetrics.reduce((s, m) => s + parseInt(m.total_orders), 0)

  const handleExportSummary = () => {
    const headers = ["Rank", "Code", "Tên", "Đơn", "Units", "Doanh thu (VND)", "AOV", "Đóng góp %"]
    const rows = [headers.join(",")]
    staffMetrics.forEach((s, i) => {
      const rev = parseFloat(s.total_revenue)
      const ord = parseInt(s.total_orders)
      const contrib = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(2) : "0"
      const aov = ord > 0 ? (rev / ord).toFixed(0) : "0"
      rows.push([i + 1, `"${s.staff_code}"`, `"${s.staff_name}"`, ord, s.total_units, rev, aov, contrib].join(","))
    })
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `Staff_Performance_${startDate}_${endDate}.csv`
    a.click()
  }

  const filteredStaff = staffList.filter(s =>
    (s.name || "").toLowerCase().includes(staffSearch.toLowerCase()) ||
    (s.code || "").toLowerCase().includes(staffSearch.toLowerCase())
  )

  return (
    <div className="p-4 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Hiệu Suất Nhân Viên</h1>
            <p className="text-xs text-slate-500">Ranking và theo dõi đội sales</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            {(["fulfilled", "created"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  viewMode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}>
                {m === "fulfilled" ? "Giao hàng" : "Tạo đơn"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border-none bg-transparent text-xs focus:ring-0 p-0" />
            <span className="text-slate-300">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border-none bg-transparent text-xs focus:ring-0 p-0" />
          </div>

          <button onClick={fetchAll}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
            Áp dụng
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <Filter className="w-4 h-4 text-slate-400" />

        <div className="flex gap-2">
          {(["All", "B2B", "B2C"] as const).map(g => (
            <button key={g} onClick={() => { setChannelGroup(g); setSelectedChannel("") }}
              className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                channelGroup === g ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white")}>
              {g}
            </button>
          ))}
        </div>

        <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-600 px-3 py-1.5">
          <option value="">Tất cả kênh</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={companyCode} onChange={e => setCompanyCode(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-600 px-3 py-1.5">
          <option value="ALL">Tất cả công ty</option>
          <option value="VN">VN</option>
          <option value="US">US</option>
        </select>

        {/* Staff multi-select */}
        <div className="relative">
          <button onClick={() => setShowStaffDropdown(!showStaffDropdown)}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-600 px-3 py-1.5">
            {selectedStaff.length === 0 ? "Tất cả NV" : `${selectedStaff.length} NV đã chọn`}
          </button>
          {showStaffDropdown && (
            <div className="absolute top-full left-0 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-60 overflow-auto p-2">
              <input type="text" placeholder="Tìm nhân viên..." value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-2 focus:outline-none" />
              <button onClick={() => setSelectedStaff([])}
                className="text-[10px] font-bold text-blue-600 px-2 py-1 hover:bg-blue-50 rounded-md w-full text-left mb-1">
                Xóa chọn
              </button>
              {filteredStaff.map(s => (
                <label key={s.code} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={selectedStaff.includes(s.code)}
                    onChange={() => setSelectedStaff(prev =>
                      prev.includes(s.code) ? prev.filter(c => c !== s.code) : [...prev, s.code]
                    )}
                    className="rounded border-slate-300 text-blue-600" />
                  <div>
                    <div className="text-xs font-medium text-slate-700">{s.name}</div>
                    <div className="text-[9px] text-slate-400">{s.code}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" placeholder="Tìm đơn, tên NV..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Tổng đơn", value: formatNumber(totalOrders), icon: ShoppingBag, color: "blue" },
          { label: "Số lượng", value: formatNumber(totalUnits), icon: Package, color: "emerald" },
          { label: "Doanh thu", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "amber" },
        ].map(card => (
          <div key={card.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                card.color === "blue" ? "bg-blue-50 text-blue-600" :
                card.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                <card.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className="text-lg font-bold text-slate-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Bảng xếp hạng nhân viên</h3>
          <button onClick={handleExportSummary}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Rank", "Nhân viên", "Đơn", "Units", "Doanh thu", "AOV", "Đóng góp"].map(h => (
                  <th key={h} className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider",
                    h !== "Rank" && h !== "Nhân viên" ? "text-right" : "")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : staffMetrics.map((staff, idx) => {
                const rev = parseFloat(staff.total_revenue)
                const ord = parseInt(staff.total_orders)
                const contrib = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0
                const aov = ord > 0 ? rev / ord : 0
                return (
                  <tr key={staff.staff_code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className={cn("w-7 h-7 inline-flex items-center justify-center rounded-lg text-xs font-bold",
                        idx === 0 ? "bg-amber-100 text-amber-700" :
                        idx === 1 ? "bg-slate-100 text-slate-600" :
                        idx === 2 ? "bg-orange-50 text-orange-700" : "text-slate-400")}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-bold text-sm text-slate-900">{staff.staff_name}</div>
                      <div className="text-xs text-slate-400">{staff.staff_code}</div>
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-slate-600">{formatNumber(ord)}</td>
                    <td className="px-5 py-3 text-right text-sm text-slate-600">{formatNumber(parseInt(staff.total_units))}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatCurrency(rev)}</td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500">{formatCurrency(aov)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${contrib}%` }} />
                        </div>
                        <span className="text-xs font-bold text-blue-600 w-9 text-right">{contrib.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && staffMetrics.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    Không có dữ liệu cho khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Giao dịch gần đây</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Trang {page}</span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={orders.length < 10}
              className="p-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Ngày", "Đơn", "Nhân viên", "Khách", "SKU", "Units", "Doanh thu"].map(h => (
                  <th key={h} className={cn("px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider",
                    h === "Units" || h === "Doanh thu" ? "text-right" : "")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o, idx) => (
                <tr key={`${o.order_code}-${idx}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {o.fulfiled_date ? new Date(o.fulfiled_date).toLocaleDateString("vi-VN") : "—"}
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-slate-900">{o.order_code}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{o.staff_name}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{o.customer_name}</td>
                  <td className="px-5 py-3">
                    <div className="text-sm text-slate-700">{o.product_name || "—"}</div>
                    <div className="font-mono text-[10px] text-slate-400">{o.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-slate-600">{o.fulfilled_quantity}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">
                    {formatCurrency(o.fulfilled_revenue_amount_vnd)}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    Không có giao dịch
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
