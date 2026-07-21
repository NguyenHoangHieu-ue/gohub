"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  CartesianGrid, Tooltip, ResponsiveContainer,
  Area, Line, ComposedChart, XAxis, YAxis,
} from "recharts"
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Filter, Calendar, Download, RefreshCw,
  ArrowUpRight, ArrowDownRight, Package, Globe, Check, ChevronDown, ChevronUp, X, ArrowUpDown, Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { CostManagementModal } from "@/components/cost-management-modal"
import { exportRawRows } from "@/lib/export-excel"
import { useDbRole } from "@/lib/use-role-guard"

// Port "y hệt" gohub-intel ChannelPerformance (deep-dive 1 kênh). Data qua /api/analytics/query
// (SELECT-only) + /api/channels + endpoint cost sẵn có. Bỏ motion/react (thay tr thường + CSS).

function getDefaultDateRange() {
  const today = new Date()
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

// POST 1 câu SQL SELECT-only tới endpoint query chung → trả mảng rows.
async function runQuery(sql: string): Promise<any[]> {
  const res = await fetch("/api/analytics/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

interface MetricCardProps {
  title: string
  value: string | number
  change: number
  icon: React.ElementType
  loading?: boolean
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
)

const MetricCard = ({ title, value, change, icon: Icon, loading, comparisonActive }: MetricCardProps & { comparisonActive?: boolean }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
        <Icon className="w-6 h-6" />
      </div>
      {loading ? (
        <Skeleton className="h-5 w-12 rounded-full" />
      ) : comparisonActive && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
          change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(change)}%
        </div>
      )}
    </div>
    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
    {loading ? (
      <Skeleton className="h-8 w-32" />
    ) : (
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    )}
  </div>
)

export default function ChannelPerformancePage() {
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)

  const [channelGroup, setChannelGroup] = useState<"All" | "B2B" | "B2C">("All")
  const [b2bTier, setB2bTier] = useState<"All" | "Strategic" | "Non-Strategic">("All")

  const [channels, setChannels] = useState<{ channel_id: string, channel_name: string }[]>([])
  const [selectedChannel, setSelectedChannel] = useState<string>("")
  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<any>(null)
  const [trendData, setTrendData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [productSortConfig, setProductSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "revenue", direction: "desc" })
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [subChannels, setSubChannels] = useState<string[]>([])
  const [selectedSubChannels, setSelectedSubChannels] = useState<string[]>([])
  const [showSubChannelDropdown, setShowSubChannelDropdown] = useState(false)
  const [productTypes, setProductTypes] = useState<string[]>([])
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
  const [showProductTypeDropdown, setShowProductTypeDropdown] = useState(false)
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [showCostModal, setShowCostModal] = useState(false)
  const dbRole = useDbRole()   // ẩn "Manage Costs" — chỉ creator thấy (tạm thời)
  const [channelCostsMap, setChannelCostsMap] = useState<any>({})
  const [channelSettingsMap, setChannelSettingsMap] = useState<any>({})
  const [showTotalCostBreakdown, setShowTotalCostBreakdown] = useState(false)

  const getProjectionInfo = () => {
    if (!metrics || !startDate || !endDate) return null

    const start = new Date(startDate)
    const end = new Date(endDate)
    const now = new Date()

    const isCurrentMonth = end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear()
    if (!isCurrentMonth) return null

    if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
      return null
    }

    const daysElapsed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()

    if (daysElapsed >= lastDayOfMonth || daysElapsed <= 0) {
      return null
    }

    const factor = lastDayOfMonth / daysElapsed

    const projectedRevenue = (metrics.revenue || 0) * factor
    const projectedOrders = (metrics.orders || 0) * factor
    const projectedUnits = (metrics.units || 0) * factor
    const projectedAOV = projectedOrders > 0 ? projectedRevenue / projectedOrders : 0

    const prevRevenue = metrics.prevMonthRevenue || 0
    const prevOrders = metrics.prevMonthOrders || 0
    const prevUnits = metrics.prevMonthUnits || 0
    const prevAOV = prevOrders > 0 ? prevRevenue / prevOrders : 0

    const revenueChange = prevRevenue > 0 ? ((projectedRevenue - prevRevenue) / prevRevenue) * 100 : 0
    const ordersChange = prevOrders > 0 ? ((projectedOrders - prevOrders) / prevOrders) * 100 : 0
    const unitsChange = prevUnits > 0 ? ((projectedUnits - prevUnits) / prevUnits) * 100 : 0
    const aovChange = prevAOV > 0 ? ((projectedAOV - prevAOV) / prevAOV) * 100 : 0

    // CM1 projection: opCost = fixed this month, chỉ GP mới scale theo factor
    const fullMonthOpCost = (metrics.margin || 0) - (metrics.gpm2 || 0)
    const projectedCm1 = (metrics.margin || 0) * factor - fullMonthOpCost

    return {
      factor,
      daysElapsed,
      totalDays: lastDayOfMonth,
      revenue: projectedRevenue,
      orders: projectedOrders,
      units: projectedUnits,
      aov: projectedAOV,
      cm1: projectedCm1,
      revenueChange,
      ordersChange,
      unitsChange,
      aovChange,
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projection = useMemo(getProjectionInfo, [metrics, startDate, endDate])

  const handleProductSort = (key: string) => {
    setProductSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }))
  }

  const sortedTopProducts = [...topProducts].sort((a, b) => {
    let aVal, bVal

    if (productSortConfig.key === "projection") {
      aVal = a.revenue * (projection?.factor || 1)
      bVal = b.revenue * (projection?.factor || 1)
    } else if (productSortConfig.key === "aov") {
      aVal = a.revenue / (a.orders || 1)
      bVal = b.revenue / (b.orders || 1)
    } else {
      aVal = a[productSortConfig.key]
      bVal = b[productSortConfig.key]
    }

    if (aVal < bVal) return productSortConfig.direction === "asc" ? -1 : 1
    if (aVal > bVal) return productSortConfig.direction === "asc" ? 1 : -1
    return 0
  })

  const ProductSortIcon = ({ column }: { column: string }) => {
    if (productSortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
    return productSortConfig.direction === "asc"
      ? <ChevronUp className="w-3 h-3 ml-1 text-blue-600" />
      : <ChevronDown className="w-3 h-3 ml-1 text-blue-600" />
  }

  // Export Performance Breakdown — KHỚP ĐÚNG cột + số của bảng hiển thị (tính lại y hệt JSX).
  const exportPerformanceBreakdown = () => {
    if (!performanceData || performanceData.length === 0) return
    const totalRevenue = metrics?.revenue || 1
    const totalOpCost = metrics?.totalOpCost || 0
    const mode = channelSettingsMap[selectedChannel] || "total"
    const start = new Date(startDate || "2026-03-01")
    const end = new Date(endDate || "2026-03-31")
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86400000) + 1
    const ratio = Math.min(1, diffDays / daysInMonth)
    const pf = projection ? projection.factor : 0

    const rows = performanceData.map((row: any) => {
      let opCostRow = 0
      if (mode === "subchannels") {
        const c = channelCostsMap[`${selectedChannel} - ${row.sub_channel}`]
        if (c && Object.keys(c).length > 0) {
          ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
            if (c[key]) {
              opCostRow += c[key].type === "amount"
                ? (parseFloat(c[key].value) || 0) * ratio
                : (row.revenue * (parseFloat(c[key].value) || 0)) / 100
            }
          })
        }
      } else {
        opCostRow = (row.revenue / totalRevenue) * totalOpCost
      }
      const rowGpm2 = row.margin - opCostRow
      const rowGpm2Percent = row.revenue > 0 ? (rowGpm2 / row.revenue) * 100 : 0
      const contribution = (row.revenue / totalRevenue) * 100
      const growth = row.prev_revenue > 0 ? ((row.revenue - row.prev_revenue) / row.prev_revenue) * 100 : 0

      const out: Record<string, unknown> = {
        "Sub-channel": row.sub_channel,
        "Orders": row.orders,
        "Units Sold": row.units,
        "Revenue": Math.round(row.revenue),
        "Dự phóng Rev": projection ? Math.round(row.revenue * pf) : "",
        "Gross Profit 1": Math.round(row.margin || 0),
        "Dự phóng GP1": projection ? Math.round((row.margin || 0) * pf) : "",
        "Contribution Margin 1": Math.round(rowGpm2 || 0),
        "Dự phóng CM1": projection ? Math.round((row.margin || 0) * pf - ((row.margin || 0) - (rowGpm2 || 0))) : "",
        "CM1 %": Number(rowGpm2Percent.toFixed(1)),
      }
      if (comparisonType !== "none") {
        out[comparisonType === "previous_period" ? "%MoM" : "%YoY"] = Math.round(growth)
      }
      out["AOV"] = Math.round(row.revenue / (row.orders || 1))
      out["Contribution %"] = Number(contribution.toFixed(1))
      return out
    })
    exportRawRows(rows, `performance_breakdown_${selectedChannel}_${startDate}_${endDate}`, "Performance")
  }

  // Export Daily Details — khớp bảng (Date, Orders, Unit Sold, Revenue, [%MoM/%YoY], AOV), thứ tự mới→cũ như hiển thị.
  const exportDaily = () => {
    if (!trendData || trendData.length === 0) return
    const dateLabel = dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"
    const rows = trendData.slice().reverse().map((row: any) => {
      const out: Record<string, unknown> = {
        [dateLabel]: row.date,
        "Orders": row.orders,
        "Unit Sold": row.units,
        "Revenue": Math.round(row.revenue),
      }
      if (comparisonType !== "none") {
        out[comparisonType === "previous_period" ? "%MoM" : "%YoY"] =
          row.prevRevenue > 0 ? Math.round(((row.revenue - row.prevRevenue) / row.prevRevenue) * 100) : 100
      }
      out["AOV"] = Math.round(row.revenue / (row.orders || 1))
      return out
    })
    exportRawRows(rows, `daily_performance_${selectedChannel}_${startDate}_${endDate}`, "Daily")
  }

  // Export Top Products — khớp bảng (Product, Orders, Units, Revenue, Gross Profit, Dự phóng Rev, AOV). Full topProducts.
  const exportTopProductsFull = () => {
    if (!topProducts || topProducts.length === 0) return
    const pf = projection ? projection.factor : 0
    const rows = topProducts.map((p: any) => ({
      "Product Name": p.product_name,
      "Orders": p.orders,
      "Units": p.units,
      "Revenue": Math.round(p.revenue),
      "Gross Profit": Math.round(p.margin || 0),
      "Dự phóng Rev": projection ? Math.round(p.revenue * pf) : "",
      "AOV": Math.round(p.revenue / (p.orders || 1)),
    }))
    exportRawRows(rows, `top_products_${selectedChannel}_${startDate}_${endDate}`, "Top Products")
  }

  const [showFilters, setShowFilters] = useState(false)
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")

  const toggleVendor = (vendor: string) => {
    setSelectedVendors(prev =>
      prev.includes(vendor) ? prev.filter(v => v !== vendor) : [...prev, vendor]
    )
  }

  const toggleSubChannel = (subChannel: string) => {
    setSelectedSubChannels(prev =>
      prev.includes(subChannel) ? prev.filter(s => s !== subChannel) : [...prev, subChannel]
    )
  }

  const toggleProductType = (type: string) => {
    setSelectedProductTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  useEffect(() => {
    fetchVendors()
    fetchProductTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelGroup, b2bTier])

  useEffect(() => {
    if (selectedChannel) {
      fetchSubChannels()
      setSelectedSubChannels([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel])

  useEffect(() => {
    if (selectedChannel) {
      fetchChannelData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel, showAllProducts])

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

  const fetchChannels = async () => {
    try {
      const params = new URLSearchParams()
      if (channelGroup !== "All") params.append("channelGroup", channelGroup)
      if (b2bTier !== "All") params.append("tier", b2bTier)

      const res = await fetch(`/api/channels?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 100)}`)
      }

      const data = await res.json()
      if (Array.isArray(data)) {
        const formatted = data.map((name: string) => ({ channel_id: name, channel_name: name }))
        setChannels(formatted)
        if (formatted.length > 0) {
          if (!formatted.some(c => c.channel_id === selectedChannel)) {
            setSelectedChannel(formatted[0].channel_id)
          }
        } else {
          setSelectedChannel("")
        }
      } else {
        setChannels([])
        setSelectedChannel("")
      }
    } catch (err) {
      console.error("Error fetching channels:", err)
      setChannels([])
      setSelectedChannel("")
    }
  }

  const fetchSubChannels = async () => {
    if (!selectedChannel) return
    try {
      const escapedChannel = selectedChannel.replace(/'/g, "''")
      const sql = `
        SELECT DISTINCT TRIM(s.sapo_name) as sub_channel
        FROM dim_order_source s
        WHERE TRIM(s.channel_name) = '${escapedChannel}'
          AND s.sapo_name IS NOT NULL
          AND s.sapo_name != ''
        UNION
        SELECT DISTINCT TRIM(s.sapo_name) as sub_channel
        FROM fact_fulfillment_revenue f
        JOIN dim_order_source s ON f.order_source_code = s.code
        WHERE (
          TRIM(f.customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE TRIM(name) = '${escapedChannel}')
          OR TRIM(f.customer_code) = '${escapedChannel}'
        )
        AND s.sapo_name IS NOT NULL
        AND s.sapo_name != ''
      `
      const data = await runQuery(sql)
      setSubChannels(data.map((d: any) => d.sub_channel))
    } catch (err) {
      console.error("Error fetching sub-channels:", err)
    }
  }

  const fetchChannelData = async () => {
    if (!selectedChannel) return
    setLoading(true)
    try {
      let dateFilter = ""
      let prevDateFilter = ""
      let breakdownDataArr: any[] = []

      const start = new Date(startDate || "2026-03-01")
      const end = new Date(endDate || "2026-03-31")

      // Dùng local date method để format ISO (tránh toISOString UTC shift trong UTC+7)
      const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const startStr = fmtLocal(start)
        const endStr = fmtLocal(end)

        dateFilter = `AND ${dateColumn}::date >= '${startStr}' AND ${dateColumn}::date <= '${endStr}'`

        if (comparisonType === "previous_period") {
          const diffTime = Math.abs(end.getTime() - start.getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

          const prevEnd = new Date(start)
          prevEnd.setDate(prevEnd.getDate() - 1)
          const prevStart = new Date(prevEnd)
          prevStart.setDate(prevStart.getDate() - diffDays + 1)

          prevDateFilter = `AND ${dateColumn}::date >= '${fmtLocal(prevStart)}' AND ${dateColumn}::date <= '${fmtLocal(prevEnd)}'`
        } else if (comparisonType === "previous_year") {
          const prevStart = new Date(start)
          prevStart.setFullYear(prevStart.getFullYear() - 1)
          const prevEnd = new Date(end)
          prevEnd.setFullYear(prevEnd.getFullYear() - 1)

          prevDateFilter = `AND ${dateColumn}::date >= '${fmtLocal(prevStart)}' AND ${dateColumn}::date <= '${fmtLocal(prevEnd)}'`
        }
      } else {
        dateFilter = `AND ${dateColumn}::date >= '2026-03-01' AND ${dateColumn}::date <= '2026-03-31'`
      }

      const prevMonthStart = new Date(start.getFullYear(), start.getMonth() - 1, 1)
      const prevMonthEnd = new Date(start.getFullYear(), start.getMonth(), 0)
      const prevMonthFilter = `AND ${dateColumn}::date >= '${fmtLocal(prevMonthStart)}' AND ${dateColumn}::date <= '${fmtLocal(prevMonthEnd)}'`

      const escapedChannel = (selectedChannel || "").replace(/'/g, "''")
      let channelFilter = `(
        order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '${escapedChannel}')
        OR TRIM(customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE TRIM(name) = '${escapedChannel}')
        OR TRIM(customer_code) = '${escapedChannel}'
      )`

      if (selectedSubChannels.length > 0) {
        const subChannelList = selectedSubChannels.map(s => `'${s.replace(/'/g, "''")}'`).join(",")
        channelFilter = `(
          order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '${escapedChannel}' AND TRIM(sapo_name) IN (${subChannelList}))
          OR (
            (TRIM(customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE TRIM(name) = '${escapedChannel}') OR TRIM(customer_code) = '${escapedChannel}')
            AND order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(sapo_name) IN (${subChannelList}))
          )
        )`
      }

      let vendorFilter = ""
      if (selectedVendors.length > 0) {
        const vendorList = selectedVendors.map(v => `'${v.replace(/'/g, "''")}'`).join(",")
        vendorFilter = `AND TRIM(sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${vendorList}))`
      }

      let productTypeFilter = ""
      if (selectedProductTypes.length > 0) {
        const typeList = selectedProductTypes.map(t => `'${t.replace(/'/g, "''")}'`).join(",")
        productTypeFilter = `AND TRIM(sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE category_name IN (${typeList}))`
      }

      const isSales = dateColumn === "created_date"
      const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
      const revenueCol = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
      const quantityCol = isSales ? "quantity" : "fulfilled_quantity"
      const marginCol = isSales ? "0" : "gross_profit_vnd"

      // 1. Summary Metrics
      const summarySql = `
        WITH current_period AS (
          SELECT
            SUM(${revenueCol}) as revenue,
            SUM(${marginCol}) as margin,
            COUNT(DISTINCT order_code) as orders,
            SUM(${quantityCol}) as units
          FROM ${mainTable}
          WHERE ${channelFilter}
          ${dateFilter}
          ${vendorFilter}
          ${productTypeFilter}
        ),
        previous_period AS (
          SELECT
            SUM(${revenueCol}) as revenue,
            SUM(${marginCol}) as margin,
            COUNT(DISTINCT order_code) as orders,
            SUM(${quantityCol}) as units
          FROM ${mainTable}
          WHERE ${channelFilter}
          ${prevDateFilter || "AND 1=0"}
          ${vendorFilter}
          ${productTypeFilter}
        ),
        last_month_full AS (
          SELECT
            SUM(${revenueCol}) as revenue,
            SUM(${marginCol}) as margin,
            COUNT(DISTINCT order_code) as orders,
            SUM(${quantityCol}) as units
          FROM ${mainTable}
          WHERE ${channelFilter}
          ${prevMonthFilter}
          ${vendorFilter}
          ${productTypeFilter}
        )
        SELECT
          COALESCE(c.revenue, 0) as current_revenue,
          COALESCE(c.margin, 0) as current_margin,
          COALESCE(p.revenue, 0) as prev_revenue,
          COALESCE(p.margin, 0) as prev_margin,
          COALESCE(c.orders, 0) as current_orders,
          COALESCE(p.orders, 0) as prev_orders,
          COALESCE(c.units, 0) as current_units,
          COALESCE(p.units, 0) as prev_units,
          COALESCE(lm.revenue, 0) as lm_revenue,
          COALESCE(lm.orders, 0) as lm_orders,
          COALESCE(lm.units, 0) as lm_units
        FROM current_period c, previous_period p, last_month_full lm
      `

      const summaryData = await runQuery(summarySql)
      let summaryObj: any = null
      let currentRev = 0, currentMargin = 0, prevRev = 0, prevMargin = 0
      let currentOrders = 0, prevOrders = 0, currentUnits = 0, prevUnits = 0

      if (Array.isArray(summaryData) && summaryData.length > 0) {
        summaryObj = summaryData[0]
        currentRev = parseFloat(summaryObj.current_revenue || 0)
        currentMargin = parseFloat(summaryObj.current_margin || 0)
        prevRev = parseFloat(summaryObj.prev_revenue || 0)
        prevMargin = parseFloat(summaryObj.prev_margin || 0)
        currentOrders = parseInt(summaryObj.current_orders || 0)
        prevOrders = parseInt(summaryObj.prev_orders || 0)
        currentUnits = parseInt(summaryObj.current_units || 0)
        prevUnits = parseInt(summaryObj.prev_units || 0)
      }

      // 2. Trend (current)
      const trendSql = `
        SELECT
          TO_CHAR(${dateColumn}::date, 'YYYY-MM-DD') as date,
          SUM(${revenueCol}) as revenue,
          SUM(${marginCol}) as margin,
          COUNT(DISTINCT order_code) as orders,
          SUM(${quantityCol}) as units
        FROM ${mainTable}
        WHERE ${channelFilter}
        ${dateFilter}
        ${vendorFilter}
        ${productTypeFilter}
        GROUP BY ${dateColumn}::date
        ORDER BY ${dateColumn}::date
      `
      const currentTrend = await runQuery(trendSql)

      // 2b. Trend (previous) if comparison active
      let prevTrend: any[] = []
      if (comparisonType !== "none") {
        const prevTrendSql = `
          SELECT
            TO_CHAR(${dateColumn}::date, 'YYYY-MM-DD') as date,
            SUM(${revenueCol}) as revenue,
            SUM(${marginCol}) as margin
          FROM ${mainTable}
          WHERE ${channelFilter}
          ${prevDateFilter}
          ${vendorFilter}
          ${productTypeFilter}
          GROUP BY ${dateColumn}::date
          ORDER BY ${dateColumn}::date
        `
        prevTrend = await runQuery(prevTrendSql)
      }

      const combinedTrend = currentTrend.map((d: any, idx: number) => {
        let formattedDate = d.date
        if (d.date && typeof d.date === "string" && d.date.includes("-")) {
          const parts = d.date.split("-")
          formattedDate = `${parts[2]}/${parts[1]}`
        }
        return {
          date: formattedDate,
          revenue: parseFloat(d.revenue || 0),
          orders: parseInt(d.orders || 0),
          units: parseInt(d.units || 0),
          prevRevenue: prevTrend[idx] ? parseFloat(prevTrend[idx].revenue || 0) : 0,
        }
      })
      setTrendData(combinedTrend)

      // 3. Top Products
      const productsSql = `
        SELECT
          sku as product_name,
          SUM(${revenueCol}) as revenue,
          SUM(${marginCol}) as margin,
          COUNT(DISTINCT order_code) as orders,
          SUM(${quantityCol}) as units
        FROM ${mainTable}
        WHERE ${channelFilter}
        ${dateFilter}
        ${vendorFilter}
        ${productTypeFilter}
        GROUP BY 1
        ORDER BY 2 DESC
        ${showAllProducts ? "" : "LIMIT 10"}
      `
      const productsData = await runQuery(productsSql)
      setTopProducts(productsData.map((p: any) => ({
        ...p,
        revenue: parseFloat(p.revenue || 0),
        margin: parseFloat(p.margin || 0),
        orders: parseInt(p.orders || 0),
        units: parseInt(p.units || 0),
      })))

      // 4. Performance Breakdown (by sub-channel)
      const breakdownSql = `
        WITH current_period AS (
          SELECT
            COALESCE(TRIM(s.sapo_name), TRIM(s.name)) as sub_channel,
            SUM(f.${revenueCol}) as revenue,
            SUM(f.${marginCol}) as margin,
            COUNT(DISTINCT f.order_code) as orders,
            SUM(f.${quantityCol}) as units
          FROM ${mainTable} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE ${channelFilter}
          ${dateFilter}
          ${vendorFilter}
          ${productTypeFilter}
          GROUP BY 1
        ),
        previous_period AS (
          SELECT
            COALESCE(TRIM(s.sapo_name), TRIM(s.name)) as sub_channel,
            SUM(f.${revenueCol}) as revenue,
            SUM(f.${marginCol}) as margin,
            COUNT(DISTINCT f.order_code) as orders,
            SUM(f.${quantityCol}) as units
          FROM ${mainTable} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE ${channelFilter}
          ${prevDateFilter || "AND 1=0"}
          ${vendorFilter}
          ${productTypeFilter}
          GROUP BY 1
        )
        SELECT
          COALESCE(c.sub_channel, p.sub_channel) as sub_channel,
          COALESCE(c.revenue, 0) as revenue,
          COALESCE(c.margin, 0) as margin,
          COALESCE(c.orders, 0) as orders,
          COALESCE(c.units, 0) as units,
          COALESCE(p.revenue, 0) as prev_revenue,
          COALESCE(p.margin, 0) as prev_margin,
          COALESCE(p.orders, 0) as prev_orders,
          COALESCE(p.units, 0) as prev_units
        FROM current_period c
        FULL OUTER JOIN previous_period p ON c.sub_channel = p.sub_channel
        ORDER BY 2 DESC
      `
      breakdownDataArr = await runQuery(breakdownSql)
      setPerformanceData(breakdownDataArr.map((d: any) => ({
        ...d,
        revenue: parseFloat(d.revenue || 0),
        margin: parseFloat(d.margin || 0),
        orders: parseInt(d.orders || 0),
        units: parseInt(d.units || 0),
        prev_revenue: parseFloat(d.prev_revenue || 0),
        prev_margin: parseFloat(d.prev_margin || 0),
        prev_orders: parseInt(d.prev_orders || 0),
        prev_units: parseInt(d.prev_units || 0),
      })))

      if (summaryObj) {
        // Fetch costs to calculate GPM 2
        let totalOpCost = 0
        let prevTotalOpCost = 0
        const opCostBreakdown = { ads: 0, platformFee: 0, sponsorProducts: 0, media: 0 }
        try {
          const startMonth = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}`

          const [costRes, settingsRes] = await Promise.all([
            fetch(`/api/channel-costs?month=${startMonth}`),
            fetch(`/api/channel-cost-settings?month=${startMonth}`),
          ])

          if (costRes.ok && settingsRes.ok) {
            const costsMap = await costRes.json()
            const settingsMap = await settingsRes.json()
            setChannelCostsMap(costsMap)
            setChannelSettingsMap(settingsMap)
            const mode = settingsMap[selectedChannel] || "total"

            const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
            const diffTime = Math.abs(end.getTime() - start.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
            const ratio = Math.min(1, diffDays / daysInMonth)

            if (mode === "subchannels" && breakdownDataArr && breakdownDataArr.length > 0) {
              const subChannelCosts = Object.values(costsMap).filter((c: any) => c.channel.startsWith(`${selectedChannel} - `))
              subChannelCosts.forEach((c: any) => {
                const subName = c.channel.replace(`${selectedChannel} - `, "")
                const subMetrics = breakdownDataArr.find((r: any) => r.sub_channel === subName)
                const subRev = subMetrics ? parseFloat(subMetrics.revenue || 0) : 0

                ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
                  if (c[key]) {
                    let costVal = 0
                    if (c[key].type === "amount") {
                      costVal = (parseFloat(c[key].value) || 0) * ratio
                    } else {
                      costVal = (subRev * (parseFloat(c[key].value) || 0)) / 100
                    }
                    totalOpCost += costVal
                    ;(opCostBreakdown as any)[key] += costVal
                  }
                })
              })
            } else {
              const c = costsMap[selectedChannel]
              if (c && Object.keys(c).length > 0) {
                ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
                  if (c[key]) {
                    let costVal = 0
                    if (c[key].type === "amount") {
                      costVal = (parseFloat(c[key].value) || 0) * ratio
                    } else {
                      costVal = (currentRev * (parseFloat(c[key].value) || 0)) / 100
                    }
                    totalOpCost += costVal
                    ;(opCostBreakdown as any)[key] += costVal
                  }
                })
              }
            }
          }

          // Prev costs
          if (comparisonType !== "none") {
            const prevStart = new Date(start)
            if (comparisonType === "previous_period") {
              const diffTime = Math.abs(end.getTime() - start.getTime())
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
              prevStart.setDate(prevStart.getDate() - diffDays)
            } else {
              prevStart.setFullYear(prevStart.getFullYear() - 1)
            }
            const prevStartMonth = `${prevStart.getFullYear()}-${String(prevStart.getMonth()+1).padStart(2,"0")}`

            const [pCostRes, pSettingsRes] = await Promise.all([
              fetch(`/api/channel-costs?month=${prevStartMonth}`),
              fetch(`/api/channel-cost-settings?month=${prevStartMonth}`),
            ])

            if (pCostRes.ok && pSettingsRes.ok) {
              const pCostsMap = await pCostRes.json()
              const pSettingsMap = await pSettingsRes.json()
              const pMode = pSettingsMap[selectedChannel] || "total"

              const daysInMonth = new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0).getDate()
              const diffTime = Math.abs(end.getTime() - start.getTime())
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
              const ratio = Math.min(1, diffDays / daysInMonth)

              if (pMode === "subchannels" && breakdownDataArr && breakdownDataArr.length > 0) {
                const pSubChannelCosts = Object.values(pCostsMap).filter((c: any) => c.channel.startsWith(`${selectedChannel} - `))
                pSubChannelCosts.forEach((pc: any) => {
                  const subName = pc.channel.replace(`${selectedChannel} - `, "")
                  const pSubMetrics = breakdownDataArr.find((r: any) => r.sub_channel === subName)
                  const pSubRev = pSubMetrics ? parseFloat(pSubMetrics.prev_revenue || 0) : 0

                  ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
                    if (pc[key]) {
                      if (pc[key].type === "amount") {
                        prevTotalOpCost += (parseFloat(pc[key].value) || 0) * ratio
                      } else {
                        prevTotalOpCost += (pSubRev * (parseFloat(pc[key].value) || 0)) / 100
                      }
                    }
                  })
                })
              } else {
                const pc = pCostsMap[selectedChannel]
                if (pc && Object.keys(pc).length > 0) {
                  ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
                    if (pc[key]) {
                      if (pc[key].type === "amount") {
                        prevTotalOpCost += (parseFloat(pc[key].value) || 0) * ratio
                      } else {
                        prevTotalOpCost += (prevRev * (parseFloat(pc[key].value) || 0)) / 100
                      }
                    }
                  })
                }
              }
            }
          }
        } catch (e) {
          console.error(e)
        }

        const currentGpm2 = currentMargin - totalOpCost
        const prevGpm2 = prevMargin - prevTotalOpCost

        const revChange = prevRev > 0 ? Math.round(((currentRev - prevRev) / prevRev) * 100) : 0
        const marginChange = prevMargin !== 0 ? Math.round(((currentMargin - prevMargin) / Math.abs(prevMargin)) * 100) : 0
        const gpm2Change = prevGpm2 !== 0 ? Math.round(((currentGpm2 - prevGpm2) / Math.abs(prevGpm2)) * 100) : 0
        const orderChange = prevOrders > 0 ? Math.round(((currentOrders - prevOrders) / prevOrders) * 100) : 0
        const unitChange = prevUnits > 0 ? Math.round(((currentUnits - prevUnits) / prevUnits) * 100) : 0

        const currentAov = currentOrders > 0 ? currentRev / currentOrders : 0
        const prevAov = prevOrders > 0 ? prevRev / prevOrders : 0
        const aovChange = prevAov > 0 ? Math.round(((currentAov - prevAov) / prevAov) * 100) : 0

        setMetrics({
          revenue: currentRev,
          revenueChange: revChange,
          margin: currentMargin,
          marginChange: marginChange,
          gpm2: currentGpm2,
          gpm2Change: gpm2Change,
          totalOpCost: totalOpCost,
          opCostBreakdown: opCostBreakdown,
          orders: currentOrders,
          ordersChange: orderChange,
          units: currentUnits,
          unitsChange: unitChange,
          aov: currentAov,
          aovChange: aovChange,
          prevMonthRevenue: parseFloat(summaryObj.lm_revenue || 0),
          prevMonthOrders: parseInt(summaryObj.lm_orders || 0),
          prevMonthUnits: parseInt(summaryObj.lm_units || 0),
        })
      }
    } catch (err) {
      console.error("Error fetching channel data:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Channel Performance</h1>
          <p className="text-slate-500">Analyze performance metrics for specific sales channels</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {comparisonType !== "none" && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
              <TrendingUp className="w-3 h-3" />
              vs {comparisonType === "previous_period" ? "Prev Period" : "Prev Year"}
            </div>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={channelGroup}
              onChange={(e) => {
                setChannelGroup(e.target.value as any)
                if (e.target.value !== "B2B") setB2bTier("All")
              }}
              className="bg-transparent text-sm font-medium focus:outline-none min-w-[70px]"
            >
              <option value="All">All Groups</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>

          {channelGroup === "B2B" && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
              <select
                value={b2bTier}
                onChange={(e) => setB2bTier(e.target.value as any)}
                className="bg-transparent text-sm font-medium focus:outline-none min-w-[100px]"
              >
                <option value="All">All Partners</option>
                <option value="Strategic">Strategic Partners</option>
                <option value="Non-Strategic">Non-Strategic Partners</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Globe className="w-4 h-4 text-slate-400" />
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-transparent text-sm font-medium focus:outline-none min-w-[150px]"
            >
              <option value="" disabled>Select partner...</option>
              {channels.map(c => (
                <option key={c.channel_id} value={c.channel_id}>{c.channel_name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium whitespace-nowrap">
              {startDate && endDate ? `${startDate} - ${endDate}` : "Select Date Range"}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <select
              value={comparisonType}
              onChange={(e: any) => setComparisonType(e.target.value)}
              className="bg-transparent text-sm font-medium focus:outline-none min-w-[130px]"
            >
              <option value="none">No Comparison</option>
              <option value="previous_period">Compare: Prev Period</option>
              <option value="previous_year">Compare: Prev Year</option>
            </select>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-colors",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />
            <span className="text-sm font-medium">Filters</span>
          </button>

          {dbRole === "creator" && (
            <button
              onClick={() => setShowCostModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Manage Costs</span>
            </button>
          )}

          <button
            onClick={fetchChannelData}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("w-5 h-5 text-slate-600", loading && "animate-spin")} />
          </button>
        </div>
      </div>

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
                      onClick={(e) => { e.stopPropagation(); setSelectedVendors([]) }}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {vendors.map(vendor => (
                      <div
                        key={vendor}
                        onClick={(e) => { e.stopPropagation(); toggleVendor(vendor) }}
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
                      onClick={(e) => { e.stopPropagation(); setSelectedSubChannels([]) }}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {subChannels.map(sc => (
                      <div
                        key={sc}
                        onClick={(e) => { e.stopPropagation(); toggleSubChannel(sc) }}
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
                      onClick={(e) => { e.stopPropagation(); setSelectedProductTypes([]) }}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {productTypes.map(type => (
                      <div
                        key={type}
                        onClick={(e) => { e.stopPropagation(); toggleProductType(type) }}
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
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setStartDate("2026-03-01")
                  setEndDate("2026-03-31")
                  setComparisonType("none")
                  setSelectedVendors([])
                  setSelectedSubChannels([])
                  setSelectedProductTypes([])
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Reset All Filters
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400 italic mr-2">
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                {loading ? "Updating data..." : "Data updated"}
              </div>
              <button
                onClick={() => { fetchChannelData(); setShowFilters(false) }}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Projected Revenue", value: formatCompactNumber(projection.revenue), change: projection.revenueChange },
              { label: "Projected Orders", value: Math.round(projection.orders).toLocaleString(), change: projection.ordersChange },
              { label: "Projected AOV", value: formatCurrency(projection.aov), change: projection.aovChange },
              { label: "Projected Units", value: Math.round(projection.units).toLocaleString(), change: projection.unitsChange },
            ].map(({ label, value, change }) => (
              <div key={label} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-blue-600">{value}</p>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {change >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(change).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">vs Last Month Actual</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="flex items-center gap-2 mb-2">
        <div className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-100">
          Viewing by: {dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"}
        </div>
        {dateColumn === "created_date" && (
          <div className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider rounded border border-amber-100">
            Note: Orders created but not yet fulfilled are included
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <MetricCard title="Total Revenue" value={formatCurrency(metrics?.revenue || 0)} change={metrics?.revenueChange || 0} icon={DollarSign} loading={loading} comparisonActive={comparisonType !== "none"} />
        <MetricCard title="Gross Profit" value={formatCurrency(metrics?.margin || 0)} change={metrics?.marginChange || 0} icon={TrendingUp} loading={loading} comparisonActive={comparisonType !== "none"} />
        <MetricCard title="Contribution Margin 1" value={formatCurrency(metrics?.gpm2 || 0)} change={metrics?.gpm2Change || 0} icon={TrendingUp} loading={loading} comparisonActive={comparisonType !== "none"} />
        <MetricCard title="Total Orders" value={formatNumber(metrics?.orders || 0)} change={metrics?.ordersChange || 0} icon={ShoppingBag} loading={loading} comparisonActive={comparisonType !== "none"} />
        <MetricCard title="Units Sold" value={formatNumber(metrics?.units || 0)} change={metrics?.unitsChange || 0} icon={Package} loading={loading} comparisonActive={comparisonType !== "none"} />
        <MetricCard title="Average Order Value" value={formatCurrency(metrics?.aov || 0)} change={metrics?.aovChange || 0} icon={TrendingUp} loading={loading} comparisonActive={comparisonType !== "none"} />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">Revenue Trend</h3>
            <p className="text-sm text-slate-500">Daily revenue trend (by {dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"})</p>
            {!loading && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current</span>
                </div>
                {comparisonType !== "none" && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Previous</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="h-[300px] w-full">
            {loading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} tickFormatter={(val) => formatCompactNumber(val)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    formatter={(val: number, name: string) => [formatCurrency(val), name === "revenue" ? "Current" : "Previous"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="revenue" />
                  <Line type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2} dot={false} name="Gross Profit" />
                  {comparisonType !== "none" && (
                    <Area type="monotone" dataKey="prevRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="prevRevenue" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Performance Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Performance Breakdown</h3>
            <p className="text-sm text-slate-500">Breakdown by sub-channel for {selectedChannel} (by {dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"})</p>
          </div>
          <button onClick={exportPerformanceBreakdown} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sub-channel</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Units Sold</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                <th className="px-6 py-4 text-xs font-bold text-blue-600 uppercase tracking-wider text-right">Dự phóng Rev</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Gross Profit</th>
                <th className="px-6 py-4 text-xs font-bold text-blue-600 uppercase tracking-wider text-right">Dự phóng GP1</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Contribution Margin 1</th>
                <th className="px-6 py-4 text-xs font-bold text-blue-600 uppercase tracking-wider text-right">Dự phóng CM1</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">CM1 %</th>
                {comparisonType !== "none" && (
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    {comparisonType === "previous_period" ? "%MoM" : "%YoY"}
                  </th>
                )}
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">AOV</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(comparisonType !== "none" ? 13 : 12).fill(0).map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                performanceData.map((row, idx) => {
                  const totalRevenue = metrics?.revenue || 1
                  const totalOpCost = metrics?.totalOpCost || 0

                  let opCostRow = 0
                  const mode = channelSettingsMap[selectedChannel] || "total"
                  const start = new Date(startDate || "2026-03-01")
                  const end = new Date(endDate || "2026-03-31")
                  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
                  const diffTime = Math.abs(end.getTime() - start.getTime())
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
                  const ratio = Math.min(1, diffDays / daysInMonth)

                  if (mode === "subchannels") {
                    const c = channelCostsMap[`${selectedChannel} - ${row.sub_channel}`]
                    if (c && Object.keys(c).length > 0) {
                      ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
                        if (c[key]) {
                          if (c[key].type === "amount") {
                            opCostRow += (parseFloat(c[key].value) || 0) * ratio
                          } else {
                            opCostRow += (row.revenue * (parseFloat(c[key].value) || 0)) / 100
                          }
                        }
                      })
                    }
                  } else {
                    opCostRow = (row.revenue / totalRevenue) * totalOpCost
                  }

                  const rowGpm2 = row.margin - opCostRow
                  const rowGpm2Percent = row.revenue > 0 ? (rowGpm2 / row.revenue) * 100 : 0

                  const contribution = (row.revenue / totalRevenue) * 100
                  const growth = row.prev_revenue > 0 ? ((row.revenue - row.prev_revenue) / row.prev_revenue) * 100 : 0

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                            <Globe className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-bold text-slate-900">{row.sub_channel}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(row.orders)}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(row.units)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{formatCurrency(row.revenue)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">{projection ? formatCurrency(row.revenue * projection.factor) : "-"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn("text-sm font-bold", row.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(row.margin || 0)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">{projection ? formatCurrency((row.margin || 0) * projection.factor) : "-"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn("text-sm font-bold", rowGpm2 >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(rowGpm2 || 0)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">{projection ? formatCurrency((row.margin || 0) * projection.factor - ((row.margin || 0) - (rowGpm2 || 0))) : "-"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn("text-sm font-bold", rowGpm2Percent >= 0 ? "text-emerald-600" : "text-rose-600")}>{rowGpm2Percent.toFixed(1)}%</span>
                      </td>
                      {comparisonType !== "none" && (
                        <td className="px-6 py-4 text-right">
                          <div className={cn("inline-flex items-center gap-1 text-xs font-bold", growth >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(Math.round(growth))}%
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(row.revenue / (row.orders || 1))}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${contribution}%` }}></div>
                          </div>
                          <span className="text-xs font-bold text-slate-500 w-10">{contribution.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {performanceData.length > 0 && !loading && (
                <React.Fragment>
                  <tr
                    className="bg-slate-50 font-bold border-t-2 border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setShowTotalCostBreakdown(!showTotalCostBreakdown)}
                  >
                    <td className="px-6 py-4 text-slate-900 text-right">
                      <div className="flex items-center justify-end gap-1">
                        Total
                        <ChevronDown className={cn("w-4 h-4 transition-transform", showTotalCostBreakdown && "rotate-180")} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-900 text-right">{formatNumber(metrics?.orders || 0)}</td>
                    <td className="px-6 py-4 text-slate-900 text-right">{formatNumber(metrics?.units || 0)}</td>
                    <td className="px-6 py-4 text-slate-900 text-right">{formatCurrency(metrics?.revenue || 0)}</td>
                    <td className="px-6 py-4 text-blue-600 font-bold text-right">{projection ? formatCurrency((metrics?.revenue || 0) * projection.factor) : "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn("text-sm font-bold", (metrics?.margin || 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(metrics?.margin || 0)}</span>
                    </td>
                    <td className="px-6 py-4 text-blue-600 font-bold text-right">{projection ? formatCurrency((metrics?.margin || 0) * projection.factor) : "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn("text-sm font-bold", (metrics?.gpm2 || 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(metrics?.gpm2 || 0)}</span>
                    </td>
                    <td className="px-6 py-4 text-blue-600 font-bold text-right">{projection ? formatCurrency(projection.cm1) : "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn("text-sm font-bold", ((metrics?.gpm2 || 0) / (metrics?.revenue || 1) * 100) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {((metrics?.gpm2 || 0) / (metrics?.revenue || 1) * 100).toFixed(1)}%
                      </span>
                    </td>
                    {comparisonType !== "none" && (
                      <td className="px-6 py-4 text-right">
                        <div className={cn("inline-flex items-center gap-1 text-xs font-bold", (metrics?.revenueChange || 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                          {(metrics?.revenueChange || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(Math.round(metrics?.revenueChange || 0))}%
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 text-slate-600 text-right">{formatCurrency(metrics?.aov || 0)}</td>
                    <td className="px-6 py-4 text-slate-600 text-right">100.0%</td>
                  </tr>

                  {showTotalCostBreakdown && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={comparisonType !== "none" ? 13 : 12} className="px-6 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Ads:</span>
                            <span className="font-bold text-rose-600">-{formatCurrency((metrics?.opCostBreakdown as any)?.ads || 0)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Platform Fee:</span>
                            <span className="font-bold text-rose-600">-{formatCurrency((metrics?.opCostBreakdown as any)?.platformFee || 0)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Sponsor Products:</span>
                            <span className="font-bold text-rose-600">-{formatCurrency((metrics?.opCostBreakdown as any)?.sponsorProducts || 0)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-medium">Media:</span>
                            <span className="font-bold text-rose-600">-{formatCurrency((metrics?.opCostBreakdown as any)?.media || 0)}</span>
                          </div>
                          <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                            <span className="text-slate-900 font-bold">Total Op Cost:</span>
                            <span className="font-bold text-rose-600">-{formatCurrency(metrics?.totalOpCost || 0)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )}
              {performanceData.length === 0 && !loading && (
                <tr>
                  <td colSpan={comparisonType !== "none" ? 13 : 12} className="px-6 py-12 text-center text-slate-400 italic">
                    No sub-channel data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Daily Performance Details</h3>
            <p className="text-sm text-slate-500">Daily breakdown (by {dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"})</p>
          </div>
          <button onClick={exportDaily} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Unit Sold</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                {comparisonType !== "none" && (
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    {comparisonType === "previous_period" ? "%MoM" : "%YoY"}
                  </th>
                )}
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(comparisonType !== "none" ? 6 : 5).fill(0).map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                trendData.slice().reverse().map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{row.date}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(row.orders)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(row.units)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{formatCurrency(row.revenue)}</td>
                    {comparisonType !== "none" && (
                      <td className="px-6 py-4 text-right">
                        <div className={cn("inline-flex items-center gap-1 text-xs font-bold", (row.revenue - (row.prevRevenue || 0)) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                          {(row.revenue - (row.prevRevenue || 0)) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {row.prevRevenue > 0 ? Math.abs(Math.round(((row.revenue - row.prevRevenue) / row.prevRevenue) * 100)) : 100}%
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(row.revenue / (row.orders || 1))}</td>
                  </tr>
                ))
              )}
              {trendData.length === 0 && !loading && (
                <tr>
                  <td colSpan={comparisonType !== "none" ? 6 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                    No data available for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Products Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Top Selling Products</h3>
            <p className="text-sm text-slate-500">Highest revenue products (by {dateColumn === "fulfiled_date" ? "Fulfillment Date" : "Created Date"})</p>
          </div>
          <button onClick={exportTopProductsFull} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product Name</th>
                {([
                  { key: "orders", label: "Orders" },
                  { key: "units", label: "Units Sold" },
                  { key: "revenue", label: "Revenue" },
                  { key: "margin", label: "Gross Profit" },
                  { key: "projection", label: "Dự phóng" },
                  { key: "aov", label: "AOV" },
                ] as const).map(col => (
                  <th
                    key={col.key}
                    className={cn("px-6 py-4 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors", col.key === "projection" ? "text-blue-600" : "text-slate-500")}
                    onClick={() => handleProductSort(col.key)}
                  >
                    <div className="flex items-center justify-end">
                      {col.label}
                      <ProductSortIcon column={col.key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                sortedTopProducts.map((product, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                          <Package className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 truncate max-w-[300px]">{product.product_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(product.orders)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatNumber(product.units)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{formatCurrency(product.revenue)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn("text-sm font-bold", product.margin >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(product.margin || 0)}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">{projection ? formatCurrency(product.revenue * projection.factor) : "-"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(product.revenue / (product.orders || 1))}</td>
                  </tr>
                ))
              )}
              {topProducts.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                    No product data available for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && topProducts.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-center">
            <button onClick={() => setShowAllProducts(!showAllProducts)} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">
              {showAllProducts ? (<><ChevronUp className="w-4 h-4" />Show Less</>) : (<><ChevronDown className="w-4 h-4" />View All Products</>)}
            </button>
          </div>
        )}
      </div>

      {/* Cost Management Modal */}
      <CostManagementModal
        isOpen={showCostModal}
        onClose={() => setShowCostModal(false)}
        onSave={() => fetchChannelData()}
        initialMonth={startDate.slice(0, 7)}
      />
    </div>
  )
}
