"use client"

import React, { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ComposedChart, Cell, PieChart, Pie,
} from "recharts"
import {
  TrendingUp, DollarSign, PieChart as PieChartIcon,
  AlertCircle, ArrowUpRight, ArrowDownRight, Filter,
  Download, ChevronDown, Package, Users, Globe,
  ArrowUpDown, ShoppingBag, Settings, Check, Sigma,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DatePresets } from "@/components/date-presets"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"

// Port "y hệt" gohub-intel B2CPerformance. Data qua /api/analytics/b2c/{kpis,trend,performance,loss-skus}
// + /api/analytics/query (filter options) + /api/channel-costs|channel-group-costs (CHỈ đọc để hiển thị CM1).
// Nhập cost B2C nay ở tab "Manage Costs" (/analytics/targets). Bỏ motion/react (dùng div thường),
// bỏ animate-in dropdown (như các port khác). Inline getDefaultDateRange/formatDateToISO.

function getDefaultDateRange() {
  const today = new Date()
  // Dùng local date method (KHÔNG dùng toISOString - sẽ bị shift timezone UTC+7 → ngày lùi 1)
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
  if (today.getDate() <= 7) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end   = new Date(today.getFullYear(), today.getMonth(), 0)
    return { startDate: fmt(start), endDate: fmt(end) }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}
const formatDateToISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`

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
  revenue: number
  margin: number
  margin_percent: number
}

interface PerformanceData {
  name: string
  revenue: number
  revenueVn?: number   // groupBy=customer: doanh thu thị trường VN
  revenueUs?: number   // groupBy=customer: doanh thu thị trường US
  projected_revenue?: number
  margin: number
  projected_margin?: number
  margin_percent: number
  units: number
  gpm2?: number
  projected_gpm2?: number
  gpm2_percent?: number
  prev_revenue?: number
}

interface ChannelCost {
  channel: string
  month: string
  ads: { type: "amount" | "percent"; value: number }
  platformFee: { type: "amount" | "percent"; value: number }
  sponsorProducts: { type: "amount" | "percent"; value: number }
  media: { type: "amount" | "percent"; value: number }
}

interface LossSKU {
  sku: string
  revenue: number
  loss: number
}

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"]

export function B2CPerformance() {
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [period, setPeriod] = useState<"month" | "quarter">("month")
  const [groupBy, setGroupBy] = useState<"channel" | "sku" | "vendor" | "destination" | "staff" | "customer">("channel")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(false)
  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [subChannels, setSubChannels] = useState<string[]>([])
  const [selectedSubChannels, setSelectedSubChannels] = useState<string[]>([])
  const [showSubChannelDropdown, setShowSubChannelDropdown] = useState(false)
  const [productTypes, setProductTypes] = useState<string[]>([])
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
  const [showProductTypeDropdown, setShowProductTypeDropdown] = useState(false)
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [showAllPerformance, setShowAllPerformance] = useState(false)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [includeShip,        setIncludeShip]        = useState(false)
  const [includeInternalOps, setIncludeInternalOps] = useState(false)
  const [includeOpsCustomers, setIncludeOpsCustomers] = useState(false)

  const toggleVendor = (vendor: string) => {
    setSelectedVendors(prev =>
      prev.includes(vendor)
        ? prev.filter(v => v !== vendor)
        : [...prev, vendor]
    )
  }

  const toggleSubChannel = (subChannel: string) => {
    setSelectedSubChannels(prev =>
      prev.includes(subChannel)
        ? prev.filter(s => s !== subChannel)
        : [...prev, subChannel]
    )
  }

  const toggleProductType = (type: string) => {
    setSelectedProductTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const runQuery = async (sql: string) => {
    const res = await fetch("/api/analytics/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    })
    if (!res.ok) throw new Error(`Query failed: ${res.status}`)
    return res.json()
  }

  const fetchVendors = async () => {
    try {
      const data = await runQuery(`SELECT DISTINCT TRIM(vendor) as vendor FROM dim_sku WHERE vendor IS NOT NULL AND vendor != '' ORDER BY 1 ASC`)
      setVendors(data.map((d: any) => d.vendor))
    } catch (err) {
      console.error("Error fetching vendors:", err)
    }
  }

  const fetchProductTypes = async () => {
    try {
      const data = await runQuery(`SELECT DISTINCT category_name as product_type FROM dim_sku WHERE category_name IS NOT NULL AND category_name != '' ORDER BY 1 ASC`)
      setProductTypes(data.map((d: any) => d.product_type))
    } catch (err) {
      console.error("Error fetching product types:", err)
    }
  }

  const fetchSubChannels = async () => {
    try {
      const data = await runQuery(`SELECT DISTINCT TRIM(sapo_name) as sub_channel FROM dim_order_source WHERE UPPER(group_name) = 'B2C' AND sapo_name IS NOT NULL AND sapo_name != '' ORDER BY 1 ASC`)
      setSubChannels(data.map((d: any) => d.sub_channel))
    } catch (err) {
      console.error("Error fetching sub-channels:", err)
    }
  }

  useEffect(() => {
    fetchVendors()
    fetchProductTypes()
    fetchSubChannels()
  }, [])

  const [kpis, setKpis] = useState<KPI[]>([])
  const [prevMonthKpis, setPrevMonthKpis] = useState<KPI[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [lossSkus, setLossSkus] = useState<LossSKU[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: keyof PerformanceData; direction: "asc" | "desc" }>({
    key: "revenue",
    direction: "desc",
  })

  // Cost data — CHỈ đọc để tính/hiển thị CM1 trong bảng (nhập cost ở tab Manage Costs).
  const [monthlyCosts, setMonthlyCosts] = useState<Record<string, ChannelCost>>({})
  const [groupCosts, setGroupCosts] = useState<any[]>([])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const getProjectionInfo = () => {
    if (kpis.length < 7 || !startDate || !endDate) return null

    // Dùng shared lib — đồng bộ với BE route + B2B/Channels/BOD
    const factor = getProjectionFactor(startDate, endDate)
    if (factor <= 1) return null

    const start = new Date(startDate)
    const end   = new Date(endDate)
    const daysElapsed    = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()

    // kpis[0]: Revenue, kpis[1]: Units, kpis[2]: Gross Profit, kpis[5]: CM1 (từ BE, đã pro-rata đúng)
    const revenue = kpis[0]?.value || 0
    const units   = kpis[1]?.value || 0
    const margin  = kpis[2]?.value || 0
    const gpm2    = kpis[5]?.value || 0  // CM1 actual từ BE

    const projectedRevenue = revenue * factor
    const projectedMargin  = margin  * factor
    const projectedGpm2    = gpm2    * factor  // CM1 actual × factor (không dùng fixed op cost)
    const projectedUnits   = units   * factor

    // MoM Comparisons (vs Full Previous Month)
    const prevRevenue = prevMonthKpis.length > 0 ? (prevMonthKpis[0]?.value || 0) : 0
    const prevUnits = prevMonthKpis.length > 0 ? (prevMonthKpis[1]?.value || 0) : 0
    const prevMargin = prevMonthKpis.length > 0 ? (prevMonthKpis[2]?.value || 0) : 0
    const prevGpm2 = prevMonthKpis.length > 0 ? (prevMonthKpis[5]?.value || 0) : 0

    const revenueChange = prevRevenue > 0 ? ((projectedRevenue - prevRevenue) / prevRevenue) * 100 : 0
    const unitsChange = prevUnits > 0 ? ((projectedUnits - prevUnits) / prevUnits) * 100 : 0
    const marginChange = prevMargin > 0 ? ((projectedMargin - prevMargin) / prevMargin) * 100 : 0
    const gpm2Change = prevGpm2 > 0 ? ((projectedGpm2 - prevGpm2) / prevGpm2) * 100 : 0

    return {
      factor,
      daysElapsed,
      totalDays: lastDayOfMonth,
      revenue: projectedRevenue,
      units: projectedUnits,
      margin: projectedMargin,
      gpm2: projectedGpm2,
      gpm2Percent: projectedRevenue > 0 ? (projectedGpm2 / projectedRevenue) * 100 : 0,
      revenueChange,
      unitsChange,
      marginChange,
      gpm2Change,
    }
  }

  const projection = getProjectionInfo()

  const fetchCosts = async (startDate: string, endDate: string) => {
    try {
      // Tính đủ tháng trong range để groupCosts phản ánh đúng tổng kỳ (không chỉ tháng đầu)
      const months: string[] = []
      const cur = new Date(startDate.slice(0, 7) + "-01")
      const last = new Date(endDate.slice(0, 7) + "-01")
      while (cur <= last) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`)
        cur.setMonth(cur.getMonth() + 1)
      }
      if (months.length === 0) return

      const [chanRes, ...groupReses] = await Promise.all([
        fetch(`/api/channel-costs?month=${months[0]}`),
        ...months.map(m => fetch(`/api/channel-group-costs?month=${m}&group=B2C`)),
      ])
      if (chanRes.ok) setMonthlyCosts(await chanRes.json())
      // Sum group costs across all months in range
      const allGroupCosts: any[] = []
      for (const r of groupReses) {
        if (r.ok) allGroupCosts.push(...(await r.json()))
      }
      setGroupCosts(allGroupCosts)
    } catch (err) {
      console.error("Error fetching costs:", err)
    }
  }

  // fresh=false mặc định: DÙNG cache để tránh cạn kết nối gohub_dw (always-nocache = 5 query/lần load →
  // góp phần lỗi 500 "remaining connection slots" ở tab nặng như Quarter Report). Chi phí VẪN phản ánh:
  // Cost POST đã flush cache server + chi phí kênh (monthlyCosts) fetch trực tiếp Supabase (tươi).
  const fetchData = async (fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const queryParams = new URLSearchParams()
      if (startDate) queryParams.append("startDate", startDate)
      if (endDate) queryParams.append("endDate", endDate)
      queryParams.append("dateColumn", dateColumn)
      if (includeShip)         queryParams.append("includeShip", "1")
      if (includeInternalOps)  queryParams.append("includeInternalOps", "1")
      if (includeOpsCustomers) queryParams.append("includeOpsCustomers", "1")
      if (fresh) queryParams.append("nocache", "1")

      // Add advanced filters
      selectedVendors.forEach(v => queryParams.append("vendors", v))
      selectedSubChannels.forEach(s => queryParams.append("subChannels", s))
      selectedProductTypes.forEach(t => queryParams.append("productTypes", t))
      if (comparisonType !== "none") queryParams.append("comparisonType", comparisonType)

      const fetchJson = async (url: string) => {
        const res = await fetch(url)
        if (!res.ok) {
          const err = await res.text()
          throw new Error(`Failed to fetch data: ${err}`)
        }
        return res.json()
      }

      // Build prevMonth params trước (chỉ tính ngày, không await)
      const pmDate = new Date(startDate)
      const prevQueryParams = new URLSearchParams()
      prevQueryParams.append("startDate", formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth() - 1, 1)))
      prevQueryParams.append("endDate", formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth(), 0)))
      prevQueryParams.append("comparisonType", "none")
      prevQueryParams.append("dateColumn", dateColumn)
      selectedVendors.forEach(v => prevQueryParams.append("vendors", v))
      selectedSubChannels.forEach(s => prevQueryParams.append("subChannels", s))
      selectedProductTypes.forEach(t => prevQueryParams.append("productTypes", t))

      // 5 query độc lập → allSettled: 1 endpoint lỗi KHÔNG làm rỗng toàn bộ (trước dùng Promise.all →
      // chỉ cần trend/loss lỗi là cả bảng Performance + KPI biến mất). Mỗi phần set độc lập.
      const [kpiR, trendR, perfR, lossR, prevKpiR] = await Promise.allSettled([
        fetchJson(`/api/analytics/b2c/kpis?${queryParams.toString()}`),
        fetchJson(`/api/analytics/b2c/trend?${queryParams.toString()}&period=${period}`),
        fetchJson(`/api/analytics/b2c/performance?${queryParams.toString()}&groupBy=${groupBy}`),
        fetchJson(`/api/analytics/b2c/loss-skus?${queryParams.toString()}`),
        fetch(`/api/analytics/b2c/kpis?${prevQueryParams.toString()}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ])

      const pick = <T,>(r: PromiseSettledResult<T>, fallback: T): T => r.status === "fulfilled" && r.value != null ? r.value : fallback
      setKpis(pick(kpiR, []))
      setTrendData(pick(trendR, []))
      setPerformanceData(pick(perfR, []))
      setLossSkus(pick(lossR, []))
      setPrevMonthKpis(pick(prevKpiR, []))

      // báo lỗi CHỈ khi phần quan trọng (performance/kpis) fail — không chặn phần còn lại
      const failed = [kpiR, perfR].filter(r => r.status === "rejected").length
      if (failed > 0) setError("Một phần dữ liệu B2C tải chưa xong, thử lại sau giây lát")

      // Fetch costs for all months in range (groupCosts dùng để patch totals.gpm2)
      fetchCosts(startDate, endDate)
    } catch (err: any) {
      console.error("Error fetching B2C data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, groupBy, dateColumn, includeShip, includeInternalOps, includeOpsCustomers])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value)
  }

  const formatCompact = (value: number) => {
    if (value >= 1000000000) return (value / 1000000000).toFixed(1) + "B"
    if (value >= 1000000) return (value / 1000000).toFixed(1) + "M"
    if (value >= 1000) return (value / 1000).toFixed(1) + "K"
    return value.toString()
  }

  const ComparisonBadge = ({ current, previous, label }: { current: number, previous?: number, label: string }) => {
    if (previous === undefined || previous === 0) return null
    const diff = ((current - previous) / previous) * 100
    const isPositive = diff >= 0

    return (
      <div className="flex items-center gap-1.5">
        <div className={cn(
          "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(diff).toFixed(1)}%
        </div>
        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">{label}</span>
      </div>
    )
  }

  const sortedPerformanceData = React.useMemo(() => [...performanceData].sort((a, b) => {
    const aValue = a[sortConfig.key]
    const bValue = b[sortConfig.key]
    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortConfig.direction === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }
    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue
    }
    return 0
  }), [performanceData, sortConfig])

  const totals = React.useMemo(() => {
    const sum = performanceData.reduce((acc, curr) => {
      acc.revenue += curr.revenue
      acc.revenueVn += curr.revenueVn || 0
      acc.revenueUs += curr.revenueUs || 0
      acc.projected_revenue += curr.projected_revenue || curr.revenue
      acc.prev_revenue += curr.prev_revenue || 0
      acc.units += curr.units
      acc.margin += curr.margin
      acc.projected_margin += curr.projected_margin || curr.margin
      acc.gpm2 += curr.gpm2 || 0
      acc.projected_gpm2 += curr.projected_gpm2 || curr.gpm2 || 0
      return acc
    }, { revenue: 0, revenueVn: 0, revenueUs: 0, projected_revenue: 0, prev_revenue: 0, units: 0, margin: 0, projected_margin: 0, gpm2: 0, projected_gpm2: 0 })

    const totalGroupCosts = groupCosts.reduce((acc, gc) => acc + (gc.amount || 0), 0)
    // Since group costs might not have projection equivalent implemented locally, we just subtract them from both.
    if (groupBy === "channel") {
      sum.gpm2 -= totalGroupCosts
      sum.projected_gpm2 -= totalGroupCosts
    }
    return sum
  }, [performanceData, groupCosts, groupBy])
  const totalMarginPercent = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0
  const totalGpm2Percent = totals.revenue > 0 ? (totals.gpm2 / totals.revenue) * 100 : 0

  const totalCosts = React.useMemo(() => {
    if (groupBy !== "channel") return null
    const summedCosts: Record<string, { type: "amount", value: number }> = {
      ads: { type: "amount", value: 0 },
      platformFee: { type: "amount", value: 0 },
      sponsorProducts: { type: "amount", value: 0 },
      media: { type: "amount", value: 0 },
    }

    performanceData.forEach(item => {
      const costs = monthlyCosts[item.name]
      if (costs) {
        (["ads", "platformFee", "sponsorProducts", "media"] as const).forEach(cat => {
          const c = costs[cat]
          if (c) {
            const amount = c.type === "percent" ? (item.revenue * c.value / 100) : c.value
            summedCosts[cat].value += amount
          }
        })
      }
    })
    return summedCosts
  }, [performanceData, monthlyCosts, groupBy])

  // Dữ liệu Pie "Channel Contribution" — memo hoá để không tạo mảng mới + ép Recharts vẽ lại mỗi render/hover
  const channelContributionData = React.useMemo(
    () => performanceData.filter(d => d.revenue > 0).slice(0, 8),
    [performanceData]
  )

  const displayedPerformanceData = showAllPerformance
    ? sortedPerformanceData
    : sortedPerformanceData.slice(0, 10)

  const handleSort = (key: keyof PerformanceData) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }))
  }

  const handleExport = () => {
    if (performanceData.length === 0) return

    // Define headers
    const headers = [
      groupBy.toUpperCase(),
      "Revenue",
      "Units Sold",
      "Projected Revenue",
      "Gross Profit",
      "Margin %",
    ]

    if (groupBy === "channel") {
      headers.push("CM1", "CM1 %")
    }

    // Prepare rows
    const rows = performanceData.map(item => {
      const row = [
        `"${item.name}"`,
        item.revenue,
        item.units,
        projection ? (item.revenue * projection.factor).toFixed(0) : "N/A",
        item.margin,
        item.margin_percent.toFixed(2),
      ]

      if (groupBy === "channel") {
        row.push(
          item.gpm2 || 0,
          (item.gpm2_percent || 0).toFixed(2)
        )
      }
      return row.join(",")
    })

    // Combine headers and rows with BOM for Excel compatibility
    const csvContent = "﻿" + [headers.join(","), ...rows].join("\n")

    // Create Blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `b2c_performance_${groupBy}_${startDate}_to_${endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const SortIcon = ({ column }: { column: keyof PerformanceData }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
    return sortConfig.direction === "asc"
      ? <ArrowUpRight className="w-3 h-3 ml-1 text-blue-600" />
      : <ArrowDownRight className="w-3 h-3 ml-1 text-blue-600" />
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">B2C Performance</h1>
            <p className="text-slate-500 text-sm mt-0.5">B2C channel revenue, margin, và sub-channel metrics.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all font-bold text-sm",
                showFilters
                  ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Filter className="w-4 h-4" />
              Filters
              {(selectedVendors.length > 0 || selectedSubChannels.length > 0 || selectedProductTypes.length > 0 || comparisonType !== "none") && (
                <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] rounded-full ml-1">
                  {(selectedVendors.length > 0 ? 1 : 0) + (selectedSubChannels.length > 0 ? 1 : 0) + (selectedProductTypes.length > 0 ? 1 : 0) + (comparisonType !== "none" ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-sm shadow-lg shadow-blue-900/20"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comparison</label>
                <select
                  value={comparisonType}
                  onChange={(e: any) => setComparisonType(e.target.value)}
                  className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="none">No Comparison</option>
                  <option value="previous_period">Previous Period</option>
                  <option value="previous_year">Previous Year</option>
                </select>
              </div>

              {/* Include filters: Phí ship / Đơn nội bộ / KH Ops */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Include</label>
                <div className="flex flex-col gap-1.5">
                  {([["Phí ship", includeShip, setIncludeShip], ["Đơn nội bộ", includeInternalOps, setIncludeInternalOps], ["KH Ops", includeOpsCustomers, setIncludeOpsCustomers]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" />
                      <span className={cn("text-xs font-semibold", val ? "text-amber-600" : "text-slate-500")}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date Type</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setDateColumn("fulfiled_date")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                      dateColumn === "fulfiled_date" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Fulfillment
                  </button>
                  <button
                    onClick={() => setDateColumn("created_date")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                      dateColumn === "created_date" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Created
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendors</label>
                <div
                  className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all"
                  onClick={() => setShowVendorDropdown(!showVendorDropdown)}
                >
                  <span className="truncate max-w-[150px]">
                    {selectedVendors.length === 0 ? "All Vendors" :
                     selectedVendors.length === 1 ? selectedVendors[0] :
                     `${selectedVendors.length} Vendors`}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showVendorDropdown && "rotate-180")} />
                </div>

                {showVendorDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                    <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-400 uppercase">Select Vendors</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVendors([])
                        }}
                        className="text-[10px] text-blue-600 font-bold hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-1">
                      {vendors.map(vendor => (
                        <div
                          key={vendor}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleVendor(vendor)
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                            selectedVendors.includes(vendor) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          <span className="text-sm font-medium">{vendor}</span>
                          {selectedVendors.includes(vendor) && <Check className="w-4 h-4" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sub Channels</label>
                <div
                  className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all"
                  onClick={() => setShowSubChannelDropdown(!showSubChannelDropdown)}
                >
                  <span className="truncate max-w-[150px]">
                    {selectedSubChannels.length === 0 ? "All Sub Channels" :
                     selectedSubChannels.length === 1 ? selectedSubChannels[0] :
                     `${selectedSubChannels.length} Sub Channels`}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showSubChannelDropdown && "rotate-180")} />
                </div>

                {showSubChannelDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                    <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-400 uppercase">Select Sub Channels</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSubChannels([])
                        }}
                        className="text-[10px] text-blue-600 font-bold hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-1">
                      {subChannels.map(sc => (
                        <div
                          key={sc}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSubChannel(sc)
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                            selectedSubChannels.includes(sc) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          <span className="text-sm font-medium">{sc}</span>
                          {selectedSubChannels.includes(sc) && <Check className="w-4 h-4" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Type</label>
                <div
                  className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all"
                  onClick={() => setShowProductTypeDropdown(!showProductTypeDropdown)}
                >
                  <span className="truncate max-w-[150px]">
                    {selectedProductTypes.length === 0 ? "All Types" :
                     selectedProductTypes.length === 1 ? selectedProductTypes[0] :
                     `${selectedProductTypes.length} Types`}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showProductTypeDropdown && "rotate-180")} />
                </div>

                {showProductTypeDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2">
                    <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-400 uppercase">Select Types</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedProductTypes([])
                        }}
                        className="text-[10px] text-blue-600 font-bold hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-1">
                      {productTypes.map(type => (
                        <div
                          key={type}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleProductType(type)
                          }}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                            selectedProductTypes.includes(type) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                          <span className="text-sm font-medium">{type}</span>
                          {selectedProductTypes.includes(type) && <Check className="w-4 h-4" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    const def = getDefaultDateRange()
                    setStartDate(def.startDate)
                    setEndDate(def.endDate)
                    setComparisonType("none")
                    setSelectedVendors([])
                    setSelectedSubChannels([])
                    setSelectedProductTypes([])
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Reset Filters
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(false)}
                  className="px-6 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    fetchData()
                    setShowFilters(false)
                  }}
                  className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {loading ? (
             <div className="flex-1 flex items-center justify-center py-32 rounded-3xl bg-white border border-slate-200">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-slate-500 font-medium animate-pulse">Loading data...</p>
                </div>
             </div>
        ) : (
          <>
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-6">
          {kpis.map((kpi, idx) => (
            <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  "p-2.5 rounded-xl",
                  idx === 0 ? "bg-blue-50 text-blue-600" :
                  idx === 1 ? "bg-cyan-50 text-cyan-600" :
                  idx === 2 ? "bg-emerald-50 text-emerald-600" :
                  idx === 3 ? "bg-purple-50 text-purple-600" :
                  idx === 4 ? "bg-orange-50 text-orange-600" :
                  idx === 5 ? "bg-rose-50 text-rose-600" :
                  "bg-indigo-50 text-indigo-600"
                )}>
                  {idx === 0 ? <DollarSign className="w-5 h-5" /> :
                   idx === 1 ? <Package className="w-5 h-5" /> :
                   idx === 2 ? <TrendingUp className="w-5 h-5" /> :
                   idx === 3 ? <PieChartIcon className="w-5 h-5" /> :
                   idx === 4 ? <ShoppingBag className="w-5 h-5" /> :
                   idx === 5 ? <DollarSign className="w-5 h-5" /> :
                   <TrendingUp className="w-5 h-5" />}
                </div>
                {kpi.change !== 0 && (
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                    kpi.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {kpi.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(kpi.change).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">{kpi.label}</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {kpi.isCurrency ? formatCompact(kpi.value) : kpi.label.includes("Orders") ? kpi.value.toLocaleString() : kpi.value.toFixed(1) + "%"}
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                {kpi.lastPeriod !== 0 ? `vs last period: ${kpi.isCurrency ? formatCompact(kpi.lastPeriod) : kpi.lastPeriod.toFixed(1) + "%"}` : "No prev data"}
              </p>
            </div>
          ))}
        </div>

        {/* Pro-rata Projection */}
        {projection && !loading && (
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Month-End Projection (Pro-rata)
                </h3>
                <p className="text-sm text-blue-600">
                  Based on <strong>{projection.daysElapsed} days</strong> of performance, projected for <strong>{projection.totalDays} total days</strong>.
                </p>
              </div>
              <div className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-900/20">
                {((projection.factor - 1) * 100).toFixed(0)}% Growth Expected
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected Revenue</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{formatCompact(projection.revenue)}</p>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    projection.revenueChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {projection.revenueChange >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(projection.revenueChange).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected Units</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{Math.round(projection.units).toLocaleString()}</p>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    projection.unitsChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {projection.unitsChange >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(projection.unitsChange).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected Margin</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{formatCompact(projection.margin)}</p>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    projection.marginChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {projection.marginChange >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(projection.marginChange).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected CM1</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{formatCompact(projection.gpm2)}</p>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    projection.gpm2Change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {projection.gpm2Change >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(projection.gpm2Change).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Projected CM1 %</p>
                <p className="text-lg font-bold text-blue-600">{projection.gpm2Percent.toFixed(2)}%</p>
                <p className="text-[9px] text-slate-400 mt-1">Full Month Estimate</p>
              </div>
            </div>
          </div>
        )}

        {/* Trend Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Revenue & Gross Profit Trend</h3>
                <p className="text-sm text-slate-500">Monthly breakdown of performance</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setPeriod("month")}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", period === "month" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setPeriod("quarter")}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", period === "quarter" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  Quarterly
                </button>
              </div>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: "#64748b", fontSize: 12}} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: "#64748b", fontSize: 12}} tickFormatter={formatCompact} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="margin" name="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Channel Contribution</h3>
                <p className="text-sm text-slate-500">Revenue share by sub-channel</p>
              </div>
            </div>
            <div className="h-[300px] flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelContributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="revenue"
                    nameKey="name"
                  >
                    {performanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                  />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Performance Breakdown Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Performance Breakdown</h3>
              <p className="text-sm text-slate-500">Detailed analysis by {groupBy}</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar scrollbar-hide">
              <button
                onClick={() => setGroupBy("channel")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "channel" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Channel
              </button>
              <button
                onClick={() => setGroupBy("sku")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "sku" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                SKU
              </button>
              <button
                onClick={() => setGroupBy("vendor")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "vendor" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Vendor
              </button>
              <button
                onClick={() => setGroupBy("destination")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "destination" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Destination
              </button>
              <button
                onClick={() => setGroupBy("staff")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "staff" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Staff
              </button>
              <button
                onClick={() => setGroupBy("customer")}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap", groupBy === "customer" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                Customer
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th
                    className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center">
                      {groupBy.toUpperCase()}
                      <SortIcon column="name" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="flex items-center justify-end">
                      {groupBy === "customer" ? "Revenue (All)" : "Revenue"}
                      <SortIcon column="revenue" />
                    </div>
                  </th>
                  {groupBy === "customer" && (
                    <>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">VN</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">US</th>
                    </>
                  )}
                  <th
                    className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("units")}
                  >
                    <div className="flex items-center justify-end">
                      Units
                      <SortIcon column="units" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("margin")}
                  >
                    <div className="flex items-center justify-end">
                      Gross Profit
                      <SortIcon column="margin" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("margin_percent")}
                  >
                    <div className="flex items-center justify-end">
                      Margin %
                      <SortIcon column="margin_percent" />
                    </div>
                  </th>
                  {groupBy === "channel" && (
                    <th
                      className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort("gpm2" as any)}
                    >
                      <div className="flex items-center justify-end">
                        CM1
                        <SortIcon column={"gpm2" as any} />
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedPerformanceData.map((item, idx) => {
                  const isExpanded = expandedRow === item.name && groupBy === "channel"
                  const costs = monthlyCosts[item.name]

                  return (
                    <React.Fragment key={idx}>
                      <tr
                        className={cn(
                          "hover:bg-slate-50 transition-colors cursor-pointer",
                          isExpanded && "bg-blue-50/50"
                        )}
                        onClick={() => setExpandedRow(isExpanded ? null : item.name)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                              {groupBy === "sku" ? <Package className="w-4 h-4" /> :
                               groupBy === "vendor" ? <Users className="w-4 h-4" /> :
                               groupBy === "channel" ? <Globe className="w-4 h-4" /> :
                               groupBy === "staff" ? <Users className="w-4 h-4" /> :
                               groupBy === "customer" ? <Users className="w-4 h-4" /> :
                               <Globe className="w-4 h-4" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{item.name}</span>
                              {groupBy === "channel" && (
                                <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                                  {isExpanded ? "Hide details" : "View cost breakdown"}
                                  <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-medium text-slate-900">{formatCurrency(item.revenue)}</div>
                          {item.projected_revenue !== undefined && item.projected_revenue !== item.revenue && (
                            <div className="text-xs font-bold text-blue-600 mt-0.5" title="Projected full month">
                              DP: {formatCurrency(item.projected_revenue)}
                            </div>
                          )}
                          {item.prev_revenue !== undefined && item.prev_revenue > 0 && (
                            <div className="flex justify-end mt-1">
                              <ComparisonBadge
                                current={item.revenue}
                                previous={item.prev_revenue}
                                label={comparisonType === "previous_period" ? "vs L.Period" : "vs L.Year"}
                              />
                            </div>
                          )}
                        </td>
                        {groupBy === "customer" && (
                          <>
                            <td className="px-6 py-4 text-right text-sm font-medium text-slate-600">{formatCurrency(item.revenueVn || 0)}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-slate-600">{formatCurrency(item.revenueUs || 0)}</td>
                          </>
                        )}
                        <td className="px-6 py-4 text-right text-sm font-medium text-slate-600">{item.units.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <div className={cn(
                            "text-sm font-medium",
                            item.margin >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {formatCurrency(item.margin)}
                          </div>
                          {item.projected_margin !== undefined && item.projected_margin !== item.margin && (
                            <div className="text-xs font-bold text-blue-600 mt-0.5" title="Projected full month GP">
                              DP: {formatCurrency(item.projected_margin)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", item.margin_percent >= 20 ? "bg-emerald-500" : item.margin_percent >= 10 ? "bg-blue-500" : "bg-rose-500")}
                                style={{ width: `${Math.max(0, Math.min(100, item.margin_percent))}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-10">{item.margin_percent.toFixed(1)}%</span>
                          </div>
                        </td>
                        {groupBy === "channel" && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={cn(
                                "text-sm font-bold",
                                (item.gpm2 || 0) >= 0 ? "text-blue-600" : "text-rose-600"
                              )}>
                                {formatCurrency(item.gpm2 || 0)}
                              </span>
                              <span className="text-[10px] text-slate-400">{(item.gpm2_percent || 0).toFixed(1)}%</span>
                              {item.projected_gpm2 !== undefined && item.projected_gpm2 !== item.gpm2 && (
                                <div className="text-[11px] font-bold text-blue-600 mt-0.5" title="Projected full month CM1">
                                  DP: {formatCurrency(item.projected_gpm2)}
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={6} className="px-6 py-4 border-t border-slate-100">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {(["ads", "platformFee", "sponsorProducts", "media"] as const).map((category) => {
                                const costInfo = costs?.[category] || { type: "amount", value: 0 }
                                const amount = costInfo.type === "percent"
                                  ? (item.revenue * costInfo.value / 100)
                                  : costInfo.value

                                return (
                                  <div key={category} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      {category.replace(/([A-Z])/g, " $1")}
                                    </p>
                                    <div className="flex items-baseline justify-between">
                                      <p className="text-sm font-bold text-slate-700">{formatCompact(amount)}</p>
                                      {costInfo.type === "percent" && (
                                        <p className="text-[10px] text-slate-400">{costInfo.value}%</p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="col-span-full pt-2 flex items-center justify-between border-t border-slate-100 mt-2">
                                <span className="text-xs font-medium text-slate-500">Total Operational Cost:</span>
                                <span className="text-sm font-bold text-slate-900">
                                  {formatCurrency(
                                    (["ads", "platformFee", "sponsorProducts", "media"] as const).reduce((acc, cat) => {
                                      const c = costs?.[cat] || { type: "amount", value: 0 }
                                      return acc + (c.type === "percent" ? (item.revenue * c.value / 100) : c.value)
                                    }, 0)
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}

                {/* TOTAL ROW */}
                {performanceData.length > 0 && (
                  <React.Fragment>
                    <tr
                      className={cn(
                        "bg-blue-50/30 border-t-2 border-slate-200 cursor-pointer hover:bg-blue-50/50 transition-colors",
                        expandedRow === "TOTAL" && "bg-blue-50/50"
                      )}
                      onClick={() => setExpandedRow(expandedRow === "TOTAL" ? null : "TOTAL")}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            <Sigma className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 truncate">Tổng cộng</span>
                            {groupBy === "channel" && (
                              <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                                {expandedRow === "TOTAL" ? "Hide details" : "View cost breakdown"}
                                <ChevronDown className={cn("w-3 h-3 transition-transform", expandedRow === "TOTAL" && "rotate-180")} />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm font-bold text-slate-900">{formatCurrency(totals.revenue)}</div>
                        {totals.projected_revenue !== undefined && totals.projected_revenue !== totals.revenue && (
                          <div className="text-xs font-bold text-blue-600 mt-0.5" title="Projected full month">
                            DP: {formatCurrency(totals.projected_revenue)}
                          </div>
                        )}
                        {totals.prev_revenue > 0 && (
                          <div className="flex justify-end mt-1">
                            <ComparisonBadge
                              current={totals.revenue}
                              previous={totals.prev_revenue}
                              label={comparisonType === "previous_period" ? "vs L.Period" : "vs L.Year"}
                            />
                          </div>
                        )}
                      </td>
                      {groupBy === "customer" && (
                        <>
                          <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">{formatCurrency(totals.revenueVn)}</td>
                          <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">{formatCurrency(totals.revenueUs)}</td>
                        </>
                      )}
                      <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">{totals.units.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <div className={cn(
                          "text-sm font-bold",
                          totals.margin >= 0 ? "text-emerald-700" : "text-rose-700"
                        )}>
                          {formatCurrency(totals.margin)}
                        </div>
                        {totals.projected_margin !== undefined && totals.projected_margin !== totals.margin && (
                          <div className="text-xs font-bold text-blue-600 mt-0.5" title="Projected full month GP">
                            DP: {formatCurrency(totals.projected_margin)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs font-bold text-slate-800">{totalMarginPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                      {groupBy === "channel" && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={cn(
                              "text-sm font-bold",
                              totals.gpm2 >= 0 ? "text-blue-700" : "text-rose-700"
                            )}>
                              {formatCurrency(totals.gpm2)}
                            </span>
                            <span className="text-[10px] text-slate-500">{totalGpm2Percent.toFixed(1)}%</span>
                            {totals.projected_gpm2 !== undefined && totals.projected_gpm2 !== totals.gpm2 && (
                              <div className="text-[11px] font-bold text-blue-600 mt-0.5" title="Projected full month CM1">
                                DP: {formatCurrency(totals.projected_gpm2)}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {expandedRow === "TOTAL" && groupBy === "channel" && (totalCosts || groupCosts.length > 0) && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="px-6 py-4 border-t border-slate-100">
                          <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {(["ads", "platformFee", "sponsorProducts", "media"] as const).map((category) => {
                                const costInfo = totalCosts?.[category] || { type: "amount", value: 0 }
                                const amount = costInfo.value

                                return (
                                  <div key={category} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      {category.replace(/([A-Z])/g, " $1")}
                                    </p>
                                    <div className="flex items-baseline justify-between">
                                      <p className="text-sm font-bold text-slate-700">{formatCompact(amount)}</p>
                                      {totals.revenue > 0 && <p className="text-[10px] text-slate-400">{((amount / totals.revenue) * 100).toFixed(1)}%</p>}
                                    </div>
                                  </div>
                                )
                              })}
                              {groupCosts.map((gc, i) => (
                                <div key={`gc-${i}`} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 line-clamp-1" title={gc.item_name}>
                                    {gc.item_name}
                                  </p>
                                  <div className="flex items-baseline justify-between">
                                    <p className="text-sm font-bold text-slate-700">{formatCompact(gc.amount)}</p>
                                    {totals.revenue > 0 && <p className="text-[10px] text-slate-400">{((gc.amount / totals.revenue) * 100).toFixed(1)}%</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                              <span className="text-xs font-medium text-slate-500">Total Operational Cost:</span>
                              <span className="text-sm font-bold text-slate-900">
                                {formatCurrency(
                                  (["ads", "platformFee", "sponsorProducts", "media"] as const).reduce((acc, cat) => {
                                    const c = totalCosts?.[cat] || { type: "amount", value: 0 }
                                    return acc + c.value
                                  }, 0) + groupCosts.reduce((acc, gc) => acc + gc.amount, 0)
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )}

                {sortedPerformanceData.length === 0 && (
                  <tr>
                    <td colSpan={groupBy === "channel" ? 6 : groupBy === "customer" ? 7 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                      No performance data found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sortedPerformanceData.length > 10 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-center">
              <button
                onClick={() => setShowAllPerformance(!showAllPerformance)}
                className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                {showAllPerformance ? "Show Less" : `View All (${sortedPerformanceData.length})`}
                <ChevronDown className={cn("w-4 h-4 transition-transform", showAllPerformance && "rotate-180")} />
              </button>
            </div>
          )}
        </div>

        {/* Top Loss-making SKUs */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            Top Loss-making SKUs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lossSkus.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between group p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{item.sku}</p>
                  <p className="text-xs text-slate-400">Revenue: {formatCompact(item.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-rose-600">-{formatCompact(item.loss)}</p>
                  <div className="w-24 bg-rose-100 h-1 rounded-full mt-1 overflow-hidden">
                    <div
                      className="bg-rose-500 h-full"
                      style={{ width: `${Math.min(100, (item.loss / (kpis[1]?.value || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {lossSkus.length === 0 && (
              <div className="col-span-full text-center py-12">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <p className="text-sm text-slate-500">No loss-making SKUs found in this period.</p>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

    </div>
  )
}
