"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  AreaChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  ShoppingBag, TrendingUp, TrendingDown, Search, Download, Package, DollarSign,
  ShoppingCart, LayoutDashboard, ChevronDown, Check, MapPin, FileText,
} from "lucide-react"
import { domToCanvas } from "modern-screenshot"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber, formatCompactNumber, formatTruncatedString } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { useToast } from "@/components/toast"
import { exportToExcel, exportRawRows } from "@/lib/export-excel"

// Port "y hệt" gohub-intel ProductPerformance. Data qua /api/analytics/query + /api/channels +
// /api/config/sku-destination-rule + /api/config/country-codes + /api/analytics/b2b/strategic-performance +
// /api/orders/export. Export PDF dùng modern-screenshot + jspdf (web đã có). Inline getDefaultDateRange/formatDateToISO.

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

interface ProductMetrics {
  revenue: number; revenueChange: number
  orders: number; ordersChange: number
  units: number; unitsChange: number
  aov: number; aovChange: number
  margin: number; marginChange: number
}
interface TrendData { date: string; revenue: number; units: number; prevRevenue?: number; prevUnits?: number }
interface ChannelData { channel_name: string; group_name?: string; revenue: number; units_sold: number; orders: number; margin: number }
interface RegionData { region: string; revenue: number; units: number }
interface SKUPerformance { sku: string; category: string; vendor: string; region: string; revenue: number; units: number; orders: number; margin: number }

