"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Activity, Search, Filter, Download, RefreshCw, Calendar, Package,
  ChevronUp, ChevronDown, Database, BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"

// Port "y hệt" gohub-intel ThreeHKDataUsage. Data qua /api/analytics/query (SELECT-only).
// Bỏ motion/react (không dùng), inline getDefaultDateRange/formatDate.

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  // Mac dinh: ngay 1 thang hien tai -> hom nay.
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = today
  return { startDate: fmt(start), endDate: fmt(end) }
}
const formatDate = (d?: string) => {
  if (!d) return "-"
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("vi-VN")
}

interface DataUsageRecord {
  order_code: string
  iccid: string
  sku: string
  sku_type: string
  data_amount_gb: number
  total_data_gb: number
  usage_pct: number
  first_report_date: string
  activation_date: string
  record_count: number
}

interface SKUMetrics {
  sku: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
}

interface SKUTypeMetrics {
  sku_type: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
}

// Nhóm tốc độ cho gói Unlimited (suy từ offer_name của data_usage_log: high-speed + throttle).
interface SpeedGroupMetrics {
  speed_group: string
  active_sims: number
  total_plan_gb: number
  total_usage_gb: number
  avg_usage_pct: number
}

// Phân nhóm Unlimited theo THROTTLE (5/10 mbps). Chỉ xét gói xác định được datatype.
// - Mã MỚI: datatype = ký tự thứ 8 của SKU → A = 5 mbps, B = 10 mbps.
// - Mã CŨ (kho 3HK, vd EAS43DP1UNLI05D): P1 = 5 mbps, P2 = 10 mbps. PY / khác → bỏ qua.
// ⚠️ TẠM HOÃN (để sau): tách thêm theo LƯỢNG high-speed (500MB/1GB/2GB/Unlimited). Nguồn high-speed =
//    cột throttle của gói (data_usage_log.offer_name, join theo iccid) — đã khảo sát, sẽ làm sau.
function throttleGroupOf(sku: string): string | null {
  const c8 = sku[7]                               // ký tự thứ 8 (mã mới)
  if (c8 === "A") return "Throttle 5 mbps"
  if (c8 === "B") return "Throttle 10 mbps"
  const m = sku.match(/P([12Y])/)                 // mã cũ trong kho
  if (m?.[1] === "1") return "Throttle 5 mbps"
  if (m?.[1] === "2") return "Throttle 10 mbps"
  return null                                     // không xác định datatype → bỏ qua
}

