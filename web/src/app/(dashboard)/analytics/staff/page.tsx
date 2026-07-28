"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import {
  Users, Calendar, Filter, Download, Search,
  ChevronDown, ChevronRight, RefreshCw, X, Play,
} from "lucide-react"
import { exportRawRows } from "@/lib/export-excel"
import { cn } from "@/lib/utils"
import { SourceBadge } from "@/components/dashboard-kit"
import { useUrlStates } from "@/hooks/use-url-state"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts"

// ─── Types ───────────────────────────────────────────────────────────────────
interface MonthlyItem { month: string; revenue: number; hk3_revenue: number; gross_profit: number }

interface StaffRow {
  staff_name:     string
  staff_code:     string
  total_revenue:  number
  hk3_revenue:    number
  gross_profit:   number
  cm1:            number
  cm1_pct:        number
  customer_count: number
  total_orders:   number
  monthly:        MonthlyItem[]
}

interface CustomerRow {
  customer_code:   string
  customer_name:   string
  price_list_name: string | null
  revenue:         number
  hk3_revenue:     number
  gross_profit:    number
  order_count:     number
  monthly:         MonthlyItem[]
}

// ─── Constants ───────────────────────────────────────────────────────────────
const STAFF_COLORS = [
  "#003B95","#E04E1B","#10b981","#8b5cf6","#f59e0b",
  "#ef4444","#06b6d4","#84cc16","#ec4899","#6366f1",
]
const HK3_COLOR  = "#F97316"
const RANK_STYLE = [
  "bg-amber-100 text-amber-700 border border-amber-200",
  "bg-slate-100 text-slate-600 border border-slate-200",
  "bg-orange-50 text-orange-600 border border-orange-100",
]
const TIER_CONFIG: Record<string, { bg: string; text: string }> = {
  Strategic: { bg: "bg-indigo-100", text: "text-indigo-700" },
  VIP:       { bg: "bg-purple-100", text: "text-purple-700" },
  Gold:      { bg: "bg-amber-100",  text: "text-amber-700"  },
  Silver:    { bg: "bg-slate-100",  text: "text-slate-600"  },
}

function fck(n: number) { return formatCompactNumber(n) }
function pct(n: number) { return n.toFixed(1) + "%" }

function TierBadge({ pln, kws }: { pln: string | null; kws: Record<string, string[]> }) {
  if (!pln) return null
  const up = pln.toUpperCase()
  let tier = ""
  for (const [t, ks] of Object.entries(kws)) {
    if ((ks as string[]).some(k => up.includes(k.toUpperCase()))) { tier = t; break }
  }
  if (!tier) tier = "Strategic"
  const c = TIER_CONFIG[tier]; if (!c) return null
  return (
    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider mr-1.5 shrink-0", c.bg, c.text)}>
      {tier}
    </span>
  )
}

