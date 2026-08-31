"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import {
  ClipboardList, Download, Search, X, ChevronLeft, ChevronRight,
  Calendar, RefreshCw,
} from "lucide-react"
import { exportToExcel }      from "@/lib/export-excel"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  order_date:      string
  staff_name:      string
  customer_name:   string
  order_code:      string
  company_code:    string | null   // VN | US | SG | HK
  order_name:      string
  sim_type:        string
  channel_name:    string
  quantity:        number
  unit_price:      number
  total_revenue:   number
  gross_profit:    number
  price_list_name: string | null
}

const COMPANY_CFG: Record<string, { label: string; flag: string; bg: string; text: string }> = {
  VN: { label: "VN", flag: "🇻🇳", bg: "bg-red-50",    text: "text-red-700"    },
  US: { label: "US", flag: "🇺🇸", bg: "bg-blue-50",   text: "text-blue-700"  },
  SG: { label: "SG", flag: "🇸🇬", bg: "bg-rose-50",   text: "text-rose-700"  },
  HK: { label: "HK", flag: "🇭🇰", bg: "bg-red-50",    text: "text-red-800"   },
}

function CompanyBadge({ code }: { code: string | null }) {
  if (!code) return null
  const cfg = COMPANY_CFG[code.toUpperCase()]
  if (!cfg) return <span className="text-[9px] font-bold text-slate-400">{code}</span>
  return (
    <span className={cn("text-[9px] font-black px-1 py-0.5 rounded uppercase tracking-wider", cfg.bg, cfg.text)}>
      {cfg.flag} {cfg.label}
    </span>
  )
}

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_CFG: Record<string, { bg: string; text: string }> = {
  Strategic: { bg: "bg-indigo-100",  text: "text-indigo-700"  },
  VIP:       { bg: "bg-purple-100",  text: "text-purple-700"  },
  Gold:      { bg: "bg-amber-100",   text: "text-amber-700"   },
  Silver:    { bg: "bg-slate-100",   text: "text-slate-600"   },
  B2C:       { bg: "bg-emerald-100", text: "text-emerald-700" },
}

function classifyTier(pln: string | null, kws: Record<string, string[]>): string {
  if (!pln) return "B2C"
  const up = pln.toUpperCase()
  for (const [t, ks] of Object.entries(kws)) {
    if (ks.some(k => up.includes(k.toUpperCase()))) return t
  }
  return "Strategic"
}

function TierBadge({ pln, kws }: { pln: string | null; kws: Record<string, string[]> }) {
  const tier = classifyTier(pln, kws)
  const c = TIER_CFG[tier]
  if (!c) return null
  return (
    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", c.bg, c.text)}>
      {tier}
    </span>
  )
}

function fmtDate(d: string | null | undefined): string {
  if (!d || typeof d !== "string") return "—"
  // Handle ISO timestamp: "2026-07-29T00:00:00.000Z" → take first 10 chars
  const s = d.slice(0, 10)
  const parts = s.split("-")
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—"
  return new Intl.NumberFormat("vi-VN").format(Math.round(n))
}

