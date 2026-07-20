"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts"
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, ArrowUpRight, ArrowDownRight,
  Filter, Calendar, Download, RefreshCw, Truck, Package, Globe, LayoutDashboard,
  AlertCircle, Search, ArrowUpDown, ChevronUp, ChevronDown, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { exportAOA } from "@/lib/export-excel"

// Port "y hệt" gohub-intel VendorPerformance. Data qua /api/analytics/query (SELECT-only) +
// /api/config/partner-tiers + /api/analytics/b2b/strategic-performance. Inline getDefaultDateRange/formatDateToISO.

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

  const [allVendorsTotalRevenue, setAllVendorsTotalRevenue] = useState(0)
  const [prevMonthMetrics, setPrevMonthMetrics] = useState<any>(null)

  const [trendData, setTrendData] = useState<any[]>([])
  const [productPerformance, setProductPerformance] = useState<any[]>([])
  const [channelDistribution, setChannelDistribution] = useState<any[]>([])
  const [strategicPerformance, setStrategicPerformance] = useState<any[]>([])
  const [partnerTiers, setPartnerTiers] = useState<Record<string, string[]>>({ Strategic: [] })
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
      ? <ChevronUp className="w-3 h-3 ml-1 text-blue-600" />
      : <ChevronDown className="w-3 h-3 ml-1 text-blue-600" />
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
            const defaultVendor = list.includes("3HKDATAPOOL") ? "3HKDATAPOOL" : list[0]
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

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const isSales = dateColumn === "created_date"
      const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
      const dateCol = isSales ? "created_date" : "fulfiled_date"
      const revCol = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
      const qtyCol = isSales ? "quantity" : "fulfilled_quantity"
      const marginCol = isSales ? "0" : "gross_profit_vnd"

      const dateFilter = `${dateCol}::date >= '${startDate}' AND ${dateCol}::date <= '${endDate}'`
      const fDateFilter = `f.${dateCol}::date >= '${startDate}' AND f.${dateCol}::date <= '${endDate}'`

      let prevDateFilter = ""
      let fPrevDateFilter = ""
      if (comparisonType === "previous_period") {
        const start = new Date(startDate), end = new Date(endDate)
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        const ps = new Date(start); ps.setDate(ps.getDate() - diffDays)
        const pe = new Date(end); pe.setDate(pe.getDate() - diffDays)
        prevDateFilter = `${dateCol}::date >= '${ps.toISOString().split("T")[0]}' AND ${dateCol}::date <= '${pe.toISOString().split("T")[0]}'`
        fPrevDateFilter = `f.${dateCol}::date >= '${ps.toISOString().split("T")[0]}' AND f.${dateCol}::date <= '${pe.toISOString().split("T")[0]}'`
      } else if (comparisonType === "previous_year") {
        const start = new Date(startDate), end = new Date(endDate)
        const ps = new Date(start); ps.setFullYear(ps.getFullYear() - 1)
        const pe = new Date(end); pe.setFullYear(pe.getFullYear() - 1)
        prevDateFilter = `${dateCol}::date >= '${ps.toISOString().split("T")[0]}' AND ${dateCol}::date <= '${pe.toISOString().split("T")[0]}'`
        fPrevDateFilter = `f.${dateCol}::date >= '${ps.toISOString().split("T")[0]}' AND f.${dateCol}::date <= '${pe.toISOString().split("T")[0]}'`
      }

      let channelFilter = selectedChannel !== "All Channels"
        ? `AND order_source_code IN (SELECT code FROM dim_order_source WHERE channel_name = '${selectedChannel.replace(/'/g, "''")}')`
        : ""
      let fChannelFilter = selectedChannel !== "All Channels"
        ? `AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE channel_name = '${selectedChannel.replace(/'/g, "''")}')`
        : ""
      if (selectedChannelGroup !== "All Groups") {
        channelFilter += ` AND order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${selectedChannelGroup}')`
        fChannelFilter += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${selectedChannelGroup}')`
      }

      const vendorList = selectedVendors.map(v => `'${v.replace(/'/g, "''")}'`).join(",")
      const vendorFilter = `TRIM(sku) IN (SELECT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${vendorList}))`
      const fVendorFilter = `TRIM(f.sku) IN (SELECT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${vendorList}))`

      // prev-month range for projection
      const pmDate = new Date(startDate)
      const pmStart = formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth() - 1, 1))
      const pmEnd   = formatDateToISO(new Date(pmDate.getFullYear(), pmDate.getMonth(), 0))

      // Build ALL SQL strings upfront
      const allVendorsSql = `SELECT SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${dateFilter} ${channelFilter}`
      const summarySql    = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${dateFilter} ${channelFilter}`
      const prevSummarySql = comparisonType !== "none"
        ? `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${prevDateFilter} ${channelFilter}`
        : null
      const pmSql = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${dateCol}::date >= '${pmStart}' AND ${dateCol}::date <= '${pmEnd}' ${channelFilter}`
      const trendSql = `SELECT TO_CHAR(${dateCol}::date, 'YYYY-MM-DD') as date, SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${vendorFilter} AND ${dateFilter} ${channelFilter} GROUP BY ${dateCol}::date ORDER BY ${dateCol}::date`
      const prevTrendSql = comparisonType !== "none"
        ? `SELECT TO_CHAR(${dateCol}::date, 'YYYY-MM-DD') as date, SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${vendorFilter} AND ${prevDateFilter} ${channelFilter} GROUP BY ${dateCol}::date ORDER BY ${dateCol}::date`
        : null
      const productsSql = `SELECT TRIM(sku) as sku, SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${marginCol}) as margin FROM ${mainTable} WHERE ${vendorFilter} AND ${dateFilter} ${channelFilter} GROUP BY TRIM(sku) ORDER BY revenue DESC`
      const prevProductsSql = comparisonType !== "none"
        ? `SELECT TRIM(sku) as sku, SUM(${revCol}) as revenue FROM ${mainTable} WHERE ${vendorFilter} AND ${prevDateFilter} ${channelFilter} GROUP BY TRIM(sku)`
        : null
      const channelSql = `WITH channel_totals AS (SELECT s.channel_name, SUM(f.${revCol}) as total_revenue FROM ${mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${fDateFilter} ${fChannelFilter} GROUP BY s.channel_name) SELECT s.channel_name, SUM(f.${revCol}) as revenue, COUNT(DISTINCT f.order_code) as orders, SUM(f.${qtyCol}) as units_sold, SUM(f.${marginCol}) as margin, MAX(t.total_revenue) as total_channel_revenue, CASE WHEN s.channel_name IN ('Traveloka', 'Klook', 'Fayfay', 'Momo', 'Gohub Web (Partner)', 'Lazada', 'Shopee', 'Tiktok Shop') THEN 'B2B-Strategic' WHEN s.channel_name IN ('VN-Wholesales', 'VN-B2B Portal', 'Global-Wholesales', 'Global-B2B Portal') THEN 'B2B-Non-Strategic' ELSE 'B2C' END as business_group FROM ${mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code LEFT JOIN channel_totals t ON COALESCE(s.channel_name, '') = COALESCE(t.channel_name, '') WHERE ${fVendorFilter} AND ${fDateFilter} ${fChannelFilter} GROUP BY s.channel_name ORDER BY revenue DESC`
      const prevChannelSql = comparisonType !== "none"
        ? `SELECT s.channel_name, SUM(f.${revCol}) as revenue FROM ${mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE ${fVendorFilter} AND ${fPrevDateFilter} ${fChannelFilter} GROUP BY s.channel_name`
        : null

      const vendorParams = selectedVendors.map(v => `vendorCodes=${encodeURIComponent(v)}`).join("&")
      const strategicUrl = `/api/analytics/b2b/strategic-performance?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}&${vendorParams}`

      // Helper: POST query or resolve null for optional prev-period queries
      const q = (sql: string) => fetch("/api/analytics/query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
      })
      const qOpt = (sql: string | null): Promise<Response | null> => sql ? q(sql) : Promise.resolve(null)

      // Tất cả query độc lập → bắn song song, thời gian = query chậm nhất
      const [
        allVendorsRes, summaryRes, prevSummaryRes, pmRes,
        trendRes, prevTrendRes, productsRes, prevProductsRes,
        chanRes, tiersRes, strategicPerfRes, prevChanRes,
      ] = await Promise.all([
        q(allVendorsSql), q(summarySql), qOpt(prevSummarySql), q(pmSql),
        q(trendSql), qOpt(prevTrendSql), q(productsSql), qOpt(prevProductsSql),
        q(channelSql), fetch("/api/config/partner-tiers"), fetch(strategicUrl), qOpt(prevChannelSql),
      ])

      // Process: allVendors
      if (allVendorsRes.ok) {
        const d = await allVendorsRes.json()
        setAllVendorsTotalRevenue(parseFloat(d[0]?.revenue || 0))
      }

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

      // Process: products
      if (!productsRes.ok) throw new Error("Failed to fetch product performance")
      const currProds = await productsRes.json()
      if (prevProductsRes) {
        const prevProds = await (prevProductsRes as Response).json()
        const prevProdMap = prevProds.reduce((acc: any, p: any) => { acc[p.sku] = parseFloat(p.revenue || 0); return acc }, {})
        setProductPerformance(currProds.map((p: any) => ({ ...p, prevRevenue: prevProdMap[p.sku] || 0 })))
      } else {
        setProductPerformance(currProds)
      }

      // Process: channels + tiers + strategic
      if (!chanRes.ok) throw new Error("Failed to fetch channel distribution")
      const currChans = await chanRes.json()
      if (tiersRes.ok) setPartnerTiers(await tiersRes.json())
      if (strategicPerfRes.ok) setStrategicPerformance(await strategicPerfRes.json())
      if (prevChanRes) {
        const prevChans = await (prevChanRes as Response).json()
        const prevChanMap = prevChans.reduce((acc: any, c: any) => { acc[c.channel_name] = parseFloat(c.revenue || 0); return acc }, {})
        setChannelDistribution(currChans.map((c: any) => ({ ...c, prevRevenue: prevChanMap[c.channel_name] || 0 })))
      } else {
        setChannelDistribution(currChans)
      }
    } catch (err) {
      console.error("Error fetching vendor performance:", err)
    } finally {
      setLoading(false)
    }
  }

  const exportChannelCSV = () => {
    const headers = ["Business Group", "Channel", "Total Order", "Unit Sold", "Gross Revenue", "Projected Revenue", "Total Channel Rev (All Vendors)", "%Contrib (vs Others)", "%MoM"]
    const rows: (string | number)[][] = []

    const claimedByChannel: Record<string, { revenue: number, orders: number, units: number, prevRevenue: number }> = {}
    strategicPerformance.forEach((s: any) => {
      if (s.channel_contributions) {
        Object.entries(s.channel_contributions).forEach(([chan, contrib]: [string, any]) => {
          if (!claimedByChannel[chan]) claimedByChannel[chan] = { revenue: 0, orders: 0, units: 0, prevRevenue: 0 }
          claimedByChannel[chan].revenue += (contrib.revenue || 0)
          claimedByChannel[chan].orders += (contrib.orders || 0)
          claimedByChannel[chan].units += (contrib.units || 0)
          claimedByChannel[chan].prevRevenue += (contrib.prev_revenue || 0)
        })
      }
    })

    let grandTotalRevenue = 0
    let grandTotalOrders = 0
    let grandTotalUnits = 0
    let grandTotalPrevRevenue = 0
    const allUniqueChannels = new Set<string>()

    ;(["B2B-Strategic", "B2B-Non-Strategic", "B2C"]).forEach((groupName) => {
      let groupChannels: any[] = []
      const uniqueChannelNamesInGroup = new Set<string>()

      if (groupName === "B2B-Strategic") {
        groupChannels = strategicPerformance.map((s: any) => {
          let totalChanRev = 0
          let hasFoundChannel = false
          if (s.channel_contributions) {
            Object.keys(s.channel_contributions).forEach(chan => {
              uniqueChannelNamesInGroup.add(chan)
              allUniqueChannels.add(chan)
              const chanData = channelDistribution.find((c: any) => c.channel_name === chan)
              if (chanData) { totalChanRev += parseFloat(chanData.total_channel_revenue || 0); hasFoundChannel = true }
            })
          }
          return {
            channel_name: s.name, orders: s.orders || 0, units_sold: s.units, revenue: s.revenue,
            prevRevenue: s.prev_revenue, total_channel_revenue: hasFoundChannel ? totalChanRev : (s.revenue > 0 ? s.revenue : 1),
          }
        })

        const strategicChannelsInDist = channelDistribution.filter((c: any) => c.business_group === "B2B-Strategic")
        strategicChannelsInDist.forEach((c: any) => {
          const claimed = claimedByChannel[c.channel_name] || { revenue: 0, orders: 0, units: 0, prevRevenue: 0 }
          const resRev = Math.max(0, parseFloat(c.revenue || 0) - claimed.revenue)
          const resOrders = Math.max(0, parseInt(c.orders || 0) - claimed.orders)
          const resUnits = Math.max(0, parseInt(c.units_sold || 0) - claimed.units)
          const resPrevRev = Math.max(0, parseFloat(c.prevRevenue || 0) - claimed.prevRevenue)

          if (resRev > 1 || resOrders > 0) {
            uniqueChannelNamesInGroup.add(c.channel_name)
            allUniqueChannels.add(c.channel_name)
            groupChannels.push({
              channel_name: `Other ${c.channel_name}`, orders: resOrders, units_sold: resUnits,
              revenue: resRev, prevRevenue: resPrevRev, total_channel_revenue: parseFloat(c.total_channel_revenue || 0),
            })
          }
        })

        groupChannels.sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0))
      } else {
        groupChannels = channelDistribution
          .filter((c: any) => {
            if (groupName === "B2B-Non-Strategic") return c.business_group === "B2B-Non-Strategic"
            return c.business_group === "B2C" || !c.business_group
          })
          .map((c: any) => {
            let adjRevenue = parseFloat(c.revenue || 0)
            let adjUnits = parseInt(c.units_sold || 0)
            let adjOrders = parseInt(c.orders || 0)
            let adjPrevRevenue = parseFloat(c.prevRevenue || 0)

            const claimed = claimedByChannel[c.channel_name]
            if (claimed) {
              adjRevenue -= claimed.revenue; adjUnits -= claimed.units; adjOrders -= claimed.orders; adjPrevRevenue -= claimed.prevRevenue
            }

            if (adjRevenue < 1000 && adjOrders < 1) return null

            uniqueChannelNamesInGroup.add(c.channel_name)
            allUniqueChannels.add(c.channel_name)

            return { ...c, revenue: Math.max(0, adjRevenue), units_sold: Math.max(0, adjUnits), orders: Math.max(0, adjOrders), prevRevenue: Math.max(0, adjPrevRevenue) }
          })
          .filter(Boolean)
          .sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0))
      }

      if (groupChannels.length > 0) {
        let groupRevenue = 0
        let groupOrders = 0
        let groupUnits = 0
        let groupPrevRevenue = 0

        groupChannels.forEach((channel: any) => {
          const rev = parseFloat(channel.revenue || 0)
          const mom = channel.prevRevenue > 0 ? ((rev - channel.prevRevenue) / channel.prevRevenue) * 100 : 0
          const contribution = channel.total_channel_revenue > 0 ? ((rev / channel.total_channel_revenue) * 100) : 0

          groupRevenue += rev
          groupOrders += channel.orders
          groupUnits += channel.units_sold
          groupPrevRevenue += (channel.prevRevenue || 0)

          rows.push([
            groupName, channel.channel_name || "Unknown", channel.orders, channel.units_sold,
            Number(rev.toFixed(0)), projection ? Number((rev * projection.factor).toFixed(0)) : "-",
            Number(parseFloat(channel.total_channel_revenue || 0).toFixed(0)),
            contribution ? contribution.toFixed(2) + "%" : "-", mom ? mom.toFixed(2) + "%" : "0%",
          ])
        })

        const correctGroupAllVendorsChannelRevenue = Array.from(uniqueChannelNamesInGroup).reduce((acc, name) => {
          const chan = channelDistribution.find((c: any) => c.channel_name === name)
          return acc + parseFloat(chan?.total_channel_revenue || 0)
        }, 0)

        const groupMom = groupPrevRevenue > 0 ? ((groupRevenue - groupPrevRevenue) / groupPrevRevenue) * 100 : 0
        const groupContrib = correctGroupAllVendorsChannelRevenue > 0 ? (groupRevenue / correctGroupAllVendorsChannelRevenue * 100) : 0

        rows.push([
          `Total ${groupName}`, "", groupOrders, groupUnits, Number(groupRevenue.toFixed(0)),
          projection ? Number((groupRevenue * projection.factor).toFixed(0)) : "-",
          Number(correctGroupAllVendorsChannelRevenue.toFixed(0)), groupContrib.toFixed(2) + "%",
          groupMom ? groupMom.toFixed(2) + "%" : "0%",
        ])

        grandTotalRevenue += groupRevenue
        grandTotalOrders += groupOrders
        grandTotalUnits += groupUnits
        grandTotalPrevRevenue += groupPrevRevenue
      }
    })

    const finalGrandTotalAllVendorsChannelRevenue = Array.from(allUniqueChannels).reduce((acc, name) => {
      const chan = channelDistribution.find((c: any) => c.channel_name === name)
      return acc + parseFloat(chan?.total_channel_revenue || 0)
    }, 0)

    rows.push([
      "GRAND TOTAL", "", grandTotalOrders, grandTotalUnits, Number(grandTotalRevenue.toFixed(0)),
      projection ? Number((grandTotalRevenue * projection.factor).toFixed(0)) : "-",
      Number(finalGrandTotalAllVendorsChannelRevenue.toFixed(0)),
      finalGrandTotalAllVendorsChannelRevenue > 0 ? (grandTotalRevenue / finalGrandTotalAllVendorsChannelRevenue * 100).toFixed(2) + "%" : "-",
      grandTotalPrevRevenue > 0 ? ((grandTotalRevenue - grandTotalPrevRevenue) / grandTotalPrevRevenue * 100).toFixed(2) + "%" : "0%",
    ])

    exportAOA(headers, rows, `Channel_Distribution_${startDate}_to_${endDate}`, "Channels")
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
            <Truck className="w-7 h-7 text-blue-600" />
            Vendor Performance
          </h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích hiệu quả kinh doanh theo nhà cung cấp (Database Data)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm shrink-0 items-center h-[42px]">
            <button onClick={() => setDateColumn("fulfiled_date")}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center",
                dateColumn === "fulfiled_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
              Fulfillment
            </button>
            <button onClick={() => setDateColumn("created_date")}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all h-full flex items-center",
                dateColumn === "created_date" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
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
                    <button onClick={() => setSelectedVendors(vendors)} className="text-[10px] text-blue-600 font-bold hover:underline">All</button>
                    <button onClick={() => setSelectedVendors([])} className="text-[10px] text-rose-600 font-bold hover:underline">Clear</button>
                  </div>
                </div>
                {vendors.map(v => (
                  <div key={v} onClick={() => toggleVendor(v)}
                    className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedVendors.includes(v) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50 text-slate-700")}>
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
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 shadow-sm">
              <ArrowUpRight className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 whitespace-nowrap">
                vs {comparisonType === "previous_period" ? "Prev Period" : "Prev Year"}
              </span>
            </div>
          )}

          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-colors",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <Filter className={cn("w-4 h-4", showFilters ? "text-white" : "text-slate-400")} />
            <span className="text-sm font-medium">Filters</span>
          </button>

          <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-all shadow-sm">
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Projection Card */}
      {projection && (
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-2xl shadow-lg shadow-blue-900/20 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Month-End Projection (Pro-rata)
              </h3>
              <p className="text-blue-100 text-xs mt-1">
                Based on performance from {startDate} to {endDate} ({projection.daysElapsed}/{projection.totalDays} days)
              </p>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10">
              <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">Projection Factor</p>
              <p className="text-xl font-bold">x{projection.factor.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Projected Revenue", value: formatCompactNumber(projection.revenue), change: projection.revenueChange },
              { label: "Projected Orders", value: Math.round(projection.orders).toLocaleString(), change: projection.ordersChange },
              { label: "Projected GP", value: formatCompactNumber(projection.margin), change: projection.marginChange },
              { label: "Projected Units", value: Math.round(projection.units).toLocaleString(), change: projection.unitsChange },
            ].map(({ label, value, change }) => (
              <div key={label} className="bg-white/10 p-4 rounded-xl border border-white/10 backdrop-blur-md">
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider mb-1">{label}</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold">{value}</p>
                  <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    change >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300")}>
                    {change >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {Math.abs(change).toFixed(1)}%
                  </div>
                </div>
                <p className="text-[9px] text-blue-200 mt-1">vs Last Month Actual</p>
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
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
              <option value="All Groups">All Groups</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Channel</label>
            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
              {channels.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} className="self-end" />
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comparison</label>
            <select value={comparisonType} onChange={(e) => setComparisonType(e.target.value as any)}
              className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
              <option value="none">No Comparison</option>
              <option value="previous_period">Previous Period</option>
              <option value="previous_year">Previous Year</option>
            </select>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => { setStartDate("2026-03-01"); setEndDate("2026-03-31"); setSelectedChannel("All Channels"); setComparisonType("none") }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors shrink-0">
                Reset
              </button>
              <button onClick={() => { fetchData(); setShowFilters(false) }}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 whitespace-nowrap shrink-0">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Revenue (VND)", value: metrics.revenue, change: metrics.revenueChange, icon: DollarSign, color: "blue" },
          { label: "Orders", value: metrics.orders, change: metrics.ordersChange, icon: ShoppingCart, color: "indigo" },
          { label: "Units Sold", value: metrics.units, change: metrics.unitsChange, icon: Package, color: "purple" },
          { label: "AOV (VND)", value: metrics.aov, change: metrics.aovChange, icon: TrendingUp, color: "emerald" },
          { label: "Gross Margin", value: metrics.margin, change: metrics.marginChange, icon: LayoutDashboard, color: "amber" },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-xl",
                item.color === "blue" ? "bg-blue-50 text-blue-600" :
                item.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                item.color === "emerald" ? "bg-emerald-50 text-emerald-600" :
                item.color === "purple" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600")}>
                <item.icon className="w-6 h-6" />
              </div>
              {loading ? <Skeleton className="h-4 w-12" /> : comparisonType !== "none" && (
                <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
                  item.change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                  {item.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(item.change)}%
                </div>
              )}
            </div>
            <p className="text-slate-500 text-sm font-medium">{item.label}</p>
            {loading ? <Skeleton className="h-8 w-32 mt-2" /> : (
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {item.label.includes("VND") ? formatCompactNumber(item.value) : formatNumber(item.value)}
              </h3>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {/* Revenue Trend */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Revenue Trend</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
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
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => formatCompactNumber(val)} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    formatter={(val: number, name: string) => [formatCurrency(val), name === "revenue" ? "Current Revenue" : "Previous Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="revenue" />
                  {comparisonType !== "none" && (
                    <Area type="monotone" dataKey="prevRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="prevRevenue" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Channel Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900">Channel Distribution</h2>
            <button onClick={exportChannelCSV}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 h-[38px] px-3 bg-blue-50/50 hover:bg-blue-50 rounded-lg transition-all">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3 text-right">Total Order</th>
                  <th className="px-4 py-3 text-right">Unit Sold</th>
                  <th className="px-4 py-3 text-right">Gross Revenue</th>
                  <th className="px-4 py-3 text-right">Doanh thu dự phóng</th>
                  <th className="px-4 py-3 text-right">Total Revenue (All Vendors)</th>
                  <th className="px-4 py-3 text-right">%Contrib (vs Others)</th>
                  <th className="px-4 py-3 text-right">%MoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(8).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>)}
                    </tr>
                  ))
                ) : (
                  (() => {
                    let grandTotalOrders = 0
                    let grandTotalUnits = 0
                    let grandTotalRevenue = 0
                    let grandTotalPrevRevenue = 0

                    let b2bTotalOrders = 0
                    let b2bTotalUnits = 0
                    let b2bTotalRevenue = 0
                    let b2bTotalPrevRevenue = 0
                    const b2bUniqueChannels = new Set<string>()

                    const claimedByChannel: Record<string, { revenue: number, orders: number, units: number, prevRevenue: number }> = {}
                    strategicPerformance.forEach((s: any) => {
                      if (s.channel_contributions) {
                        Object.entries(s.channel_contributions).forEach(([chan, contrib]: [string, any]) => {
                          if (!claimedByChannel[chan]) claimedByChannel[chan] = { revenue: 0, orders: 0, units: 0, prevRevenue: 0 }
                          claimedByChannel[chan].revenue += (contrib.revenue || 0)
                          claimedByChannel[chan].orders += (contrib.orders || 0)
                          claimedByChannel[chan].units += (contrib.units || 0)
                          claimedByChannel[chan].prevRevenue += (contrib.prev_revenue || 0)
                        })
                      }
                    })

                    const groupFragments = (["B2B-Strategic", "B2B-Non-Strategic", "B2C"]).map((groupName) => {
                      let groupChannels: any[] = []
                      const uniqueChannelNamesInGroup = new Set<string>()

                      if (groupName === "B2B-Strategic") {
                        groupChannels = strategicPerformance.map((s: any) => {
                          let totalChanRev = 0
                          let hasFoundChannel = false
                          if (s.channel_contributions) {
                            Object.keys(s.channel_contributions).forEach(chan => {
                              uniqueChannelNamesInGroup.add(chan)
                              if (groupName.startsWith("B2B")) b2bUniqueChannels.add(chan)
                              const chanData = channelDistribution.find((c: any) => c.channel_name === chan)
                              if (chanData) { totalChanRev += parseFloat(chanData.total_channel_revenue || 0); hasFoundChannel = true }
                            })
                          }
                          return {
                            channel_name: s.name, orders: s.orders || 0, units_sold: s.units, revenue: s.revenue,
                            prevRevenue: s.prev_revenue, total_channel_revenue: hasFoundChannel ? totalChanRev : (s.revenue > 0 ? s.revenue : 1),
                          }
                        })

                        const strategicChannelsInDist = channelDistribution.filter((c: any) => c.business_group === "B2B-Strategic")
                        strategicChannelsInDist.forEach((c: any) => {
                          const claimed = claimedByChannel[c.channel_name] || { revenue: 0, orders: 0, units: 0, prevRevenue: 0 }
                          const resRev = Math.max(0, parseFloat(c.revenue || 0) - claimed.revenue)
                          const resOrders = Math.max(0, parseInt(c.orders || 0) - claimed.orders)
                          const resUnits = Math.max(0, parseInt(c.units_sold || 0) - claimed.units)
                          const resPrevRev = Math.max(0, parseFloat(c.prevRevenue || 0) - claimed.prevRevenue)

                          if (resRev > 1 || resOrders > 0) {
                            uniqueChannelNamesInGroup.add(c.channel_name)
                            if (groupName.startsWith("B2B")) b2bUniqueChannels.add(c.channel_name)
                            groupChannels.push({
                              channel_name: `Other ${c.channel_name}`, orders: resOrders, units_sold: resUnits,
                              revenue: resRev, prevRevenue: resPrevRev, total_channel_revenue: parseFloat(c.total_channel_revenue || 0),
                            })
                          }
                        })

                        groupChannels.sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0))
                      } else {
                        groupChannels = channelDistribution
                          .filter((c: any) => {
                            if (groupName === "B2B-Non-Strategic") return c.business_group === "B2B-Non-Strategic"
                            return c.business_group === "B2C" || !c.business_group
                          })
                          .map((c: any) => {
                            let adjRevenue = parseFloat(c.revenue || 0)
                            let adjUnits = parseInt(c.units_sold || 0)
                            let adjOrders = parseInt(c.orders || 0)
                            let adjPrevRevenue = parseFloat(c.prevRevenue || 0)

                            const claimed = claimedByChannel[c.channel_name]
                            if (claimed) {
                              adjRevenue -= claimed.revenue; adjUnits -= claimed.units; adjOrders -= claimed.orders; adjPrevRevenue -= claimed.prevRevenue
                            }

                            if (adjRevenue < 1000 && adjOrders < 1) return null

                            uniqueChannelNamesInGroup.add(c.channel_name)
                            if (groupName.startsWith("B2B")) b2bUniqueChannels.add(c.channel_name)

                            return { ...c, revenue: Math.max(0, adjRevenue), units_sold: Math.max(0, adjUnits), orders: Math.max(0, adjOrders), prevRevenue: Math.max(0, adjPrevRevenue) }
                          })
                          .filter(Boolean)
                          .sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0))
                      }

                      if (groupChannels.length === 0) return null

                      let groupRevenue = 0
                      let groupOrders = 0
                      let groupUnits = 0
                      let groupPrevRevenue = 0

                      const groupAllVendorsChannelRevenue = Array.from(uniqueChannelNamesInGroup).reduce((acc, name) => {
                        const chan = channelDistribution.find((c: any) => c.channel_name === name)
                        return acc + parseFloat(chan?.total_channel_revenue || 0)
                      }, 0)

                      groupChannels.forEach((c: any) => {
                        groupRevenue += c.revenue; groupOrders += c.orders; groupUnits += c.units_sold; groupPrevRevenue += (c.prevRevenue || 0)
                      })

                      grandTotalRevenue += groupRevenue
                      grandTotalOrders += groupOrders
                      grandTotalUnits += groupUnits
                      grandTotalPrevRevenue += groupPrevRevenue

                      if (groupName.startsWith("B2B")) {
                        b2bTotalRevenue += groupRevenue; b2bTotalOrders += groupOrders; b2bTotalUnits += groupUnits; b2bTotalPrevRevenue += groupPrevRevenue
                      }

                      const b2bTotalAllVendorsChannelRevenue = Array.from(b2bUniqueChannels).reduce((acc, name) => {
                        const chan = channelDistribution.find((c: any) => c.channel_name === name)
                        return acc + parseFloat(chan?.total_channel_revenue || 0)
                      }, 0)

                      return (
                        <React.Fragment key={groupName}>
                          <tr className="bg-slate-50/80">
                            <td colSpan={8} className="px-4 py-2 font-bold text-slate-700 text-[10px] uppercase tracking-wider">{groupName}</td>
                          </tr>
                          {groupChannels.map((channel: any, idx: number) => {
                            const rev = parseFloat(channel.revenue || 0)
                            const mom = channel.prevRevenue > 0 ? ((rev - channel.prevRevenue) / channel.prevRevenue) * 100 : 0
                            const contribution = channel.total_channel_revenue > 0 ? ((rev / channel.total_channel_revenue) * 100) : null

                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors group text-xs">
                                <td className="px-4 py-3 font-medium text-slate-700 border-l-2 border-transparent group-hover:border-blue-400">
                                  {channel.channel_name || "Unknown"}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-600">{formatNumber(channel.orders)}</td>
                                <td className="px-4 py-3 text-right text-slate-600">{formatNumber(channel.units_sold)}</td>
                                <td className="px-4 py-3 text-right text-slate-600 font-medium">{formatCurrency(rev)}</td>
                                <td className="px-4 py-3 text-right text-blue-600 font-medium">{projection ? formatCurrency(rev * projection.factor) : "-"}</td>
                                <td className="px-4 py-3 text-right text-slate-500 italic">{formatCurrency(channel.total_channel_revenue)}</td>
                                <td className="px-4 py-3 text-right">
                                  {contribution !== null ? (
                                    <span className={cn("font-bold", contribution > 50 ? "text-emerald-600" : "text-slate-600")}>{contribution.toFixed(1)}%</span>
                                  ) : "-"}
                                </td>
                                <td className={cn("px-4 py-3 text-right font-bold", mom >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                  {mom > 0 ? "+" : ""}{mom.toFixed(1)}%
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="bg-slate-50 font-bold text-xs border-y border-slate-200">
                            <td className="px-4 py-2 text-slate-900 bg-slate-100">Total {groupName}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(groupOrders)}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(groupUnits)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(groupRevenue)}</td>
                            <td className="px-4 py-2 text-right text-blue-600">{projection ? formatCurrency(groupRevenue * projection.factor) : "-"}</td>
                            <td className="px-4 py-2 text-right text-slate-500 italic">{formatCurrency(groupAllVendorsChannelRevenue)}</td>
                            <td className="px-4 py-2 text-right">
                              {groupAllVendorsChannelRevenue > 0 ? (
                                <span className="font-bold text-slate-700">{(groupRevenue / groupAllVendorsChannelRevenue * 100).toFixed(1)}%</span>
                              ) : "-"}
                            </td>
                            <td className={cn("px-4 py-2 text-right font-bold border-r-2 border-slate-200",
                              (groupRevenue - groupPrevRevenue) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {groupPrevRevenue > 0 ? (groupRevenue >= groupPrevRevenue ? "+" : "") + ((groupRevenue - groupPrevRevenue) / groupPrevRevenue * 100).toFixed(1) + "%" : "-"}
                            </td>
                          </tr>
                          {groupName === "B2B-Non-Strategic" && (
                            <tr className="bg-blue-50 font-bold text-xs border-y-2 border-blue-100">
                              <td className="px-4 py-3 text-blue-900 bg-blue-100/50">Total B2B (Combined)</td>
                              <td className="px-4 py-3 text-right">{formatNumber(b2bTotalOrders)}</td>
                              <td className="px-4 py-3 text-right">{formatNumber(b2bTotalUnits)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(b2bTotalRevenue)}</td>
                              <td className="px-4 py-3 text-right text-blue-600">{projection ? formatCurrency(b2bTotalRevenue * projection.factor) : "-"}</td>
                              <td className="px-4 py-3 text-right text-slate-500 italic border-l border-blue-100">{formatCurrency(b2bTotalAllVendorsChannelRevenue)}</td>
                              <td className="px-4 py-3 text-right">
                                {b2bTotalAllVendorsChannelRevenue > 0 ? (
                                  <span className="font-bold text-blue-700">{(b2bTotalRevenue / b2bTotalAllVendorsChannelRevenue * 100).toFixed(1)}%</span>
                                ) : "-"}
                              </td>
                              <td className={cn("px-4 py-3 text-right font-black",
                                (b2bTotalRevenue - b2bTotalPrevRevenue) >= 0 ? "text-emerald-700" : "text-rose-700")}>
                                {b2bTotalPrevRevenue > 0 ? (b2bTotalRevenue >= b2bTotalPrevRevenue ? "+" : "") + ((b2bTotalRevenue - b2bTotalPrevRevenue) / b2bTotalPrevRevenue * 100).toFixed(1) + "%" : "-"}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })

                    const finalGrandTotalAllVendorsChannelRevenue = channelDistribution.reduce((acc: number, c: any) => acc + parseFloat(c.total_channel_revenue || 0), 0)

                    return (
                      <>
                        {groupFragments}
                        <tr className="bg-slate-200 font-bold text-sm border-t-2 border-slate-300">
                          <td className="px-4 py-4 text-slate-900 font-black">GRAND TOTAL</td>
                          <td className="px-4 py-4 text-right">{formatNumber(grandTotalOrders)}</td>
                          <td className="px-4 py-4 text-right">{formatNumber(grandTotalUnits)}</td>
                          <td className="px-4 py-4 text-right overflow-hidden truncate">{formatCurrency(grandTotalRevenue)}</td>
                          <td className="px-4 py-4 text-right text-blue-700">{projection ? formatCurrency(grandTotalRevenue * projection.factor) : "-"}</td>
                          <td className="px-4 py-4 text-right text-slate-500 italic">{formatCurrency(finalGrandTotalAllVendorsChannelRevenue)}</td>
                          <td className="px-4 py-4 text-right text-slate-900">
                            {finalGrandTotalAllVendorsChannelRevenue > 0 ? (
                              <span>{(grandTotalRevenue / finalGrandTotalAllVendorsChannelRevenue * 100).toFixed(1)}%</span>
                            ) : "-"}
                          </td>
                          <td className={cn("px-4 py-4 text-right font-black",
                            (grandTotalRevenue - grandTotalPrevRevenue) >= 0 ? "text-emerald-700" : "text-rose-700")}>
                            {grandTotalPrevRevenue > 0 ? (grandTotalRevenue >= grandTotalPrevRevenue ? "+" : "") + ((grandTotalRevenue - grandTotalPrevRevenue) / grandTotalPrevRevenue * 100).toFixed(1) + "%" : "-"}
                          </td>
                        </tr>
                      </>
                    )
                  })()
                )}
                {channelDistribution.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400 italic font-medium">No channel data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900">Product Performance</h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-64" />
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
              {loading ? Array(5).fill(0).map((_, i) => (
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
                    {searchTerm ? `No products matching "${searchTerm}"` : "No product data found for this vendor in the selected period."}
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
                        productPage === pageNum ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-slate-600 hover:bg-white hover:border-slate-200 border border-transparent")}>
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
