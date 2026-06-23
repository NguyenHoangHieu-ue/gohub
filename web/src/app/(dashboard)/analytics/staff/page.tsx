"use client"

import React, { useState, useEffect } from "react"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { Users, Calendar, Filter, Download, Search, ChevronLeft, ChevronRight, ShoppingBag, Package, TrendingUp, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { SourceBadge } from "@/components/dashboard-kit"
import { Pager, PAGE_ROWS } from "@/components/pager"

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

export default function StaffPerformancePage() {
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [channelGroup, setChannelGroup] = useState<"All" | "B2B" | "B2C">("All")
  const [selectedChannel, setSelectedChannel] = useState("")
  const [companyCode, setCompanyCode] = useState<string>("ALL")
  const [searchTerm, setSearchTerm] = useState("")
  const [staffSearchTerm, setStaffSearchTerm] = useState("")
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [staffList, setStaffList] = useState<{ code: string; name: string }[]>([])
  const [staffMetrics, setStaffMetrics] = useState<StaffMetric[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"fulfilled" | "created">("fulfilled")
  const [page, setPage] = useState(1)
  const [totalOrdersCount, setTotalOrdersCount] = useState(0)
  const [leaderPage, setLeaderPage] = useState(1)
  useEffect(() => { setLeaderPage(1) }, [staffMetrics])

  useEffect(() => {
    fetchChannels()
    fetchStaffList()
    fetchPerformance()
    fetchRecentOrders()
  }, [viewMode, page])

  const fetchStaffList = async () => {
    try {
      const params = new URLSearchParams({
        channelGroup: channelGroup === "All" ? "" : channelGroup,
        channel: selectedChannel,
        companyCode,
        dataSource: viewMode,
      })
      const response = await fetch(`/api/staff-list?${params}`)
      if (response.ok) {
        setStaffList(await response.json())
      }
    } catch (err) {
      console.error("Error fetching staff list:", err)
    }
  }

  const fetchChannels = async () => {
    try {
      const params = new URLSearchParams({
        channelGroup: channelGroup === "All" ? "" : channelGroup,
      })
      const response = await fetch(`/api/channels?${params}`)
      if (response.ok) {
        const channels = await response.json()
        setChannels(channels)
      }
    } catch (err) {
      console.error("Error fetching channels:", err)
    }
  }

  const fetchPerformance = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        channelGroup: channelGroup === "All" ? "" : channelGroup,
        channel: selectedChannel,
        companyCode,
        staff: selectedStaff.length > 0 ? selectedStaff.join(",") : "",
        search: selectedStaff.length === 0 ? searchTerm : "",
        dataSource: viewMode,
      })
      const response = await fetch(`/api/staff-performance?${params}`)
      if (response.ok) {
        setStaffMetrics(await response.json())
      }
    } catch (err) {
      console.error("Error fetching staff performance:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentOrders = async () => {
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        channelGroup: channelGroup === "All" ? "" : channelGroup,
        channel: selectedChannel,
        companyCode,
        staff: selectedStaff.length > 0 ? selectedStaff.join(",") : "",
        search: selectedStaff.length === 0 ? searchTerm : "",
        dataSource: viewMode,
        page: page.toString(),
        pageSize: "10",
      })
      const response = await fetch(`/api/orders?${params}`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.orders)
        setTotalOrdersCount(data.total)
      }
    } catch (err) {
      console.error("Error fetching recent orders:", err)
    }
  }

  const handleExportTransactions = async () => {
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        channelGroup: channelGroup === "All" ? "" : channelGroup,
        channel: selectedChannel,
        companyCode,
        staff: selectedStaff.length > 0 ? selectedStaff.join(",") : "",
        search: selectedStaff.length === 0 ? searchTerm : "",
        dataSource: viewMode,
      })
      const response = await fetch(`/api/orders/export?${params}`)
      if (response.ok) {
        const data = await response.json()
        const headers = ["Order ID", "Company", "Date", "Staff", "Customer", "Channel", "Order Source", "Product", "SKU", "Qty", "Revenue"]
        const csvRows = [headers.join(",")]
        data.forEach((item: any) => {
          csvRows.push([
            `"${item.order_id}"`,
            `"${item.company_code}"`,
            `"${item.date?.split("T")[0]}"`,
            `"${item.staff}"`,
            `"${item.customer_name?.replace(/"/g, '""')}"`,
            `"${item.channel}"`,
            `"${item.order_source?.replace(/"/g, '""')}"`,
            `"${item.product_name?.replace(/"/g, '""')}"`,
            `"${item.sku}"`,
            item.fulfilled_quantity,
            item.revenue,
          ].join(","))
        })
        const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `Recent_Transactions_${startDate}_to_${endDate}.csv`
        link.click()
      }
    } catch (err) {
      console.error("Export failed:", err)
    }
  }

  const handleExportSummary = () => {
    try {
      const totalRevenue = staffMetrics.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0)
      const headers = ["Rank", "Staff Code", "Staff Name", "Orders", "Units", "Revenue (VND)", "Avg Order Value", "Contribution %"]
      const csvRows = [headers.join(",")]

      staffMetrics.forEach((staff, idx) => {
        const revValue = parseFloat(staff.total_revenue)
        const ordValue = parseInt(staff.total_orders)
        const contribution = totalRevenue > 0 ? ((revValue / totalRevenue) * 100).toFixed(2) : "0.00"
        const aov = ordValue > 0 ? (revValue / ordValue).toFixed(2) : "0.00"

        csvRows.push([
          idx + 1,
          `"${staff.staff_code}"`,
          `"${staff.staff_name}"`,
          ordValue,
          staff.total_units,
          revValue,
          aov,
          contribution,
        ].join(","))
      })

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Staff_Performance_Summary_${startDate}_to_${endDate}.csv`
      link.click()
    } catch (err) {
      console.error("Export summary failed:", err)
    }
  }

  const totalRevenue = staffMetrics.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0)
  const totalUnits = staffMetrics.reduce((sum, item) => sum + parseInt(item.total_units), 0)
  const totalOrders = staffMetrics.reduce((sum, item) => sum + parseInt(item.total_orders), 0)

  return (
    <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto pb-24 lg:pb-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="w-12 h-12 lg:w-16 lg:h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 rotate-3 transform group-hover:rotate-0 transition-transform">
            <Users className="w-6 h-6 lg:w-8 lg:h-8" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-4xl font-black text-slate-900 tracking-tight">Staff Performance</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm lg:text-lg text-slate-500 font-medium italic">Ranking and tracking our sales team's execution</p>
              <SourceBadge source="admin" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
            <button
              onClick={() => setViewMode("fulfilled")}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                viewMode === "fulfilled" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Fulfilled
            </button>
            <button
              onClick={() => setViewMode("created")}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                viewMode === "created" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Created
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0"
            />
            <span className="text-slate-300 font-bold">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0"
            />
          </div>
          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />
          <button
            onClick={() => {
              fetchChannels()
              fetchStaffList()
              fetchPerformance()
              fetchRecentOrders()
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Filters Summary */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Filters:</span>
        </div>

        <div className="flex gap-2">
          {["All", "B2B", "B2C"].map((group) => (
            <button
              key={group}
              onClick={() => { setChannelGroup(group as any); setSelectedChannel("") }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border",
                channelGroup === group
                  ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300"
              )}
            >
              {group}
            </button>
          ))}
        </div>

        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-4 py-1.5 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Channels</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={companyCode}
          onChange={(e) => setCompanyCode(e.target.value)}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-4 py-1.5 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="ALL">All Companies</option>
          <option value="VN">VN</option>
          <option value="US">US</option>
        </select>

        <div className="relative">
          <button
            onClick={() => {
              const el = document.getElementById("staff-dropdown")
              if (el) el.classList.toggle("hidden")
            }}
            className="flex items-center justify-between w-48 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-600 px-4 py-1.5 focus:ring-blue-500 focus:border-blue-500"
          >
            <span>
              {selectedStaff.length === 0 ? "All Staff" :
               selectedStaff.length === 1 ? staffList.find(s => s.code === selectedStaff[0])?.name || selectedStaff[0] :
               `${selectedStaff.length} Staff Selected`}
            </span>
            <Filter className="w-3 h-3 ml-2 text-slate-400" />
          </button>

          <div id="staff-dropdown" className="hidden absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-80 overflow-auto p-2">
            <div className="sticky top-0 bg-white pb-2 border-b border-slate-50 mb-2 space-y-2 z-10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={staffSearchTerm}
                  onChange={(e) => setStaffSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => setSelectedStaff([])}
                className="w-full text-left px-3 py-1.5 text-[10px] font-black text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Clear Selection
              </button>
            </div>
            <div className="space-y-1">
              {staffList
                .filter(s =>
                  (s.name || "").toLowerCase().includes((staffSearchTerm || "").toLowerCase()) ||
                  (s.code || "").toLowerCase().includes((staffSearchTerm || "").toLowerCase())
                )
                .map(s => (
                  <label key={s.code} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group">
                  <input
                    type="checkbox"
                    checked={selectedStaff.includes(s.code)}
                    onChange={() => {
                      if (selectedStaff.includes(s.code)) {
                        setSelectedStaff(selectedStaff.filter(code => code !== s.code))
                      } else {
                        setSelectedStaff([...selectedStaff, s.code])
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-700 group-hover:text-slate-900">{s.name}</span>
                    <span className="text-[9px] font-medium text-slate-400">{s.code}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order, Staff Name / Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
          <div className="relative">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-4">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Orders</p>
            <h3 className="text-3xl font-black text-slate-900">{totalOrders.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
          <div className="relative">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
              <Package className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Units Sold</p>
            <h3 className="text-3xl font-black text-slate-900">{totalUnits.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group md:col-span-2">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-50 rounded-full -mr-24 -mt-24 transition-transform group-hover:scale-110" />
          <div className="relative">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 mb-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Gross Revenue (VND)</p>
            <h3 className="text-3xl lg:text-4xl font-black text-slate-900">
              {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(totalRevenue)}
            </h3>
          </div>
        </div>
      </div>

      {/* Main Tables */}
      <div className="grid grid-cols-1 gap-8">
        {/* Performance Leaderboard */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-lg font-black text-slate-900">Staff Performance Summary</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Key metrics by team member</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                {loading ? "Refreshing..." : "Live Data"}
              </div>
              <button
                onClick={handleExportSummary}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                title="Export this table to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Units</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue (VND)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Avg Order Value</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Contr. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffMetrics.slice((leaderPage - 1) * PAGE_ROWS, leaderPage * PAGE_ROWS).map((staff, i) => {
                  const idx = (leaderPage - 1) * PAGE_ROWS + i
                  const revValue = parseFloat(staff.total_revenue)
                  const ordValue = parseInt(staff.total_orders)
                  const contribution = (revValue / totalRevenue) * 100
                  const aov = ordValue > 0 ? revValue / ordValue : 0

                  return (
                    <tr key={staff.staff_code} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs",
                          idx === 0 ? "bg-amber-100 text-amber-700 shadow-sm border border-amber-200" :
                          idx === 1 ? "bg-slate-100 text-slate-700 border border-slate-200" :
                          idx === 2 ? "bg-orange-50 text-orange-700 border border-orange-100" :
                          "text-slate-400"
                        )}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 group-hover:text-blue-600 transition-colors">{staff.staff_name}</span>
                          <span className="text-xs text-slate-500 font-bold">{staff.staff_code}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-600">{ordValue.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-600">{parseInt(staff.total_units).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-slate-900">
                          {new Intl.NumberFormat("vi-VN").format(revValue)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs font-bold text-slate-500">
                          {new Intl.NumberFormat("vi-VN").format(Math.round(aov))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${contribution}%` }}
                            />
                          </div>
                          <span className="text-xs font-black text-blue-600 w-10 text-right">{contribution.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={leaderPage} total={staffMetrics.length} onPage={setLeaderPage} label="nhân viên" />
        </div>

        {/* Transaction Detail Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Recent Transactions</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Detailed log of sales activity</p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleExportTransactions}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                title="Export detailed transactions to CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500">Page {page}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="p-1 hover:bg-white rounded-md disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={orders.length < 10}
                    className="p-1 hover:bg-white rounded-md disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Units</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order, idx) => (
                  <tr key={`${order.order_code}-${idx}`} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {new Date(order.fulfiled_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900">
                      {order.order_code}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600">
                      {order.company_code}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-600">
                      {order.staff_name}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {order.customer_name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{order.product_name}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{order.sku}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {order.order_source}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-600">
                      {order.fulfilled_quantity}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-black text-blue-600">
                        {new Intl.NumberFormat("vi-VN").format(order.fulfilled_revenue_amount_vnd)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
