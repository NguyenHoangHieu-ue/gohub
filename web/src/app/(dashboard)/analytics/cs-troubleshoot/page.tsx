"use client"

import React, { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  AlertCircle, Ticket, Activity, Clock, RefreshCcw, DollarSign, Database, ChevronRight,
  AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, CheckCircle2, LayoutList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { DatePresets } from "@/components/date-presets"

// Port "y hệt" gohub-intel CSTroubleshootReport. Backend /api/reports/cs-troubleshoot ĐÃ khớp shape.
// Adapt (user chốt): GIỮ sync của web → nút Sync gọi POST /api/admin/sync-lark-tickets (thay intel sync-lark).

function getDefaultDateRange() {
  const today = new Date()
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
  // Mac dinh: ngay 1 thang hien tai -> hom qua (T-1).
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  return { startDate: fmt(start), endDate: fmt(end) }
}

interface CSTroubleshootData {
  kpis: { unitsSold: number; ticketCount: number; tbsRate: number; avgHandleTime: number; replacementCount: number; refundCount: number }
  shifts: { shift: string; tickets: number }[]
  issues: { name: string; count: number }[]
  skuPerformance: { sku: string; telco: string; tbs: number; unitsSold: number; tbsRate: number; refunds: number; refundRate: number; issueBreakdown: { name: string; count: number; percentage: number }[]; conclusionBreakdown: { name: string; count: number; percentage: number }[] }[]
  vendorPerformance: { vendor: string; tbs: number; unitsSold: number; tbsRate: number; refunds: number; refundRate: number; issueBreakdown: { name: string; count: number; percentage: number }[]; conclusionBreakdown: { name: string; count: number; percentage: number }[] }[]
  sourcePerformance: { source: string; tbs: number; unitsSold: number; tbsRate: number; refunds: number; refundRate: number; issueBreakdown: { name: string; count: number; percentage: number }[]; conclusionBreakdown: { name: string; count: number; percentage: number }[] }[]
  channelGroupPerformance: { group: string; tbs: number; unitsSold: number; tbsRate: number; refunds: number; refundRate: number; issueBreakdown: { name: string; count: number; percentage: number }[]; conclusionBreakdown: { name: string; count: number; percentage: number }[] }[]
  invalidTickets: { id: string; orderNo: string; reason: string }[]
}

export default function CSTroubleshootReport() {
  const [data, setData] = useState<CSTroubleshootData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"tbs" | "sku" | "vendor" | "source" | "invalid">("tbs")

  const [dateRange, setDateRange] = useState(() => {
    const defaultRange = getDefaultDateRange()
    return { start: defaultRange.startDate, end: defaultRange.endDate }
  })
  const [channelGroup, setChannelGroup] = useState("All")

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end, channelGroup })
      const res = await fetch(`/api/reports/cs-troubleshoot?${params}`)
      if (!res.ok) throw new Error("Failed to fetch data")
      setData(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Giữ sync của web: POST /api/admin/sync-lark-tickets (không poll như intel).
  const syncLarkData = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/sync-lark-tickets", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Failed to sync")
      await fetchData()
      alert(json.message || `Đã đồng bộ ${json.synced ?? ""} bản ghi từ Lark.`)
    } catch (err: any) {
      alert(`Sync error: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { fetchData() }, [dateRange, channelGroup]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] bg-slate-50 rounded-3xl border border-dashed border-slate-300">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">Error loading report</h3>
        <p className="text-slate-500 text-center max-w-md">{error}</p>
        <button onClick={() => fetchData()} className="mt-6 px-6 py-2 bg-[#003B95] text-white rounded-full font-bold hover:bg-[#002B70] transition-all">Retry</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      <div className="bg-white border-b border-slate-200 md:sticky md:top-0 z-40 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-[#003B95] rounded-lg flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
                <Activity className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight leading-tight">CS TROUBLESHOOTING <span className="text-blue-600">HUB</span></h1>
                <p className="hidden md:block text-slate-400 text-xs font-medium">Lark Base &amp; PostgreSQL Integration</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 flex-1 md:flex-none">
                <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent border-none text-[10px] md:text-xs font-bold text-slate-600 px-2 md:px-3 py-1 md:py-1.5 focus:ring-0 cursor-pointer w-full" />
                <span className="text-slate-300">→</span>
                <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent border-none text-[10px] md:text-xs font-bold text-slate-600 px-2 md:px-3 py-1 md:py-1.5 focus:ring-0 cursor-pointer w-full" />
              </div>
              <DatePresets onSelect={(s, e) => setDateRange(prev => ({ ...prev, start: s, end: e }))} />
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select value={channelGroup} onChange={e => setChannelGroup(e.target.value)} className="bg-slate-50 border border-slate-200 text-[10px] md:text-xs font-bold text-slate-600 px-3 md:px-4 py-2 md:py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/20 flex-1 md:flex-none">
                  <option value="All">All Channels</option>
                  <option value="B2B">B2B Performance</option>
                  <option value="B2C">B2C Performance</option>
                </select>
                <button onClick={fetchData} className="p-2 md:p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                  <RefreshCcw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
                </button>
                <button onClick={syncLarkData} disabled={syncing} className={cn("flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-bold transition-all shadow-sm", syncing ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-[#003B95] text-white hover:bg-[#002B70] shadow-blue-200")}>
                  <Database className={cn("w-3 h-3 md:w-4 md:h-4", syncing && "animate-spin")} />
                  <span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync Lark"}</span>
                  <span className="sm:hidden">{syncing ? "Syncing..." : "Sync"}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-4 md:mt-8 border-b border-slate-100 overflow-x-auto no-scrollbar touch-pan-x">
            {[
              { id: "tbs", label: "CS_ Troubleshoot", icon: Ticket },
              { id: "sku", label: "CS_ SKU Performance", icon: Database },
              { id: "vendor", label: "CS_ Vendor Performance", icon: Activity },
              { id: "source", label: "CS_ Source Performance", icon: LayoutList },
              { id: "invalid", label: "CS_ Invalid", icon: AlertTriangle },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-[11px] md:text-sm font-bold transition-all relative whitespace-nowrap", activeTab === tab.id ? "text-[#003B95]" : "text-slate-400 hover:text-slate-600")}>
                <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-[#003B95]" : "text-slate-400")} />
                {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#003B95] rounded-t-full shadow-[0_-2px_8px_rgba(0,59,149,0.3)]" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-8">
        {activeTab === "tbs" && <TBSOverview data={data} loading={loading} />}
        {activeTab === "sku" && <SKUPerformance data={data} loading={loading} />}
        {activeTab === "vendor" && <VendorPerformance data={data} loading={loading} />}
        {activeTab === "source" && <SourcePerformance data={data} loading={loading} />}
        {activeTab === "invalid" && <InvalidTickets data={data} loading={loading} />}
      </div>
    </div>
  )
}

function TBSOverview({ data, loading }: { data: CSTroubleshootData | null; loading: boolean }) {
  if (loading) return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-4 gap-6"><div className="h-24 bg-slate-200 rounded-2xl"></div><div className="h-24 bg-slate-200 rounded-2xl"></div><div className="h-24 bg-slate-200 rounded-2xl"></div><div className="h-24 bg-slate-200 rounded-2xl"></div></div>
      <div className="h-96 bg-slate-200 rounded-3xl"></div>
    </div>
  )
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Units Sold", value: formatNumber(data?.kpis.unitsSold || 0), icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "TBS Tickets", value: formatNumber(data?.kpis.ticketCount || 0), icon: Ticket, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "TBS Rate", value: `${(data?.kpis.tbsRate || 0).toFixed(2)}%`, icon: Activity, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Avg Handle Time", value: `${data?.kpis.avgHandleTime || 0}m`, icon: Clock, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
            <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center", kpi.bg)}><kpi.icon className={cn("w-7 h-7", kpi.color)} /></div>
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">{kpi.label}</p>
              <h3 className="text-2xl font-black text-slate-900">{kpi.value}</h3>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm lg:col-span-1">
          <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><RefreshCcw className="w-6 h-6 text-[#003B95]" />Replacement &amp; Refund</h3>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Replace Count</p>
                  <h4 className="text-3xl font-black text-slate-900">{formatNumber(data?.kpis.replacementCount || 0)} <span className="text-sm font-medium text-slate-400">Cases</span></h4>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><RefreshCcw className="w-5 h-5 text-blue-600" /></div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Counted from &quot;Product Action&quot; field (contains &apos;replace&apos;).</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Refund Count</p>
                  <h4 className="text-3xl font-black text-slate-900">{formatNumber(data?.kpis.refundCount || 0)} <span className="text-sm font-medium text-slate-400">Cases</span></h4>
                </div>
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
              </div>
              <div className="flex justify-between items-center px-1"><p className="text-xs font-bold text-slate-500">Based on &quot;Money Action&quot;</p></div>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><Clock className="w-6 h-6 text-[#003B95]" />TBS Volume by Shift</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.shifts || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="shift" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11, fontWeight: "bold" }} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }} />
                <Bar dataKey="tickets" fill="#003B95" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function BreakdownDetail({ row, colSpan }: { row: any; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 md:px-8 py-6 md:py-8 bg-slate-50/50 border-b border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-rose-500" />Issue Detail Breakdown</h4>
            <div className="space-y-4">
              {(row.issueBreakdown || []).map((item: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1.5 px-1">
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{item.name}</span>
                    <span className="text-[10px] font-black text-slate-400">{item.count} cases ({item.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-rose-400 rounded-full" style={{ width: `${item.percentage}%` }} /></div>
                </div>
              ))}
              {(!row.issueBreakdown || row.issueBreakdown.length === 0) && <p className="text-xs text-slate-400 italic">No issue data</p>}
            </div>
          </div>
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Conclusion Breakdown</h4>
            <div className="space-y-4">
              {(row.conclusionBreakdown || []).map((item: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1.5 px-1">
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{item.name}</span>
                    <span className="text-[10px] font-black text-slate-400">{item.count} cases ({item.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${item.percentage}%` }} /></div>
                </div>
              ))}
              {(!row.conclusionBreakdown || row.conclusionBreakdown.length === 0) && <p className="text-xs text-slate-400 italic">No conclusion data</p>}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20" />
  return direction === "asc" ? <ChevronUp className="w-3 h-3 ml-1 text-blue-600" /> : <ChevronDown className="w-3 h-3 ml-1 text-blue-600" />
}

