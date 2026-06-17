"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  Activity, Ticket, Clock, RefreshCcw, DollarSign, Database,
  ChevronRight, AlertTriangle, AlertCircle, CheckCircle2, LayoutList,
  ArrowUpDown, ChevronUp, ChevronDown, Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber, getDefaultDateRange } from "@/lib/analytics-formatters"

interface KPIs {
  unitsSold: number; ticketCount: number; tbsRate: number
  avgHandleTime: number; replacementCount: number; refundCount: number
}
interface PerformanceRow {
  tbs: number; unitsSold: number; tbsRate: number; refunds: number; refundRate: number
  issueBreakdown: { name: string; count: number; percentage: number }[]
  conclusionBreakdown: { name: string; count: number; percentage: number }[]
}
interface Data {
  hasTicketData: boolean
  kpis: KPIs
  shifts: { shift: string; tickets: number }[]
  issues: { name: string; count: number }[]
  skuPerformance: (PerformanceRow & { sku: string; telco: string })[]
  vendorPerformance: (PerformanceRow & { vendor: string })[]
  sourcePerformance: (PerformanceRow & { source: string })[]
  channelGroupPerformance: (PerformanceRow & { group: string })[]
  invalidTickets: { id: string; orderNo: string; reason: string }[]
}

type Tab = "tbs" | "sku" | "vendor" | "source" | "invalid"

function TBSRate({ rate }: { rate: number }) {
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md",
      rate > 5 ? "bg-rose-50 text-rose-600" : rate > 2 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
      {rate.toFixed(2)}%
    </span>
  )
}

