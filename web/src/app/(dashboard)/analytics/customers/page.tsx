"use client"

import React, { useState, useEffect } from "react"
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import {
  TrendingUp, DollarSign, Users, ChevronDown, Package,
  Check, ShoppingBag, UserPlus, RefreshCw, Activity, Sparkles, Search, Filter, Calendar, Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SourceBadge } from "@/components/dashboard-kit"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { Pager, PAGE_ROWS } from "@/components/pager"
import { exportRawRows } from "@/lib/export-excel"

interface KPI {
  label: string
  value: number
  lastPeriod: number
  change: number
  isPositive: boolean
  isCurrency?: boolean
}

interface TrendData {
  name: string
  active_customers: number
  revenue: number
  margin: number
}

interface DistributionData {
  name: string
  value: number
}

interface CustomerRow {
  name: string
  revenue: number
  margin: number
  margin_percent: number
  orders: number
  units: number
  last_order: string
}

export default function CustomerPerformancePage() {
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)

  const [kpis, setKpis] = useState<KPI[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [performanceData, setPerformanceData] = useState<CustomerRow[]>([])
  const [custPage, setCustPage] = useState(1)
  useEffect(() => { setCustPage(1) }, [performanceData])
  const [tierDistribution, setTierDistribution] = useState<DistributionData[]>([])
  const [channelDistribution, setChannelDistribution] = useState<DistributionData[]>([])
  const [productData, setProductData] = useState<any[]>([])
  const [orderData, setOrderData] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [customers, setCustomers] = useState<string[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [searching, setSearching] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<"day" | "week" | "month">("day")
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })

  const fetchData = async () => {
    if (selectedCustomers.length === 0) return

    setLoading(true)
    setError(null)
    try {
      const reqBody = { startDate, endDate, dateColumn, period, customers: selectedCustomers }

      const [res, tiersRes] = await Promise.all([
        fetch(`/api/analytics/customer/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        }),
        fetch(`/api/config/partner-tiers`).catch(() => null),
      ])

      if (!res.ok) throw new Error("Failed to fetch data")

      const data = await res.json()

      setKpis(data.kpis || [])
      setTrendData(data.trend || [])
      setPerformanceData(data.performance || [])
      setTierDistribution(data.tierDist || [])
      setChannelDistribution(data.channelDistribution || [])
      setProductData(data.products || [])
      setOrderData(data.orders || [])

      if (tiersRes?.ok) setPartnerTiers(await tiersRes.json())
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCustomers.length === 0) {
      setKpis([])
      setTrendData([])
      setPerformanceData([])
      setTierDistribution([])
      setChannelDistribution([])
      setProductData([])
      setOrderData([])
      setLoading(false)
      return
    }
  }, [selectedCustomers])

  useEffect(() => {
    const fetchDebouncedCustomers = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(searchQuery)}`)
        if (res.ok) {
          const data = await res.json()
          setCustomers(data)
        }
      } catch (err) {
        console.error("Failed to fetch customers", err)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(fetchDebouncedCustomers)
  }, [searchQuery])

  const toggleCustomer = (name: string) => {
    setSelectedCustomers(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value).replace("₫", "VND")
  }

  const formatCompact = (value: number) => {
    if (value >= 1000000000) return (value / 1000000000).toFixed(1) + "B"
    if (value >= 1000000) return (value / 1000000).toFixed(1) + "M"
    if (value >= 1000) return (value / 1000).toFixed(1) + "K"
    return value.toString()
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8 font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Customer Performance</h1>
              {loading && <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-slate-500 font-medium italic text-sm">Deep dive into B2B customer behavior and acquisition.</p>
              <SourceBadge source="admin" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative border-r border-slate-100 pr-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-50 transition-all min-w-[180px]"
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
              >
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-bold truncate max-w-[140px] text-indigo-600">
                  {selectedCustomers.length === 0 ? "Select Customer(s) *" :
                   selectedCustomers.length === 1 ? selectedCustomers[0] :
                   `${selectedCustomers.length} Selected`}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform ml-auto", showCustomerDropdown && "rotate-180")} />
              </div>

              {showCustomerDropdown && (
                <div className="absolute z-[100] top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 min-w-[280px] space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Filter Customers</span>
                    <button
                      onClick={() => setSelectedCustomers([])}
                      className="text-[10px] font-black text-rose-500 uppercase hover:underline"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {!searchQuery.trim() && selectedCustomers.map((cust, i) => (
                      <div
                        key={`sel-${i}`}
                        onClick={() => toggleCustomer(cust)}
                        className="px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all bg-indigo-50 text-indigo-700"
                      >
                        <span className="text-xs font-bold truncate">{cust}</span>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    ))}

                    {customers
                      .filter(cust => !(!searchQuery.trim() && selectedCustomers.includes(cust)))
                      .map((cust, i) => (
                      <div
                        key={i}
                        onClick={() => toggleCustomer(cust)}
                        className={cn(
                          "px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all",
                          selectedCustomers.includes(cust) ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"
                        )}
                      >
                        <span className="text-xs font-bold truncate">{cust}</span>
                        {selectedCustomers.includes(cust) && <Check className="w-3.5 h-3.5" />}
                      </div>
                    ))}

                    {searching && (
                      <div className="py-4 text-center">
                        <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin mx-auto" />
                      </div>
                    )}

                    {!searching && customers.length === 0 && searchQuery.trim() && (
                      <div className="py-8 text-center">
                        <Users className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No customers found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 border-r border-slate-100 h-[40px]">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-sm font-bold focus:outline-none"
              />
              <span className="text-slate-400 font-black px-1">/</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm font-bold focus:outline-none"
              />
            </div>

            <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />

            <button
              onClick={fetchData}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 whitespace-nowrap"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {selectedCustomers.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-16 flex flex-col items-center justify-center text-center space-y-6 mt-8">
            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
              <Users className="w-10 h-10 text-indigo-400" />
            </div>
            <div className="space-y-3 max-w-md mx-auto">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight italic uppercase">Select Customer(s)</h2>
              <p className="text-slate-500 font-medium">Please choose one or more customers from the filter above to generate the analytics dashboard and deep dive into their performance.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {kpis.map((kpi, idx) => (
                <div
                  key={idx}
                  className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[100px] -mr-8 -mt-8 transition-all group-hover:bg-indigo-50/50" />

                  <div className="relative z-10">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center mb-4 shadow-sm",
                      kpi.label.includes("Active") ? "bg-blue-600 text-white" :
                      kpi.label.includes("New") ? "bg-emerald-600 text-white" :
                      kpi.label.includes("Revenue") ? "bg-amber-600 text-white" :
                      kpi.label.includes("ARPU") ? "bg-indigo-600 text-white" :
                      "bg-rose-600 text-white"
                    )}>
                      {kpi.label.includes("Active") ? <Users className="w-5 h-5" /> :
                       kpi.label.includes("New") ? <UserPlus className="w-5 h-5" /> :
                       kpi.label.includes("Revenue") ? <DollarSign className="w-5 h-5" /> :
                       kpi.label.includes("ARPU") ? <Activity className="w-5 h-5" /> :
                       <TrendingUp className="w-5 h-5" />}
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                    <h3 className="text-2xl font-black text-slate-900 tabular-nums">
                      {kpi.isCurrency ? formatCompact(kpi.value).replace("₫", "VND") : kpi.value}
                    </h3>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-8">
              {/* Trend Chart */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Customer Revenue Trend</h3>
                    <p className="text-sm text-slate-400 font-medium">Revenue generation over time</p>
                  </div>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button
                      onClick={() => setPeriod("day")}
                      className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", period === "day" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setPeriod("week")}
                      className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", period === "week" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
                    >
                      Weekly
                    </button>
                    <button
                      onClick={() => setPeriod("month")}
                      className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", period === "month" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
                    >
                      Monthly
                    </button>
                  </div>
                </div>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                        dy={12}
                      />
                      <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                        tickFormatter={(val: any) => formatCompact(val).replace("₫", "")}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: "24px", border: "none", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)", padding: "16px" }}
                        itemStyle={{ fontWeight: 800, fontSize: "12px" }}
                        formatter={(value: any, name: string) => [formatCompact(value).replace("₫", "VND"), name]}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }} />
                      <Bar yAxisId="left" dataKey="prev_revenue" name="Previous Period" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar yAxisId="left" dataKey="revenue" name="Current Period" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Second Level Insights: Products & Orders */}
            <div className="grid grid-cols-1 gap-8">
              {/* Top Products */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-amber-50 rounded-2xl">
                    <ShoppingBag className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 italic uppercase">Top Products Purchased</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">By revenue contribution</p>
                  </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[400px] custom-scrollbar pr-2">
                  {productData.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No product data available</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Qty</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {productData.map((prod, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4">
                              <p className="text-sm font-bold text-slate-700 leading-tight">{prod.product_name || prod.sku}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{prod.sku}</p>
                            </td>
                            <td className="py-4 text-right">
                              <span className="text-sm font-black text-slate-500 tabular-nums">{prod.quantity}</span>
                            </td>
                            <td className="py-4 text-right">
                              <span className="text-sm font-black text-slate-900 tabular-nums">{formatCompact(prod.revenue).replace("₫", "VND")}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* List of Orders */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-emerald-50 rounded-2xl">
                    <ShoppingBag className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 italic uppercase">Customer Orders</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">List of transactions</p>
                  </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[600px] custom-scrollbar pr-2">
                  {orderData.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No order data available</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Code</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Name</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Date</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Items</th>
                          <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {orderData.map((order, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4">
                              <p className="text-sm font-black text-slate-900 truncate max-w-[150px]">{order.order_code}</p>
                            </td>
                            <td className="py-4">
                              <p className="text-xs text-slate-600 font-medium truncate max-w-[200px]" title={order.product_name}>{order.product_name}</p>
                            </td>
                            <td className="py-4">
                              <p className="text-xs text-indigo-600 font-bold uppercase truncate max-w-[150px]">{order.customer_name}</p>
                            </td>
                            <td className="py-4 text-right whitespace-nowrap">
                              <span className="text-xs font-bold text-slate-500 tabular-nums">
                                {new Date(order.order_date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <span className="text-sm border border-slate-200 px-2 py-1 rounded bg-white font-bold text-slate-500 tabular-nums">{order.items}</span>
                            </td>
                            <td className="py-4 text-right">
                              <span className="text-sm font-black text-slate-900 tabular-nums">{formatCompact(order.revenue).replace("₫", "VND")}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Partner Tiers Sections */}
            {Object.entries(partnerTiers).map(([tierName, partners]) => {
              if (partners.length === 0) return null
              const tierPerfData = performanceData.filter(p => partners.includes(p.name))
              if (tierPerfData.length === 0) return null

              return (
                <div key={tierName} className="bg-white rounded-[2.5rem] border-2 border-indigo-100 shadow-xl shadow-indigo-100/20 overflow-hidden mt-8 first:mt-0">
                  <div className="px-10 py-8 border-b border-indigo-50 bg-gradient-to-r from-indigo-50/50 to-white flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">{tierName} Partners Performance</h2>
                        <p className="text-[10px] text-indigo-600 font-black uppercase tracking-[0.3em]">Priority Business Verticals</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-indigo-50/20">
                          <th className="px-10 py-5 text-[10px] font-black text-indigo-600 uppercase tracking-widest">Partner Name</th>
                          <th className="px-10 py-5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-right">Revenue</th>
                          <th className="px-10 py-5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-right">Margin %</th>
                          <th className="px-10 py-5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-right">Orders</th>
                          <th className="px-10 py-5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-right">Last Order</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-50">
                        {tierPerfData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                            <td className="px-10 py-6">
                              <span className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{row.name}</span>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <span className="text-lg font-black text-slate-800 tracking-tighter tabular-nums">{formatCurrency(row.revenue)}</span>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={cn(
                                  "text-sm font-black px-2 py-0.5 rounded-lg",
                                  row.margin_percent >= 15 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                )}>{row.margin_percent.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-10 py-6 text-right font-black text-slate-600 tabular-nums">
                              {row.orders}
                            </td>
                            <td className="px-10 py-6 text-right font-bold text-slate-400 text-xs uppercase tracking-widest tabular-nums">
                              {row.last_order && row.last_order !== "N/A" ? new Date(row.last_order).toLocaleDateString("vi-VN") : "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}

            {/* Full Performance Breakdown */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-black text-slate-900 italic uppercase">All Customers Breakdown</h3>
                  <p className="text-sm text-slate-400 font-medium italic">Comprehensive performance metrics per client.</p>
                </div>
                <button
                  onClick={() => {
                    // Xuất TẤT CẢ khách (bỏ strategic partners, không giới hạn phân trang)
                    const all = performanceData.filter(p => !Object.values(partnerTiers).flat().includes(p.name))
                    const rows = all.map(r => ({
                      "Customer": r.name,
                      "Revenue": r.revenue,
                      "GP": r.margin,
                      "Units": r.units,
                      "Orders": r.orders,
                      "AOV": r.orders > 0 ? Math.round(r.revenue / r.orders) : 0,
                    }))
                    exportRawRows(rows, `Customers_Breakdown_${startDate}_to_${endDate}`, "Customers")
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">GP</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Units</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Orders</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">AOV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {performanceData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="w-8 h-8 text-slate-200" />
                            <p className="text-sm font-bold text-slate-400">No customer data found for this period</p>
                          </div>
                        </td>
                      </tr>
                    ) : performanceData
                      .filter(p => !Object.values(partnerTiers).flat().includes(p.name))
                      .slice((custPage - 1) * PAGE_ROWS, custPage * PAGE_ROWS)
                      .map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-[10px]">
                              {row.name.charAt(0)}
                            </div>
                            <span className="text-sm font-bold text-slate-700 truncate max-w-[200px]">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(row.revenue)}</span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className={cn(
                            "text-sm font-bold tabular-nums",
                            row.margin >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>{formatCurrency(row.margin)}</span>
                        </td>
                        <td className="px-8 py-5 text-right text-sm font-bold text-slate-400 tabular-nums">
                          {row.units}
                        </td>
                        <td className="px-8 py-5 text-right text-sm font-bold text-slate-600 tabular-nums">
                          {row.orders}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">
                            {formatCompact(row.revenue / row.orders).replace("₫", "VND")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={custPage}
                total={performanceData.filter(p => !Object.values(partnerTiers).flat().includes(p.name)).length}
                onPage={setCustPage}
                label="khách"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
