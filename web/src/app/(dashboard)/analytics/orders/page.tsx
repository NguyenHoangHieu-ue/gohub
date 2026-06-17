"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search, Filter, Download, ChevronLeft, ChevronRight,
  Calendar, ShoppingBag, Globe, Package, RefreshCw, User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"

interface Order {
  order_code: string
  fulfiled_date: string
  channel_name: string
  order_source: string
  sku: string
  fulfilled_quantity: number
  fulfilled_revenue_amount_vnd: number
  unit_price_after_discount_vnd?: number
  staff_name: string
  customer_name: string
}

const PAGE_SIZE = 20

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ totalRevenue: 0, totalQuantity: 0 })
  const [showFilters, setShowFilters] = useState(false)
  const [channels, setChannels] = useState<string[]>([])
  const [selectedChannel, setSelectedChannel] = useState("")
  const [selectedChannelGroup, setSelectedChannelGroup] = useState("")
  const [selectedCustomerTier, setSelectedCustomerTier] = useState("")
  const [staffList, setStaffList] = useState<{ code: string; name: string }[]>([])
  const [selectedStaff, setSelectedStaff] = useState("")
  const [orderSources, setOrderSources] = useState<{ code: string; name: string }[]>([])
  const [selectedOrderSource, setSelectedOrderSource] = useState("")
  const [viewMode, setViewMode] = useState<"fulfilled" | "created">("fulfilled")

  const fetchChannels = useCallback(async (group = selectedChannelGroup, tier = selectedCustomerTier) => {
    const p = new URLSearchParams()
    if (group) p.set("channelGroup", group)
    if (tier && group === "B2B") p.set("tier", tier)
    const res = await fetch(`/api/channels?${p}`)
    if (res.ok) setChannels(await res.json())
  }, [selectedChannelGroup, selectedCustomerTier])

  const fetchStaff = useCallback(async (ch = selectedChannel, group = selectedChannelGroup) => {
    const p = new URLSearchParams()
    if (ch) p.set("channel", ch)
    if (group) p.set("channelGroup", group)
    const res = await fetch(`/api/staff?${p}`)
    if (res.ok) setStaffList(await res.json())
  }, [selectedChannel, selectedChannelGroup])

  const fetchOrderSources = useCallback(async (ch = selectedChannel, group = selectedChannelGroup) => {
    const p = new URLSearchParams()
    if (ch) p.set("channel", ch)
    if (group) p.set("channelGroup", group)
    const res = await fetch(`/api/order-sources?${p}`)
    if (res.ok) setOrderSources(await res.json())
  }, [selectedChannel, selectedChannelGroup])

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    try {
      const p = new URLSearchParams({
        startDate, endDate, page: page.toString(), pageSize: PAGE_SIZE.toString(),
        search: searchTerm, channelGroup: selectedChannelGroup,
        customerTier: selectedChannelGroup === "B2B" ? selectedCustomerTier : "",
        channel: selectedChannel, staff: selectedStaff,
        orderSource: selectedOrderSource, dataSource: viewMode,
      })
      const res = await fetch(`/api/orders?${p}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders)
        setTotal(data.total)
        setSummary(data.summary || { totalRevenue: 0, totalQuantity: 0 })
      }
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, page, searchTerm, selectedChannelGroup, selectedCustomerTier, selectedChannel, selectedStaff, selectedOrderSource, viewMode])

  useEffect(() => { fetchChannels() }, [])
  useEffect(() => { fetchChannels(selectedChannelGroup, selectedCustomerTier); setSelectedChannel("") }, [selectedChannelGroup, selectedCustomerTier])
  useEffect(() => { fetchStaff(selectedChannel, selectedChannelGroup); fetchOrderSources(selectedChannel, selectedChannelGroup) }, [selectedChannel])
  useEffect(() => { fetchOrders() }, [page, startDate, endDate, selectedChannel, selectedStaff, selectedOrderSource, viewMode, selectedChannelGroup, selectedCustomerTier])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const p = new URLSearchParams({
        startDate, endDate, search: searchTerm,
        channelGroup: selectedChannelGroup,
        customerTier: selectedChannelGroup === "B2B" ? selectedCustomerTier : "",
        channel: selectedChannel, staff: selectedStaff,
        orderSource: selectedOrderSource, dataSource: viewMode,
      })
      const res = await fetch(`/api/orders/export?${p}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.length) return

      const headers = ["Order ID", "Ngày", "Khách hàng", "Nhân viên", "Kênh", "Nguồn", "SKU", "Số lượng", "Đơn giá", "Doanh thu (VND)"]
      const rows = [headers.join(",")]
      data.forEach((item: any) => {
        rows.push([
          `"${item.order_id || ''}"`,
          `"${item.date ? new Date(item.date).toLocaleDateString("vi-VN") : ''}"`,
          `"${(item.customer || '').replace(/"/g, '""')}"`,
          `"${(item.staff || '').replace(/"/g, '""')}"`,
          `"${item.channel || ''}"`,
          `"${(item.order_source || '').replace(/"/g, '""')}"`,
          `"${item.sku || ''}"`,
          item.fulfilled_quantity || 0,
          item.unit_price_after_discount_vnd || 0,
          item.revenue || 0,
        ].join(","))
      })

      const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Orders_${startDate}_${endDate}.csv`
      a.click()
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-4 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Quản Lý Đơn Hàng</h1>
            <p className="text-xs text-slate-500">
              {viewMode === "fulfilled" ? "Đơn đã giao" : "Đơn đã tạo"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-200 p-1 rounded-lg">
            {(["fulfilled", "created"] as const).map(m => (
              <button key={m} onClick={() => { setViewMode(m); setPage(1) }}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  viewMode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {m === "fulfilled" ? "Giao hàng" : "Tạo đơn"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border-none bg-transparent text-xs focus:ring-0 p-0" />
            <span className="text-slate-300">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border-none bg-transparent text-xs focus:ring-0 p-0" />
          </div>

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className="w-3.5 h-3.5" />
            Lọc
          </button>

          <button onClick={handleExport} disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Tổng đơn", value: formatNumber(total), icon: ShoppingBag, color: "blue" },
          { label: "Số lượng", value: formatNumber(summary.totalQuantity), icon: Package, color: "emerald" },
          { label: "Doanh thu", value: formatCurrency(summary.totalRevenue), icon: RefreshCw, color: "amber" },
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

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tìm kiếm</label>
              <form onSubmit={e => { e.preventDefault(); setPage(1); fetchOrders() }} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Mã đơn, SKU..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  Tìm
                </button>
              </form>
            </div>

            {/* Channel Group */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhóm kênh</label>
              <select value={selectedChannelGroup}
                onChange={e => { setSelectedChannelGroup(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>

            {/* Customer Tier (B2B only) */}
            {selectedChannelGroup === "B2B" && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tier khách</label>
                <select value={selectedCustomerTier}
                  onChange={e => { setSelectedCustomerTier(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Tất cả</option>
                  <option value="Strategic">Strategic</option>
                  <option value="Non-strategic">Non-strategic</option>
                </select>
              </div>
            )}

            {/* Channel */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Kênh</label>
              <select value={selectedChannel}
                onChange={e => { setSelectedChannel(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                {channels.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Staff */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhân viên</label>
              <select value={selectedStaff}
                onChange={e => { setSelectedStaff(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                {staffList.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>

            {/* Order Source */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Nguồn</label>
              <select value={selectedOrderSource}
                onChange={e => { setSelectedOrderSource(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tất cả</option>
                {orderSources.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
            <button onClick={() => {
              setSearchTerm(""); setSelectedChannelGroup(""); setSelectedCustomerTier("")
              setSelectedChannel(""); setSelectedStaff(""); setSelectedOrderSource("")
              setPage(1)
            }} className="text-xs text-slate-500 hover:text-slate-700">
              Xóa bộ lọc
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              {isLoading ? "Đang tải..." : "Đã cập nhật"}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Đơn hàng</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Khách hàng</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Kênh</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nhân viên</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nguồn</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">SL</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-slate-100 rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length > 0 ? (
                orders.map((o, idx) => (
                  <tr key={`${o.order_code}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900 text-sm">{o.order_code}</div>
                      <div className="text-xs text-slate-400">
                        {o.fulfiled_date ? new Date(o.fulfiled_date).toLocaleDateString("vi-VN") : "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">{o.customer_name || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">{o.channel_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">{o.staff_name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">{o.order_source || "—"}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs font-medium text-slate-700">{o.sku}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">
                      {o.fulfilled_quantity}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-blue-600">
                      {formatCurrency(o.fulfilled_revenue_amount_vnd)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400 text-sm">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    Không có đơn hàng trong khoảng thời gian này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {total > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} / ${formatNumber(total)} đơn` : "0 đơn"}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-600 px-2">Trang {page}/{totalPages || 1}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || isLoading}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
