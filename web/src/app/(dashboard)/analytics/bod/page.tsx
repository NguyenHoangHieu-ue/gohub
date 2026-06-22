"use client"

import React, { useState, useEffect } from "react"
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts"
import { ArrowUpRight, ArrowDownRight, Filter, TrendingUp, Download, RefreshCw, ChevronDown, Check } from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"
import { SourceBadge } from "@/components/dashboard-kit"
import { useSession } from "next-auth/react"

function getDefaultDateRange() {
  const today = new Date()
  const d = today.getDate()
  const fmt = (dt: Date) => dt.toISOString().split("T")[0]
  if (d <= 7) {
    return { startDate: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) }
  }
  return { startDate: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: fmt(new Date(today.getFullYear(), today.getMonth(), d - 1)) }
}

function cn(...c: (string | boolean | undefined)[]) { return c.filter(Boolean).join(" ") }
const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse bg-slate-200 rounded", className)} />

// Multi-select dropdown cho filter BOD (vendors/subchannels/groups/product types)
function MultiSelect({ label, options, selected, onToggle, onClear, open, setOpen }: {
  label: string; options: string[]; selected: string[]
  onToggle: (v: string) => void; onClear: () => void; open: boolean; setOpen: () => void
}) {
  return (
    <div className="space-y-1 relative">
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      <div onClick={setOpen} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-100">
        <span className="truncate max-w-[120px]">{selected.length === 0 ? `All ${label}` : selected.length === 1 ? selected[0] : `${selected.length} selected`}</span>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto p-2">
          <div className="flex items-center justify-between p-1 mb-1 border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
            <button onClick={(e) => { e.stopPropagation(); onClear() }} className="text-[10px] text-blue-600 font-bold hover:underline">Clear</button>
          </div>
          {options.map(o => (
            <div key={o} onClick={(e) => { e.stopPropagation(); onToggle(o) }}
              className={cn("flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-sm", selected.includes(o) ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50 text-slate-600")}>
              <span className="truncate">{o}</span>
              {selected.includes(o) && <Check className="w-4 h-4 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface BODSummary {
  total_revenue: number; total_cogs: number; total_margin: number
  total_units: number; total_gpm2: number; total_target_revenue?: number
  avg_margin_percent: number; avg_gpm2_percent: number
  previous_period?: BODSummary; previous_year?: BODSummary
}
interface BODDataPoint { date: string; revenue: number; cogs?: number; margin: number; margin_percent: number; gpm2: number; gpm2_percent?: number; prev_revenue?: number }
interface GroupMargin { group: string; revenue: number; cogs: number; margin: number; units: number; orders: number; margin_percent: number; gpm2: number; gpm2_percent: number; prev_revenue?: number }
interface ChannelPerf { group: string; channel: string; revenue: number; cogs: number; margin: number; units: number; orders: number; margin_percent: number; gpm2: number; gpm2_percent: number }

export default function BODReportPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"  // chú thích methodology chỉ admin thấy
  const [summary, setSummary]               = useState<BODSummary | null>(null)
  const [data, setData]                     = useState<BODDataPoint[]>([])
  const [groupMargins, setGroupMargins]     = useState<GroupMargin[]>([])
  const [channelPerf, setChannelPerf]       = useState<ChannelPerf[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [startDate, setStartDate]           = useState(() => getDefaultDateRange().startDate)
  const [endDate, setEndDate]               = useState(() => getDefaultDateRange().endDate)
  const [dateColumn, setDateColumn]         = useState<"fulfiled_date" | "created_date">("fulfiled_date")
  const [comparisonType, setComparisonType] = useState<"none" | "previous_period" | "previous_year">("none")
  const [showFilters, setShowFilters]       = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Filters nâng cao (port từ intel BODReport)
  const [vendors, setVendors]                         = useState<string[]>([])
  const [selectedVendors, setSelectedVendors]         = useState<string[]>([])
  const [subChannels, setSubChannels]                 = useState<string[]>([])
  const [selectedSubChannels, setSelectedSubChannels] = useState<string[]>([])
  const [productTypes, setProductTypes]               = useState<string[]>([])
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([])
  const [selectedChannelGroups, setSelectedChannelGroups] = useState<string[]>([])
  const [openDd, setOpenDd]                           = useState<string | null>(null)

  const toggleVal = (v: string, list: string[], set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  // Nạp options filter (vendors/subchannels/product types) từ gohub_dw qua endpoint query chung
  useEffect(() => {
    const rq = (sql: string) => fetch("/api/analytics/query", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }),
    }).then(r => r.ok ? r.json() : []).catch(() => [])
    Promise.all([
      rq("SELECT DISTINCT vendor FROM dim_sku WHERE vendor IS NOT NULL AND vendor != '' ORDER BY 1"),
      rq("SELECT DISTINCT sapo_name FROM dim_order_source WHERE sapo_name IS NOT NULL AND sapo_name != '' ORDER BY 1"),
      rq("SELECT DISTINCT category_name FROM dim_sku WHERE category_name IS NOT NULL AND category_name != '' ORDER BY 1"),
    ]).then(([v, sc, pt]) => {
      setVendors(v.map((r: any) => r.vendor))
      setSubChannels(sc.map((r: any) => r.sapo_name))
      setProductTypes(pt.map((r: any) => r.category_name))
    })
  }, [])

  const toggleGroup = (g: string) => setExpandedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const getProjectionFactor = () => {
    if (!summary) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const end = new Date(endDate), start = new Date(startDate)
    const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
    const isCurrentMonth = end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear()
    const targetDays = isCurrentMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : daysElapsed
    const factor = targetDays / daysElapsed
    if (factor <= 1) return null
    return {
      factor, daysElapsed, totalDays: targetDays,
      revenue: summary.total_revenue * factor,
      margin:  summary.total_margin  * factor,
      gpm2:    summary.total_gpm2    * factor,
      gpm2Percent: summary.total_revenue > 0 ? (summary.total_gpm2 / summary.total_revenue) * 100 : 0,
    }
  }
  const projection = getProjectionFactor()

  const getComparison = (key: keyof BODSummary): number | null => {
    const ref = comparisonType === "previous_period" ? summary?.previous_period : summary?.previous_year
    return ref ? (ref[key] as number) : null
  }
  const pctChange = (a: number, b: number | null) => b === null || b === 0 ? null : ((a - b) / b) * 100

  const fetchData = async () => {
    setLoading(true); setError(null)
    const q  = `?startDate=${startDate}&endDate=${endDate}&comparisonType=${comparisonType}&dateColumn=${dateColumn}`
      + `&vendors=${encodeURIComponent(selectedVendors.join(","))}`
      + `&subChannels=${encodeURIComponent(selectedSubChannels.join(","))}`
      + `&channelGroups=${encodeURIComponent(selectedChannelGroups.join(","))}`
      + `&productTypes=${encodeURIComponent(selectedProductTypes.join(","))}`
    const fj = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
    try {
      // Phase 1: summary (KPI cards visible immediately)
      const sum = await fj(`/api/analytics/bod-summary${q}`)
      setSummary(sum); setLoading(false)
      // Phase 2: charts + tables
      const [rep, grp, ch] = await Promise.all([
        fj(`/api/analytics/bod-report${q}`),
        fj(`/api/analytics/bod-group-margin${q}`),
        fj(`/api/analytics/bod-channel-performance${q}`),
      ])
      setData(rep); setGroupMargins(grp); setChannelPerf(ch)
    } catch (err: any) { console.error(err); setError("Hiếu đang fix, vui lòng đợi"); setLoading(false) }
  }

  useEffect(() => { fetchData() }, [dateColumn])

  const exportCSV = () => {
    if (!channelPerf.length) return
    const h = ["Group", "Channel", "Units", "Revenue", "COGS", "Margin", "Margin%", "GPM2", "GPM2%"]
    const rows = channelPerf.map(r => [`"${r.group}"`, `"${r.channel}"`, r.units, r.revenue, r.cogs, r.margin, `${r.margin_percent.toFixed(2)}%`, r.gpm2, `${r.gpm2_percent.toFixed(2)}%`].join(","))
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" }))
    a.download = `bod_${startDate}_${endDate}.csv`; a.click()
  }

  const SummaryCard = ({ label, value, prevValue, isCurrency = true }: { label: string; value: number; prevValue?: number | null; isCurrency?: boolean }) => {
    const change = pctChange(value, prevValue ?? null)
    return (
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <h2 className="text-2xl font-bold text-slate-900">{isCurrency ? formatCurrency(value) : formatNumber(value)}</h2>
        {change !== null && (
          <div className={cn("mt-2 flex items-center gap-1 text-xs font-bold", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
            <span className="font-normal text-slate-400 ml-1">vs {comparisonType === "previous_year" ? "năm trước" : "kỳ trước"}</span>
          </div>
        )}
      </div>
    )
  }

  const groupedChannel = Object.entries(
    channelPerf.reduce((acc, row) => {
      const g = row.group || "Other"; if (!acc[g]) acc[g] = []; acc[g].push(row); return acc
    }, {} as Record<string, ChannelPerf[]>)
  ).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Board of Directors Report</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-500">Doanh thu, Lợi nhuận, Kênh — {startDate} đến {endDate}</p>
            <SourceBadge source="admin" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm h-[38px] items-center">
            {(["fulfiled_date", "created_date"] as const).map(col => (
              <button key={col} onClick={() => setDateColumn(col)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", dateColumn === col ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {col === "fulfiled_date" ? "Fulfillment" : "Created"}
              </button>
            ))}
          </div>
          <select value={comparisonType} onChange={e => setComparisonType(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none shadow-sm">
            <option value="none">No comparison</option>
            <option value="previous_period">vs Previous Period</option>
            <option value="previous_year">vs Previous Year</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium shadow-sm",
              showFilters ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700")}>
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
            {[{ label: "Start Date", val: startDate, set: setStartDate }, { label: "End Date", val: endDate, set: setEndDate }].map(({ label, val, set }) => (
              <div key={label} className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
                <input type="date" value={val} onChange={e => set(e.target.value)} className="block w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            ))}
            <MultiSelect label="Vendors"      options={vendors}            selected={selectedVendors}        onToggle={v => toggleVal(v, selectedVendors, setSelectedVendors)}             onClear={() => setSelectedVendors([])}        open={openDd === "v"}  setOpen={() => setOpenDd(openDd === "v"  ? null : "v")} />
            <MultiSelect label="Sub Channels" options={subChannels}        selected={selectedSubChannels}    onToggle={v => toggleVal(v, selectedSubChannels, setSelectedSubChannels)}     onClear={() => setSelectedSubChannels([])}    open={openDd === "sc"} setOpen={() => setOpenDd(openDd === "sc" ? null : "sc")} />
            <MultiSelect label="Groups"       options={["B2B", "B2C"]}     selected={selectedChannelGroups}  onToggle={v => toggleVal(v, selectedChannelGroups, setSelectedChannelGroups)} onClear={() => setSelectedChannelGroups([])}  open={openDd === "cg"} setOpen={() => setOpenDd(openDd === "cg" ? null : "cg")} />
            <MultiSelect label="Product Type" options={productTypes}        selected={selectedProductTypes}   onToggle={v => toggleVal(v, selectedProductTypes, setSelectedProductTypes)}   onClear={() => setSelectedProductTypes([])}   open={openDd === "pt"} setOpen={() => setOpenDd(openDd === "pt" ? null : "pt")} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { const r = getDefaultDateRange(); setStartDate(r.startDate); setEndDate(r.endDate); setSelectedVendors([]); setSelectedSubChannels([]); setSelectedChannelGroups([]); setSelectedProductTypes([]) }} className="px-4 py-2 text-sm text-slate-500">Reset</button>
            <button onClick={() => { fetchData(); setShowFilters(false) }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Apply</button>
            {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin self-center" />}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-36" />
          </div>
        )) : summary ? [
          { label: "Total Revenue",   value: summary.total_revenue, prev: getComparison("total_revenue") },
          { label: "Gross Margin",    value: summary.total_margin,  prev: getComparison("total_margin")  },
          { label: "GPM2",            value: summary.total_gpm2,    prev: getComparison("total_gpm2")    },
          { label: "Units Sold",      value: summary.total_units,   prev: getComparison("total_units"), isCurrency: false },
        ].map(({ label, value, prev, isCurrency }) => (
          <SummaryCard key={label} label={label} value={value} prevValue={prev} isCurrency={isCurrency !== false} />
        )) : null}
      </div>

      {/* Target */}
      {summary?.total_target_revenue && summary.total_target_revenue > 0 && !loading && (() => {
        const p = Math.min(100, (summary.total_revenue / summary.total_target_revenue) * 100)
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800">Target Progress</h3>
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">Target: <strong>{formatCurrency(summary.total_target_revenue)}</strong></span>
                <span className="text-slate-500">Actual: <strong>{formatCurrency(summary.total_revenue)}</strong></span>
                {projection && <span className="text-blue-600">Projected: <strong>{formatCurrency(projection.revenue)}</strong></span>}
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-700",
                p >= 100 ? "bg-emerald-500" : p >= 70 ? "bg-blue-500" : p >= 40 ? "bg-amber-500" : "bg-rose-500"
              )} style={{ width: `${p}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{p.toFixed(1)}% vs target</p>
          </div>
        )
      })()}

      {/* Projection */}
      {projection && !loading && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5">
          <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5" /> Month-End Projection {isAdmin && <span>(×{projection.factor.toFixed(2)})</span>}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Revenue", val: formatCurrency(projection.revenue) },
              { label: "Margin",  val: formatCurrency(projection.margin)  },
              { label: "GPM2",    val: formatCurrency(projection.gpm2)    },
              { label: "GPM2 %",  val: `${projection.gpm2Percent.toFixed(2)}%` },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Projected {label}</p>
                <p className="text-lg font-bold text-blue-600">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-6">Revenue &amp; Margin Over Time</h3>
        <div className="h-[280px]">
          {loading ? <Skeleton className="w-full h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => formatCompactNumber(v)} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number, n: string) => [n.includes("percent") ? `${v.toFixed(1)}%` : formatCurrency(v), n]} />
                <Legend />
                <Bar  yAxisId="left"  dataKey="revenue"        name="Revenue"  fill="#3b82f6" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Bar  yAxisId="left"  dataKey="margin"         name="Margin"   fill="#10b981" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" dataKey="margin_percent" name="Margin %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                {data.some(d => d.prev_revenue) && (
                  <Line yAxisId="left" dataKey="prev_revenue" name="Prev Revenue" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Revenue vs COGS */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-6">Revenue vs COGS</h3>
        <div className="h-[280px]">
          {loading ? <Skeleton className="w-full h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(val: string) => val.split("-").slice(1).join("/")} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => formatCompactNumber(v)} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none" }} formatter={(v: number) => [formatCurrency(v), ""]} />
                <Legend iconType="circle" />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
                <Line type="monotone" dataKey="cogs" name="COGS" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
                <Line type="monotone" dataKey="gpm2" name="GPM2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Group Margin */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Margin by Group</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                {["Group", "Revenue", "COGS", "Margin", "Margin %", "GPM2", "GPM2 %", ...(comparisonType !== "none" ? ["Prev Revenue"] : [])].map(h => (
                  <th key={h} className={cn("px-4 py-3", h !== "Group" && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(3).fill(0).map((_, i) => (
                <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>)}</tr>
              )) : groupMargins.map(g => (
                <tr key={g.group} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold",
                      g.group === "B2B-Strategic" ? "bg-indigo-100 text-indigo-700" :
                      g.group === "B2B-Non-Strategic" ? "bg-blue-100 text-blue-700" :
                      g.group === "B2C" ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-600"
                    )}>{g.group}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(g.revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(g.cogs)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatCurrency(g.margin)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{g.margin_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">{formatCurrency(g.gpm2)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{g.gpm2_percent.toFixed(1)}%</td>
                  {comparisonType !== "none" && <td className="px-4 py-3 text-right text-slate-400 text-xs">{g.prev_revenue != null ? formatCurrency(g.prev_revenue) : "-"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel Performance */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Channel Performance</h3>
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                {["Channel", "Units", "Revenue", ...(projection ? ["Dự phóng"] : []), "Margin", "Margin %", "GPM2", "GPM2 %"].map(h => (
                  <th key={h} className={cn("px-4 py-3", h !== "Channel" && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>)}</tr>
              )) : groupedChannel.map(([grp, rows]) => (
                <React.Fragment key={grp}>
                  <tr className="bg-slate-50 cursor-pointer" onClick={() => toggleGroup(grp)}>
                    <td colSpan={projection ? 8 : 7} className="px-4 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-widest">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform", expandedGroups.includes(grp) && "rotate-180")} />
                        {grp}
                        <span className="font-normal text-slate-400">{formatCurrency(rows.reduce((s, r) => s + r.revenue, 0))}</span>
                      </div>
                    </td>
                  </tr>
                  {(expandedGroups.includes(grp) || groupedChannel.length === 1) && rows.sort((a, b) => b.revenue - a.revenue).map(row => (
                    <tr key={row.channel} className="hover:bg-slate-50">
                      <td className="px-4 py-3 pl-10 text-slate-700">{row.channel}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatNumber(row.units)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.revenue)}</td>
                      {projection && <td className="px-4 py-3 text-right text-blue-600/80">{formatCurrency(row.revenue * projection.factor)}</td>}
                      <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(row.margin)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{row.margin_percent.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(row.gpm2)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{row.gpm2_percent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Financial Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Daily Financial Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Gross Margin</th>
                <th className="px-4 py-3 text-right">Margin %</th>
                <th className="px-4 py-3 text-right">GPM2</th>
                <th className="px-4 py-3 text-right">GPM2 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>)}</tr>
              )) : data.slice().reverse().map(row => (
                <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{row.date}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(row.revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(row.cogs || 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(row.margin)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", row.margin_percent > 20 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600")}>{(row.margin_percent || 0).toFixed(2)}%</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatCurrency(row.gpm2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", (row.gpm2_percent || 0) > 15 ? "bg-indigo-50 text-indigo-600" : "bg-pink-50 text-pink-600")}>{(row.gpm2_percent || 0).toFixed(2)}%</span>
                  </td>
                </tr>
              ))}
              {data.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">No data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
