"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { getDefaultDateRange } from "@/lib/analytics-formatters"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"
import { Users, Calendar, Filter, Download, Search, ChevronDown, ChevronRight, TrendingUp, RefreshCw, X, Play } from "lucide-react"
import { exportRawRows } from "@/lib/export-excel"
import { cn } from "@/lib/utils"
import { SourceBadge } from "@/components/dashboard-kit"
import { useUrlStates } from "@/hooks/use-url-state"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts"

interface StaffRow {
  staff_name:     string
  staff_code:     string
  total_revenue:  number
  hk3_revenue:    number
  customer_count: number
  total_orders:   number
  monthly:        { month: string; revenue: number; hk3_revenue: number }[]
}

interface CustomerRow {
  customer_code:   string
  customer_name:   string
  price_list_name: string | null
  revenue:         number
  hk3_revenue:     number
  order_count:     number
}

const COLORS = ["#003B95","#0052CC","#0065FF","#2684FF","#4C9AFF","#B3D4FF"]
const HK3_COLOR = "#F97316"
const MONTH_COLORS = ["#003B95","#F97316","#10b981","#8b5cf6","#ef4444","#f59e0b"]

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  Strategic: { label: "Strategic", bg: "bg-indigo-100",  text: "text-indigo-700" },
  VIP:       { label: "VIP",       bg: "bg-purple-100",  text: "text-purple-700" },
  Gold:      { label: "Gold",      bg: "bg-amber-100",   text: "text-amber-700"  },
  Silver:    { label: "Silver",    bg: "bg-slate-100",   text: "text-slate-600"  },
}

function fck(n: number) { return formatCompactNumber(n) }

function TierBadge({ pln, tierKeywords }: { pln: string | null; tierKeywords: Record<string, string[]> }) {
  if (!pln) return null
  const p = pln.toUpperCase()
  let matched = ""
  for (const [tier, kws] of Object.entries(tierKeywords)) {
    if ((kws as string[]).some(kw => p.includes(kw.toUpperCase()))) { matched = tier; break }
  }
  if (!matched) matched = "Strategic"
  const cfg = TIER_CONFIG[matched]
  if (!cfg) return null
  return (
    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider mr-1.5 shrink-0", cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  )
}

function MiniSparkline({ data }: { data: StaffRow["monthly"] }) {
  if (!data.length) return <span className="text-slate-300 text-xs">–</span>
  const max = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div className="flex items-end gap-[2px] h-6">
      {data.map(d => (
        <div key={d.month} className="w-2 rounded-sm bg-blue-400 opacity-80"
          style={{ height: `${Math.max(2, (d.revenue / max) * 20)}px` }}
          title={`${d.month}: ${fck(d.revenue)}`}
        />
      ))}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-black text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name}: {fck(p.value)}
        </p>
      ))}
    </div>
  )
}