export default function ProductPerformancePage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<ProductMetrics>({
    revenue: 0, revenueChange: 0, orders: 0, ordersChange: 0, units: 0, unitsChange: 0, aov: 0, aovChange: 0, margin: 0, marginChange: 0,
  })
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [channelData, setChannelData] = useState<ChannelData[]>([])
  const [regionData, setRegionData] = useState<RegionData[]>([])
  const [skuPerformance, setSkuPerformance] = useState<SKUPerformance[]>([])
  const reportRef = React.useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const skuFullQueryRef = React.useRef<string>("")   // query SKU không LIMIT → export FULL
  const [exportingSku, setExportingSku] = useState(false)

  // Filters
  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("previous_period")
  const [dateColumn, setDateColumn] = useState<"fulfiled_date" | "created_date">("fulfiled_date")

  // SKU Selection
  const [availableSkus, setAvailableSkus] = useState<string[]>([])
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [skuSearch, setSkuSearch] = useState("")
  const [showSkuDropdown, setShowSkuDropdown] = useState(false)

  // Category & Vendor Filters
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [vendors, setVendors] = useState<string[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  // Channel & Channel Group Filters
  const [selectedChannelGroup, setSelectedChannelGroup] = useState<string>("all")
  const [availableChannels, setAvailableChannels] = useState<string[]>([])
  const [selectedChannel, setSelectedChannel] = useState<string>("all")

  // Destination Filters
  const [skuRule, setSkuRule] = useState({ startsWith: "E", codeLength: 3, useGohubVietnamRule: true, useGohubIncRule: true })
  const [countryMappings, setCountryMappings] = useState<Record<string, string>>({})
  const [selectedDestination, setSelectedDestination] = useState<string>("all")

  const runQuery = async (sql: string) => {
    const res = await fetch("/api/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })
    if (!res.ok) throw new Error(`Query failed: ${res.status}`)
    return res.json()
  }

  const exportToCSV = (data: any[], filename: string, columns: { label: string; key: string }[]) => {
    exportToExcel(data as Record<string, unknown>[], columns, `${filename}_${startDate}_to_${endDate}`)
  }

  // Export SKU Breakdown FULL (chạy lại query KHÔNG LIMIT) — cột khớp đúng bảng hiển thị.
  const exportSkuBreakdownFull = async () => {
    if (!skuFullQueryRef.current || exportingSku) return
    setExportingSku(true)
    try {
      const skus = await runQuery(skuFullQueryRef.current)
      const rows = (Array.isArray(skus) ? skus : []).map((s: any) => {
        const revenue = parseFloat(s.revenue || 0)
        const margin = parseFloat(s.margin || 0)
        return {
          "SKU": s.sku || "",
          "Country Code": s.region || "",
          "Country": countryMappings[s.region] || "",
          "Category": s.category || "",
          "Vendor": s.vendor || "",
          "Revenue": revenue,
          "Units": parseInt(s.units || 0),
          "Orders": parseInt(s.orders || 0),
          "Margin %": revenue > 0 ? Number(((margin / revenue) * 100).toFixed(1)) : 0,
        }
      })
      exportRawRows(rows, `SKU_Breakdown_${startDate}_to_${endDate}`, "SKU Breakdown")
    } catch (err) {
      console.error("Export SKU breakdown failed:", err)
    } finally {
      setExportingSku(false)
    }
  }

  const exportToPDF = async () => {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const canvas = await domToCanvas(reportRef.current, { scale: 2, backgroundColor: "#f8fafc" })
      const imgData = canvas.toDataURL("image/png")
      const { jsPDF } = await import("jspdf")   // nạp động: chỉ tải jspdf khi user xuất PDF
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`Product_Performance_Report_${startDate}_to_${endDate}.pdf`)
    } catch (err) {
      console.error("PDF Export error:", err)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    fetchInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchPerformanceData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateColumn, skuRule])

  const toggleItem = (item: string, current: string[], setter: (val: string[]) => void) => {
    setter(current.includes(item) ? current.filter(i => i !== item) : [...current, item])
  }

  useEffect(() => {
    fetchFilteredChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelGroup])

  const fetchFilteredChannels = async () => {
    try {
      const resp = await fetch(`/api/channels?channelGroup=${selectedChannelGroup}`)
      if (resp.ok) setAvailableChannels(await resp.json())
    } catch (err) {
      console.error("Error fetching filtered channels:", err)
    }
  }

  const fetchInitialData = async () => {
    try {
      const [skus, cats, vends, rule, countries] = await Promise.all([
        runQuery("SELECT DISTINCT sku FROM dim_sku ORDER BY sku"),
        runQuery("SELECT DISTINCT category_name FROM dim_sku WHERE category_name IS NOT NULL ORDER BY category_name"),
        runQuery("SELECT DISTINCT vendor FROM dim_sku WHERE vendor IS NOT NULL ORDER BY vendor"),
        fetch("/api/config/sku-destination-rule").then(r => r.json()),
        fetch("/api/config/country-codes").then(r => r.json()),
      ])

      setAvailableSkus(skus.map((s: any) => s.sku))
      setCategories(cats.map((c: any) => c.category_name))
      setVendors(vends.map((v: any) => v.vendor))
      // Web rule = {prefix, codeLength, offset}; map prefix→startsWith
      setSkuRule(prev => ({ ...prev, ...rule, startsWith: rule.prefix ?? prev.startsWith, codeLength: rule.codeLength ?? prev.codeLength }))

      const mapping: Record<string, string> = {}
      if (Array.isArray(countries)) countries.forEach((c: any) => mapping[c.code] = c.country)
      setCountryMappings(mapping)
    } catch (err) {
      console.error("Error fetching initial data:", err)
    }
  }

  const fetchPerformanceData = async () => {
    setLoading(true)
    try {
      const isSales = dateColumn === "created_date"
      const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
      const dateCol = isSales ? "created_date" : "fulfiled_date"
      const revCol = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
      const qtyCol = isSales ? "quantity" : "fulfilled_quantity"
      const marginCol = isSales ? "0" : "gross_profit_vnd"

      let filterSQL = `f.${dateCol}::date BETWEEN '${startDate}' AND '${endDate}'`
      if (selectedSkus.length > 0) filterSQL += ` AND f.sku IN (${selectedSkus.map(s => `'${s}'`).join(",")})`
      if (selectedCategory !== "all") filterSQL += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE category_name = '${selectedCategory}')`
      if (selectedVendors.length > 0) {
        const vendorList = selectedVendors.map(v => `'${v.replace(/'/g, "''")}'`).join(",")
        filterSQL += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE vendor IN (${vendorList}))`
      }

      const ruleToUse = {
        startsWith: skuRule.startsWith || "E",
        codeLength: skuRule.codeLength || 3,
        useGohubVietnamRule: skuRule.useGohubVietnamRule !== false,
        useGohubIncRule: skuRule.useGohubIncRule !== false,
      }
      const regionExpr = `TRIM(CASE
        ${ruleToUse.useGohubVietnamRule ? "WHEN SUBSTRING(f.sku, 1, 1) BETWEEN '1' AND '6' THEN SUBSTRING(f.sku FROM 3 FOR 3)" : ""}
        ${ruleToUse.useGohubIncRule ? "WHEN SUBSTRING(f.sku, 1, 1) BETWEEN 'A' AND 'E' THEN SUBSTRING(f.sku FROM 3 FOR 3)" : ""}
        WHEN f.sku LIKE '${ruleToUse.startsWith}%' THEN SUBSTRING(f.sku FROM ${ruleToUse.startsWith.length + 1} FOR ${ruleToUse.codeLength})
        ELSE SUBSTRING(f.sku FROM 1 FOR ${ruleToUse.codeLength})
      END)`
      if (selectedDestination !== "all") filterSQL += ` AND ${regionExpr} = '${selectedDestination}'`

      if (selectedChannel !== "all") {
        filterSQL += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '${selectedChannel}')`
      } else if (selectedChannelGroup !== "all") {
        const dbGroup = selectedChannelGroup === "B2B" ? "B2B" : "B2C"
        filterSQL += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${dbGroup}')`
      }

      const metricsQuery = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} f WHERE ${filterSQL}`

      let prevFilterSQL = "1=0"
      if (comparisonType !== "none") {
        const start = new Date(startDate)
        const end = new Date(endDate)
        let prevStart: Date, prevEnd: Date
        if (comparisonType === "previous_period") {
          const diff = end.getTime() - start.getTime()
          prevEnd = new Date(start.getTime() - 86400000)
          prevStart = new Date(prevEnd.getTime() - diff)
        } else {
          prevStart = new Date(start); prevStart.setFullYear(start.getFullYear() - 1)
          prevEnd = new Date(end); prevEnd.setFullYear(end.getFullYear() - 1)
        }
        const prevStartDate = formatDateToISO(prevStart)
        const prevEndDate = formatDateToISO(prevEnd)

        prevFilterSQL = `f.${dateCol}::date BETWEEN '${prevStartDate}' AND '${prevEndDate}'`
        if (selectedSkus.length > 0) prevFilterSQL += ` AND f.sku IN (${selectedSkus.map(s => `'${s}'`).join(",")})`
        if (selectedCategory !== "all") prevFilterSQL += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE category_name = '${selectedCategory}')`
        if (selectedVendors.length > 0) {
          const vendorList = selectedVendors.map(v => `'${v.replace(/'/g, "''")}'`).join(",")
          prevFilterSQL += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE vendor IN (${vendorList}))`
        }
        if (selectedDestination !== "all") prevFilterSQL += ` AND ${regionExpr} = '${selectedDestination}'`
        if (selectedChannel !== "all") {
          prevFilterSQL += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '${selectedChannel}')`
        } else if (selectedChannelGroup !== "all") {
          const dbGroup = selectedChannelGroup === "B2B" ? "B2B" : "B2C"
          prevFilterSQL += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${dbGroup}')`
        }
      }

      const prevMetricsQuery = `SELECT SUM(${revCol}) as revenue, COUNT(DISTINCT order_code) as orders, SUM(${qtyCol}) as units, SUM(${marginCol}) as margin FROM ${mainTable} f WHERE ${prevFilterSQL}`

      const trendQuery = `SELECT ${dateCol}::date as date, SUM(${revCol}) as revenue, SUM(${qtyCol}) as units FROM ${mainTable} f WHERE ${filterSQL} GROUP BY 1 ORDER BY 1`

      const channelQuery = `
        SELECT s.channel_name, s.group_name, SUM(f.${revCol}) as revenue, SUM(f.${qtyCol}) as units_sold,
          COUNT(DISTINCT f.order_code) as orders, SUM(f.${marginCol}) as margin
        FROM ${mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
        WHERE ${filterSQL} GROUP BY 1, 2 ORDER BY revenue DESC`

      const regionQuery = `SELECT ${regionExpr} as region_code, SUM(${revCol}) as revenue, SUM(${qtyCol}) as units FROM ${mainTable} f WHERE ${filterSQL} GROUP BY 1 ORDER BY revenue DESC LIMIT 10`

      // Base query (KHÔNG LIMIT) — lưu để export FULL; bảng chỉ hiển thị top 50.
      const skuBreakdownBase = `
        SELECT f.sku, v.category_name as category, v.vendor, ${regionExpr} as region,
          SUM(f.${revCol}) as revenue, SUM(f.${qtyCol}) as units, COUNT(DISTINCT f.order_code) as orders, SUM(f.${marginCol}) as margin
        FROM ${mainTable} f LEFT JOIN dim_sku v ON f.sku = v.sku
        WHERE ${filterSQL} GROUP BY 1, 2, 3, 4 ORDER BY revenue DESC`
      skuFullQueryRef.current = skuBreakdownBase
      const skuBreakdownQuery = `${skuBreakdownBase} LIMIT 50`

      const [mRecords, pmRecords, trends, channels, regions, skus, strategicRes] = await Promise.all([
        runQuery(metricsQuery),
        runQuery(prevMetricsQuery),
        runQuery(trendQuery),
        runQuery(channelQuery),
        runQuery(regionQuery),
        runQuery(skuBreakdownQuery),
        fetch(`/api/analytics/b2b/strategic-performance?startDate=${startDate}&endDate=${endDate}&dateColumn=${dateColumn}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ])
      const strategic = Array.isArray(strategicRes) ? strategicRes : []

      const m = mRecords[0] || {}
      const pm = pmRecords[0] || {}

      const calcChange = (curr: number, prev: number) => (!prev || prev === 0) ? 0 : Math.round(((curr - prev) / prev) * 100)

      setMetrics({
        revenue: parseFloat(m.revenue || 0),
        revenueChange: calcChange(parseFloat(m.revenue || 0), parseFloat(pm.revenue || 0)),
        orders: parseInt(m.orders || 0),
        ordersChange: calcChange(parseInt(m.orders || 0), parseInt(pm.orders || 0)),
        units: parseInt(m.units || 0),
        unitsChange: calcChange(parseInt(m.units || 0), parseInt(pm.units || 0)),
        aov: m.orders > 0 ? parseFloat(m.revenue) / parseInt(m.orders) : 0,
        aovChange: calcChange(m.orders > 0 ? parseFloat(m.revenue) / parseInt(m.orders) : 0, pm.orders > 0 ? parseFloat(pm.revenue) / parseInt(pm.orders) : 0),
        margin: parseFloat(m.margin || 0),
        marginChange: calcChange(parseFloat(m.margin || 0), parseFloat(pm.margin || 0)),
      })

      setTrendData(trends.map((t: any) => ({
        date: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: parseFloat(t.revenue),
        units: parseInt(t.units),
      })))

      const rawChannels = channels.map((c: any) => ({
        channel_name: c.channel_name, group_name: c.group_name,
        revenue: parseFloat(c.revenue), units_sold: parseInt(c.units_sold), orders: parseInt(c.orders), margin: parseFloat(c.margin),
      }))

      const adjustedChannels = rawChannels.map((rc: any) => {
        let rev = rc.revenue, units = rc.units_sold, orders = rc.orders, margin = rc.margin
        strategic.forEach((s: any) => {
          if (s.channel_contributions && s.channel_contributions[rc.channel_name]) {
            const contrib = s.channel_contributions[rc.channel_name]
            rev -= (contrib.revenue || 0)
            units -= (contrib.units || 0)
            orders -= (contrib.orders || 0)
            const marginRatio = rc.revenue > 0 ? rc.margin / rc.revenue : 0
            margin -= (contrib.revenue || 0) * marginRatio
          }
        })
        return { ...rc, revenue: rev, units_sold: units, orders, margin }
      }).filter((c: any) => c.revenue > 1000 || c.orders > 0)

      const strategicRows = strategic.map((s: any) => ({
        channel_name: s.name, group_name: "Strategic", revenue: s.revenue, units_sold: s.units, orders: s.orders, margin: s.margin,
      }))

      setChannelData([...strategicRows, ...adjustedChannels].sort((a, b) => b.revenue - a.revenue))

      setRegionData(regions.map((r: any) => ({
        region: countryMappings[r.region_code] || r.region_code,
        revenue: parseFloat(r.revenue), units: parseInt(r.units),
      })))

      setSkuPerformance(skus.map((s: any) => ({
        sku: s.sku, category: s.category, vendor: s.vendor, region: s.region,
        revenue: parseFloat(s.revenue), units: parseInt(s.units), orders: parseInt(s.orders), margin: parseFloat(s.margin),
      })))
    } catch (err) {
      console.error("Error fetching performance data:", err)
    } finally {
      setLoading(false)
    }
  }

  const groupedChannelData = useMemo(() => {
    const groups = { b2c: [] as ChannelData[], b2bStrategic: [] as ChannelData[], b2bNonStrategic: [] as ChannelData[] }
    channelData.forEach(channel => {
      if (channel.group_name === "Strategic") groups.b2bStrategic.push(channel)
      else if (channel.group_name?.toUpperCase() === "B2C") groups.b2c.push(channel)
      else groups.b2bNonStrategic.push(channel)
    })
    return groups
  }, [channelData])

  const filteredSkus = useMemo(() => {
    return availableSkus.filter(sku => (sku || "").toLowerCase().includes((skuSearch || "").toLowerCase())).slice(0, 100)
  }, [availableSkus, skuSearch])

  const toggleSku = (sku: string) => {
    setSelectedSkus(prev => prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku])
  }

  const filteredChannels = availableChannels

  const getProjection = () => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const now = new Date()
    const isCurrentMonth = end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear()
    if (!isCurrentMonth) return null
    const daysElapsed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const lastDayOfMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
    if (daysElapsed >= lastDayOfMonth || daysElapsed <= 0) return null
    const factor = lastDayOfMonth / daysElapsed
    return { revenue: metrics.revenue * factor, units: metrics.units * factor, daysElapsed, totalDays: lastDayOfMonth }
  }
  const projection = getProjection()

  const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse bg-slate-200 rounded", className)} />

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        startDate, endDate,
        skus: selectedSkus.join(","), category: selectedCategory, vendor: selectedVendors.join(","),
        channelGroup: selectedChannelGroup, channel: selectedChannel, destination: selectedDestination,
        startsWith: skuRule.startsWith, codeLength: skuRule.codeLength.toString(),
        useGohubVietnamRule: skuRule.useGohubVietnamRule ? "true" : "false",
        useGohubIncRule: skuRule.useGohubIncRule ? "true" : "false",
        dataSource: dateColumn === "fulfiled_date" ? "fulfilled" : "created",
      })
      const response = await fetch(`/api/orders/export?${params}`)
      if (response.ok) {
        const data = await response.json()
        const rows = data.map((item: any) => ({
          "Order ID": item.order_id || "",
          "Date": item.date ? (typeof item.date === "string" ? item.date.split("T")[0] : new Date(item.date).toISOString().split("T")[0]) : "",
          "Staff": item.staff || "",
          "Customer": item.customer || item.customer_name || "",
          "Channel": item.channel || "",
          "Order Source": item.order_source || "",
          "Product": item.product_name || "",
          "SKU": item.sku || "",
          "Qty": item.fulfilled_quantity || 0,
          "Revenue": item.revenue || 0,
        }))
        exportRawRows(rows, `Product_Performance_${startDate}_to_${endDate}`, "Products")
      } else {
        toast.error("Failed to export data")
      }
    } catch (err) {
      console.error("Export error:", err)
      toast.error("Error exporting data")
    }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header & Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm shrink-0 items-center h-[42px]">
              <button onClick={() => setDateColumn("fulfiled_date")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all h-full flex items-center", dateColumn === "fulfiled_date" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
                Fulfillment
              </button>
              <button onClick={() => setDateColumn("created_date")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all h-full flex items-center", dateColumn === "created_date" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>
                Created
              </button>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Product Performance</h1>
              <p className="text-slate-500">Analyze performance by SKU, Channel, or Category</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportToPDF} disabled={loading || exporting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50">
              {exporting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <FileText className="w-4 h-4" />}
              Export PDF
            </button>
            <button onClick={handleExport} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50">
              <Download className="w-4 h-4" />
              Export Orders
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* SKU Multi-select */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select SKUs</label>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all" onClick={() => setShowSkuDropdown(!showSkuDropdown)}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <ShoppingBag className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{selectedSkus.length === 0 ? "All SKUs" : `${selectedSkus.length} SKUs selected`}</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showSkuDropdown && "rotate-180")} />
              </div>
              {showSkuDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" placeholder="Search SKU..." value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-0" onClick={(e) => e.stopPropagation()} />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {selectedSkus.length > 0 && (
                      <div className="p-2 border-b border-slate-50 mb-1">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedSkus([]) }} className="text-xs font-bold text-blue-600 hover:text-blue-700">Clear Selection</button>
                      </div>
                    )}
                    {filteredSkus.map(sku => (
                      <div key={sku} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer group" onClick={(e) => { e.stopPropagation(); toggleSku(sku) }}>
                        <span className="text-sm text-slate-700">{sku}</span>
                        {selectedSkus.includes(sku) && <Check className="w-4 h-4 text-blue-600" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Category Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Categories</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {/* Vendor Filter */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor</label>
              <div className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 transition-all font-medium h-[38px]" onClick={() => setShowVendorDropdown(!showVendorDropdown)}>
                <span className="truncate max-w-[150px]">{selectedVendors.length === 0 ? "All Vendors" : selectedVendors.length === 1 ? selectedVendors[0] : `${selectedVendors.length} Vendors`}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showVendorDropdown && "rotate-180")} />
              </div>
              {showVendorDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-2 min-w-[200px]">
                  <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Select Vendors</span>
                    <button onClick={() => setSelectedVendors([])} className="text-[10px] text-blue-600 font-bold hover:underline">Clear</button>
                  </div>
                  {vendors.map(v => (
                    <div key={v} onClick={() => toggleItem(v, selectedVendors, setSelectedVendors)}
                      className={cn("flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors", selectedVendors.includes(v) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50")}>
                      <span className="text-sm font-medium">{v}</span>
                      {selectedVendors.includes(v) && <Check className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date Range</label>
              <div className="flex items-center gap-2">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-slate-400">-</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} className="pt-1" />
            </div>

            {/* Channel Group Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Channel Group</label>
              <select value={selectedChannelGroup} onChange={(e) => { setSelectedChannelGroup(e.target.value); setSelectedChannel("all") }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Groups</option>
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>

            {/* Channel Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Channel</label>
              <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Channels</option>
                {filteredChannels.map(channel => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </div>

            {/* Destination Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Destination</label>
              <select value={selectedDestination} onChange={(e) => setSelectedDestination(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Destinations</option>
                {Object.entries(countryMappings).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => (
                  <option key={code} value={code}>{name} ({code})</option>
                ))}
              </select>
            </div>

            {/* Comparison Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Compare To</label>
              <select value={comparisonType} onChange={(e) => setComparisonType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="none">No Comparison</option>
                <option value="previous_period">Previous Period</option>
                <option value="previous_year">Previous Year</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
            <button onClick={fetchPerformanceData} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6">
        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Revenue (VND)", value: metrics.revenue, change: metrics.revenueChange, icon: DollarSign, color: "blue" },
            { label: "Units Sold", value: metrics.units, change: metrics.unitsChange, icon: Package, color: "purple" },
            { label: "Orders", value: metrics.orders, change: metrics.ordersChange, icon: ShoppingCart, color: "indigo" },
            { label: "ASP (VND)", value: metrics.aov, change: metrics.aovChange, icon: TrendingUp, color: "emerald" },
            { label: "Gross Margin", value: metrics.margin, change: metrics.marginChange, icon: LayoutDashboard, color: "amber" },
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("p-3 rounded-xl",
                  item.color === "blue" ? "bg-blue-50 text-blue-600" :
                  item.color === "purple" ? "bg-purple-50 text-purple-600" :
                  item.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
                  item.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                  <item.icon className="w-6 h-6" />
                </div>
                {loading ? <Skeleton className="h-4 w-12" /> : (comparisonType !== "none" && (
                  <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full", item.change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                    {item.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(item.change)}%
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-sm font-medium">{item.label}</p>
              {loading ? <Skeleton className="h-8 w-32 mt-2" /> : (
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{item.label.includes("VND") ? formatCompactNumber(item.value) : formatNumber(item.value)}</h3>
              )}
            </div>
          ))}
        </div>

        {/* Projection */}
        {projection && !loading && (
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><TrendingUp className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-bold text-blue-900">Month-End Projection</h3>
                <p className="text-sm text-blue-600">Based on {projection.daysElapsed} days of performance</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Projected Revenue</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(projection.revenue)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Projected Units</p>
                <p className="text-2xl font-bold text-blue-600">{formatNumber(Math.round(projection.units))}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* Trend Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Sales &amp; Units Trend</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Revenue</div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div> Units</div>
              </div>
            </div>
            <div className="h-[350px] w-full">
              {loading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => formatCompactNumber(val)} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#10b981", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="Revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="units" stroke="#10b981" strokeWidth={2} dot={false} name="Units" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top Regions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-6">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Top Regions</h2>
            </div>
            <div className="h-[500px] w-full">
              {loading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionData} layout="vertical" margin={{ left: 30, right: 40, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="region" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} width={180} interval={0} tickFormatter={(value) => formatTruncatedString(value, 20)} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [formatCompactNumber(val), "Revenue"]} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Channel Performance */}
        <div className="space-y-6">
          {[
            { id: "b2c", title: "B2C Performance", data: groupedChannelData.b2c, color: "indigo" },
            { id: "b2b-strategic", title: "B2B - Strategic Performance", data: groupedChannelData.b2bStrategic, color: "blue" },
            { id: "b2b-non-strategic", title: "B2B - Non-Strategic Performance", data: groupedChannelData.b2bNonStrategic, color: "slate" },
          ].map((group) => (
            <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", group.color === "indigo" ? "bg-indigo-50 text-indigo-600" : group.color === "blue" ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600")}>
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{group.title}</h2>
                </div>
                <button onClick={() => exportToCSV(group.data, group.id.replace(/-/g, "_"), [
                  { label: "Channel", key: "channel_name" }, { label: "Revenue", key: "revenue" }, { label: "Units Sold", key: "units_sold" }, { label: "Orders", key: "orders" }, { label: "Gross Margin", key: "margin" },
                ])} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px]">
                  <Download className="w-3 h-3" /> Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Channel</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Units Sold</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Gross Margin</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? Array(2).fill(0).map((_, i) => (
                      <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>)}</tr>
                    )) : group.data.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm italic">No performance data found for this group in selected period</td></tr>
                    ) : (
                      group.data.map((channel, idx) => {
                        const marginPercent = channel.revenue > 0 ? (channel.margin / channel.revenue) * 100 : 0
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-700">{channel.channel_name}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">{formatCompactNumber(channel.revenue)}</td>
                            <td className="px-6 py-4 text-right text-slate-600">{formatNumber(channel.units_sold)}</td>
                            <td className="px-6 py-4 text-right text-slate-600">{formatNumber(channel.orders)}</td>
                            <td className="px-6 py-4 text-right text-emerald-600 font-medium">{formatCompactNumber(channel.margin)}</td>
                            <td className="px-6 py-4 text-right">
                              <span className={cn("px-2 py-1 rounded-full text-xs font-bold", marginPercent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{marginPercent.toFixed(1)}%</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* SKU Performance Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">SKU Breakdown</h2>
              <span className="text-xs text-slate-500">Bảng hiển thị top 50 theo doanh thu · Export xuất TẤT CẢ SKU</span>
            </div>
            <button onClick={exportSkuBreakdownFull} disabled={exportingSku} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px] disabled:opacity-50">
              <Download className="w-3 h-3" /> {exportingSku ? "Exporting..." : "Export"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Country</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Units</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-20 ml-auto" /></td>)}</tr>
                )) : (
                  skuPerformance.map((sku, idx) => {
                    const marginPercent = sku.revenue > 0 ? (sku.margin / sku.revenue) * 100 : 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-700">{sku.sku}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase">{sku.region}</span>
                            <span className="text-slate-500 text-xs truncate max-w-[100px]">{countryMappings[sku.region] || "-"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{sku.category || "-"}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{sku.vendor || "-"}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900">{formatNumber(sku.revenue)}</td>
                        <td className="px-6 py-4 text-right text-slate-600">{formatNumber(sku.units)}</td>
                        <td className="px-6 py-4 text-right text-slate-600">{formatNumber(sku.orders)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn("px-2 py-1 rounded-full text-xs font-bold", marginPercent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{marginPercent.toFixed(1)}%</span>
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
    </div>
  )
}
