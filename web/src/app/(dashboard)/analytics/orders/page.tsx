"use client"

import React, { useState, useEffect } from "react"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { Search, Filter, Download, ChevronLeft, ChevronRight, Calendar, ShoppingBag, Globe, Package, RefreshCw, User } from "lucide-react"
import { cn } from "@/lib/utils"

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

export default function OrderManagementPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
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
  const pageSize = 20

  useEffect(() => {
    fetchChannels()
  }, [])

  useEffect(() => {
    fetchChannels(selectedChannelGroup, selectedCustomerTier)
    setSelectedChannel("")
    fetchStaff(undefined, selectedChannelGroup)
    fetchOrderSources(undefined, selectedChannelGroup)
  }, [selectedChannelGroup, selectedCustomerTier])

  useEffect(() => {
    fetchStaff(selectedChannel, selectedChannelGroup)
    setSelectedStaff("")
    fetchOrderSources(selectedChannel, selectedChannelGroup)
    setSelectedOrderSource("")
  }, [selectedChannel])

  useEffect(() => {
    fetchOrders()
  }, [page, startDate, endDate, selectedChannel, selectedStaff, selectedOrderSource, viewMode, selectedCustomerTier, selectedChannelGroup])

  const fetchChannels = async (channelGroup?: string, tier?: string) => {
    try {
      const params = new URLSearchParams()
      if (channelGroup) params.append("channelGroup", channelGroup)
      if (tier && channelGroup === "B2B") params.append("tier", tier)
      const url = `/api/channels${params.toString() ? `?${params.toString()}` : ""}`
      const response = await fetch(url)
      if (response.ok) {
        setChannels(await response.json())
      }
    } catch (err) {
      console.error("Error fetching channels:", err)
    }
  }

  const fetchStaff = async (channel?: string, channelGroup?: string) => {
    try {
      const params = new URLSearchParams()
      if (channel) params.append("channel", channel)
      if (channelGroup) params.append("channelGroup", channelGroup)

      const url = `/api/staff?${params.toString()}`
      const response = await fetch(url)
      if (response.ok) {
        setStaffList(await response.json())
      }
    } catch (err) {
      console.error("Error fetching staff:", err)
    }
  }

  const fetchOrderSources = async (channel?: string, channelGroup?: string) => {
    try {
      const params = new URLSearchParams()
      if (channel) params.append("channel", channel)
      if (channelGroup) params.append("channelGroup", channelGroup)

      const url = `/api/order-sources?${params.toString()}`
      const response = await fetch(url)
      if (response.ok) {
        setOrderSources(await response.json())
      }
    } catch (err) {
      console.error("Error fetching order sources:", err)
    }
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        page: page.toString(),
        pageSize: pageSize.toString(),
        search: searchTerm,
        channelGroup: selectedChannelGroup,
        customerTier: selectedChannelGroup === "B2B" ? selectedCustomerTier : "",
        channel: selectedChannel,
        staff: selectedStaff,
        orderSource: selectedOrderSource,
        dataSource: viewMode,
      })
      const response = await fetch(`/api/orders?${params}`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.orders)
        setTotal(data.total)
        setSummary(data.summary || { totalRevenue: 0, totalQuantity: 0 })
      }
    } catch (err) {
      console.error("Error fetching orders:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchOrders()
  }

  const handleReset = () => {
    setSearchTerm("")
    setSelectedChannelGroup("")
    setSelectedCustomerTier("")
    setSelectedChannel("")
    setSelectedStaff("")
    setSelectedOrderSource("")
    setViewMode("fulfilled")
    setStartDate(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0])
    setEndDate(new Date().toISOString().split("T")[0])
    setPage(1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        search: searchTerm,
        channelGroup: selectedChannelGroup,
        customerTier: selectedChannelGroup === "B2B" ? selectedCustomerTier : "",
        channel: selectedChannel,
        staff: selectedStaff,
        orderSource: selectedOrderSource,
        dataSource: viewMode,
      })
      const response = await fetch(`/api/orders/export?${params}`)
      if (response.ok) {
        const data = await response.json()

        if (data.length === 0) {
          alert("No data to export for the selected filters.")
          return
        }

        const headers = ["Order ID", viewMode === "created" ? "Created Date" : "Fulfilled Date", "Customer", "Staff", "Channel", "Order Source", "Product Name", "SKU", "Quantity", "Unit Price", "Revenue (VND)", "Location"]
        const csvRows = [headers.join(",")]

        data.forEach((item: any) => {
          const dateStr = item.date ? (
            viewMode === "created"
              ? new Date(item.date).toLocaleString("en-GB").replace(",", "")
              : new Date(item.date).toLocaleDateString()
          ) : ""

          const row = [
            `"${item.order_id || ""}"`,
            `"${dateStr}"`,
            `"${item.customer || ""}"`,
            `"${item.staff || ""}"`,
            `"${item.channel || ""}"`,
            `"${item.order_source || ""}"`,
            `"${item.product_name?.replace(/"/g, '""') || ""}"`,
            `"${item.sku || ""}"`,
            item.fulfilled_quantity || 0,
            item.unit_price_after_discount_vnd || 0,
            item.revenue || 0,
            `"${item.location || ""}"`,
          ]
          csvRows.push(row.join(","))
        })

        const csvContent = "﻿" + csvRows.join("\n")
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `Orders_${viewMode}_Export_${startDate}_to_${endDate}.csv`)
        link.style.visibility = "hidden"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        console.error("Export failed")
      }
    } catch (err) {
      console.error("Error exporting orders:", err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl lg:text-2xl shrink-0">O</div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Order Management</h1>
            <p className="text-xs lg:text-sm text-slate-500">View and manage all {viewMode === "fulfilled" ? "fulfillment" : "sales"} orders</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Data Source Toggle */}
          <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner mr-2">
            <button
              onClick={() => { setViewMode("fulfilled"); setPage(1) }}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewMode === "fulfilled" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Fulfilled
            </button>
            <button
              onClick={() => { setViewMode("created"); setPage(1) }}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewMode === "created" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Created
            </button>
          </div>

          <div className="flex-1 md:flex-none flex items-center gap-2 bg-white px-3 lg:px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs lg:text-sm font-medium whitespace-nowrap">
              {startDate && endDate ? `${startDate} - ${endDate}` : "Select Date Range"}
            </span>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg border shadow-sm transition-colors",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />
            <span className="text-xs lg:text-sm font-medium">Filters</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{isExporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total {viewMode === "created" ? "Created" : "Fulfilled"} Orders</p>
              <h3 className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total {viewMode === "created" ? "Quantity" : "Fulfilled Qty"}</p>
              <h3 className="text-2xl font-bold text-slate-900">{summary.totalQuantity.toLocaleString()}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total {viewMode === "created" ? "Sales Value" : "Fulfilled Revenue"}</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(summary.totalRevenue)}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4 items-end">
            <div className="md:col-span-2 lg:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Search</label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Order Code, SKU..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all shadow-sm"
                >
                  Search
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel Group</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                  value={selectedChannelGroup}
                  onChange={(e) => {
                    setSelectedChannelGroup(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All Groups</option>
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
            </div>
            {selectedChannelGroup === "B2B" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Tier</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={selectedCustomerTier}
                    onChange={(e) => {
                      setSelectedCustomerTier(e.target.value)
                      setPage(1)
                    }}
                  >
                    <option value="">All Tiers</option>
                    <option value="Strategic">Strategic</option>
                    <option value="Non-strategic">Non-strategic</option>
                  </select>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {selectedChannelGroup === "B2B" ? "Customer Name" : "Channel"}
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                  value={selectedChannel}
                  onChange={(e) => {
                    setSelectedChannel(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All Channels</option>
                  {channels.map(channel => (
                    <option key={channel} value={channel}>{channel}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Staff</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                  value={selectedStaff}
                  onChange={(e) => {
                    setSelectedStaff(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All Staff</option>
                  {staffList.map(staff => (
                    <option key={staff.code} value={staff.code}>{staff.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Source</label>
              <div className="relative">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                  value={selectedOrderSource}
                  onChange={(e) => {
                    setSelectedOrderSource(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All Sources</option>
                  {orderSources.map(source => (
                    <option key={source.code} value={source.code}>{source.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </form>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={handleReset}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Reset Filters
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 italic">
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              {isLoading ? "Updating..." : "Updated"}
            </div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">
                  {viewMode === "created" ? "Order Info (Created)" : "Order Info (Fulfilled)"}
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">
                  {selectedChannelGroup === "B2B" ? "Customer Name" : "Channel"}
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Staff</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Order Source</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Product / SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Qty</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Unit Price</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24 mb-2"></div><div className="h-3 bg-slate-50 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-32"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-8 ml-auto"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16 ml-auto"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : orders.length > 0 ? (
                orders.map((order, idx) => (
                  <tr key={`${order.order_code}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{order.order_code}</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {order.fulfiled_date ? (
                            viewMode === "created"
                              ? new Date(order.fulfiled_date).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : new Date(order.fulfiled_date).toLocaleDateString()
                          ) : "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 font-medium">{order.customer_name || "Unknown"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">{order.channel_name || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600 whitespace-nowrap">{order.staff_name || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600 font-medium whitespace-nowrap">{order.order_source || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600 font-medium">{order.sku}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-slate-900">{order.fulfilled_quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-medium text-slate-600">
                        {order.unit_price_after_discount_vnd ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(order.unit_price_after_discount_vnd) : "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-blue-600">
                        {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(order.fulfilled_revenue_amount_vnd)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ShoppingBag className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No orders found for the selected period</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-500 font-medium">
            Showing <span className="text-slate-900">{(page - 1) * pageSize + 1}</span> to <span className="text-slate-900">{Math.min(page * pageSize, total)}</span> of <span className="text-slate-900">{total}</span> orders
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(total / pageSize)) }).map((_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                      page === pageNum ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-white text-slate-600"
                    )}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= total || isLoading}
              className="p-2 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
