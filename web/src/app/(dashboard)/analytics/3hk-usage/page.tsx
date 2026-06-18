"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Activity, Search, Filter, Download, RefreshCw, Calendar,
  Package, ArrowUpDown, ChevronUp, ChevronDown, Database, BarChart3,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber, formatDate, getDefaultDateRange } from "@/lib/analytics-formatters"

interface DataUsageRecord {
  order_code: string; iccid: string; sku: string; sku_type: string
  data_amount_gb: number; total_data_gb: number; usage_pct: number
  first_report_date: string; activation_date: string; record_count: number
}
interface SKUMetrics { sku: string; active_sims: number; total_plan_gb: number; total_usage_gb: number; avg_usage_pct: number }
interface SKUTypeMetrics { sku_type: string; active_sims: number; total_plan_gb: number; total_usage_gb: number; avg_usage_pct: number }

function UsageBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={cn("h-1.5 rounded-full", pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={cn("text-xs font-bold w-10 text-right",
        pct > 80 ? "text-rose-600" : pct > 50 ? "text-amber-600" : "text-emerald-600")}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

function SortableTh({ label, k, sort, onSort, align = "left" }: {
  label: string; k: string
  sort: { key: string; dir: "asc" | "desc" }
  onSort: (k: string) => void; align?: string
}) {
  const isSorted = sort.key === k
  return (
    <th onClick={() => onSort(k)} className={cn("px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none",
      align === "right" && "text-right", align === "center" && "text-center")}>
      <span className={cn("flex items-center gap-1", align === "right" && "justify-end", align === "center" && "justify-center")}>
        {label}
        {isSorted ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
          : <ArrowUpDown className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  )
}

function MetricsTable<T extends { [k: string]: any }>({
  rows, nameKey, nameLabel, loading
}: { rows: T[]; nameKey: string; nameLabel: string; loading: boolean }) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "total_usage_gb", dir: "desc" })
  const toggle = (k: string) => setSort(s => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }))

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av
    return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  }), [rows, sort])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <SortableTh label={nameLabel} k={nameKey} sort={sort} onSort={toggle} />
            <SortableTh label="Active SIMs" k="active_sims" sort={sort} onSort={toggle} align="center" />
            <SortableTh label="Plan (GB)" k="total_plan_gb" sort={sort} onSort={toggle} align="right" />
            <SortableTh label="Actual (GB)" k="total_usage_gb" sort={sort} onSort={toggle} align="right" />
            <SortableTh label="Avg Usage %" k="avg_usage_pct" sort={sort} onSort={toggle} align="right" />
            <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Efficiency</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {loading ? Array(3).fill(0).map((_, i) => (
            <tr key={i} className="animate-pulse">
              <td colSpan={6} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>
            </tr>
          )) : sorted.length === 0 ? (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">Không có dữ liệu</td></tr>
          ) : sorted.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-5 py-3">
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-100 text-sm font-medium">
                  {row[nameKey]}
                </span>
              </td>
              <td className="px-5 py-3 text-center text-sm font-medium text-slate-600">{row.active_sims.toLocaleString()}</td>
              <td className="px-5 py-3 text-right text-sm text-slate-500">{formatNumber(row.total_plan_gb)}</td>
              <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{formatNumber(row.total_usage_gb)}</td>
              <td className="px-5 py-3 text-right">
                <span className={cn("text-sm font-bold",
                  row.avg_usage_pct > 80 ? "text-rose-600" : row.avg_usage_pct > 50 ? "text-amber-600" : "text-emerald-600")}>
                  {row.avg_usage_pct.toFixed(1)}%
                </span>
              </td>
              <td className="px-5 py-3 text-right"><UsageBar pct={row.avg_usage_pct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PAGE_SIZE = 20

export default function ThreeHKUsagePage() {
  const [records, setRecords] = useState<DataUsageRecord[]>([])
  const [skuTypeMetrics, setSkuTypeMetrics] = useState<SKUTypeMetrics[]>([])
  const [skuMetrics, setSkuMetrics] = useState<SKUMetrics[]>([])
  const [totals, setTotals] = useState({ totalUsage: 0, totalCapacity: 0, avgUsage: 0, count: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "Daily" | "Fixed" | "Unlimited">("all")
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState("first_report_date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 500)
    return () => clearTimeout(t)
  }, [searchTerm])

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/3hk-usage/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate, endDate,
          search: debouncedSearch, activeTab,
          sortKey, sortDir,
          page: p, pageSize: PAGE_SIZE,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi tải dữ liệu")
      const d = await res.json()
      setTotals(d.totals)
      setSkuTypeMetrics(d.skuTypeMetrics)
      setSkuMetrics(d.skuMetrics)
      setRecords(d.records)
      setHasMore(d.hasMore)
    } catch (err: any) {
      console.error(err)
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, debouncedSearch, activeTab, sortKey, sortDir])

  useEffect(() => { fetchData(page) }, [startDate, endDate, debouncedSearch, activeTab, sortKey, sortDir, page])

  const handleSort = (k: string) => {
    setSortKey(k)
    setSortDir(s => s === "desc" && sortKey === k ? "asc" : "desc")
    setPage(1)
  }
  const recSort = { key: sortKey, dir: sortDir }

  const exportCsv = () => {
    const headers = ["Order Code", "ICCID", "SKU", "Type", "Plan (GB)", "Actual (GB)", "Usage %", "First Use", "Activation"]
    const rows = [headers.join(","), ...records.map(r => [
      `"${r.order_code}"`, `"${r.iccid}"`, `"${r.sku}"`, `"${r.sku_type}"`,
      r.data_amount_gb.toFixed(2), r.total_data_gb.toFixed(2), r.usage_pct.toFixed(1),
      `"${formatDate(r.first_report_date)}"`, `"${formatDate(r.activation_date)}"`,
    ].join(","))]
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `3HK_Usage_${startDate}_${endDate}.csv`; a.click()
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            3HK Data Usage
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Phân tích hành vi & hiệu suất data theo kỳ cước</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Tab filter */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl">
            {(["all", "Daily", "Fixed", "Unlimited"] as const).map(t => (
              <button key={t} onClick={() => { setActiveTab(t); setPage(1) }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {t === "all" ? "Tất cả" : t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="ICCID, Order Code, SKU..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm" />
          </div>

          {/* Date */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-transparent focus:outline-none text-xs font-medium" />
            <span className="text-slate-300">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-transparent focus:outline-none text-xs font-medium" />
          </div>

          <button onClick={() => fetchData(page)}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
            <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Usage", value: `${formatNumber(totals.totalUsage)} GB`, icon: BarChart3, color: "blue", sub: "Actual data consumed" },
          { label: "Total Capacity", value: `${formatNumber(totals.totalCapacity)} GB`, icon: Database, color: "emerald", sub: "Total data in plans" },
          { label: "Avg Usage %", value: `${totals.avgUsage.toFixed(1)}%`, icon: RefreshCw, color: "amber", sub: null, bar: true },
          { label: "Active SIMs", value: totals.count.toLocaleString(), icon: Package, color: "purple", sub: "SIM bundles this period" },
        ].map((card, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className={cn("p-2 rounded-xl",
                card.color === "blue" ? "bg-blue-50 text-blue-600" :
                card.color === "emerald" ? "bg-emerald-50 text-emerald-600" :
                card.color === "amber" ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600")}>
                <card.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</span>
            </div>
            {loading ? <div className="h-7 w-24 bg-slate-100 animate-pulse rounded" /> :
              <p className="text-xl font-bold text-slate-900">{card.value}</p>}
            {card.bar && !loading && (
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, totals.avgUsage)}%` }} />
              </div>
            )}
            {card.sub && <p className="text-xs text-slate-400 mt-1">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* SKU Type Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Filter className="w-4 h-4 text-purple-600" />
          <h2 className="text-sm font-bold text-slate-800">Average Usage by SKU Type</h2>
        </div>
        <MetricsTable rows={skuTypeMetrics} nameKey="sku_type" nameLabel="SKU Type" loading={loading} />
      </div>

      {/* SKU Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">Average Usage by SKU</h2>
        </div>
        <MetricsTable rows={skuMetrics} nameKey="sku" nameLabel="SKU" loading={loading} />
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Chi tiết từng SIM</h2>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <SortableTh label="Order Code" k="order_code" sort={recSort} onSort={handleSort} />
                <SortableTh label="ICCID" k="iccid" sort={recSort} onSort={handleSort} />
                <SortableTh label="SKU" k="sku" sort={recSort} onSort={handleSort} />
                <SortableTh label="First Use" k="first_report_date" sort={recSort} onSort={handleSort} />
                <SortableTh label="Plan (GB)" k="data_amount_gb" sort={recSort} onSort={handleSort} align="right" />
                <SortableTh label="Actual (GB)" k="total_data_gb" sort={recSort} onSort={handleSort} align="right" />
                <SortableTh label="Usage %" k="usage_pct" sort={recSort} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>
                </tr>
              )) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Database className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Không có dữ liệu 3HK trong khoảng thời gian này</p>
                  </td>
                </tr>
              ) : records.map((r, idx) => (
                <tr key={`${r.iccid}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-900 text-sm">{r.order_code}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs font-mono">{r.iccid}</td>
                  <td className="px-5 py-3">
                    <div className="text-xs font-medium text-slate-700">{r.sku}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{r.sku_type}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-xs font-bold text-slate-600">{formatDate(r.first_report_date)}</div>
                    <div className="text-[10px] text-slate-400 italic">Acts: {formatDate(r.activation_date)}</div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-slate-500">{r.data_amount_gb.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{r.total_data_gb.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right"><UsageBar pct={r.usage_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {totals.count > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totals.count)} / ${totals.count.toLocaleString()} records` : "0 records"}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="p-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-600 px-2">Trang {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={!hasMore || loading}
              className="p-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