const PAGE_SIZE = 50

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrdersPage() {
  // Date state — empty until client sets it (avoid SSR hydration mismatch)
  // Default: range mode (đầu tháng → hôm qua) để đồng bộ với Staff tab
  const [singleDate,   setSingleDate]   = useState("")
  const [startDate,    setStartDate]    = useState("")
  const [endDate,      setEndDate]      = useState("")
  const [dateMode,     setDateMode]     = useState<"day" | "range">("range")
  const [dataSource,   setDataSource]   = useState("fulfilled")

  // Filter state
  const [companyCode,  setCompanyCode]  = useState("")          // "" = ALL, "VN", "US", "SG", "HK"
  const [includeShip,        setIncludeShip]        = useState(false)  // No (default) = loại shipping fee
  const [includeInternalOps, setIncludeInternalOps] = useState(false)  // No (default) = loại internal ops
  const [staffCode,    setStaffCode]    = useState("")
  const [channelGroup, setChannelGroup] = useState("")
  const [channel,      setChannel]      = useState("")
  const [orderSource,  setOrderSource]  = useState("")
  const [search,       setSearch]       = useState("")
  const [page,         setPage]         = useState(1)

  // Data state
  const [rows,    setRows]    = useState<OrderRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [sumRevenue, setSumRevenue] = useState(0)   // tổng toàn kỳ (từ API, không phải page)
  const [sumGp,      setSumGp]      = useState(0)
  const [sumQty,     setSumQty]     = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Reference data
  const [tierKws,      setTierKws]      = useState<Record<string, string[]>>({})
  const [staffList,    setStaffList]    = useState<{ code: string; name: string }[]>([])
  const [channelList,  setChannelList]  = useState<string[]>([])
  const [orderSrcList, setOrderSrcList] = useState<string[]>([])

  // Track if dates have been initialised (client-only)
  const datesReady = useRef(false)

  // ── Init dates on client ─────────────────────────────────────────────────
  // Dùng getDefaultDateRange() để đồng bộ với Staff tab (đầu tháng → hôm qua)
  useEffect(() => {
    const { startDate: s, endDate: e } = getDefaultDateRange()
    const today = new Date().toISOString().split("T")[0]
    setSingleDate(today)
    setStartDate(s)
    setEndDate(e)
    datesReady.current = true
  }, [])

  // ── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/analytics/quarterly-settings")
      .then(r => r.json())
      .then(d => { if (d?.tierKeywords) setTierKws(d.tierKeywords) })
      .catch(() => {})
    fetch("/api/staff")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStaffList(d) })
      .catch(() => {})
    fetch("/api/channels")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setChannelList(
          d.map((x: any) => typeof x === "string" ? x : String(x?.name || x?.channel_name || "")).filter(Boolean)
        )
      })
      .catch(() => {})
    fetch("/api/order-sources")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setOrderSrcList(
          d.map((x: any) => typeof x === "string" ? x : String(x?.name || x?.code || "")).filter(Boolean)
        )
      })
      .catch(() => {})
  }, [])

  // ── Fetch helper ─────────────────────────────────────────────────────────
  async function doFetch(pg: number) {
    if (!datesReady.current) return
    const effectiveDate = dateMode === "day" ? singleDate : null
    const effectiveStart = dateMode === "range" ? startDate : null
    const effectiveEnd   = dateMode === "range" ? endDate   : null
    if (!effectiveDate && (!effectiveStart || !effectiveEnd)) return

    setLoading(true)
    try {
      const qs = new URLSearchParams({ dataSource, page: String(pg), limit: String(PAGE_SIZE) })
      if (effectiveDate) {
        qs.set("date", effectiveDate)
      } else {
        qs.set("startDate", effectiveStart!)
        qs.set("endDate", effectiveEnd!)
      }
      if (companyCode)        qs.set("companyCode", companyCode)
      if (includeShip)        qs.set("includeShip", "1")
      if (includeInternalOps) qs.set("includeInternalOps", "1")
      if (staffCode)    qs.set("staffCode", staffCode)
      if (channelGroup) qs.set("channelGroup", channelGroup)
      if (channel)      qs.set("channel", channel)
      if (orderSource)  qs.set("orderSource", orderSource)

      const res  = await fetch(`/api/analytics/order-report?${qs}`)
      if (!res.ok) { setRows([]); setTotal(0); setSumRevenue(0); setSumGp(0); setSumQty(0); return }
      const json = await res.json()
      setRows(Array.isArray(json.rows) ? json.rows : [])
      setTotal(typeof json.total === "number" ? json.total : 0)
      setSumRevenue(Number(json.totalRevenue) || 0)
      setSumGp(Number(json.totalGp) || 0)
      setSumQty(Number(json.totalQty) || 0)
      setPage(pg)
    } catch {
      setRows([])
      setTotal(0)
      setSumRevenue(0); setSumGp(0); setSumQty(0)
    } finally {
      setLoading(false)
    }
  }

  // ── Trigger fetch when dates ready hoặc toggle phí ship đổi ───────────────
  useEffect(() => {
    if (startDate && endDate) doFetch(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, includeShip, includeInternalOps])

  // ── Client-side search filter ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      (r.order_code  || "").toLowerCase().includes(q) ||
      (r.customer_name || "").toLowerCase().includes(q) ||
      (r.staff_name  || "").toLowerCase().includes(q) ||
      (r.order_name  || "").toLowerCase().includes(q)
    )
  }, [rows, search])

  // KPI = tổng TOÀN KỲ (từ API aggregate), KHÔNG phải chỉ page hiện tại.
  // Khi đang search (client-side, chỉ lọc page hiện tại) → hiển thị tổng của rows đang hiện.
  const isSearching = search.trim().length > 0
  const kpiRevenue = isSearching ? filtered.reduce((s, r) => s + (r.total_revenue || 0), 0) : sumRevenue
  const kpiGp      = isSearching ? filtered.reduce((s, r) => s + (r.gross_profit  || 0), 0) : sumGp
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const EXPORT_PAGE = 5000  // khớp cap server-side/page

      const buildQs = (pg: number) => {
        const qs = new URLSearchParams({ dataSource, export: "1", page: String(pg), limit: String(EXPORT_PAGE) })
        if (dateMode === "day" && singleDate) {
          qs.set("date", singleDate)
        } else if (startDate && endDate) {
          qs.set("startDate", startDate)
          qs.set("endDate", endDate)
        }
        if (companyCode)        qs.set("companyCode", companyCode)
        if (includeShip)        qs.set("includeShip", "1")
        if (includeInternalOps) qs.set("includeInternalOps", "1")
        if (staffCode)    qs.set("staffCode", staffCode)
        if (channelGroup) qs.set("channelGroup", channelGroup)
        if (channel)      qs.set("channel", channel)
        if (orderSource)  qs.set("orderSource", orderSource)
        return qs
      }

      // Loop lấy TẤT CẢ đơn (không chỉ 1 page): fetch page 1 → biết total → fetch tiếp cho hết
      const first = await fetch(`/api/analytics/order-report?${buildQs(1)}`)
      if (!first.ok) return
      const firstJson = await first.json()
      const allRows: OrderRow[] = Array.isArray(firstJson.rows) ? firstJson.rows : []
      const grandTotal = Number(firstJson.total) || allRows.length

      const totalPages = Math.ceil(grandTotal / EXPORT_PAGE)
      for (let pg = 2; pg <= totalPages; pg++) {
        const r = await fetch(`/api/analytics/order-report?${buildQs(pg)}`)
        if (!r.ok) break
        const j = await r.json()
        if (Array.isArray(j.rows) && j.rows.length) allRows.push(...j.rows)
        else break
      }

      if (!allRows.length) return

      const cols = [
        { label: "Date",          key: "order_date"    },
        { label: "Entity",        key: "company_code"  },
        { label: "PIC",           key: "staff_name"    },
        { label: "Order Name",    key: "order_name"    },
        { label: "Customer",      key: "customer_name" },
        { label: "Order ID",      key: "order_code"    },
        { label: "Type",          key: "sim_type"      },
        { label: "Channel",       key: "channel_name"  },
        { label: "Qty",           key: "quantity"      },
        { label: "Unit Price",    key: "unit_price"    },
        { label: "Revenue (VND)", key: "total_revenue" },
        { label: "GP (VND)",      key: "gross_profit"  },
        { label: "Tier",          key: "_tier"         },
      ]
      const exportRows = allRows.map((r: OrderRow) => ({
        ...r,
        order_date: fmtDate(r.order_date),
        _tier: classifyTier(r.price_list_name, tierKws),
      }))
      const label = dateMode === "day" ? singleDate : `${startDate}_${endDate}`
      await exportToExcel(exportRows as Record<string, unknown>[], cols, `Orders_${label}`, "Orders")
    } catch {
      // silently ignore
    } finally {
      setExporting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#003B95]/10">
            <ClipboardList className="h-5 w-5 text-[#003B95]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Orders</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Order detail · PIC · Customer · Channel</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting || rows.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#003B95] border border-[#003B95]/30 rounded-lg hover:bg-[#003B95]/5 disabled:opacity-40 disabled:cursor-not-allowed transition">
          {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 shadow-sm space-y-3">
        {/* Row 1: Entity + date */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Entity pills — đầu dòng */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Entity</label>
            <div className="flex gap-1">
              {[
                { code: "",   label: "All" },
                { code: "VN", label: "🇻🇳 VN" },
                { code: "US", label: "🇺🇸 US" },
              ].map(({ code, label }) => (
                <button key={code} onClick={() => setCompanyCode(code)}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
                    companyCode === code
                      ? "bg-[#003B95] text-white border-[#003B95]"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-[#003B95] hover:text-[#003B95]"
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 self-end mb-0.5" />

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date mode</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
              {(["day", "range"] as const).map(m => (
                <button key={m} onClick={() => setDateMode(m)}
                  className={cn("px-3 py-1 text-xs font-semibold rounded-md transition",
                    dateMode === m ? "bg-white dark:bg-slate-700 text-[#003B95] shadow-sm" : "text-slate-500 dark:text-slate-400")}>
                  {m === "day" ? "Single day" : "Date range"}
                </button>
              ))}
            </div>
          </div>

          {dateMode === "day" ? (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input type="date" value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
              </div>
              <span className="text-slate-400 dark:text-slate-500 pb-1.5">→</span>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">By date</label>
            <select value={dataSource} onChange={e => setDataSource(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <option value="fulfilled">Fulfilled</option>
              <option value="created">Created</option>
            </select>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 self-end mb-0.5" />

          {/* Include ShippingFee: Yes/No — default No (loại phí ship) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide" title="Yes = gồm phí ship vào doanh thu">Include ShippingFee</label>
            <select value={includeShip ? "yes" : "no"} onChange={e => setIncludeShip(e.target.value === "yes")}
              className={cn("text-xs border rounded-lg px-2.5 py-1.5 font-semibold",
                includeShip ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          {/* Include Internal Ops: Yes/No — default No (loại đơn nội bộ) */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide" title="Yes = gồm đơn chuyển nội bộ (INTERNAL-TRANSACTION, revenue=0)">Include Internal Ops</label>
            <select value={includeInternalOps ? "yes" : "no"} onChange={e => setIncludeInternalOps(e.target.value === "yes")}
              className={cn("text-xs border rounded-lg px-2.5 py-1.5 font-semibold",
                includeInternalOps ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                                   : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        {/* Row 2: other filters + Apply */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Group</label>
            <select value={channelGroup} onChange={e => { setChannelGroup(e.target.value); setChannel("") }}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <option value="">All groups</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[120px]">
              <option value="">All channels</option>
              {channelList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">PIC</label>
            <select value={staffCode} onChange={e => setStaffCode(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[130px]">
              <option value="">All PIC</option>
              {staffList.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Source</label>
            <select value={orderSource} onChange={e => setOrderSource(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[120px]">
              <option value="">All sources</option>
              {orderSrcList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={() => doFetch(1)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] text-white text-xs font-semibold rounded-lg hover:bg-[#002d73] transition self-end">
            Apply
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input type="text" placeholder="Search order ID, customer, PIC..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards — tổng TOÀN KỲ (từ API), không phải chỉ trang hiện tại */}
      {(() => {
        const shipNote = (includeShip && includeInternalOps)
          ? "gồm ship + internal ops (khớp báo cáo gốc)"
          : `${includeShip ? "gồm ship" : "loại ship"} · ${includeInternalOps ? "gồm internal" : "loại internal"}`
        return (
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Orders",  value: (isSearching ? filtered.length : total).toLocaleString("vi-VN"),   sub: isSearching ? "trong kết quả search" : "orders (toàn kỳ)" },
          { label: "Total Revenue", value: fmtNum(kpiRevenue),               sub: isSearching ? "trong kết quả search" : `VND · ${shipNote}` },
          { label: "Gross Profit",  value: fmtNum(kpiGp),                    sub: isSearching ? "trong kết quả search" : `VND · ${shipNote}` },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{k.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>
        )
      })()}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {["Date","PIC","Order Name","Customer","Order ID","Type","Channel","Qty","Unit Price","Revenue","GP","Entity","Tier"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-slate-400">
                    <div className="flex justify-center">
                      <div className="animate-spin h-5 w-5 border-2 border-[#003B95] border-t-transparent rounded-full" />
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-slate-400 dark:text-slate-500">
                    No orders found.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((r, i) => (
                <tr key={`${r.order_code || i}-${i}`}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {fmtDate(r.order_date)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                    {r.staff_name || "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <span className="text-slate-500 dark:text-slate-400 truncate block" title={r.order_name || ""}>
                      {r.order_name || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                    {r.customer_name || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{r.order_code || "—"}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.sim_type ? (
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded",
                        r.sim_type.toLowerCase().includes("esim")
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                      )}>
                        {r.sim_type}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {r.channel_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                    {r.quantity != null ? r.quantity.toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                    {r.unit_price ? fmtNum(r.unit_price) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {fmtNum(r.total_revenue)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={cn("font-semibold",
                      (r.gross_profit || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                      {fmtNum(r.gross_profit)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <CompanyBadge code={r.company_code} />
                  </td>
                  <td className="px-3 py-2">
                    <TierBadge pln={r.price_list_name} kws={tierKws} />
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
              Page {page} / {totalPages} · {total.toLocaleString("vi-VN")} orders
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => doFetch(page - 1)} disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition">
                <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pg = start + i
                return (
                  <button key={pg} onClick={() => doFetch(pg)}
                    className={cn("w-7 h-7 text-xs rounded font-medium transition",
                      pg === page
                        ? "bg-[#003B95] text-white"
                        : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300")}>
                    {pg}
                  </button>
                )
              })}
              <button onClick={() => doFetch(page + 1)} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition">
                <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 text-center">
        GP = Gross Profit (Revenue − COGS). Source:{" "}
        {dataSource === "created" ? "fact_sales_revenue · created_date" : "fact_fulfillment_revenue · fulfiled_date"}
      </p>
    </div>
  )
}