function BreakdownPanel({ title, rows, color, colSpan }: { title: string; rows: { name: string; count: number; percentage: number }[]; color: string; colSpan: number }) {
  return (
    <td colSpan={colSpan} className="px-5 py-5 bg-slate-50/50 border-b border-slate-100">
      <div className="space-y-2 max-w-lg">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          {color === "rose" ? <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {title}
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Không có dữ liệu</p>
        ) : rows.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-700 truncate max-w-[200px]">{item.name}</span>
              <span className="text-slate-400 ml-2 whitespace-nowrap">{item.count} ({item.percentage.toFixed(1)}%)</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", color === "rose" ? "bg-rose-400" : "bg-emerald-400")}
                style={{ width: `${item.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
    </td>
  )
}

function SortableHeader({ label, col, sort, onSort, className = "" }: {
  label: string; col: string
  sort: { key: string; dir: "asc" | "desc" }
  onSort: (k: string) => void; className?: string
}) {
  return (
    <th onClick={() => onSort(col)}
      className={cn("px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none", className)}>
      <span className="flex items-center gap-1">
        {label}
        {sort.key === col
          ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
          : <ArrowUpDown className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  )
}

function PerformanceTable<T extends PerformanceRow & { [k: string]: any }>({
  data, nameKey, nameLabel, loading, defaultSortKey,
}: {
  data: T[]; nameKey: string; nameLabel: string; loading: boolean; defaultSortKey: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: defaultSortKey, dir: "desc" })
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = [...data].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av
    return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  })

  const toggle = (k: string) => { setSort(s => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" })) }

  const cols = [nameLabel, "Units Sold", "TBS Volume", "TBS Rate", "Refunds", "Rf/TBS %", "Detail"]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <SortableHeader label={nameLabel} col={nameKey} sort={sort} onSort={toggle} />
              <SortableHeader label="Units Sold" col="unitsSold" sort={sort} onSort={toggle} className="text-center" />
              <SortableHeader label="TBS" col="tbs" sort={sort} onSort={toggle} className="text-center" />
              <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">TBS Rate</th>
              <SortableHeader label="Refunds" col="refunds" sort={sort} onSort={toggle} className="text-center" />
              <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Rf/TBS %</th>
              <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array(3).fill(0).map((_, i) => (
              <tr key={i} className="animate-pulse border-b border-slate-50">
                {Array(7).fill(0).map((_, j) => (
                  <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>
                ))}
              </tr>
            )) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">Không có dữ liệu</td></tr>
            ) : sorted.map((row, idx) => {
              const key = row[nameKey]
              const isExpanded = expanded === key
              return (
                <>
                  <tr key={`${key}-${idx}`}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                    className={cn("border-b border-slate-50 cursor-pointer transition-colors",
                      isExpanded ? "bg-blue-50/30" : "hover:bg-slate-50")}>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{key}</td>
                    <td className="px-5 py-3 text-center text-sm text-slate-600">{formatNumber(row.unitsSold)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="text-sm font-black text-blue-700">{row.tbs}</span>
                    </td>
                    <td className="px-5 py-3 text-center"><TBSRate rate={row.tbsRate} /></td>
                    <td className="px-5 py-3 text-center text-sm font-bold text-rose-600">{row.refunds}</td>
                    <td className="px-5 py-3 text-center text-xs font-bold text-slate-500">{row.refundRate.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right">
                      <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-90")} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${key}-exp`}>
                      <BreakdownPanel title="Issue Breakdown" rows={row.issueBreakdown} color="rose" colSpan={4} />
                      <BreakdownPanel title="Conclusion Breakdown" rows={row.conclusionBreakdown} color="emerald" colSpan={3} />
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CSTroubleshootPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("tbs")
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate)
  const [channelGroup, setChannelGroup] = useState("All")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [ticketCount, setTicketCount] = useState<number | null>(null)

  // Check ticket count on mount
  useEffect(() => {
    fetch("/api/admin/sync-lark-tickets")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTicketCount(d.count) })
      .catch(() => {})
  }, [])

  const syncLark = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch("/api/admin/sync-lark-tickets", { method: "POST" })
      const d = await res.json()
      if (res.ok) {
        setSyncMsg({ ok: true, text: `Sync xong! ${d.totalSynced} tickets đã import.` })
        setTicketCount(d.totalSynced)
        fetchData()
      } else {
        setSyncMsg({ ok: false, text: d.error || "Sync thất bại" })
      }
    } catch (err: any) {
      setSyncMsg({ ok: false, text: err.message })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }

  const migrateTurso = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch("/api/admin/migrate-turso-tickets", { method: "POST" })
      const d = await res.json()
      if (res.ok) {
        setSyncMsg({ ok: true, text: `Migrate xong! ${d.totalUpserted}/${d.total} tickets từ Turso.` })
        setTicketCount(d.totalUpserted)
        fetchData()
      } else {
        setSyncMsg({ ok: false, text: d.error || "Migrate thất bại" })
      }
    } catch (err: any) {
      setSyncMsg({ ok: false, text: err.message })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 8000)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ startDate, endDate, channelGroup })
      const res = await fetch(`/api/reports/cs-troubleshoot?${p}`)
      if (!res.ok) throw new Error((await res.json()).error || "Lỗi tải dữ liệu")
      setData(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, channelGroup])

  useEffect(() => { fetchData() }, [startDate, endDate, channelGroup])

  const tabs = [
    { id: "tbs" as Tab, label: "CS Troubleshoot", icon: Ticket },
    { id: "sku" as Tab, label: "SKU Performance", icon: Database },
    { id: "vendor" as Tab, label: "Vendor Performance", icon: Activity },
    { id: "source" as Tab, label: "Source Performance", icon: LayoutList },
    { id: "invalid" as Tab, label: "Invalid Tickets", icon: AlertTriangle },
  ]

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Sticky Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-5 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#003B95] rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  CS TROUBLESHOOTING <span className="text-blue-600">HUB</span>
                </h1>
                <p className="text-slate-400 text-[10px] font-medium">Lark Base & PostgreSQL Integration</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0" />
                <span className="text-slate-300">→</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0" />
              </div>
              <select value={channelGroup} onChange={e => setChannelGroup(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 px-3 py-2 rounded-xl focus:ring-2 focus:ring-blue-500/20">
                <option value="All">All Channels</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
              <button onClick={fetchData}
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
                <RefreshCcw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
              </button>
              <button onClick={migrateTurso} disabled={syncing}
                title="Migrate từ Turso gohub-intel (1 lần)"
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm",
                  syncing ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200")}>
                <Database className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                {syncing ? "Migrating..." : "Migrate Turso"}
              </button>
              <button onClick={syncLark} disabled={syncing}
                title="Sync từ Lark Base API (cần LARK_BASE_ID + LARK_TABLE_ID)"
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm",
                  syncing ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#003B95] text-white hover:bg-[#002B70] shadow-blue-200")}>
                <Database className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : `Sync Lark${ticketCount !== null ? ` (${ticketCount})` : ""}`}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-3 border-b border-slate-100 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn("flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all relative whitespace-nowrap",
                  activeTab === tab.id ? "text-[#003B95]" : "text-slate-400 hover:text-slate-600")}>
                <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.id ? "text-[#003B95]" : "text-slate-400")} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#003B95] rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-5 py-6 space-y-6">
        {/* Sync toast */}
        {syncMsg && (
          <div className={cn("flex items-center gap-3 p-3 rounded-xl text-sm border",
            syncMsg.ok ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700")}>
            {syncMsg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {syncMsg.text}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={fetchData} className="ml-auto text-xs font-bold bg-rose-100 px-3 py-1 rounded-lg">Thử lại</button>
          </div>
        )}

        {/* No ticket data banner */}
        {data && !data.hasTicketData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Chưa có dữ liệu ticket Lark</p>
              <p className="text-xs text-amber-600 mt-1">
                Cách nhanh nhất: nhấn <strong className="text-emerald-700">Migrate Turso</strong> để copy ticket từ Turso (gohub-intel) sang đây.
                Cần set <code className="bg-amber-100 px-1 rounded">TURSO_URL</code> và <code className="bg-amber-100 px-1 rounded">TURSO_AUTH_TOKEN</code> trong Vercel env vars.
              </p>
            </div>
            <button onClick={migrateTurso} disabled={syncing}
              className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {syncing ? "Migrating..." : "Migrate Turso"}
            </button>
          </div>
        )}

        {/* TBS Overview Tab */}
        {activeTab === "tbs" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Units Sold", value: formatNumber(data?.kpis.unitsSold || 0), icon: Database, color: "blue" },
                { label: "TBS Tickets", value: formatNumber(data?.kpis.ticketCount || 0), icon: Ticket, color: "rose" },
                { label: "TBS Rate", value: `${(data?.kpis.tbsRate || 0).toFixed(2)}%`, icon: Activity, color: "amber" },
                { label: "Avg Handle Time", value: `${data?.kpis.avgHandleTime || 0}m`, icon: Clock, color: "emerald" },
              ].map((kpi, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0",
                    kpi.color === "blue" ? "bg-blue-50 text-blue-600" :
                    kpi.color === "rose" ? "bg-rose-50 text-rose-600" :
                    kpi.color === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                    <kpi.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                    {loading ? <div className="h-6 w-16 bg-slate-100 animate-pulse rounded mt-1" /> :
                      <h3 className="text-xl font-black text-slate-900">{kpi.value}</h3>}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Replace & Refund */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 text-[#003B95]" />
                  Replacement & Refund
                </h3>
                {[
                  { label: "Replace Count", value: data?.kpis.replacementCount || 0, color: "blue" },
                  { label: "Refund Count", value: data?.kpis.refundCount || 0, color: "emerald" },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                    {loading ? <div className="h-7 w-20 bg-slate-200 animate-pulse rounded" /> :
                      <h4 className="text-2xl font-black text-slate-900">{formatNumber(item.value)}
                        <span className="text-sm font-medium text-slate-400 ml-1">Cases</span>
                      </h4>}
                  </div>
                ))}
              </div>

              {/* Shift Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-[#003B95]" />
                  TBS Volume by Shift
                </h3>
                <div className="h-56">
                  {loading ? <div className="w-full h-full bg-slate-100 animate-pulse rounded-xl" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.shifts || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="shift" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: "bold" }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }} />
                        <Bar dataKey="tickets" fill="#003B95" radius={[4, 4, 0, 0]} barSize={36} name="Tickets" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "sku" && (
          <PerformanceTable
            data={data?.skuPerformance || []}
            nameKey="sku" nameLabel="SKU" loading={loading} defaultSortKey="tbs"
          />
        )}

        {activeTab === "vendor" && (
          <PerformanceTable
            data={data?.vendorPerformance || []}
            nameKey="vendor" nameLabel="Vendor" loading={loading} defaultSortKey="tbs"
          />
        )}

        {activeTab === "source" && (
          <div className="space-y-6">
            {/* Channel Group */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-[#003B95]" />
                Channel Group Performance
              </h3>
              <PerformanceTable
                data={data?.channelGroupPerformance || []}
                nameKey="group" nameLabel="Group" loading={loading} defaultSortKey="tbs"
              />
            </div>
            <PerformanceTable
              data={data?.sourcePerformance || []}
              nameKey="source" nameLabel="Source" loading={loading} defaultSortKey="tbs"
            />
          </div>
        )}

        {activeTab === "invalid" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-rose-50/30">
              <h3 className="font-bold text-rose-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Invalid Tickets Detection
              </h3>
              <p className="text-[10px] font-bold text-rose-900/40 uppercase tracking-wider mt-0.5">
                Tickets with invalid SKU or missing fields
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Ticket ID", "Order No", "Issue / Reason"].map(h => (
                      <th key={h} className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.invalidTickets || []).map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-rose-50/20 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-900 text-sm">{row.id}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{row.orderNo}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full uppercase">{row.reason}</span>
                      </td>
                    </tr>
                  ))}
                  {!(data?.invalidTickets?.length) && (
                    <tr>
                      <td colSpan={3} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                          <p className="text-sm font-medium text-slate-500">Không có ticket lỗi trong kỳ này</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