function StaffPageInner() {
  const def = getDefaultDateRange()

  // URL state (chỉ cập nhật khi Apply)
  const [urlState, setUrlState] = useUrlStates({
    startDate:    def.startDate,
    endDate:      def.endDate,
    channelGroup: "All",
    channel:      "",
    companyCode:  "ALL",
    viewMode:     "fulfilled",
  }, 0)

  // Draft (form) — user đang chỉnh nhưng chưa Apply
  const [draft, setDraft] = useState({
    startDate:    urlState.startDate,
    endDate:      urlState.endDate,
    channelGroup: urlState.channelGroup,
    channel:      urlState.channel,
    companyCode:  urlState.companyCode,
    viewMode:     urlState.viewMode,
  })

  // Applied — đây là giá trị thực sự fetch
  const [applied, setApplied] = useState(draft)

  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied)

  const applyFilters = () => {
    setApplied(draft)
    setUrlState(draft)
  }

  const [channels, setChannels]         = useState<string[]>([])
  const [staffData, setStaffData]       = useState<StaffRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [tierKeywords, setTierKeywords] = useState<Record<string, string[]>>({
    Strategic: ["STRATEGIC"], VIP: ["VIP"], Gold: ["GOLD"], Silver: ["SILVER"],
  })

  // Staff filter (client-side)
  const [staffSearch, setStaffSearch]     = useState("")
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [staffDropOpen, setStaffDropOpen] = useState(false)

  // Expand + customers
  const [expandedStaff, setExpandedStaff]     = useState<string | null>(null)
  const [customers, setCustomers]             = useState<CustomerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [chartView, setChartView]             = useState<"staff" | "customer">("staff")

  const fetchChannels = useCallback(async () => {
    try {
      const p = new URLSearchParams({ channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup })
      const r = await fetch(`/api/channels?${p}`)
      if (r.ok) setChannels(await r.json())
    } catch {}
  }, [applied.channelGroup])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({
        startDate:    applied.startDate,
        endDate:      applied.endDate,
        dataSource:   applied.viewMode,
        channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup,
        channel:      applied.channel,
        companyCode:  applied.companyCode,
      })
      const r = await fetch(`/api/analytics/staff-report?${p}`)
      if (r.ok) setStaffData(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [applied])

  const fetchTierKeywords = useCallback(async () => {
    try {
      const r = await fetch("/api/analytics/quarterly-settings")
      if (r.ok) {
        const d = await r.json()
        if (d?.tierKeywords) setTierKeywords(d.tierKeywords)
      }
    } catch {}
  }, [])

  useEffect(() => { fetchChannels() }, [fetchChannels])
  useEffect(() => { fetchStaff() },   [fetchStaff])
  useEffect(() => { fetchTierKeywords() }, [fetchTierKeywords])

  const toggleExpand = async (staffCode: string) => {
    if (expandedStaff === staffCode) {
      setExpandedStaff(null); setCustomers([]); setChartView("staff"); return
    }
    setExpandedStaff(staffCode); setCustomers([]); setCustomersLoading(true); setChartView("customer")
    try {
      const p = new URLSearchParams({
        staffCode,
        startDate:    applied.startDate,
        endDate:      applied.endDate,
        dataSource:   applied.viewMode,
        channelGroup: applied.channelGroup === "All" ? "" : applied.channelGroup,
        channel:      applied.channel,
        companyCode:  applied.companyCode,
      })
      const r = await fetch(`/api/analytics/staff-report/customers?${p}`)
      if (r.ok) setCustomers(await r.json())
    } catch {} finally { setCustomersLoading(false) }
  }

  // Client-side staff filter
  const displayed = selectedCodes.length > 0
    ? staffData.filter(s => selectedCodes.includes(s.staff_code))
    : staffData

  const staffOptions = staffData.filter(s =>
    !staffSearch ||
    s.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.staff_code.toLowerCase().includes(staffSearch.toLowerCase())
  )

  const totalRevenue   = displayed.reduce((s, r) => s + r.total_revenue, 0)
  const totalHk3       = displayed.reduce((s, r) => s + r.hk3_revenue, 0)
  const totalOrders    = displayed.reduce((s, r) => s + r.total_orders, 0)
  const totalCustomers = displayed.reduce((s, r) => s + r.customer_count, 0)

  // Detect multi-month range
  const isMultiMonth = useMemo(() => {
    const s = new Date(applied.startDate)
    const e = new Date(applied.endDate)
    return s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()
  }, [applied.startDate, applied.endDate])

  // Monthly comparison chart data (aggregate all displayed staff)
  const monthlyComparisonData = useMemo(() => {
    if (!isMultiMonth || !displayed.length) return []
    const agg: Record<string, { revenue: number; hk3: number }> = {}
    displayed.forEach(s => {
      s.monthly.forEach(m => {
        if (!agg[m.month]) agg[m.month] = { revenue: 0, hk3: 0 }
        agg[m.month].revenue += m.revenue
        agg[m.month].hk3 += m.hk3_revenue
      })
    })
    return Object.entries(agg)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: `T${month.slice(5)}/${month.slice(2, 4)}`,
        "Tổng Rev": data.revenue,
        "3HK Rev":  data.hk3,
      }))
  }, [isMultiMonth, displayed])

  const staffChartData = displayed.slice(0, 12).map(s => ({
    name: s.staff_name.length > 12 ? s.staff_name.slice(0, 12) + "…" : s.staff_name,
    "Tổng Rev": s.total_revenue,
    "3HK Rev":  s.hk3_revenue,
  }))
  const custChartData = customers.slice(0, 15).map(c => ({
    name: (c.customer_name || c.customer_code).length > 14
      ? (c.customer_name || c.customer_code).slice(0, 14) + "…"
      : (c.customer_name || c.customer_code),
    "Tổng Rev": c.revenue,
    "3HK Rev":  c.hk3_revenue,
  }))
  const activeChartData = chartView === "customer" && custChartData.length ? custChartData : staffChartData
  const chartTitle = chartView === "customer"
    ? `Breakdown KH — ${staffData.find(s => s.staff_code === expandedStaff)?.staff_name || ""}`
    : "So sánh doanh thu Sales"

  const handleExport = () => {
    const rows = displayed.map((s, i) => ({
      Rank: i + 1,
      "Staff Code": s.staff_code,
      "Staff Name": s.staff_name,
      "Total Revenue": s.total_revenue,
      "3HK Revenue": s.hk3_revenue,
      "3HK %": s.total_revenue > 0 ? +((s.hk3_revenue / s.total_revenue) * 100).toFixed(1) : 0,
      "Customers": s.customer_count,
      "Orders": s.total_orders,
    }))
    exportRawRows(rows, `Staff_Report_${applied.startDate}_to_${applied.endDate}`, "Staff")
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto pb-24 lg:pb-8 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 rotate-3">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Staff Performance</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500 font-medium italic">Doanh thu & KH theo từng sales</p>
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

      {/* ── Filters + Apply ── */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />

        {/* B2B/B2C/All */}
        <div className="flex gap-2">
          {(["All","B2B","B2C"] as const).map(g => (
            <button key={g} onClick={() => setDraft(d => ({ ...d, channelGroup: g, channel: "" }))}
              className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all",
                draft.channelGroup === g
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white")}>
              {g}
            </button>
          ))}
        </div>

        {/* Channel */}
        <select value={draft.channel} onChange={e => setDraft(d => ({ ...d, channel: e.target.value }))}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1 focus:ring-blue-500">
          <option value="">All Channels</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Company */}
        <select value={draft.companyCode} onChange={e => setDraft(d => ({ ...d, companyCode: e.target.value }))}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1 focus:ring-blue-500">
          <option value="ALL">All Companies</option>
          <option value="VN">VN</option>
          <option value="US">US</option>
        </select>

        {/* Staff filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setStaffDropOpen(v => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-all",
              selectedCodes.length > 0
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"
            )}
          >
            <Users className="w-3 h-3" />
            {selectedCodes.length === 0 ? "All Sales" :
             selectedCodes.length === 1 ? (staffData.find(s => s.staff_code === selectedCodes[0])?.staff_name || selectedCodes[0]) :
             `${selectedCodes.length} Sales`}
            {selectedCodes.length > 0 && (
              <span onClick={e => { e.stopPropagation(); setSelectedCodes([]) }}
                className="ml-1 hover:opacity-70"><X className="w-3 h-3" /></span>
            )}
          </button>

          {staffDropOpen && (
            <div className="absolute top-full left-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-72 overflow-auto p-2">
              <div className="sticky top-0 bg-white pb-2 border-b border-slate-100 mb-2 z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Tìm sales..." value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div className="space-y-0.5">
                {staffOptions.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Không có sales</p>
                )}
                {staffOptions.map(s => (
                  <label key={s.staff_code} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={selectedCodes.includes(s.staff_code)}
                      onChange={() => setSelectedCodes(prev =>
                        prev.includes(s.staff_code) ? prev.filter(c => c !== s.staff_code) : [...prev, s.staff_code]
                      )}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <div>
                      <p className="text-[11px] font-bold text-slate-700">{s.staff_name}</p>
                      <p className="text-[9px] text-slate-400">{s.staff_code}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {staffDropOpen && <div className="fixed inset-0 z-40" onClick={() => setStaffDropOpen(false)} />}

        {/* Apply button */}
        <button
          onClick={applyFilters}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black transition-all shadow-sm",
            isDirty
              ? "bg-blue-600 text-white hover:bg-blue-700 animate-pulse"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <Play className="w-3 h-3 fill-white" />
          Apply Filters
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? "Loading…" : `${staffData.length} sales`}
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tổng Revenue", value: fck(totalRevenue), color: "blue" },
          { label: "3HK Revenue",  value: fck(totalHk3),     color: "orange" },
          { label: "Sales",        value: displayed.length,   color: "emerald" },
          { label: "Khách hàng",   value: totalCustomers,     color: "purple" },
        ].map(card => (
          <div key={card.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{card.label}</p>
            <p className={cn("text-2xl font-black",
              card.color === "blue"    && "text-blue-700",
              card.color === "orange"  && "text-orange-600",
              card.color === "emerald" && "text-emerald-600",
              card.color === "purple"  && "text-purple-600",
            )}>{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Monthly Comparison Chart (hiện khi filter nhiều tháng) ── */}
      {isMultiMonth && monthlyComparisonData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">So sánh theo tháng</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {applied.startDate.slice(0,7)} → {applied.endDate.slice(0,7)} · {monthlyComparisonData.length} tháng
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Tổng Rev</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> 3HK Rev</span>
            </div>
          </div>
          <div className="p-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyComparisonData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => fck(v)} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Tổng Rev" fill="#003B95" radius={[4,4,0,0]} maxBarSize={48} />
                <Bar dataKey="3HK Rev"  fill={HK3_COLOR} radius={[4,4,0,0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bar Chart (staff/customer) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">{chartTitle}</h3>
            {chartView === "customer" && (
              <button onClick={() => { setChartView("staff"); setExpandedStaff(null); setCustomers([]) }}
                className="text-xs text-blue-600 font-bold hover:underline mt-0.5">
                ← Về tổng hợp sales
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Tổng Rev</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> 3HK Rev</span>
          </div>
        </div>
        <div className="p-4" style={{ height: 240 }}>
          {activeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => fck(v)} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Tổng Rev" radius={[4,4,0,0]} maxBarSize={40}>
                  {activeChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
                <Bar dataKey="3HK Rev" fill={HK3_COLOR} radius={[4,4,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              {loading ? "Đang tải…" : "Không có dữ liệu"}
            </div>
          )}
        </div>
      </div>

      {/* ── Leaderboard Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Chi tiết từng Sales</h3>
          <p className="text-xs text-slate-500 mt-0.5">Click vào hàng để xem breakdown theo KH</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sales</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Tổng Revenue</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">3HK Revenue</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">3HK %</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">KH</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Đơn</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Trend</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Contr.%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-400">
                  {selectedCodes.length > 0 ? "Sales đã chọn không có dữ liệu trong kỳ này" : "Không có dữ liệu"}
                </td></tr>
              )}
              {displayed.map((s, i) => {
                const hk3Pct = s.total_revenue > 0 ? (s.hk3_revenue / s.total_revenue) * 100 : 0
                const contPct = totalRevenue > 0 ? (s.total_revenue / totalRevenue) * 100 : 0
                const isExpanded = expandedStaff === s.staff_code

                return (
                  <React.Fragment key={s.staff_code}>
                    <tr onClick={() => toggleExpand(s.staff_code)}
                      className={cn("cursor-pointer transition-colors group",
                        isExpanded ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-slate-50")}>
                      <td className="px-4 py-3">
                        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs",
                          i === 0 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                          i === 1 ? "bg-slate-100 text-slate-600 border border-slate-200" :
                          i === 2 ? "bg-orange-50 text-orange-600 border border-orange-100" :
                          "text-slate-400 text-[11px]"
                        )}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-blue-500" />}
                          <div>
                            <p className={cn("text-sm font-black", isExpanded ? "text-blue-700" : "text-slate-900")}>{s.staff_name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{s.staff_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right"><span className="text-sm font-black text-slate-900">{fck(s.total_revenue)}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-sm font-bold text-orange-600">{fck(s.hk3_revenue)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-xs font-black px-2 py-0.5 rounded-full",
                          hk3Pct >= 50 ? "bg-orange-100 text-orange-700" :
                          hk3Pct >= 20 ? "bg-amber-50 text-amber-700" : "text-slate-500"
                        )}>{hk3Pct.toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{s.customer_count}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-500">{s.total_orders.toLocaleString()}</td>
                      <td className="px-4 py-3"><MiniSparkline data={s.monthly} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${contPct}%` }} />
                          </div>
                          <span className="text-xs font-black text-blue-600 w-10 text-right">{contPct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>

                    {/* ── Customer Expand Row ── */}
                    {isExpanded && (
                      <tr><td colSpan={9} className="px-0 py-0">
                        <div className="bg-blue-50/60 border-b border-blue-100 px-6 py-4">
                          {customersLoading ? (
                            <div className="text-xs text-slate-400 py-4 text-center">Đang tải KH…</div>
                          ) : customers.length === 0 ? (
                            <div className="text-xs text-slate-400 py-4 text-center">Không có dữ liệu KH</div>
                          ) : (
                            <>
                              <p className="text-xs font-black text-blue-700 mb-3 uppercase tracking-wider">
                                Breakdown {customers.length} khách hàng — {s.staff_name}
                              </p>
                              <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-blue-50 border-b border-blue-100">
                                      {["#","Khách hàng","Revenue","3HK Rev","3HK %","Đơn","% of Sales"].map(h => (
                                        <th key={h} className={cn("px-4 py-2 text-[10px] font-bold text-blue-600 uppercase tracking-wider", h !== "#" && h !== "Khách hàng" && "text-right")}>{h}</th>
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
                                              <TierBadge pln={c.price_list_name} tierKeywords={tierKeywords} />
                                              <div>
                                                <p className="text-xs font-bold text-slate-800">{c.customer_name}</p>
                                                <p className="text-[9px] text-slate-400">{c.customer_code}</p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-2 text-right text-xs font-black text-slate-900">{fck(c.revenue)}</td>
                                          <td className="px-4 py-2 text-right text-xs font-bold text-orange-600">{fck(c.hk3_revenue)}</td>
                                          <td className="px-4 py-2 text-right">
                                            <span className={cn("text-[10px] font-black", h3p >= 50 ? "text-orange-600" : "text-slate-400")}>{h3p.toFixed(1)}%</span>
                                          </td>
                                          <td className="px-4 py-2 text-right text-xs font-bold text-slate-500">{c.order_count}</td>
                                          <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <div className="w-12 h-1 bg-blue-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${ofS}%` }} />
                                              </div>
                                              <span className="text-[10px] font-black text-blue-600">{ofS.toFixed(1)}%</span>
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
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={2} className="px-4 py-3 text-xs font-black text-slate-700 uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{fck(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-orange-600">{fck(totalHk3)}</td>
                  <td className="px-4 py-3 text-right text-xs font-black text-orange-600">
                    {totalRevenue > 0 ? ((totalHk3 / totalRevenue) * 100).toFixed(1) : 0}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{totalCustomers}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-500">{totalOrders.toLocaleString()}</td>
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
  return (
    <Suspense>
      <StaffPageInner />
    </Suspense>
  )
}
