"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import {
  ClipboardList, Download, Filter, Play, Search, X, ChevronLeft, ChevronRight,
} from "lucide-react"
import { exportToExcel } from "@/lib/export-excel"
import { cn } from "@/lib/utils"
import { useUrlStates } from "@/hooks/use-url-state"

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  order_date:      string
  staff_code:      string
  staff_name:      string
  customer_name:   string
  customer_code:   string
  order_code:      string
  order_name:      string
  sim_type:        string
  quantity:        number
  unit_price:      number
  total_revenue:   number
  gross_profit:    number
  price_list_name: string | null
}

interface ApiResponse {
  rows:  OrderRow[]
  total: number
  page:  number
  limit: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { bg: string; text: string }> = {
  Strategic: { bg: "bg-indigo-100",  text: "text-indigo-700"  },
  VIP:       { bg: "bg-purple-100",  text: "text-purple-700"  },
  Gold:      { bg: "bg-amber-100",   text: "text-amber-700"   },
  Silver:    { bg: "bg-slate-100",   text: "text-slate-600"   },
  B2C:       { bg: "bg-emerald-100", text: "text-emerald-700" },
}

const PAGE_SIZE = 50

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n))
}

function TierBadge({ pln, kws }: { pln: string | null; kws: Record<string, string[]> }) {
  if (!pln) return <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", TIER_CONFIG.B2C.bg, TIER_CONFIG.B2C.text)}>B2C</span>
  const up = pln.toUpperCase()
  let tier = ""
  for (const [t, ks] of Object.entries(kws)) {
    if ((ks as string[]).some(k => up.includes(k.toUpperCase()))) { tier = t; break }
  }
  if (!tier) tier = "Strategic"
  const c = TIER_CONFIG[tier]
  if (!c) return null
  return <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", c.bg, c.text)}>{tier}</span>
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrderReportPage() {
  const def = getDefaultDateRange()

  // ── URL state (applied filters) ───────────────────────────────────────────
  const [urlState, setUrlState] = useUrlStates({
    startDate:    def.startDate,
    endDate:      def.endDate,
    staffCode:    "",
    channelGroup: "",
    companyCode:  "ALL",
    dataSource:   "fulfilled",
    page:         "1",
    search:       "",
  })

  // ── Draft filter state (chưa Apply) ──────────────────────────────────────
  const [draft, setDraft] = useState({
    startDate:    urlState.startDate,
    endDate:      urlState.endDate,
    staffCode:    urlState.staffCode,
    channelGroup: urlState.channelGroup,
    companyCode:  urlState.companyCode,
    dataSource:   urlState.dataSource,
    search:       urlState.search,
  })

  // ── Data state ────────────────────────────────────────────────────────────
  const [data,     setData]     = useState<ApiResponse | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [exporting,setExporting]= useState(false)
  const [staffList,setStaffList]= useState<{ code: string; name: string }[]>([])
  const [tierKws,  setTierKws]  = useState<Record<string, string[]>>({})
  const [search,   setSearch]   = useState(urlState.search)

  // ── Load tier keywords + staff list ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/analytics/quarterly-settings")
      .then(r => r.json())
      .then(d => { if (d.tierKeywords) setTierKws(d.tierKeywords) })
      .catch(() => {})
    fetch("/api/analytics/staff-report?startDate=2020-01-01&endDate=2099-12-31")
      .then(r => r.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          setStaffList(rows.map(r => ({ code: r.staff_code, name: r.staff_name })))
        }
      })
      .catch(() => {})
  }, [])

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (overrides?: Partial<typeof urlState>) => {
    const s = { ...urlState, ...overrides }
    if (!s.startDate || !s.endDate) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        startDate:    s.startDate,
        endDate:      s.endDate,
        ...(s.staffCode   && { staffCode:    s.staffCode   }),
        ...(s.channelGroup && s.channelGroup !== "All" && { channelGroup: s.channelGroup }),
        ...(s.companyCode && s.companyCode !== "ALL"  && { companyCode:  s.companyCode  }),
        ...(s.dataSource  && { dataSource:   s.dataSource  }),
        page:  s.page || "1",
        limit: String(PAGE_SIZE),
      })
      const res = await fetch(`/api/analytics/order-report?${qs}`)
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [urlState])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Apply filters ─────────────────────────────────────────────────────────
  function applyFilters() {
    const next = { ...draft, page: "1", search: search }
    setUrlState(next)
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function goPage(pg: number) {
    const next = { ...urlState, page: String(pg) }
    setUrlState(next)
    fetchData(next)
  }

  // ── Client-side search filter ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!data?.rows) return []
    if (!search.trim()) return data.rows
    const q = search.toLowerCase()
    return data.rows.filter(r =>
      r.order_code.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q) ||
      r.staff_name.toLowerCase().includes(q) ||
      r.order_name.toLowerCase().includes(q)
    )
  }, [data?.rows, search])

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const rows = filtered
    return {
      orders:  rows.length,
      revenue: rows.reduce((s, r) => s + r.total_revenue, 0),
      gp:      rows.reduce((s, r) => s + r.gross_profit,  0),
    }
  }, [filtered])

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const qs = new URLSearchParams({
        startDate:    urlState.startDate,
        endDate:      urlState.endDate,
        ...(urlState.staffCode    && { staffCode:    urlState.staffCode    }),
        ...(urlState.channelGroup && urlState.channelGroup !== "All" && { channelGroup: urlState.channelGroup }),
        ...(urlState.companyCode  && urlState.companyCode !== "ALL"  && { companyCode:  urlState.companyCode  }),
        ...(urlState.dataSource   && { dataSource:   urlState.dataSource   }),
        export: "1",
      })
      const res  = await fetch(`/api/analytics/order-report?${qs}`)
      const json = await res.json() as ApiResponse

      if (!json.rows?.length) return

      const columns = [
        { label: "Ngày",             key: "order_date"    },
        { label: "PIC",              key: "staff_name"    },
        { label: "Tên đơn hàng",     key: "order_name"    },
        { label: "Khách hàng",       key: "customer_name" },
        { label: "Mã Đơn Hàng",      key: "order_code"    },
        { label: "Loại Hàng Hóa",    key: "sim_type"      },
        { label: "Số lượng",         key: "quantity"      },
        { label: "Đơn giá (VND)",    key: "unit_price"    },
        { label: "Tổng tiền (VND)",  key: "total_revenue" },
        { label: "CM1/GP (VND)",     key: "gross_profit"  },
        { label: "Tier KH",          key: "_tier"         },
      ]

      const exportRows = json.rows.map(r => {
        const pln = r.price_list_name
        let tier = "B2C"
        if (pln) {
          const up = pln.toUpperCase()
          for (const [t, ks] of Object.entries(tierKws)) {
            if ((ks as string[]).some(k => up.includes(k.toUpperCase()))) { tier = t; break }
          }
          if (tier === "B2C") tier = "Strategic"
        }
        return { ...r, _tier: tier }
      })

      await exportToExcel(
        exportRows as Record<string, unknown>[],
        columns,
        `order-report_${urlState.startDate}_${urlState.endDate}`,
        "Đơn Hàng",
      )
    } catch {
      // silently fail
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const curPage    = parseInt(urlState.page || "1")

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#003B95]/10">
            <ClipboardList className="h-5 w-5 text-[#003B95]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Order Report</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Chi tiết đơn hàng theo ngày · PIC · Khách hàng</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !data?.rows?.length}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#003B95] border border-[#003B95]/30 rounded-lg hover:bg-[#003B95]/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "Đang xuất..." : "Xuất Excel"}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Khoảng thời gian</label>
            <DatePresets
              onSelect={(s: string, e: string) => setDraft(d => ({ ...d, startDate: s, endDate: e }))}
            />
          </div>

          {/* Staff */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">PIC</label>
            <select
              value={draft.staffCode}
              onChange={e => setDraft(d => ({ ...d, staffCode: e.target.value }))}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[140px]"
            >
              <option value="">Tất cả NV</option>
              {staffList.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Channel Group */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nhóm kênh</label>
            <select
              value={draft.channelGroup}
              onChange={e => setDraft(d => ({ ...d, channelGroup: e.target.value }))}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="">Tất cả</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>

          {/* Data Source */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Theo ngày</label>
            <select
              value={draft.dataSource}
              onChange={e => setDraft(d => ({ ...d, dataSource: e.target.value }))}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="fulfilled">Ngày giao</option>
              <option value="created">Ngày tạo đơn</option>
            </select>
          </div>

          {/* Apply */}
          <button
            onClick={applyFilters}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] text-white text-xs font-semibold rounded-lg hover:bg-[#002d73] transition"
          >
            <Play className="h-3 w-3" />
            Apply
          </button>
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, khách hàng, NV..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {search && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} / {data?.rows?.length || 0} kết quả</span>
          )}
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Tổng đơn",     value: kpis.orders.toLocaleString("vi-VN"),  unit: "đơn hàng" },
          { label: "Tổng doanh thu", value: fmt(kpis.revenue),                   unit: "VND" },
          { label: "CM1 / GP",     value: fmt(kpis.gp),                          unit: "VND" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{k.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{k.unit}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {[
                  "Ngày",
                  "PIC",
                  "Tên đơn hàng",
                  "Khách hàng",
                  "Mã Đơn Hàng",
                  "Loại HH",
                  "SL",
                  "Đơn giá",
                  "Tổng tiền",
                  "CM1/GP",
                  "Tier",
                ].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-[#003B95] border-t-transparent rounded-full" />
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                    <Filter className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Không có dữ liệu trong khoảng thời gian đã chọn</p>
                  </td>
                </tr>
              )}
              {!loading && filtered.map((row, i) => (
                <tr key={`${row.order_code}-${i}`}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{row.order_date}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{row.staff_name}</span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="text-slate-600 dark:text-slate-300 truncate block" title={row.order_name}>{row.order_name || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{row.customer_name}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-slate-600 dark:text-slate-400 text-[10px]">{row.order_code}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn(
                      "text-[9px] font-semibold px-1.5 py-0.5 rounded",
                      row.sim_type?.toLowerCase().includes("esim")
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
                    )}>
                      {row.sim_type || "Other"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700 dark:text-slate-300">
                    {row.quantity?.toLocaleString("vi-VN") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400">
                    {row.unit_price ? fmt(row.unit_price) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {fmt(row.total_revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className={cn("font-semibold", row.gross_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                      {fmt(row.gross_profit)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <TierBadge pln={row.price_list_name} kws={tierKws} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Trang {curPage} / {totalPages} ({data?.total?.toLocaleString("vi-VN")} đơn)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goPage(curPage - 1)}
                disabled={curPage <= 1}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(curPage - 2, totalPages - 4))
                const pg = start + i
                return (
                  <button
                    key={pg}
                    onClick={() => goPage(pg)}
                    className={cn(
                      "w-7 h-7 text-xs rounded font-medium transition",
                      pg === curPage
                        ? "bg-[#003B95] text-white"
                        : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {pg}
                  </button>
                )
              })}
              <button
                onClick={() => goPage(curPage + 1)}
                disabled={curPage >= totalPages}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Note */}
      <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 text-center">
        CM1/GP = Gross Profit (doanh thu - COGS). Chi phí vận hành nhóm không được phân bổ xuống cấp đơn hàng.
        Nguồn: {urlState.dataSource === "created" ? "fact_sales_revenue (ngày tạo đơn)" : "fact_fulfillment_revenue (ngày giao)"}
      </p>
    </div>
  )
}