function MiniSparkline({ data }: { data: MonthlyItem[] }) {
  if (!data.length) return <span className="text-slate-300 text-xs">–</span>
  const max = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div className="flex items-end gap-[2px] h-6">
      {data.map(d => (
        <div key={d.month} className="w-2 rounded-sm bg-blue-400 opacity-80"
          style={{ height: `${Math.max(2, (d.revenue / max) * 20)}px` }}
          title={`${d.month}: ${fck(d.revenue)}`} />
      ))}
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-black text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold flex justify-between gap-4">
          <span className="truncate max-w-[120px]">{p.name}</span>
          <span>{fck(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
function StaffPageInner() {
  const def = getDefaultDateRange()
  const [urlState, setUrlState] = useUrlStates({
    startDate: def.startDate, endDate: def.endDate,
    channelGroup: "All", channel: "", companyCode: "ALL", viewMode: "fulfilled",
  }, 0)

  const [draft,   setDraft]   = useState({ ...urlState })
  const [applied, setApplied] = useState({ ...urlState })
  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied)

  const applyFilters = () => { setApplied(draft); setUrlState(draft) }

  const [channels,     setChannels]     = useState<string[]>([])
  const [staffData,    setStaffData]    = useState<StaffRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [tierKeywords, setTierKeywords] = useState<Record<string, string[]>>({
    Strategic: ["STRATEGIC"], VIP: ["VIP"], Gold: ["GOLD"], Silver: ["SILVER"],
  })
  const [staffSearch,   setStaffSearch]   = useState("")
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [staffDropOpen, setStaffDropOpen] = useState(false)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  const [customers,     setCustomers]     = useState<CustomerRow[]>([])
  const [custLoading,   setCustLoading]   = useState(false)

  const fetchChannels = useCallback(async () => {
    try {
      const r = await fetch(`/api/channels?${new URLSearchParams({ channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup })}`)
      if (r.ok) setChannels(await r.json())
    } catch {}
  }, [applied.channelGroup])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/analytics/staff-report?${new URLSearchParams({
        startDate: applied.startDate, endDate: applied.endDate,
        dataSource: applied.viewMode,
        channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup,
        channel: applied.channel, companyCode: applied.companyCode,
      })}`)
      if (r.ok) setStaffData(await r.json())
    } catch {} finally { setLoading(false) }
  }, [applied])

  const fetchTierKeywords = useCallback(async () => {
    try {
      const r = await fetch("/api/analytics/quarterly-settings")
      if (r.ok) { const d = await r.json(); if (d?.tierKeywords) setTierKeywords(d.tierKeywords) }
    } catch {}
  }, [])

  useEffect(() => { fetchChannels() },     [fetchChannels])
  useEffect(() => { fetchStaff() },        [fetchStaff])
  useEffect(() => { fetchTierKeywords() }, [fetchTierKeywords])

  const toggleExpand = async (code: string) => {
    if (expandedStaff === code) { setExpandedStaff(null); setCustomers([]); return }
    setExpandedStaff(code); setCustomers([]); setCustLoading(true)
    try {
      const r = await fetch(`/api/analytics/staff-report/customers?${new URLSearchParams({
        staffCode: code,
        startDate: applied.startDate, endDate: applied.endDate,
        dataSource: applied.viewMode,
        channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup,
        channel: applied.channel, companyCode: applied.companyCode,
      })}`)
      if (r.ok) setCustomers(await r.json())
    } catch {} finally { setCustLoading(false) }
  }

  const displayed = selectedCodes.length > 0
    ? staffData.filter(s => selectedCodes.includes(s.staff_code))
    : staffData
  const staffOptions = staffData.filter(s =>
    !staffSearch || s.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.staff_code.toLowerCase().includes(staffSearch.toLowerCase()))

  const totRev  = displayed.reduce((a, r) => a + r.total_revenue, 0)
  const totHk3  = displayed.reduce((a, r) => a + r.hk3_revenue, 0)
  const totGP   = displayed.reduce((a, r) => a + r.gross_profit, 0)
  const totCM1  = displayed.reduce((a, r) => a + r.cm1, 0)
  const totOrds = displayed.reduce((a, r) => a + r.total_orders, 0)
  const totCust = displayed.reduce((a, r) => a + r.customer_count, 0)

  // ─── Months in range ────────────────────────────────────────────────────
  const monthsInRange = useMemo(() => {
    const s = new Date(applied.startDate), e = new Date(applied.endDate)
    const list: string[] = []
    const cur = new Date(s.getFullYear(), s.getMonth(), 1)
    const last = new Date(e.getFullYear(), e.getMonth(), 1)
    while (cur <= last) {
      list.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`)
      cur.setMonth(cur.getMonth() + 1)
    }
    return list
  }, [applied.startDate, applied.endDate])

  const isMultiMonth = monthsInRange.length > 1

  // ─── Monthly comparison: stacked bar per month, each segment = 1 sales ──
  const staffMonthlyChart = useMemo(() => {
    if (!isMultiMonth || !displayed.length) return []
    const top = displayed.slice(0, 8) // tối đa 8 sales để chart dễ đọc
    return monthsInRange.map(month => {
      const row: Record<string, any> = { month: `T${month.slice(5)}/${month.slice(2,4)}` }
      top.forEach(s => {
        const m = s.monthly.find(x => x.month === month)
        row[s.staff_name.length > 10 ? s.staff_name.slice(0,10)+"…" : s.staff_name] = m?.revenue || 0
      })
      return row
    })
  }, [isMultiMonth, displayed, monthsInRange])

  // ─── Customer monthly chart (khi có expanded) ───────────────────────────
  const custMonthlyChart = useMemo(() => {
    if (!isMultiMonth || !customers.length) return []
    const top = customers.slice(0, 8)
    return monthsInRange.map(month => {
      const row: Record<string, any> = { month: `T${month.slice(5)}/${month.slice(2,4)}` }
      top.forEach(c => {
        const name = (c.customer_name || c.customer_code)
        const label = name.length > 12 ? name.slice(0,12)+"…" : name
        const m = c.monthly.find(x => x.month === month)
        row[label] = m?.revenue || 0
      })
      return row
    })
  }, [isMultiMonth, customers, monthsInRange])

  // ─── Export ─────────────────────────────────────────────────────────────
  const exportStaff = () => {
    const rows = displayed.map((s, i) => ({
      Rank: i + 1, "Staff Code": s.staff_code, "Staff Name": s.staff_name,
      "Total Revenue": s.total_revenue, "3HK Revenue": s.hk3_revenue,
      "3HK %": s.total_revenue > 0 ? +((s.hk3_revenue / s.total_revenue)*100).toFixed(1) : 0,
      "Gross Profit": s.gross_profit, "CM1": +s.cm1.toFixed(0),
      "CM1 %": +s.cm1_pct.toFixed(1),
      "Customers": s.customer_count, "Orders": s.total_orders,
    }))
    exportRawRows(rows, `Staff_Report_${applied.startDate}_${applied.endDate}`, "Staff")
  }

  const exportCustomers = (staffName: string) => {
    if (!customers.length) return
    const rows = customers.map((c, i) => ({
      Rank: i + 1, "Customer Code": c.customer_code, "Customer Name": c.customer_name,
      "Tier": (() => {
        if (!c.price_list_name) return ""
        const up = c.price_list_name.toUpperCase()
        for (const [t, ks] of Object.entries(tierKeywords))
          if ((ks as string[]).some(k => up.includes(k.toUpperCase()))) return t
        return "Strategic"
      })(),
      "Revenue": c.revenue, "3HK Revenue": c.hk3_revenue,
      "3HK %": c.revenue > 0 ? +((c.hk3_revenue/c.revenue)*100).toFixed(1) : 0,
      "Gross Profit": c.gross_profit, "Orders": c.order_count,
    }))
    exportRawRows(rows, `Staff_${staffName}_Customers_${applied.startDate}_${applied.endDate}`, "Customers")
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 rotate-3">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Staff Performance</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500 font-medium italic">Doanh thu, GP & CM1 theo từng sales</p>
              <SourceBadge source="admin" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(["fulfilled","created"] as const).map(m => (
              <button key={m} onClick={() => setDraft(d => ({ ...d, viewMode: m }))}
                className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                  draft.viewMode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {m === "fulfilled" ? "Fulfilled" : "Created"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={draft.startDate}
              onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0" />
            <span className="text-slate-300">→</span>
            <input type="date" value={draft.endDate}
              onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0" />
          </div>
          <DatePresets onSelect={(s, e) => setDraft(d => ({ ...d, startDate: s, endDate: e }))} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex gap-2">
          {(["All","B2B","B2C"] as const).map(g => (
            <button key={g} onClick={() => setDraft(d => ({ ...d, channelGroup: g, channel: "" }))}
              className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all",
                draft.channelGroup === g ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white")}>
              {g}
            </button>
          ))}
        </div>
        <select value={draft.channel} onChange={e => setDraft(d => ({ ...d, channel: e.target.value }))}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1">
          <option value="">All Channels</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={draft.companyCode} onChange={e => setDraft(d => ({ ...d, companyCode: e.target.value }))}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1">
          <option value="ALL">All Companies</option>
          <option value="VN">VN</option><option value="US">US</option>
        </select>
        {/* Staff filter */}
        <div className="relative">
          <button onClick={() => setStaffDropOpen(v => !v)}
            className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-all",
              selectedCodes.length > 0 ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white")}>
            <Users className="w-3 h-3" />
            {selectedCodes.length === 0 ? "All Sales" :
             selectedCodes.length === 1 ? (staffData.find(s => s.staff_code === selectedCodes[0])?.staff_name || selectedCodes[0]) :
             `${selectedCodes.length} Sales`}
            {selectedCodes.length > 0 && (
              <span onClick={e => { e.stopPropagation(); setSelectedCodes([]) }} className="ml-1 hover:opacity-70">
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
          {staffDropOpen && (
            <div className="absolute top-full left-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-72 overflow-auto p-2">
              <div className="sticky top-0 bg-white pb-2 border-b border-slate-100 mb-2 z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Tìm sales..." value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600" />
                </div>
              </div>
              {staffOptions.map(s => (
                <label key={s.staff_code} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={selectedCodes.includes(s.staff_code)}
                    onChange={() => setSelectedCodes(prev =>
                      prev.includes(s.staff_code) ? prev.filter(c => c !== s.staff_code) : [...prev, s.staff_code])}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600" />
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">{s.staff_name}</p>
                    <p className="text-[9px] text-slate-400">{s.staff_code}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        {staffDropOpen && <div className="fixed inset-0 z-40" onClick={() => setStaffDropOpen(false)} />}

        <button onClick={applyFilters}
          className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black transition-all shadow-sm bg-blue-600 text-white hover:bg-blue-700",
            isDirty && "animate-pulse")}>
          <Play className="w-3 h-3 fill-white" /> Apply Filters
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? "Loading…" : `${staffData.length} sales`}
          </div>
          <button onClick={exportStaff}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
            <Download className="w-3.5 h-3.5" /> Export All
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: "Tổng Revenue",  value: fck(totRev),  color: "blue"    },
          { label: "3HK Revenue",   value: fck(totHk3),  color: "orange"  },
          { label: "Gross Profit",  value: fck(totGP),   color: "emerald" },
          { label: "CM1",           value: fck(totCM1),  color: "indigo"  },
          { label: "Sales",         value: displayed.length, color: "purple" },
          { label: "Khách hàng",    value: totCust,      color: "sky"     },
        ].map(card => (
          <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{card.label}</p>
            <p className={cn("text-xl font-black",
              card.color === "blue"    && "text-blue-700",
              card.color === "orange"  && "text-orange-600",
              card.color === "emerald" && "text-emerald-600",
              card.color === "indigo"  && "text-indigo-700",
              card.color === "purple"  && "text-purple-600",
              card.color === "sky"     && "text-sky-600",
            )}>{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly comparison chart — stacked per sales */}
      {isMultiMonth && staffMonthlyChart.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">So sánh theo tháng — Revenue từng Sales</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {applied.startDate.slice(0,7)} → {applied.endDate.slice(0,7)} · {monthsInRange.length} tháng
                {displayed.length > 8 && <span className="ml-1 text-amber-600">(Top 8 sales)</span>}
              </p>
            </div>
          </div>
          <div className="p-4" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffMonthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => fck(v)} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {displayed.slice(0,8).map((s, i) => (
                  <Bar key={s.staff_code}
                    dataKey={s.staff_name.length > 10 ? s.staff_name.slice(0,10)+"…" : s.staff_name}
                    stackId="a" fill={STAFF_COLORS[i % STAFF_COLORS.length]}
                    radius={i === Math.min(7, displayed.length-1) ? [4,4,0,0] : [0,0,0,0]}
                    maxBarSize={60} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Customer monthly chart — khi có sales expanded và multi-month */}
      {isMultiMonth && expandedStaff && custMonthlyChart.length > 0 && (
        <div className="bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-blue-100">
            <h3 className="text-sm font-black text-blue-900">
              Khách hàng theo tháng — {staffData.find(s => s.staff_code === expandedStaff)?.staff_name}
            </h3>
            <p className="text-xs text-blue-600 mt-0.5">Revenue từng KH qua {monthsInRange.length} tháng
              {customers.length > 8 && <span className="ml-1">(Top 8 KH)</span>}</p>
          </div>
          <div className="p-4" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={custMonthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e7ff" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#4338ca", fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => fck(v)} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {customers.slice(0,8).map((c, i) => {
                  const name = (c.customer_name || c.customer_code)
                  const label = name.length > 12 ? name.slice(0,12)+"…" : name
                  return (
                    <Bar key={c.customer_code} dataKey={label} stackId="b"
                      fill={STAFF_COLORS[i % STAFF_COLORS.length]}
                      radius={i === Math.min(7, customers.length-1) ? [4,4,0,0] : [0,0,0,0]}
                      maxBarSize={60} />
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Chi tiết từng Sales</h3>
          <p className="text-xs text-slate-500 mt-0.5">Click hàng để xem breakdown KH · CM1 = GP trừ chi phí nhóm kênh (B2B/B2C)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["#","Sales","Tổng Rev","3HK Rev","3HK%","GP","CM1","CM1%","KH","Đơn","Trend","Contr%"].map((h,i) => (
                  <th key={h} className={cn("px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider", i>1 && "text-right", i<=1 && i>0 && "")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.length === 0 && !loading && (
                <tr><td colSpan={12} className="px-6 py-8 text-center text-sm text-slate-400">Không có dữ liệu</td></tr>
              )}
              {displayed.map((s, i) => {
                const hk3p    = s.total_revenue > 0 ? (s.hk3_revenue / s.total_revenue) * 100 : 0
                const contp   = totRev > 0 ? (s.total_revenue / totRev) * 100 : 0
                const isExp   = expandedStaff === s.staff_code
                return (
                  <React.Fragment key={s.staff_code}>
                    <tr onClick={() => toggleExpand(s.staff_code)}
                      className={cn("cursor-pointer transition-colors group", isExp ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-slate-50")}>
                      <td className="px-4 py-3">
                        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs",
                          i < 3 ? RANK_STYLE[i] : "text-slate-400 text-[11px]")}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExp ? <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
                                 : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-blue-500" />}
                          <div>
                            <p className={cn("text-sm font-black", isExp ? "text-blue-700" : "text-slate-900")}>{s.staff_name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{s.staff_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{fck(s.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-orange-600">{fck(s.hk3_revenue)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-xs font-black px-2 py-0.5 rounded-full",
                          hk3p >= 50 ? "bg-orange-100 text-orange-700" : hk3p >= 20 ? "bg-amber-50 text-amber-700" : "text-slate-500")}>
                          {pct(hk3p)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{fck(s.gross_profit)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-indigo-600">{fck(s.cm1)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-xs font-black px-2 py-0.5 rounded-full",
                          s.cm1_pct >= 15 ? "bg-indigo-100 text-indigo-700" : s.cm1_pct > 0 ? "text-indigo-600" : "text-rose-600")}>
                          {pct(s.cm1_pct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{s.customer_count}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-500">{s.total_orders.toLocaleString()}</td>
                      <td className="px-4 py-3"><MiniSparkline data={s.monthly} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${contp}%` }} />
                          </div>
                          <span className="text-xs font-black text-blue-600 w-9 text-right">{pct(contp)}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Customer expand */}
                    {isExp && (
                      <tr><td colSpan={12} className="px-0 py-0">
                        <div className="bg-blue-50/60 border-b border-blue-100 px-6 py-4">
                          {custLoading ? (
                            <div className="text-xs text-slate-400 py-4 text-center">Đang tải KH…</div>
                          ) : customers.length === 0 ? (
                            <div className="text-xs text-slate-400 py-4 text-center">Không có dữ liệu KH</div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-black text-blue-700 uppercase tracking-wider">
                                  Breakdown {customers.length} KH — {s.staff_name}
                                </p>
                                <button onClick={() => exportCustomers(s.staff_name)}
                                  className="flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors">
                                  <Download className="w-3 h-3" /> Export KH
                                </button>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-blue-50 border-b border-blue-100">
                                      {["#","Khách hàng","Revenue","3HK Rev","3HK%","GP","% of Sales"].map(h => (
                                        <th key={h} className={cn("px-4 py-2 text-[10px] font-bold text-blue-600 uppercase tracking-wider",
                                          h !== "#" && h !== "Khách hàng" && "text-right")}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-blue-50">
                                    {customers.map((c, ci) => {
                                      const h3p = c.revenue > 0 ? (c.hk3_revenue / c.revenue) * 100 : 0
                                      const ofS = s.total_revenue > 0 ? (c.revenue / s.total_revenue) * 100 : 0
                                      return (
                                        <tr key={c.customer_code} className="hover:bg-blue-50/40 transition-colors">
                                          <td className="px-4 py-2 text-[10px] font-bold text-slate-400">{ci + 1}</td>
                                          <td className="px-4 py-2">
                                            <div className="flex items-center gap-1">
                                              <TierBadge pln={c.price_list_name} kws={tierKeywords} />
                                              <div>
                                                <p className="text-xs font-bold text-slate-800">{c.customer_name}</p>
                                                <p className="text-[9px] text-slate-400">{c.customer_code}</p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-2 text-right text-xs font-black text-slate-900">{fck(c.revenue)}</td>
                                          <td className="px-4 py-2 text-right text-xs font-bold text-orange-600">{fck(c.hk3_revenue)}</td>
                                          <td className="px-4 py-2 text-right">
                                            <span className={cn("text-[10px] font-black", h3p >= 50 ? "text-orange-600" : "text-slate-400")}>{pct(h3p)}</span>
                                          </td>
                                          <td className="px-4 py-2 text-right text-xs font-bold text-emerald-600">{fck(c.gross_profit)}</td>
                                          <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <div className="w-12 h-1 bg-blue-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${ofS}%` }} />
                                              </div>
                                              <span className="text-[10px] font-black text-blue-600">{pct(ofS)}</span>
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                )
              })}

              {/* Total row */}
              {displayed.length > 0 && (
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-black">
                  <td colSpan={2} className="px-4 py-3 text-xs uppercase tracking-wider text-slate-700">Tổng cộng</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-900">{fck(totRev)}</td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">{fck(totHk3)}</td>
                  <td className="px-4 py-3 text-right text-xs text-orange-600">{totRev>0?pct((totHk3/totRev)*100):"0%"}</td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-700">{fck(totGP)}</td>
                  <td className="px-4 py-3 text-right text-sm text-indigo-700">{fck(totCM1)}</td>
                  <td className="px-4 py-3 text-right text-xs text-indigo-700">{totRev>0?pct((totCM1/totRev)*100):"0%"}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">{totCust}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-500">{totOrds.toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function StaffPerformancePage() {
  return <Suspense><StaffPageInner /></Suspense>
}