export default function ThreeHKDataUsagePage() {
  const [data, setData] = useState<DataUsageRecord[]>([])
  const [skuMetrics, setSkuMetrics] = useState<SKUMetrics[]>([])
  const [skuTypeMetrics, setSkuTypeMetrics] = useState<SKUTypeMetrics[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSKU, setLoadingSKU] = useState(false)
  const [loadingType, setLoadingType] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [skuPage, setSkuPage] = useState(1)
  const skuPageSize = 10
  const [hasMore, setHasMore] = useState(true)
  const pageSize = 50

  const [activeTab, setActiveTab] = useState<"all" | "Daily" | "Fixed" | "Unlimited">("all")

  const [startDate, setStartDate] = useState<string>(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(() => getDefaultDateRange().endDate)
  const [sortConfig, setSortConfig] = useState<{ key: keyof DataUsageRecord; direction: "asc" | "desc" }>({ key: "first_report_date", direction: "desc" })

  const [skuSort, setSkuSort] = useState<{ key: keyof SKUMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })
  const [skuTypeSort, setSkuTypeSort] = useState<{ key: keyof SKUTypeMetrics; direction: "asc" | "desc" }>({ key: "total_usage_gb", direction: "desc" })

  const [totals, setTotals] = useState({ totalUsage: 0, totalCapacity: 0, avgUsage: 0, count: 0 })

  const runQuery = async (sql: string) => {
    const res = await fetch("/api/analytics/query", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Server error: ${res.status}`)
    }
    return res.json()
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true)
      setError(null)
      try {
        await fetchTotals()
        await fetchSKUTypeMetrics()
        await fetchSKUMetrics()
        await fetchRecords(1, true)
        setSkuPage(1)
      } catch (err) {
        console.error("Error in batch data fetch:", err)
        setError("Network error: Could not reach the server or query timed out.")
      } finally {
        setLoading(false)
      }
    }
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, debouncedSearch, sortConfig, activeTab])

  const sortedSkuMetrics = useMemo(() => {
    const items = [...skuMetrics]
    items.sort((a, b) => {
      const aVal = a[skuSort.key]
      const bVal = b[skuSort.key]
      if (typeof aVal === "number" && typeof bVal === "number") {
        return skuSort.direction === "asc" ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (aStr < bStr) return skuSort.direction === "asc" ? -1 : 1
      if (aStr > bStr) return skuSort.direction === "asc" ? 1 : -1
      return 0
    })
    return items
  }, [skuMetrics, skuSort])

  const paginatedSkuMetrics = useMemo(() => {
    return sortedSkuMetrics.slice((skuPage - 1) * skuPageSize, skuPage * skuPageSize)
  }, [sortedSkuMetrics, skuPage, skuPageSize])

  const sortedSkuTypeMetrics = useMemo(() => {
    const items = [...skuTypeMetrics]
    items.sort((a, b) => {
      const aVal = a[skuTypeSort.key]
      const bVal = b[skuTypeSort.key]
      if (typeof aVal === "number" && typeof bVal === "number") {
        return skuTypeSort.direction === "asc" ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (aStr < bStr) return skuTypeSort.direction === "asc" ? -1 : 1
      if (aStr > bStr) return skuTypeSort.direction === "asc" ? 1 : -1
      return 0
    })
    return items
  }, [skuTypeMetrics, skuTypeSort])

  // Breakdown Unlimited theo throttle (5/10 mbps) — gom skuMetrics (đã lọc Unlimited) theo datatype SKU.
  const speedGroups = useMemo<SpeedGroupMetrics[]>(() => {
    if (activeTab !== "Unlimited") return []
    const acc: Record<string, SpeedGroupMetrics> = {}
    for (const sm of skuMetrics) {
      const group = throttleGroupOf(sm.sku)
      if (!group) continue   // bỏ SKU không xác định datatype
      const g = acc[group] ?? (acc[group] = { speed_group: group, active_sims: 0, total_plan_gb: 0, total_usage_gb: 0, avg_usage_pct: 0 })
      g.active_sims    += sm.active_sims
      g.total_plan_gb  += sm.total_plan_gb
      g.total_usage_gb += sm.total_usage_gb
    }
    const list = Object.values(acc)
    for (const g of list) g.avg_usage_pct = g.total_plan_gb > 0 ? (g.total_usage_gb / g.total_plan_gb) * 100 : 0
    return list.sort((a, b) => a.speed_group.localeCompare(b.speed_group))
  }, [activeTab, skuMetrics])

  const searchClause = () => debouncedSearch ? `
    AND (
      f.order_code ILIKE '%${debouncedSearch.replace(/'/g, "''")}%' OR
      f.iccid ILIKE '%${debouncedSearch.replace(/'/g, "''")}%' OR
      f.sku ILIKE '%${debouncedSearch.replace(/'/g, "''")}%'
    )
  ` : ""
  const tabClause = () => {
    const tabValue = activeTab === "Daily" ? "Daily Data" : activeTab === "Fixed" ? "Fixed Data" : activeTab === "Unlimited" ? "Unlimited Data" : "all"
    return activeTab !== "all" ? `AND sku_type = '${tabValue}'` : ""
  }

  const fetchSKUTypeMetrics = async () => {
    setLoadingType(true)
    try {
      const sql = `
        WITH bundle_starts AS (
          SELECT iccid, order_code, MIN(first_report_date) as bundle_start_date, MAX(sku_type) as sku_type
          FROM fact_data_usage
          WHERE sku IN (SELECT sku FROM dim_sku WHERE vendor = '3HKDATAPOOL')
          GROUP BY iccid, order_code
        ),
        filtered_bundles AS (
          SELECT iccid, order_code, sku_type
          FROM bundle_starts
          WHERE bundle_start_date >= '${startDate}' AND bundle_start_date <= '${endDate}' ${tabClause()}
        ),
        per_bundle_usage AS (
          SELECT fb.sku_type, f.iccid, f.order_code, SUM(f.total_data_gb) as total_usage_gb, MAX(f.data_amount_gb) as total_plan_gb
          FROM fact_data_usage f
          JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
          WHERE 1=1 ${searchClause()}
          GROUP BY 1, 2, 3
        )
        SELECT COALESCE(sku_type, 'Unknown') as sku_type, COUNT(*) as active_sims,
          SUM(total_plan_gb) as total_plan_gb, SUM(total_usage_gb) as total_usage_gb,
          CASE WHEN SUM(total_plan_gb) > 0 THEN (SUM(total_usage_gb) / SUM(total_plan_gb)) * 100 ELSE 0 END as avg_usage_pct
        FROM per_bundle_usage GROUP BY 1 ORDER BY total_usage_gb DESC
      `
      const result = await runQuery(sql)
      setSkuTypeMetrics(result.map((r: any) => ({
        sku_type: r.sku_type,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
    } catch (e) {
      console.error("Error fetching SKU Type metrics:", e); throw e
    } finally {
      setLoadingType(false)
    }
  }

  const fetchSKUMetrics = async () => {
    setLoadingSKU(true)
    try {
      const sql = `
        WITH bundle_starts AS (
          SELECT iccid, order_code, MIN(first_report_date) as bundle_start_date, MAX(sku) as sku, MAX(sku_type) as sku_type
          FROM fact_data_usage
          WHERE sku IN (SELECT sku FROM dim_sku WHERE vendor = '3HKDATAPOOL')
          GROUP BY iccid, order_code
        ),
        filtered_bundles AS (
          SELECT iccid, order_code, sku, sku_type
          FROM bundle_starts
          WHERE bundle_start_date >= '${startDate}' AND bundle_start_date <= '${endDate}' ${tabClause()}
        ),
        per_bundle_usage AS (
          SELECT fb.sku, f.iccid, f.order_code, SUM(f.total_data_gb) as total_usage_gb, MAX(f.data_amount_gb) as total_plan_gb
          FROM fact_data_usage f
          JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
          WHERE 1=1 ${searchClause()}
          GROUP BY 1, 2, 3
        )
        SELECT sku, COUNT(*) as active_sims, SUM(total_plan_gb) as total_plan_gb, SUM(total_usage_gb) as total_usage_gb,
          CASE WHEN SUM(total_plan_gb) > 0 THEN (SUM(total_usage_gb) / SUM(total_plan_gb)) * 100 ELSE 0 END as avg_usage_pct
        FROM per_bundle_usage GROUP BY 1 ORDER BY total_usage_gb DESC
      `
      const result = await runQuery(sql)
      setSkuMetrics(result.map((r: any) => ({
        sku: r.sku,
        active_sims: parseInt(r.active_sims || 0),
        total_plan_gb: parseFloat(r.total_plan_gb || 0),
        total_usage_gb: parseFloat(r.total_usage_gb || 0),
        avg_usage_pct: parseFloat(r.avg_usage_pct || 0),
      })))
    } catch (e) {
      console.error("Error fetching SKU metrics:", e); throw e
    } finally {
      setLoadingSKU(false)
    }
  }

  const fetchTotals = async () => {
    try {
      const sql = `
        WITH bundle_starts AS (
          SELECT iccid, order_code, MIN(first_report_date) as bundle_start_date, MAX(sku_type) as sku_type
          FROM fact_data_usage
          WHERE sku IN (SELECT sku FROM dim_sku WHERE vendor = '3HKDATAPOOL')
          GROUP BY iccid, order_code
        ),
        filtered_bundles AS (
          SELECT iccid, order_code
          FROM bundle_starts
          WHERE bundle_start_date >= '${startDate}' AND bundle_start_date <= '${endDate}' ${tabClause()}
        ),
        per_bundle_usage AS (
          SELECT f.iccid, f.order_code, SUM(f.total_data_gb) as total_usage, MAX(f.data_amount_gb) as capacity
          FROM fact_data_usage f
          JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
          WHERE 1=1 ${searchClause()}
          GROUP BY 1, 2
        )
        SELECT SUM(total_usage) as total_usage, SUM(capacity) as total_capacity,
          CASE WHEN SUM(capacity) > 0 THEN (SUM(total_usage) / SUM(capacity)) * 100 ELSE 0 END as avg_usage,
          COUNT(*) as total_count
        FROM per_bundle_usage
      `
      const result = await runQuery(sql)
      if (result && result[0]) {
        setTotals({
          totalUsage: parseFloat(result[0].total_usage || 0),
          totalCapacity: parseFloat(result[0].total_capacity || 0),
          avgUsage: parseFloat(result[0].avg_usage || 0),
          count: parseInt(result[0].total_count || 0),
        })
      }
    } catch (e) {
      console.error("Error fetching totals:", e); throw e
    }
  }

  const fetchRecords = async (pageNum: number, isNewSearch: boolean = false) => {
    if (isNewSearch) setLoading(true)
    else setLoadingMore(true)

    setError(null)
    try {
      const offset = (pageNum - 1) * pageSize
      const sql = `
        WITH bundle_starts AS (
          SELECT iccid, order_code, MIN(first_report_date) as bundle_start_date, MAX(sku) as sku,
            MAX(sku_type) as sku_type, MAX(activation_date) as activation_date
          FROM fact_data_usage
          WHERE sku IN (SELECT sku FROM dim_sku WHERE vendor = '3HKDATAPOOL')
          GROUP BY iccid, order_code
        ),
        filtered_bundles AS (
          SELECT iccid, order_code, sku, sku_type, bundle_start_date, activation_date
          FROM bundle_starts
          WHERE bundle_start_date >= '${startDate}' AND bundle_start_date <= '${endDate}' ${tabClause()}
        ),
        per_bundle_usage AS (
          SELECT fb.sku, f.iccid, f.order_code, fb.sku_type, fb.bundle_start_date as first_report_date, fb.activation_date,
            SUM(f.total_data_gb) as total_data_gb, MAX(f.data_amount_gb) as data_amount_gb, COUNT(*) as record_count
          FROM fact_data_usage f
          JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
          WHERE 1=1 ${searchClause()}
          GROUP BY 1, 2, 3, 4, 5, 6
        )
        SELECT order_code, iccid, sku, sku_type,
          COALESCE(data_amount_gb, 0) as data_amount_gb,
          COALESCE(total_data_gb, 0) as total_data_gb,
          CASE WHEN data_amount_gb > 0 THEN (total_data_gb / data_amount_gb) * 100 ELSE 0 END as usage_pct,
          first_report_date, activation_date, record_count
        FROM per_bundle_usage
        ORDER BY ${sortConfig.key === "first_report_date" ? "first_report_date" : sortConfig.key} ${sortConfig.direction}
        LIMIT ${pageSize} OFFSET ${offset}
      `
      const result = await runQuery(sql)
      if (Array.isArray(result)) {
        const formatted = result.map((r: any) => ({
          ...r,
          data_amount_gb: parseFloat(r.data_amount_gb || 0),
          total_data_gb: parseFloat(r.total_data_gb || 0),
          usage_pct: parseFloat(r.usage_pct || 0),
        }))
        setData(formatted)
        setHasMore(formatted.length === pageSize)
      }
    } catch (err) {
      console.error("Error fetching 3HK data usage:", err)
      setError("Could not load data usage statistics.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handlePageChange = (pageNum: number) => {
    setPage(pageNum)
    fetchRecords(pageNum, true)
  }

  const handleSort = (key: keyof DataUsageRecord) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }))
    setPage(1)
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-blue-600" />
            3HK Data Usage
          </h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích hành vi &amp; hiệu suất sản phẩm theo kỳ cước</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(["all", "Daily", "Fixed", "Unlimited"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === tab ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {tab === "all" ? "Tất cả" : tab}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search ICCID, Order Code..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm" />
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/20">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-medium focus:outline-none" />
            <span className="text-slate-300 mx-1">—</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-medium focus:outline-none" />
          </div>

          <DatePresets onSelect={(s, e) => { setStartDate(s); setEndDate(e) }} />

          <button onClick={() => { setPage(1); fetchTotals(); fetchSKUMetrics(); fetchSKUTypeMetrics(); fetchRecords(1, true) }}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-all shadow-sm">
            <RefreshCw className={cn("w-5 h-5", (loading || loadingMore || loadingSKU || loadingType) && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><BarChart3 className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Usage</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatNumber(totals.totalUsage)} GB</p>
          <p className="text-xs text-slate-500 mt-1">Actual data consumed</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600"><Database className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Capacity</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatNumber(totals.totalCapacity)} GB</p>
          <p className="text-xs text-slate-500 mt-1">Total data allocated in plans</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600"><RefreshCw className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg. Usage %</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totals.avgUsage.toFixed(1)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, totals.avgUsage)}%` }} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Package className="w-5 h-5" /></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active SIMs</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totals.count.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Sim tracks in this period</p>
        </div>
      </div>

      {/* SKU Type Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-600" />
            Average Usage by SKU Type
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                {([
                  { key: "sku_type" as const, label: "SKU Type", align: "" },
                  { key: "active_sims" as const, label: "Active SIMs", align: "text-center" },
                  { key: "total_plan_gb" as const, label: "Total Plan (GB)", align: "text-right" },
                  { key: "total_usage_gb" as const, label: "Total Actual (GB)", align: "text-right" },
                  { key: "avg_usage_pct" as const, label: "Avg. Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => setSkuTypeSort(prev => ({ key: col.key, direction: prev.key === col.key && prev.direction === "asc" ? "desc" : "asc" }))}>
                    {col.label} {skuTypeSort.key === col.key && (skuTypeSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingType ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : sortedSkuTypeMetrics.length > 0 ? (
                sortedSkuTypeMetrics.map((sm, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-100">{sm.sku_type}</span>
                    </td>
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sm.active_sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                        {sm.avg_usage_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", sm.avg_usage_pct > 80 ? "bg-rose-500" : sm.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, sm.avg_usage_pct)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-6 py-6 text-center text-slate-400 text-sm">No SKU type metrics available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unlimited Breakdown theo nhóm tốc độ (high-speed + throttle) — chỉ tab Unlimited */}
      {activeTab === "Unlimited" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Unlimited — Breakdown theo throttle (5 / 10 mbps)
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Throttle theo mã datatype SKU: mã mới A=5 mbps, B=10 mbps · mã cũ P1=5 mbps, P2=10 mbps. (Tách theo lượng high-speed sẽ bổ sung sau.)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nhóm tốc độ</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Active SIMs</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Plan (GB)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Actual (GB)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Avg. Usage %</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingSKU ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                  ))
                ) : speedGroups.length > 0 ? (
                  speedGroups.map((sg, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-bold text-slate-900 text-sm">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">{sg.speed_group}</span>
                      </td>
                      <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sg.active_sims.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sg.total_plan_gb)}</td>
                      <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sg.total_usage_gb)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={cn("text-sm font-bold", sg.avg_usage_pct > 80 ? "text-rose-600" : sg.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                          {sg.avg_usage_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={cn("h-1.5 rounded-full", sg.avg_usage_pct > 80 ? "bg-rose-500" : sg.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${Math.min(100, sg.avg_usage_pct)}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="px-6 py-6 text-center text-slate-400 text-sm">Không có dữ liệu nhóm Unlimited trong kỳ này</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SKU Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Average Usage by SKU
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                {([
                  { key: "sku" as const, label: "SKU", align: "" },
                  { key: "active_sims" as const, label: "Active SIMs", align: "text-center" },
                  { key: "total_plan_gb" as const, label: "Total Plan (GB)", align: "text-right" },
                  { key: "total_usage_gb" as const, label: "Total Actual (GB)", align: "text-right" },
                  { key: "avg_usage_pct" as const, label: "Avg. Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => setSkuSort(prev => ({ key: col.key, direction: prev.key === col.key && prev.direction === "asc" ? "desc" : "asc" }))}>
                    {col.label} {skuSort.key === col.key && (skuSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingSKU ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : paginatedSkuMetrics.length > 0 ? (
                paginatedSkuMetrics.map((sm, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-bold text-slate-900 text-sm">{sm.sku}</td>
                    <td className="px-6 py-3 text-center text-slate-600 text-sm font-medium">{sm.active_sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-slate-600 text-sm">{formatNumber(sm.total_plan_gb)}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900 text-sm">{formatNumber(sm.total_usage_gb)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn("text-sm font-bold", sm.avg_usage_pct > 80 ? "text-rose-600" : sm.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                        {sm.avg_usage_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", sm.avg_usage_pct > 80 ? "bg-rose-500" : sm.avg_usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, sm.avg_usage_pct)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">No SKU metrics available</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* SKU Pagination */}
        {sortedSkuMetrics.length > skuPageSize && (
          <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {Math.min((skuPage - 1) * skuPageSize + 1, sortedSkuMetrics.length)} to {Math.min(skuPage * skuPageSize, sortedSkuMetrics.length)} of {sortedSkuMetrics.length} SKUs
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setSkuPage(p => Math.max(1, p - 1))} disabled={skuPage === 1}
                className="p-1 border border-slate-200 rounded-lg bg-white disabled:opacity-50 text-slate-500">
                <ChevronUp className="w-4 h-4 -rotate-90" />
              </button>
              <span className="text-xs font-bold text-slate-600 px-2">{skuPage} / {Math.ceil(sortedSkuMetrics.length / skuPageSize)}</span>
              <button onClick={() => setSkuPage(p => Math.min(Math.ceil(sortedSkuMetrics.length / skuPageSize), p + 1))} disabled={skuPage >= Math.ceil(sortedSkuMetrics.length / skuPageSize)}
                className="p-1 border border-slate-200 rounded-lg bg-white disabled:opacity-50 text-slate-500">
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-end gap-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {([
                  { key: "order_code" as const, label: "Order Code", align: "" },
                  { key: "iccid" as const, label: "ICCID", align: "" },
                  { key: "sku" as const, label: "Product / SKU", align: "" },
                  { key: "first_report_date" as const, label: "First Usage", align: "" },
                  { key: "data_amount_gb" as const, label: "Plan (GB)", align: "text-right" },
                  { key: "total_data_gb" as const, label: "Actual (GB)", align: "text-right" },
                  { key: "usage_pct" as const, label: "Usage %", align: "text-right" },
                ]).map(col => (
                  <th key={col.key} className={cn("px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors", col.align)}
                    onClick={() => handleSort(col.key)}>
                    {col.label} {sortConfig.key === col.key && (sortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={7} className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td></tr>
                ))
              ) : data.length > 0 ? (
                data.map((record, idx) => (
                  <tr key={`${record.iccid}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">{record.order_code}</td>
                    <td className="px-6 py-4 text-slate-600 text-sm font-mono">{record.iccid}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-600 font-medium">{record.sku}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{record.sku_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-600 font-bold">{formatDate(record.first_report_date)}</span>
                        <span className="text-[10px] text-slate-400 italic">Acts: {formatDate(record.activation_date)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-600 text-sm">{record.data_amount_gb.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm">{record.total_data_gb.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn("h-1.5 rounded-full", record.usage_pct > 90 ? "bg-rose-500" : record.usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, record.usage_pct)}%` }} />
                        </div>
                        <span className={cn("text-xs font-bold min-w-[40px] text-right", record.usage_pct > 90 ? "text-rose-600" : record.usage_pct > 70 ? "text-amber-600" : "text-emerald-600")}>
                          {record.usage_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Database className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No usage records found for 3HK products in this period</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500 font-medium">
            Showing <span className="text-slate-900">{Math.min((page - 1) * pageSize + 1, totals.count)}</span> to <span className="text-slate-900">{Math.min(page * pageSize, totals.count)}</span> of <span className="text-slate-900">{totals.count.toLocaleString()}</span> records
          </p>

          <div className="flex items-center gap-2">
            <button onClick={() => handlePageChange(Math.max(1, page - 1))} disabled={page === 1 || loading || loadingMore}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              <ChevronUp className="w-4 h-4 -rotate-90" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(totals.count / pageSize)) }).map((_, i) => {
                const totalPages = Math.ceil(totals.count / pageSize)
                let pageNum = 1
                if (totalPages <= 5) pageNum = i + 1
                else if (page <= 3) pageNum = i + 1
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = page - 2 + i

                if (pageNum > totalPages || pageNum < 1) return null

                return (
                  <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                    className={cn("w-9 h-9 rounded-xl text-sm font-bold transition-all",
                      page === pageNum ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm")}>
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button onClick={() => handlePageChange(page + 1)} disabled={page >= Math.ceil(totals.count / pageSize) || loading || loadingMore}
              className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
