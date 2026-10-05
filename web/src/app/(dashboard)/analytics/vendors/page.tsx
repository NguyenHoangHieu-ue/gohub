"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, ArrowUpRight, ArrowDownRight,
  Filter, Calendar, RefreshCw, Truck, Package, Globe, LayoutDashboard,
  AlertCircle, Search, ArrowUpDown, ChevronUp, ChevronDown, Check, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber, formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { focusSql, type DistFocus, type DistRow, type DistView } from "@/lib/vendor-distribution"
import { StatTile, type MetricAccent, CHART_PALETTE } from "@/components/dashboard-kit"
import { VendorDistribution } from "./vendors-distribution"

// Port "y hệt" gohub-intel VendorPerformance. KPI/Trend/SKU qua /api/analytics/query (SELECT-only); bảng phân bổ theo
// Khách hàng/Kênh qua /api/analytics/vendors/distribution (s219). Inline getDefaultDateRange/formatDateToISO.

// Biểu đồ nạp động (ssr:false) → recharts code-split khỏi bundle đầu (s196+21, roadmap performance s196+20).
const chartLoading = () => <div className="w-full h-full animate-pulse bg-slate-100 rounded" />
const RevenueTrendChart = dynamic(() => import("./vendors-charts").then(m => m.RevenueTrendChart), { ssr: false, loading: chartLoading })

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
const formatDateToISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`

export default function VendorPerformancePage() {
  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [showFilters, setShowFilters] = useState(false)

  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "revenue", direction: "desc" })

  const [productPage, setProductPage] = useState(1)
  const [productItemsPerPage] = useState(15)

  const [metrics, setMetrics] = useState({
    revenue: 0, revenueChange: 0, orders: 0, ordersChange: 0, aov: 0, aovChange: 0,
    margin: 0, marginChange: 0, units: 0, unitsChange: 0,
  })

  const [prevMonthMetrics, setPrevMonthMetrics] = useState<any>(null)

  const [trendData, setTrendData] = useState<any[]>([])
  const [productPerformance, setProductPerformance] = useState<any[]>([])
  // Bảng phân bổ theo Khách hàng / Kênh (server tính) + khách/kênh đang chọn để lọc SKU
  const [distRows, setDistRows] = useState<DistRow[]>([])
  const [distView, setDistView] = useState<DistView>("customer")
  const [distLoading, setDistLoading] = useState(false)
  const [focus, setFocus] = useState<DistFocus | null>(null)
  const [productsLoading, setProductsLoading] = useState(false)
  const productsRef = useRef<HTMLDivElement>(null)
  const [channels, setChannels] = useState<string[]>([])
  const [selectedChannel, setSelectedChannel] = useState<string>("All Channels")
  const [selectedChannelGroup, setSelectedChannelGroup] = useState<string>("All Groups")
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")

  const filteredProducts = useMemo(() =>
    productPerformance
      .filter(p => (p.sku || "").toLowerCase().includes((searchTerm || "").toLowerCase()))
      .sort((a, b) => {
        const aVal = sortConfig.key === "marginPercent"
          ? (parseFloat(a.revenue) > 0 ? parseFloat(a.margin) / parseFloat(a.revenue) : 0)
          : parseFloat(a[sortConfig.key] || 0)
        const bVal = sortConfig.key === "marginPercent"
          ? (parseFloat(b.revenue) > 0 ? parseFloat(b.margin) / parseFloat(b.revenue) : 0)
          : parseFloat(b[sortConfig.key] || 0)
        if (sortConfig.key === "sku") {
          return sortConfig.direction === "asc" ? a.sku.localeCompare(b.sku) : b.sku.localeCompare(a.sku)
        }
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal
      }),
    [productPerformance, searchTerm, sortConfig]
  )

  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }))
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
    return sortConfig.direction === "asc"
      ? <ChevronUp className="w-3 h-3 ml-1 text-brand-600" />
      : <ChevronDown className="w-3 h-3 ml-1 text-brand-600" />
  }

  useEffect(() => { setProductPage(1) }, [searchTerm, sortConfig])

  const totalProductPages = Math.ceil(filteredProducts.length / productItemsPerPage)
  const paginatedProducts = filteredProducts.slice((productPage - 1) * productItemsPerPage, productPage * productItemsPerPage)

  const toggleVendor = (vendor: string) => {
    setSelectedVendors(prev => prev.includes(vendor) ? prev.filter(v => v !== vendor) : [...prev, vendor])
  }

  // Fetch Vendors from dim_sku
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const sql = `SELECT DISTINCT TRIM(vendor) as vendor FROM dim_sku WHERE vendor IS NOT NULL AND vendor != '' ORDER BY 1 ASC`
        const res = await fetch("/api/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })
        if (!res.ok) throw new Error(`Failed to fetch vendors: ${res.status}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          const list = data.map((d: any) => d.vendor)
          setVendors(list)
          if (list.length > 0 && selectedVendors.length === 0) {
            // DB lưu "3HK DATAPOOL" (CÓ dấu cách) — so khớp bỏ dấu cách/hoa-thường, đúng chuẩn
            // REPLACE(UPPER(vendor),' ','') dùng xuyên suốt repo (xem analytics-data-model.md gotcha #9).
            const defaultVendor = list.find(v => v.replace(/\s+/g, "").toUpperCase() === "3HKDATAPOOL") || list[0]
            setSelectedVendors([defaultVendor])
          }
        } else {
          console.error("Vendors data is not an array:", data)
          setError("Could not load vendor list.")
        }
      } catch (err) {
        console.error("Error fetching vendors:", err)
        setError("Failed to connect to database.")
      }
    }
    fetchVendors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch Channels from dim_order_source
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        let cond = `channel_name IS NOT NULL AND channel_name != ''`
        if (selectedChannelGroup !== "All Groups") {
          cond += ` AND UPPER(group_name) = '${selectedChannelGroup}'`
        }
        const sql = `SELECT DISTINCT channel_name FROM dim_order_source WHERE ${cond} ORDER BY 1 ASC`
        const res = await fetch("/api/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })
        if (res.ok) {
          const data = await res.json()
          const fetchedChannels = data.map((d: any) => d.channel_name)
          setChannels(["All Channels", ...fetchedChannels])
          if (selectedChannel !== "All Channels" && !fetchedChannels.includes(selectedChannel)) {
            setSelectedChannel("All Channels")
          }
        }
      } catch (err) {
        console.error("Error fetching channels:", err)
      }
    }
    fetchChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelGroup])

  const getProjectionInfo = () => {
    if (!metrics.revenue || !startDate || !endDate) return null

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) return null

    const daysElapsed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()

    if (daysElapsed >= lastDayOfMonth || daysElapsed <= 0) return null

    const factor = lastDayOfMonth / daysElapsed

    const revenue = metrics.revenue
    const orders = metrics.orders
    const margin = metrics.margin
    const units = metrics.units

    const revenueLast = prevMonthMetrics?.revenue || 0
    const ordersLast = prevMonthMetrics?.orders || 0
    const marginLast = prevMonthMetrics?.margin || 0
    const unitsLast = prevMonthMetrics?.units || 0

    const projectedRevenue = revenue * factor
    const projectedOrders = orders * factor
    const projectedMargin = margin * factor
    const projectedUnits = units * factor

    const revenueChange = revenueLast === 0 ? 0 : ((projectedRevenue - revenueLast) / revenueLast) * 100
    const ordersChange = ordersLast === 0 ? 0 : ((projectedOrders - ordersLast) / ordersLast) * 100
    const marginChange = marginLast === 0 ? 0 : ((projectedMargin - marginLast) / marginLast) * 100
    const unitsChange = unitsLast === 0 ? 0 : ((projectedUnits - unitsLast) / unitsLast) * 100

    return {
      factor, daysElapsed, totalDays: lastDayOfMonth,
      revenue: projectedRevenue, orders: projectedOrders, margin: projectedMargin, units: projectedUnits,
      revenueChange, ordersChange, marginChange, unitsChange,
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projection = useMemo(getProjectionInfo, [metrics, startDate, endDate, prevMonthMetrics])

  // Initial load: fetchData chỉ chạy 1 lần khi vendors được load lần đầu
  const initialLoadDone = React.useRef(false)
  useEffect(() => {
    if (selectedVendors.length > 0 && !initialLoadDone.current) {
      initialLoadDone.current = true
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendors])

  useEffect(() => {
    if (vendors.length === 0 || selectedVendors.length === 0) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateColumn])

  // Bộ lọc dùng chung cho mọi truy vấn của trang (fetchData + lọc SKU theo khách/kênh) — 1 nơi build để không lệch nhau.
  const getPrevRange = () => {
    const start = new Date(startDate), end = new Date(endDate)
    if (comparisonType === "previous_period") {
      const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const ps = new Date(start); ps.setDate(ps.getDate() - diffDays)
      const pe = new Date(end); pe.setDate(pe.getDate() - diffDays)
      return { ps: ps.toISOString().split("T")[0], pe: pe.toISOString().split("T")[0] }
    }
    if (comparisonType === "previous_year") {
      const ps = new Date(start); ps.setFullYear(ps.getFullYear() - 1)
      const pe = new Date(end); pe.setFullYear(pe.getFullYear() - 1)
      return { ps: ps.toISOString().split("T")[0], pe: pe.toISOString().split("T")[0] }
    }
    return null
  }

  const buildFilters = () => {
    const isSales = dateColumn === "created_date"
    const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
    const dateCol = isSales ? "created_date" : "fulfiled_date"
    const revCol = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
    const qtyCol = isSales ? "quantity" : "fulfilled_quantity"
    const marginCol = isSales ? "0" : "gross_profit_vnd"

    const dateFilter = `${dateCol}::date >= '${startDate}' AND ${dateCol}::date <= '${endDate}'`

    // Chuẩn "doanh thu SP thuần" toàn hệ thống (loại phí ship + đơn nội bộ) — trang này không có
    // toggle riêng, trước đây 0 chỗ nào áp filter này (audit s197 toàn hệ thống logic dữ liệu).
    const stdFilter = `AND sku != 'SHIPPINGFEE0' AND order_source_code NOT IN (SELECT code FROM dim_order_source WHERE UPPER(COALESCE(group_name,'')) = 'INTERNAL-TRANSACTION')`

    const prev = getPrevRange()
    const prevDateFilter = prev ? `${dateCol}::date >= '${prev.ps}' AND ${dateCol}::date <= '${prev.pe}'` : ""

    let channelFilter = selectedChannel !== "All Channels"
      ? `AND order_source_code IN (SELECT code FROM dim_order_source WHERE channel_name = '${selectedChannel.replace(/'/g, "''")}')`
      : ""
    if (selectedChannelGroup !== "All Groups") {
      channelFilter += ` AND order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${selectedChannelGroup}')`
    }

    const vendorList = selectedVendors.map(v => `'${v.replace(/'/g, "''")}'`).join(",")
    const vendorFilter = `TRIM(sku) IN (SELECT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${vendorList}))`
    return { mainTable, dateCol, revCol, qtyCol, marginCol, dateFilter, stdFilter, prevDateFilter, prev, channelFilter, vendorFilter }
  }

  const q = (sql: string) => fetch("/api/analytics/query", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
  })

  // SKU bán được của vendor — lọc theo khách hàng/kênh đang chọn ở bảng phân bổ (focus), rỗng = toàn bộ.
  const loadProducts = async (f: ReturnType<typeof buildFilters>, focusNow: DistFocus | null) => {
    const fc = focusSql(focusNow)
    const productsSql = `SELECT TRIM(sku) as sku, SUM(${f.revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${f.marginCol}) as margin FROM ${f.mainTable} f WHERE ${f.vendorFilter} AND ${f.dateFilter} ${f.channelFilter} ${f.stdFilter} ${fc} GROUP BY TRIM(sku) ORDER BY revenue DESC`
    const prevProductsSql = comparisonType !== "none"
      ? `SELECT TRIM(sku) as sku, SUM(${f.revCol}) as revenue FROM ${f.mainTable} f WHERE ${f.vendorFilter} AND ${f.prevDateFilter} ${f.channelFilter} ${f.stdFilter} ${fc} GROUP BY TRIM(sku)`
      : null
    const [productsRes, prevProductsRes] = await Promise.all([q(productsSql), prevProductsSql ? q(prevProductsSql) : Promise.resolve(null)])
    if (!productsRes.ok) throw new Error("Failed to fetch product performance")
    const currProds = await productsRes.json()
    if (prevProductsRes) {
      const prevProds = await prevProductsRes.json()
      const prevProdMap = prevProds.reduce((acc: any, p: any) => { acc[p.sku] = parseFloat(p.revenue || 0); return acc }, {})
      setProductPerformance(currProds.map((p: any) => ({ ...p, prevRevenue: prevProdMap[p.sku] || 0 })))
    } else {
      setProductPerformance(currProds)
    }
  }

  // Bảng phân bổ theo Khách hàng / Kênh — tính ở server (api/analytics/vendors/distribution).
  const loadDistribution = async (f: ReturnType<typeof buildFilters>, view: DistView) => {
    const params = new URLSearchParams({ startDate, endDate, dateColumn, view, channel: selectedChannel, channelGroup: selectedChannelGroup === "All Groups" ? "" : selectedChannelGroup })
    selectedVendors.forEach(v => params.append("vendors", v))
    if (f.prev) { params.set("prevStart", f.prev.ps); params.set("prevEnd", f.prev.pe) }
    const res = await fetch(`/api/analytics/vendors/distribution?${params}`)
    if (!res.ok) throw new Error("Failed to fetch distribution")
    const data = await res.json()
    setDistRows(Array.isArray(data) ? data : [])
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const f = buildFilters()
      const { mainTable, dateCol, revCol, qtyCol, marginCol, dateFilter, stdFilter, prevDateFilter, channelFilter, vendorFilter } = f

      // prev-month range for projection
      const pmDate = new Date(startDate)
      const pmStart = formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth() - 1, 1))
      const pmEnd   = formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth(), 0))

      const summarySql    = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${dateFilter} ${channelFilter} ${stdFilter}`
      const prevSummarySql = comparisonType !== "none"
        ? `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${prevDateFilter} ${channelFilter} ${stdFilter}`
        : null
      const pmSql = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${dateCol}::date >= '${pmStart}' AND ${dateCol}::date <= '${pmEnd}' ${channelFilter} ${stdFilter}`
      const trendSql = `SELECT TO_CHAR(${dateCol}::date, 'YYYY-MM-DD') as date, SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${vendorFilter} AND ${dateFilter} ${channelFilter} ${stdFilter} GROUP BY ${dateCol}::date ORDER BY ${dateCol}::date`
      const prevTrendSql = comparisonType !== "none"
        ? `SELECT TO_CHAR(${dateCol}::date, 'YYYY-MM-DD') as date, SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${vendorFilter} AND ${prevDateFilter} ${channelFilter} ${stdFilter} GROUP BY ${dateCol}::date ORDER BY ${dateCol}::date`
        : null
      const qOpt = (sql: string | null): Promise<Response | null> => sql ? q(sql) : Promise.resolve(null)

      // Tất cả truy vấn độc lập → bắn song song, thời gian = truy vấn chậm nhất.
      // (Trước: thêm 2 request chờ nối tiếp — quarterly-settings rồi strategic-performance — để dựng bảng kênh ở client.)
      const [summaryRes, prevSummaryRes, pmRes, trendRes, prevTrendRes] = await Promise.all([
        q(summarySql), qOpt(prevSummarySql), q(pmSql), q(trendSql), qOpt(prevTrendSql),
        loadProducts(f, focus),
        loadDistribution(f, distView),
      ])

      // Process: summary metrics
      if (!summaryRes.ok) throw new Error("Failed to fetch summary metrics")
      const currData = (await summaryRes.json())[0]
      const prevData = prevSummaryRes ? (await (prevSummaryRes as Response).json())[0] : null
      if (currData) {
        const currentRev = parseFloat(currData.revenue || 0)
        const prevRev    = parseFloat(prevData?.revenue || 0)
        const revChange  = (comparisonType !== "none" && prevRev > 0) ? Math.round(((currentRev - prevRev) / prevRev) * 100) : 0
        const currentOrders = parseInt(currData.orders || 0)
        const prevOrders    = parseInt(prevData?.orders || 0)
        const orderChange   = (comparisonType !== "none" && prevOrders > 0) ? Math.round(((currentOrders - prevOrders) / prevOrders) * 100) : 0
        const currentAov = currentOrders > 0 ? currentRev / currentOrders : 0
        const prevAov    = prevOrders > 0 ? prevRev / prevOrders : 0
        const aovChange  = (comparisonType !== "none" && prevAov > 0) ? Math.round(((currentAov - prevAov) / prevAov) * 100) : 0
        const currentMargin = parseFloat(currData.margin || 0)
        const prevMargin    = parseFloat(prevData?.margin || 0)
        const marginChange  = (comparisonType !== "none" && prevMargin > 0) ? Math.round(((currentMargin - prevMargin) / prevMargin) * 100) : 0
        const currentUnits = parseInt(currData.units || 0)
        const prevUnits    = parseInt(prevData?.units || 0)
        const unitChange   = (comparisonType !== "none" && prevUnits > 0) ? Math.round(((currentUnits - prevUnits) / prevUnits) * 100) : 0
        setMetrics({
          revenue: currentRev, revenueChange: revChange,
          orders: currentOrders, ordersChange: orderChange,
          aov: currentAov, aovChange: aovChange,
          margin: currentMargin, marginChange: marginChange,
          units: currentUnits, unitsChange: unitChange,
        })
      }

      // Process: prevMonth (soft fail)
      try {
        if (pmRes.ok) {
          const pmData = await pmRes.json()
          setPrevMonthMetrics({
            revenue: parseFloat(pmData[0]?.revenue || 0),
            orders:  parseInt(pmData[0]?.orders || 0),
            units:   parseInt(pmData[0]?.units || 0),
            margin:  parseFloat(pmData[0]?.margin || 0),
          })
        }
      } catch (e) { console.error("Error fetching prev month metrics:", e) }

      // Process: trend
      if (!trendRes.ok) throw new Error("Failed to fetch trend data")
      const currTrend = await trendRes.json()
      if (prevTrendRes) {
        const prevTrend = await (prevTrendRes as Response).json()
        const maxLen = Math.max(currTrend.length, prevTrend.length)
        const combined = []
        for (let i = 0; i < maxLen; i++) {
          combined.push({
            date: (currTrend[i]?.date || prevTrend[i]?.date).split("-").slice(1).reverse().join("/"),
            revenue: parseFloat(currTrend[i]?.revenue || 0),
            prevRevenue: parseFloat(prevTrend[i]?.revenue || 0),
          })
        }
        setTrendData(combined)
      } else {
        setTrendData(currTrend.map((d: any) => ({
          date: d.date.split("-").slice(1).reverse().join("/"),
          revenue: parseFloat(d.revenue || 0),
        })))
      }
    } catch (err) {
      console.error("Error fetching vendor performance:", err)
      setError("Không tải được dữ liệu — Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }

  // Bấm khách/kênh ở bảng phân bổ → chỉ tải lại bảng SKU (không chạy lại cả trang), rồi cuộn xuống bảng đó.
  const applyFocus = async (next: DistFocus | null) => {
    setFocus(next)
    setProductPage(1)
    setProductsLoading(true)
    try { await loadProducts(buildFilters(), next) }
    catch (err) { console.error("Error fetching products:", err); setError("Không tải được SKU — Hiếu đang fix, vui lòng đợi") }
    finally { setProductsLoading(false) }
    if (next) productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Đổi cách xem (Khách hàng ⇄ Kênh) → chỉ tải lại bảng phân bổ.
  const changeView = async (v: DistView) => {
    setDistView(v)
    setDistLoading(true)
    try { await loadDistribution(buildFilters(), v) }
    catch (err) { console.error("Error fetching distribution:", err); setError("Không tải được bảng phân bổ — Hiếu đang fix, vui lòng đợi") }
    finally { setDistLoading(false) }
  }

  const Skeleton = ({ className }: { className?: string }) => (
    <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
  )

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="font-bold">Error:</span> {error}
        </div>
      )}

      {vendors.length === 0 && !loading && !error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>No vendors found in database. Please check the <b>dim_sku</b> table.</span>
        </div>
      )}

      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-7 h-7 text-brand-600" />
            Vendor Performance
          </h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích hiệu quả kinh doanh theo nhà cung cấp (Database Data)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm shrink-0 items-center h-[42px]">
            <button onClick={() => setDateColumn("fulfiled_date")}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center",
                dateColumn === "fulfiled_date" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
              Fulfillment
            </button>
            <button onClick={() => setDateColumn("created_date")}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center",
                dateColumn === "created_date" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
              Created
            </button>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-[42px] cursor-pointer hover:bg-slate-50 min-w-[180px]"
              onClick={() => setShowVendorDropdown(!showVendorDropdown)}>
              <Truck className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium truncate max-w-[160px]">
                {selectedVendors.length === 0 ? "All Vendors" : selectedVendors.length === 1 ? selectedVendors[0] : `${selectedVendors.length} Vendors`}
              </span>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform ml-auto", showVendorDropdown && "rotate-180")} />
            </div>

            {showVendorDropdown && (
              <div className="absolute z-50 top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 overflow-y-auto p-2 min-w-[240px]">
                <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                  <span className="text-xs font-bold text-slate-400 uppercase">Select Vendors</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedVendors(vendors)} className="text-[10px] text-brand-600 font-bold hover:underline">All</button>
                    <button onClick={() => setSelectedVendors([])} className="text-[10px] text-rose-600 font-bold hover:underline">Clear</button>
                  </div>
                </div>
                {vendors.map(v => (
                  <div key={v} onClick={() => toggleVendor(v)}
                    className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedVendors.includes(v) ? "bg-brand-50 text-brand-600" : "hover:bg-slate-50 text-slate-700")}>
                    <span className="text-sm font-medium">{v}</span>
                    {selectedVendors.includes(v) && <Check className="w-4 h-4" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium whitespace-nowrap">
              {startDate && endDate ? `${startDate} - ${endDate}` : "Select Date Range"}
            </span>
          </div>

          {selectedChannel !== "All Channels" && (
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
              <Globe className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium whitespace-nowrap">{selectedChannel}</span>
            </div>
          )}

          {comparisonType !== "none" && (
            <div className="flex items-center gap-2 bg-brand-50 px-3 py-2 rounded-xl border border-brand-100 shadow-sm">
              <ArrowUpRight className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-medium text-brand-700 whitespace-nowrap">
                vs {comparisonType === "previous_period" ? "Prev Period" : "Prev Year"}
              </span>
            </div>
          )}

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-colors",
              showFilters ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />
            <span className="text-sm font-medium">Filters</span>
          </button>

          <button onClick={fetchData} aria-label="Làm mới dữ liệu" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-all shadow-sm">
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Projection Card */}
      {projection && (
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-6 rounded-2xl shadow-lg shadow-brand-800/25 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Month-End Projection (Pro-rata)
              </h3>
              <p className="text-brand-100 text-xs mt-1">
                Based on performance from {startDate} to {endDate} ({projection.daysElapsed}/{projection.totalDays} days)
              </p>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10">
              <p className="text-[10px] font-bold text-brand-100 uppercase tracking-wider">Projection Factor</p>
              <p className="text-xl font-bold">x{projection.factor.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Projected Revenue", value: formatCompactNumber(projection.revenue), change: projection.revenueChange },
              { label: "Projected Orders", value: formatNumber(Math.round(projection.orders)), change: projection.ordersChange },
              { label: "Projected GP", value: formatCompactNumber(projection.margin), change: projection.marginChange },
              { label: "Projected Units", value: formatNumber(Math.round(projection.units)), change: projection.unitsChange },
            ].map(({ label, value, change }) => (
              <div key={label} className="bg-white/10 p-4 rounded-xl border border-white/10 backdrop-blur-md">
                <p className="text-[10px] font-bold text-brand-100 uppercase tracking-wider mb-1">{label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold">{value}</p>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    change >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300")}>
                    {change >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(change).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-brand-200 mt-1">vs Last Month Actual</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel Group</label>
            <select value={selectedChannelGroup} onChange={(e) => setSelectedChannelGroup(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
              <option value="All Groups">All Groups</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel</label>
            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
              {channels.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
          </div>
          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} className="self-end" />
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comparison</label>
            <select value={comparisonType} onChange={(e) => setComparisonType(e.target.value as any)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
              <option value="none">No Comparison</option>
              <option value="previous_period">Previous Period</option>
              <option value="previous_year">Previous Year</option>
            </select>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => { const d = getDefaultDateRange(); setStartDate(d.startDate); setEndDate(d.endDate); setSelectedChannel("All Channels"); setSelectedChannelGroup("All Groups"); setComparisonType("none") }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors shrink-0">
                Reset
              </button>
              <button onClick={() => { fetchData(); setShowFilters(false) }}
                className="px-6 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 whitespace-nowrap shrink-0">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {([
          { label: "Revenue (VND)", value: metrics.revenue, change: metrics.revenueChange, icon: DollarSign,      accent: "revenue" },
          { label: "Orders",        value: metrics.orders,  change: metrics.ordersChange,  icon: ShoppingCart,    accent: "neutral" },
          { label: "Units Sold",    value: metrics.units,   change: metrics.unitsChange,   icon: Package,         accent: "neutral" },
          { label: "AOV (VND)",     value: metrics.aov,      change: metrics.aovChange,     icon: TrendingUp,      accent: "positive" },
          { label: "Gross Margin",  value: metrics.margin,  change: metrics.marginChange,  icon: LayoutDashboard, accent: "margin"  },
        ] as { label: string; value: number; change: number; icon: React.ElementType; accent: MetricAccent }[]).map((item, idx) => (
          loading ? (
            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /></div>
            </div>
          ) : (
            <StatTile
              key={idx}
              icon={<item.icon className="w-5 h-5" />}
              label={item.label}
              value={item.label.includes("VND") ? formatCompactNumber(item.value) : formatNumber(item.value)}
              accent={item.accent}
              deltas={comparisonType !== "none" ? [{ label: "So sánh", value: `${item.change >= 0 ? "+" : ""}${item.change}%`, kind: item.change >= 0 ? "up" : "down" }] : undefined}
            />
          )
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {/* Revenue Trend */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Revenue Trend</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                <div className="w-2 h-2 rounded-full" style={{ background: CHART_PALETTE[0] }}></div>
                Current Period
              </div>
              {comparisonType !== "none" && (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                  <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                  Previous Period
                </div>
              )}
            </div>
          </div>
          <div className="h-[350px] w-full">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <RevenueTrendChart data={trendData} comparisonType={comparisonType} />
            )}
          </div>
        </div>

        {/* Phân bổ theo Khách hàng / Kênh — bấm 1 dòng để lọc SKU bên dưới */}
        <VendorDistribution
          rows={distRows} loading={loading || distLoading} view={distView} onViewChange={changeView}
          focus={focus} onFocus={applyFocus} projectionFactor={projection ? projection.factor : null}
          comparison={comparisonType !== "none"} startDate={startDate} endDate={endDate}
        />
      </div>

      {/* Product Performance Table */}
      <div ref={productsRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900">Product Performance</h2>
            {focus && (
              <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs font-bold text-brand-700">
                {focus.kind === "customer" ? "Khách hàng" : "Kênh"}: {focus.label}
                <button onClick={() => applyFocus(null)} aria-label="Bỏ lọc" className="p-0.5 rounded-full hover:bg-brand-100"><X className="w-3 h-3" /></button>
              </span>
            )}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full md:w-64" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort("sku")}>
                  <div className="flex items-center">Product SKU <SortIcon column="sku" /></div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort("revenue")}>
                  <div className="flex items-center justify-end">Revenue (VND) <SortIcon column="revenue" /></div>
                </th>
                {comparisonType !== "none" && (
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Change</th>
                )}
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort("orders")}>
                  <div className="flex items-center justify-end">Orders <SortIcon column="orders" /></div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort("margin")}>
                  <div className="flex items-center justify-end">Gross Margin <SortIcon column="margin" /></div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort("marginPercent")}>
                  <div className="flex items-center justify-end">Margin % <SortIcon column="marginPercent" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading || productsLoading ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(5).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>)}
                </tr>
              )) : (
                paginatedProducts.map((product, idx) => {
                  const rev = parseFloat(product.revenue)
                  const margin = parseFloat(product.margin)
                  const marginPercent = rev > 0 ? (margin / rev) * 100 : 0

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-700">{product.sku}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">{formatNumber(rev)}</td>
                      {comparisonType !== "none" && (
                        <td className="px-6 py-4 text-right">
                          <div className={cn("inline-flex items-center gap-1 text-xs font-bold",
                            (rev - (product.prevRevenue || 0)) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {(rev - (product.prevRevenue || 0)) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {product.prevRevenue > 0 ? Math.abs(Math.round(((rev - product.prevRevenue) / product.prevRevenue) * 100)) : 100}%
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 text-right text-slate-600">{formatNumber(product.orders)}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-medium">{formatNumber(margin)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn("px-2 py-1 rounded-full text-xs font-bold", marginPercent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                          {marginPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
              {filteredProducts.length === 0 && !loading && (
                <tr>
                  <td colSpan={comparisonType !== "none" ? 6 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                    {searchTerm ? `No products matching "${searchTerm}"` : focus ? `Vendor không bán SKU nào cho ${focus.label} trong kỳ này.` : "No product data found for this vendor in the selected period."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalProductPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Showing <span className="font-bold text-slate-700">{(productPage - 1) * productItemsPerPage + 1}</span> to <span className="font-bold text-slate-700">{Math.min(productPage * productItemsPerPage, filteredProducts.length)}</span> of <span className="font-bold text-slate-700">{filteredProducts.length}</span> SKUs
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setProductPage(prev => Math.max(1, prev - 1))} disabled={productPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalProductPages) }, (_, i) => {
                  let pageNum
                  if (totalProductPages <= 5) pageNum = i + 1
                  else if (productPage <= 3) pageNum = i + 1
                  else if (productPage >= totalProductPages - 2) pageNum = totalProductPages - 4 + i
                  else pageNum = productPage - 2 + i

                  return (
                    <button key={pageNum} onClick={() => setProductPage(pageNum)}
                      className={cn("w-8 h-8 text-xs font-bold rounded-lg transition-all",
                        productPage === pageNum ? "bg-brand-600 text-white shadow-md shadow-brand-200" : "text-slate-600 hover:bg-white hover:border-slate-200 border border-transparent")}>
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              <button onClick={() => setProductPage(prev => Math.min(totalProductPages, prev + 1))} disabled={productPage === totalProductPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
