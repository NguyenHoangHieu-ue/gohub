"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  ClipboardList, Download, Search, X, ChevronLeft, ChevronRight,
  Calendar, RefreshCw,
} from "lucide-react"
import { exportToExcel } from "@/lib/export-excel"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"

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
  channel_name:    string
  channel_group:   string
  quantity:        number
  unit_price:      number
  total_revenue:   number
  gross_profit:    number
  price_list_name: string | null
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
const TODAY = new Date().toISOString().split("T")[0]

// Format YYYY-MM-DD → DD/MM/YY
function fmtDate(d: string) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y?.slice(2)}`
}
function fmtNum(n: number) {
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
  return c ? <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", c.bg, c.text)}>{tier}</span> : null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrdersPage() {
  const toast = useToast()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [dateMode,     setDateMode]     = useState<"day" | "range">("day")
  const [singleDate,   setSingleDate]   = useState(TODAY)
  const [startDate,    setStartDate]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]
  })
  const [endDate,      setEndDate]      = useState(TODAY)
  const [staffCode,    setStaffCode]    = useState("")
  const [channelGroup, setChannelGroup] = useState("")
  const [channel,      setChannel]      = useState("")
  const [orderSource,  setOrderSource]  = useState("")
  const [dataSource,   setDataSource]   = useState<"fulfilled"|"created">("fulfilled")
  const [search,       setSearch]       = useState("")
  const [page,         setPage]         = useState(1)

  // ── Data state ────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState<OrderRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [tierKws,    setTierKws]    = useState<Record<string, string[]>>({})
  const [staffList,  setStaffList]  = useState<{ code: string; name: string }[]>([])
  const [channelList,setChannelList]= useState<string[]>([])
  const [orderSrcList,setOrderSrcList] = useState<string[]>([])

  // ── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/analytics/quarterly-settings")
      .then(r => r.json()).then(d => { if (d.tierKeywords) setTierKws(d.tierKeywords) }).catch(() => {})
    fetch("/api/staff").then(r => r.json())
      .then((d: any[]) => { if (Array.isArray(d)) setStaffList(d) }).catch(() => {})
    fetch("/api/channels").then(r => r.json())
      .then((d: any) => { if (Array.isArray(d)) setChannelList(d) }).catch(() => {})
    fetch("/api/order-sources").then(r => r.json())
      .then((d: any[]) => {
        if (Array.isArray(d)) setOrderSrcList(d.map((x: any) => x.name || x).filter(Boolean))
      }).catch(() => {})
  }, [])

  // ── Build query params ────────────────────────────────────────────────────
  const buildParams = useCallback((pg = page, forExport = false) => {
    const qs = new URLSearchParams({ dataSource, page: String(pg), limit: String(PAGE_SIZE) })
    if (dateMode === "day") {
      qs.set("date", singleDate)
    } else {
      qs.set("startDate", startDate)
      qs.set("endDate", endDate)
    }
    if (staffCode)    qs.set("staffCode", staffCode)
    if (channelGroup) qs.set("channelGroup", channelGroup)
    if (channel)      qs.set("channel", channel)
    if (orderSource)  qs.set("orderSource", orderSource)
    if (forExport)    qs.set("export", "1")
    return qs
  }, [dateMode, singleDate, startDate, endDate, staffCode, channelGroup, channel, orderSource, dataSource, page])

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/analytics/order-report?${buildParams(pg)}`)
      const json = await res.json()
      setRows(json.rows || [])
      setTotal(json.total || 0)
      setPage(pg)
    } catch {
      setRows([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // Auto-fetch when single date changes
  useEffect(() => { if (dateMode === "day") fetchData(1) }, [singleDate, dataSource])
  // Fetch on mount
  useEffect(() => { fetchData(1) }, [])

  // ── Client-side search ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.order_code.toLowerCase().includes(q) ||
      r.customer_name.toLowerCase().includes(q) ||
      r.staff_name.toLowerCase().includes(q) ||
      r.order_name?.toLowerCase().includes(q)
    )
  }, [rows, search])

  // ── KPI summary ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    orders:  total,
    revenue: filtered.reduce((s, r) => s + r.total_revenue, 0),
    gp:      filtered.reduce((s, r) => s + r.gross_profit,  0),
  }), [filtered, total])

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const res  = await fetch(`/api/analytics/order-report?${buildParams(1, true)}`)
      const json = await res.json()
      if (!json.rows?.length) { toast.info("No data to export."); return }

      const cols = [
        { label: "Date",         key: "order_date"    },
        { label: "PIC",          key: "staff_name"    },
        { label: "Order Name",   key: "order_name"    },
        { label: "Customer",     key: "customer_name" },
        { label: "Order ID",     key: "order_code"    },
        { label: "Type",         key: "sim_type"      },
        { label: "Channel",      key: "channel_name"  },
        { label: "Group",        key: "channel_group" },
        { label: "Qty",          key: "quantity"      },
        { label: "Unit Price",   key: "unit_price"    },
        { label: "Revenue (VND)",key: "total_revenue" },
        { label: "GP (VND)",     key: "gross_profit"  },
        { label: "Tier",         key: "_tier"         },
      ]
      const exportRows = json.rows.map((r: OrderRow) => {
        const pln = r.price_list_name; let tier = "B2C"
        if (pln) {
          const up = pln.toUpperCase()
          for (const [t, ks] of Object.entries(tierKws)) {
            if ((ks as string[]).some(k => up.includes(k.toUpperCase()))) { tier = t; break }
          }
          if (tier === "B2C") tier = "Strategic"
        }
        return { ...r, order_date: fmtDate(r.order_date), _tier: tier }
      })
      const label = dateMode === "day" ? singleDate : `${startDate}_${endDate}`
      await exportToExcel(exportRows as Record<string, unknown>[], cols, `Orders_${label}`, "Orders")
    } catch {
      toast.error("Export failed.")
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

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
            <p className="text-xs text-slate-500 dark:text-slate-400">Order detail by PIC · Customer · Channel</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !rows.length}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#003B95] border border-[#003B95]/30 rounded-lg hover:bg-[#003B95]/5 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 shadow-sm space-y-3">
        {/* Row 1: Date filter */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Day / Range toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date mode</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
              {(["day", "range"] as const).map(m => (
                <button key={m} onClick={() => setDateMode(m)}
                  className={cn("px-3 py-1 text-xs font-semibold rounded-md transition",
                    dateMode === m ? "bg-white dark:bg-slate-700 text-[#003B95] shadow-sm" : "text-slate-500 dark:text-slate-400"
                  )}>
                  {m === "day" ? "Single day" : "Date range"}
                </button>
              ))}
            </div>
          </div>

          {/* Date input(s) */}
          {dateMode === "day" ? (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input type="date" value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
                max={TODAY}
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
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} max={TODAY}
                  className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
              </div>
            </div>
          )}

          {/* Data source */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">By date</label>
            <select value={dataSource} onChange={e => setDataSource(e.target.value as any)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <option value="fulfilled">Fulfilled</option>
              <option value="created">Created</option>
            </select>
          </div>

          {/* Apply (for range mode) */}
          {dateMode === "range" && (
            <button onClick={() => fetchData(1)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] text-white text-xs font-semibold rounded-lg hover:bg-[#002d73] transition">
              Apply
            </button>
          )}
        </div>

        {/* Row 2: other filters */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Channel Group */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Group</label>
            <select value={channelGroup} onChange={e => { setChannelGroup(e.target.value); setChannel("") }}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <option value="">All groups</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>

          {/* Channel */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[120px]">
              <option value="">All channels</option>
              {channelList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Staff */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">PIC</label>
            <select value={staffCode} onChange={e => setStaffCode(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[130px]">
              <option value="">All PIC</option>
              {staffList.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>

          {/* Order Source */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Source</label>
            <select value={orderSource} onChange={e => setOrderSource(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-w-[120px]">
              <option value="">All sources</option>
              {orderSrcList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <button onClick={() => fetchData(1)}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Orders",   value: kpis.orders.toLocaleString("vi-VN"),  sub: "orders" },
          { label: "Total Revenue",  value: fmtNum(kpis.revenue),                 sub: "VND" },
          { label: "Gross Profit",   value: fmtNum(kpis.gp),                      sub: "VND (= CM1 before op cost)" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{k.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {["Date","PIC","Order Name","Customer","Order ID","Type","Channel","Qty","Unit Price","Revenue","GP","Tier"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} className="py-10 text-center text-slate-400">
                  <div className="flex justify-center"><div className="animate-spin h-5 w-5 border-2 border-[#003B95] border-t-transparent rounded-full" /></div>
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={12} className="py-10 text-center text-slate-400 dark:text-slate-500">
                  No orders found for the selected filters.
                </td></tr>
              )}
              {!loading && filtered.map((r, i) => (
                <tr key={`${r.order_code}-${i}`}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-[11px]">{fmtDate(r.order_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">{r.staff_name}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <span className="text-slate-500 dark:text-slate-400 truncate block" title={r.order_name}>{r.order_name || "—"}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">{r.customer_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-slate-500 dark:text-slate-400 text-[10px]">{r.order_code}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.sim_type && (
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded",
                        r.sim_type.toLowerCase().includes("esim")
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                      )}>{r.sim_type}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.channel_name || "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">{r.quantity?.toLocaleString("vi-VN") || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{r.unit_price ? fmtNum(r.unit_price) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{fmtNum(r.total_revenue)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={cn("font-semibold", r.gross_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                      {fmtNum(r.gross_profit)}
                    </span>
                  </td>
                  <td className="px-3 py-2"><TierBadge pln={r.price_list_name} kws={tierKws} /></td>
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
              <button onClick={() => fetchData(page - 1)} disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pg = start + i
                return (
                  <button key={pg} onClick={() => fetchData(pg)}
                    className={cn("w-7 h-7 text-xs rounded font-medium transition",
                      pg === page ? "bg-[#003B95] text-white" : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                    )}>{pg}</button>
                )
              })}
              <button onClick={() => fetchData(page + 1)} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 text-center">
        GP = Gross Profit (Revenue − COGS). Source: {dataSource === "created" ? "fact_sales_revenue · created_date" : "fact_fulfillment_revenue · fulfiled_date"}
      </p>
    </div>
  )
}
