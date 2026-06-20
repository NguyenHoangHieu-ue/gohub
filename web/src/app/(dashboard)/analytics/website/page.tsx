"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  ComposedChart, Bar, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Globe, Users, MousePointerClick, Eye, Target, DollarSign, TrendingDown } from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"
import { cn } from "@/lib/utils"
import { SourceBadge } from "@/components/dashboard-kit"

interface Site { id: string; name: string; propertyId: string; siteUrl?: string; currency?: string }
interface Kpis {
  activeUsers: number; sessions: number; pageviews: number; conversions: number
  bounceRate: number; revenue: number; purchases: number; cr: number
}
interface SeriesPt { date: string; users: number; sessions: number; pageviews: number; conversions: number; cr: number; revenue: number }
interface Row { name: string; sessions: number; conversions: number; cr: number }
interface Summary { kpis: Kpis; series: SeriesPt[]; countries: Row[]; sources: Row[] }

const RANGES: { id: string; label: string; start: string }[] = [
  { id: "7d",  label: "7 ngày",  start: "7daysAgo" },
  { id: "28d", label: "28 ngày", start: "28daysAgo" },
  { id: "90d", label: "90 ngày", start: "90daysAgo" },
]

const KpiCard = ({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string
}) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className={cn("p-2 rounded-xl w-fit mb-3", accent)}>{icon}</div>
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</p>
    {sub && <p className="text-xs font-medium text-slate-500 mt-0.5">{sub}</p>}
  </div>
)

const RankTable = ({ title, rows }: { title: string; rows: Row[] }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-800">{title}</h3></div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="text-left font-semibold px-6 py-2.5 text-xs uppercase tracking-wider">Tên</th>
            <th className="text-right font-semibold px-4 py-2.5 text-xs">Sessions</th>
            <th className="text-right font-semibold px-4 py-2.5 text-xs">Conv.</th>
            <th className="text-right font-semibold px-6 py-2.5 text-xs">CR%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(r => (
            <tr key={r.name} className="hover:bg-slate-50/40">
              <td className="px-6 py-3 font-medium text-slate-700 truncate max-w-[220px]">{r.name}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-800 font-semibold">{formatNumber(r.sessions)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatNumber(r.conversions)}</td>
              <td className="px-6 py-3 text-right tabular-nums text-slate-600">{r.cr.toFixed(1)}%</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="px-6 py-6 text-center text-slate-400 text-sm">Không có dữ liệu</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
)

export default function WebsiteAnalyticsPage() {
  const [sites, setSites]     = useState<Site[]>([])
  const [siteId, setSiteId]   = useState<string>("")
  const [range, setRange]     = useState("28d")
  const [data, setData]       = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // load sites
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config/ga4")
        const d = await res.json()
        setSites(d.sites ?? [])
        if (d.sites?.length) setSiteId(d.sites[0].id)
        else { setError("GA4 chưa cấu hình"); setLoading(false) }
      } catch { setError("Hiếu đang fix, vui lòng đợi"); setLoading(false) }
    })()
  }, [])

  const load = useCallback(async () => {
    if (!siteId) return
    setLoading(true); setError(null)
    try {
      const start = RANGES.find(r => r.id === range)?.start ?? "28daysAgo"
      const res = await fetch(`/api/analytics/website?siteId=${encodeURIComponent(siteId)}&startDate=${start}&endDate=today`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError("Hiếu đang fix, vui lòng đợi") } finally { setLoading(false) }
  }, [siteId, range])

  useEffect(() => { load() }, [load])

  const k = data?.kpis
  const currentSite = sites.find(s => s.id === siteId)

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm"><Globe className="w-5 h-5" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Website Analytics</h1>
              <p className="text-sm text-slate-500 mt-0.5">GA4 · {currentSite?.name ?? "—"} · {RANGES.find(r => r.id === range)?.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sites.length > 1 && (
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                {sites.map(s => (
                  <button key={s.id} onClick={() => setSiteId(s.id)}
                    className={`px-3 py-1.5 rounded-md font-semibold transition-all ${siteId === s.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
              {RANGES.map(r => (
                <button key={r.id} onClick={() => setRange(r.id)}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${range === r.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <SourceBadge source="ga4" />
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}{error === "GA4 chưa cấu hình" && " — vào Admin → Cài đặt để kết nối GA4."}</div>}
        {loading && <div className="text-sm text-slate-400 py-8">Đang tải dữ liệu GA4…</div>}

        {data && !loading && k && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={<Users className="w-5 h-5" />} accent="bg-blue-50 text-blue-600" label="Người dùng" value={formatNumber(k.activeUsers)} sub={`${formatNumber(k.sessions)} sessions`} />
              <KpiCard icon={<Eye className="w-5 h-5" />} accent="bg-indigo-50 text-indigo-600" label="Lượt xem trang" value={formatNumber(k.pageviews)} sub={`${(k.pageviews / Math.max(k.sessions, 1)).toFixed(1)} trang/session`} />
              <KpiCard icon={<Target className="w-5 h-5" />} accent="bg-emerald-50 text-emerald-600" label="Conversions" value={formatNumber(k.conversions)} sub="key events GA4" />
              <KpiCard icon={<DollarSign className="w-5 h-5" />} accent="bg-amber-50 text-amber-600" label="Doanh thu GA4" value={formatCompactNumber(k.revenue)} sub={`${formatNumber(k.purchases)} đơn`} />
              <KpiCard icon={<MousePointerClick className="w-5 h-5" />} accent="bg-purple-50 text-purple-600" label="Tỷ lệ mua hàng" value={`${k.cr.toFixed(2)}%`} sub="lượt mua / sessions" />
              <KpiCard icon={<TrendingDown className="w-5 h-5" />} accent="bg-rose-50 text-rose-600" label="Bounce rate" value={`${(k.bounceRate * 100).toFixed(1)}%`} sub="trung bình kỳ" />
            </div>

            {/* Traffic + CR combo */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Target className="w-4 h-4" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Traffic & Tỷ lệ chuyển đổi</h3>
                  <p className="text-xs font-medium text-slate-500">Sessions (cột) vs CR% (đường) theo ngày</p>
                </div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                    <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                      formatter={(v: number, n: string) => n === "CR%" ? `${v.toFixed(2)}%` : formatNumber(v)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="sessions" name="Sessions" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={18} />
                    <Line yAxisId="r" type="monotone" dataKey="cr" name="CR%" stroke="#2f9d55" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Users area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Users className="w-4 h-4" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Người dùng theo ngày</h3>
                  <p className="text-xs font-medium text-slate-500">activeUsers</p>
                </div>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series}>
                    <defs><linearGradient id="gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} formatter={(v: number) => formatNumber(v)} />
                    <Area type="monotone" dataKey="users" name="Người dùng" stroke="#6366f1" strokeWidth={2} fill="url(#gu)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top countries + sources */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RankTable title="Top quốc gia" rows={data.countries} />
              <RankTable title="Top nguồn (source / medium)" rows={data.sources} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