function useSort(defaultKey: string) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: defaultKey, direction: "desc" })
  const handleSort = (key: string) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc" }))
  const sort = (rows: any[]) => [...rows].sort((a, b) => {
    const { key, direction } = sortConfig
    if (a[key] < b[key]) return direction === "asc" ? -1 : 1
    if (a[key] > b[key]) return direction === "asc" ? 1 : -1
    return 0
  })
  return { sortConfig, handleSort, sort }
}

function SKUPerformance({ data, loading }: { data: CSTroubleshootData | null; loading: boolean }) {
  const { sortConfig, handleSort, sort } = useSort("tbs")
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  if (loading) return <div className="p-8"><div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div></div>
  const sorted = sort(data?.skuPerformance || [])
  const COLS: [string, string, boolean][] = [["sku", "SKU", false], ["telco", "Vendor/Telco", false], ["unitsSold", "Units Sold", true], ["tbs", "TBS Volume", true], ["tbsRate", "TBS Rate", true], ["refunds", "Refunds", true], ["refundRate", "Rf/TBS (%)", true]]
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/30 gap-4">
        <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2"><Database className="w-5 h-5 md:w-6 md:h-6 text-[#003B95]" />SKU &amp; Telco Performance</h3>
      </div>
      <div className="overflow-x-auto no-scrollbar touch-pan-x">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {COLS.map(([key, label, center]) => (
                <th key={key} className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort(key)}>
                  <div className={cn("flex items-center", center && "justify-center")}>{label} <SortIcon active={sortConfig.key === key} direction={sortConfig.direction} /></div>
                </th>
              ))}
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 15).map((row, idx) => (
              <React.Fragment key={idx}>
                <tr className={cn("border-b border-slate-50 transition-colors cursor-pointer", expandedSku === row.sku ? "bg-blue-50/30" : "hover:bg-slate-50/50")} onClick={() => setExpandedSku(expandedSku === row.sku ? null : row.sku)}>
                  <td className="px-8 py-4"><span className="text-sm font-bold text-slate-900">{row.sku}</span></td>
                  <td className="px-8 py-4"><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{row.telco}</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-slate-700">{formatNumber(row.unitsSold)}</span></td>
                  <td className="px-8 py-4">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-sm font-black text-[#003B95]">{row.tbs}</span>
                      <div className="hidden lg:block flex-1 max-w-[80px] h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(row.tbs / (data?.skuPerformance[0]?.tbs || 1)) * 100}%` }} /></div>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-center"><span className={cn("text-xs font-black px-2 py-1 rounded-md", row.tbsRate > 5 ? "bg-rose-50 text-rose-600" : row.tbsRate > 2 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>{row.tbsRate.toFixed(2)}%</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-rose-600">{row.refunds}</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-xs font-black text-slate-500">{row.refundRate.toFixed(1)}%</span></td>
                  <td className="px-8 py-4 text-right"><button className={cn("transition-transform duration-200", expandedSku === row.sku && "rotate-90")}><ChevronRight className="w-4 h-4 text-slate-400" /></button></td>
                </tr>
                {expandedSku === row.sku && <BreakdownDetail row={row} colSpan={8} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {(!data?.skuPerformance || data.skuPerformance.length === 0) && <div className="p-20 text-center text-slate-400 font-medium">No SKU data found for this period.</div>}
      </div>
    </div>
  )
}

function VendorPerformance({ data, loading }: { data: CSTroubleshootData | null; loading: boolean }) {
  const { sortConfig, handleSort, sort } = useSort("tbs")
  const [expanded, setExpanded] = useState<string | null>(null)
  if (loading) return <div className="p-8"><div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div></div>
  const sorted = sort(data?.vendorPerformance || [])
  const COLS: [string, string, boolean][] = [["vendor", "Vendor", false], ["unitsSold", "Units Sold", true], ["tbs", "TBS Volume", true], ["tbsRate", "TBS Rate", true], ["refunds", "Refunds", true], ["refundRate", "Rf/TBS (%)", true]]
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/30 gap-4">
        <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2"><Activity className="w-5 h-5 md:w-6 md:h-6 text-[#003B95]" />Vendor Performance</h3>
      </div>
      <div className="overflow-x-auto no-scrollbar touch-pan-x">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {COLS.map(([key, label, center]) => (
                <th key={key} className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort(key)}>
                  <div className={cn("flex items-center", center && "justify-center")}>{label} <SortIcon active={sortConfig.key === key} direction={sortConfig.direction} /></div>
                </th>
              ))}
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Detail</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <React.Fragment key={idx}>
                <tr className={cn("border-b border-slate-50 transition-colors cursor-pointer", expanded === row.vendor ? "bg-blue-50/30" : "hover:bg-slate-50/50")} onClick={() => setExpanded(expanded === row.vendor ? null : row.vendor)}>
                  <td className="px-8 py-4"><span className="text-sm font-bold text-slate-900">{row.vendor}</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-slate-700">{formatNumber(row.unitsSold)}</span></td>
                  <td className="px-8 py-4">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-sm font-black text-[#003B95]">{row.tbs}</span>
                      <div className="hidden lg:block flex-1 max-w-[80px] h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(row.tbs / (data?.vendorPerformance[0]?.tbs || 1)) * 100}%` }} /></div>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-center"><span className={cn("text-xs font-black px-2 py-1 rounded-md", row.tbsRate > 5 ? "bg-rose-50 text-rose-600" : row.tbsRate > 2 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>{row.tbsRate.toFixed(2)}%</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-rose-600">{row.refunds}</span></td>
                  <td className="px-8 py-4 text-center"><span className="text-xs font-black text-slate-500">{row.refundRate.toFixed(1)}%</span></td>
                  <td className="px-8 py-4 text-right"><button className={cn("transition-transform duration-200", expanded === row.vendor && "rotate-90")}><ChevronRight className="w-4 h-4 text-slate-400" /></button></td>
                </tr>
                {expanded === row.vendor && <BreakdownDetail row={row} colSpan={7} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {(!data?.vendorPerformance || data.vendorPerformance.length === 0) && <div className="p-20 text-center text-slate-400 font-medium">No Vendor data found for this period.</div>}
      </div>
    </div>
  )
}

function SourcePerformance({ data, loading }: { data: CSTroubleshootData | null; loading: boolean }) {
  const { sortConfig, handleSort, sort } = useSort("tbs")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  if (loading) return <div className="p-8"><div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div></div>
  if (!data) return null
  const COLS: [string, string][] = [["source", "Source"], ["unitsSold", "Units Sold"], ["tbs", "TBS Volume"], ["tbsRate", "TBS Rate (%)"], ["refunds", "Refunds"], ["refundRate", "Rf Rate (%)"]]
  return (
    <div className="space-y-12">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/30 gap-4">
          <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2"><LayoutList className="w-5 h-5 md:w-6 md:h-6 text-[#003B95]" />Channel Group Performance</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar touch-pan-x">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Group</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Units Sold</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">TBS Volume</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">TBS Rate (%)</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Refunds</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Rf Rate (%)</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.channelGroupPerformance.map((row, idx) => (
                <React.Fragment key={idx}>
                  <tr className={cn("border-b border-slate-50 transition-colors cursor-pointer", expandedGroup === row.group ? "bg-blue-50/30" : "hover:bg-slate-50/50")} onClick={() => setExpandedGroup(expandedGroup === row.group ? null : row.group)}>
                    <td className="px-8 py-4"><span className="text-sm font-bold text-slate-900">{row.group}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-slate-700">{formatNumber(row.unitsSold)}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-black text-[#003B95]">{row.tbs}</span></td>
                    <td className="px-8 py-4 text-center"><span className={cn("text-xs font-black px-2 py-1 rounded-md", row.tbsRate > 5 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>{row.tbsRate.toFixed(2)}%</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-rose-600">{row.refunds}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-xs font-black text-slate-500">{row.refundRate.toFixed(1)}%</span></td>
                    <td className="px-8 py-4 text-right"><button className={cn("transition-transform duration-200", expandedGroup === row.group && "rotate-90")}><ChevronRight className="w-4 h-4 text-slate-400" /></button></td>
                  </tr>
                  {expandedGroup === row.group && <BreakdownDetail row={row} colSpan={7} />}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/30 gap-4">
          <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2"><LayoutList className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />Individual Source Performance</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar touch-pan-x">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {COLS.map(([key, label], i) => (
                  <th key={key} className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleSort(key)}>
                    <div className={cn("flex items-center", i > 0 && "justify-center")}>{label} <SortIcon active={sortConfig.key === key} direction={sortConfig.direction} /></div>
                  </th>
                ))}
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {sort(data.sourcePerformance).map((row, idx) => (
                <React.Fragment key={idx}>
                  <tr className={cn("border-b border-slate-50 transition-colors cursor-pointer", expandedRow === row.source ? "bg-blue-50/30" : "hover:bg-slate-50/50")} onClick={() => setExpandedRow(expandedRow === row.source ? null : row.source)}>
                    <td className="px-8 py-4"><span className="text-sm font-bold text-slate-900">{row.source}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-slate-700">{formatNumber(row.unitsSold)}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-black text-[#003B95]">{row.tbs}</span></td>
                    <td className="px-8 py-4 text-center"><span className={cn("text-xs font-black px-2 py-1 rounded-md", row.tbsRate > 5 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>{row.tbsRate.toFixed(2)}%</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-sm font-bold text-rose-600">{row.refunds}</span></td>
                    <td className="px-8 py-4 text-center"><span className="text-xs font-black text-slate-500">{row.refundRate.toFixed(1)}%</span></td>
                    <td className="px-8 py-4 text-right"><button className={cn("transition-transform duration-200", expandedRow === row.source && "rotate-90")}><ChevronRight className="w-4 h-4 text-slate-400" /></button></td>
                  </tr>
                  {expandedRow === row.source && <BreakdownDetail row={row} colSpan={7} />}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function InvalidTickets({ data, loading }: { data: CSTroubleshootData | null; loading: boolean }) {
  if (loading) return <div className="p-8"><div className="h-64 bg-slate-100 animate-pulse rounded-2xl"></div></div>
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100 bg-rose-50/30">
        <h3 className="text-xl font-black text-rose-600 flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-rose-500" />Invalid Tickets Detection</h3>
        <p className="text-rose-900/40 text-xs font-bold mt-1 uppercase tracking-wider">Tickets with invalid SKU or missing fields</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ticket ID</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order No</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Issue/Reason</th>
            </tr>
          </thead>
          <tbody>
            {(data?.invalidTickets || []).map((row, idx) => (
              <tr key={idx} className="border-b border-slate-50 hover:bg-rose-50/20 transition-colors">
                <td className="px-8 py-4 font-bold text-slate-900 text-sm">{row.id}</td>
                <td className="px-8 py-4 text-slate-500 font-medium text-xs">{row.orderNo}</td>
                <td className="px-8 py-4"><span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full uppercase">{row.reason}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!data?.invalidTickets || data.invalidTickets.length === 0) && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
            <p className="text-slate-600 font-bold">No invalid tickets found in the current period.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Package(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
  )
}
