"use client"

import React, { useState, useEffect } from "react"
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, Lock, DollarSign, TrendingUp, UserPlus, Users, PieChart as PieChartIcon, Globe,
} from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"
import { cn } from "@/lib/utils"
import { SourceBadge, LogicNote, DataReadiness, type SourceKind } from "@/components/dashboard-kit"

// ── types ───────────────────────────────────────────────────────────────────
interface MarketCell { vn: number; us: number; total: number }
interface CustCell { revenue: number; count: number }
interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
interface ChannelCell { web: number; app: number; other: number }
interface KpiTarget { vn: number; us: number; total: number }
interface MonthlyData {
  months:       string[]
  currentMonth: string
  elapsedDays:  number
  totalDays:    number
  markets:      Record<string, MarketCell>
  customers:    Record<string, CustRow>
  channels:     Record<string, ChannelCell>
  targets:      Record<string, KpiTarget>
  spend:        Record<string, number>
  budget:       Record<string, number>
  leads:        Record<string, number>
  leadsByChannel: { label: string; byMonth: Record<string, number> }[]
}

// ── helpers ──────────────────────────────────────────────────────────────────
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-")
  return { top: `Thg ${parseInt(mo)}`, sub: `'${y.slice(2)}` }
}
const pct = (cur: number, prev: number): number | null =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null

const Delta = ({ v }: { v: number | null }) => {
  if (v === null) return <span className="text-slate-300 text-[11px]">—</span>
  const up = v >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${up ? "text-emerald-600" : "text-rose-500"}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(v).toFixed(1)}%
    </span>
  )
}

// Section shell — card đồng bộ với các tab analytics khác
const Section = ({ icon, title, desc, children, action, accent = "blue", source, note }: {
  icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode
  accent?: "blue" | "indigo" | "slate"; source?: SourceKind; note?: React.ReactNode
}) => {
  const chip = accent === "indigo" ? "bg-indigo-600" : accent === "slate" ? "bg-slate-700" : "bg-blue-600"
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm", chip)}>{icon}</div>
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">{title}</h2>
            {desc && <p className="text-xs font-medium text-slate-500 mt-0.5">{desc}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          {source && <SourceBadge source={source} />}
        </div>
      </div>
      {note && <div className="px-6 pt-4"><LogicNote>{note}</LogicNote></div>}
      {children}
    </section>
  )
}

// KPI card — đồng bộ format các tab khác
const KpiCard = ({ icon, label, value, sub, delta, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; delta?: number | null; accent: string
}) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <div className={cn("p-2 rounded-xl", accent)}>{icon}</div>
      {delta !== undefined && <Delta v={delta ?? null} />}
    </div>
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</p>
    {sub && <p className="text-xs font-medium text-slate-500 mt-0.5">{sub}</p>}
  </div>
)

// Placeholder cho section chờ nguồn dữ liệu
const AwaitingData = ({ note }: { note: string }) => (
  <div className="px-6 pb-7 pt-5">
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 flex flex-col items-center justify-center text-center gap-2">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
        <Lock className="w-4 h-4 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-500">Chờ kết nối nguồn dữ liệu</p>
      <p className="text-xs text-slate-400 max-w-md">{note}</p>
    </div>
  </div>
)

export default function B2CDashboardPage() {
  const [data, setData]       = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<"revenue" | "kpi">("revenue")
  // GA4 conversion per site (Section 4) — load lazy, graceful nếu chưa cấu hình
  const [ga4, setGa4] = useState<{ name: string; cr: number; series: { date: string; sessions: number; cr: number }[] }[] | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch("/api/analytics/b2c/monthly")
        if (!res.ok) throw new Error(`${res.status}`)
        setData(await res.json())
      } catch (err) {
        console.error(err); setError("Hiếu đang fix, vui lòng đợi")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // GA4 (Section 4) — riêng, không chặn main load
  useEffect(() => {
    (async () => {
      try {
        const sd = await (await fetch("/api/config/ga4")).json()
        const sites: { id: string; name: string }[] = sd.sites ?? []
        if (!sites.length) { setGa4([]); return }
        const out: { name: string; cr: number; series: { date: string; sessions: number; cr: number }[] }[] = []
        for (const s of sites) {
          const r = await fetch(`/api/analytics/website?siteId=${encodeURIComponent(s.id)}&days=28`)
          if (!r.ok) continue
          const d = await r.json()
          out.push({ name: s.name, cr: d.kpis?.cr ?? 0, series: d.series ?? [] })
        }
        setGa4(out)
      } catch { setGa4([]) }
    })()
  }, [])

  const completed = data ? data.months.slice(0, 5) : []
  const current   = data?.currentMonth ?? ""
  const prevFull  = data ? data.months[4] : ""
  const proj      = (mtd: number) => data && data.elapsedDays > 0 ? mtd / data.elapsedDays * data.totalDays : 0

  // ── KPI values (MTD tháng hiện tại) ─────────────────────────────────────────
  const mtdTotal   = data?.markets[current]?.total ?? 0
  const prevTotal  = data?.markets[prevFull]?.total ?? 0
  const cust       = data?.customers[current]
  const newRev     = cust?.new.revenue ?? 0
  const retRev     = cust?.returning.revenue ?? 0
  const totRev     = cust?.total.revenue ?? 0
  const newShare   = totRev > 0 ? (newRev / totRev) * 100 : 0

  // ── chart series (rolling 6 tháng) ──────────────────────────────────────────
  const revSeries = data ? data.months.map(m => ({
    name: `${monthLabel(m).top} ${monthLabel(m).sub}`,
    "VN B2C": data.markets[m]?.vn ?? 0,
    "US B2C": data.markets[m]?.us ?? 0,
  })) : []
  const custSeries = data ? data.months.map(m => ({
    name: `${monthLabel(m).top} ${monthLabel(m).sub}`,
    "Khách mới": data.customers[m]?.new.revenue ?? 0,
    "Quay lại":  data.customers[m]?.returning.revenue ?? 0,
  })) : []

  // generic rolling-table renderer
  const RollingTable = ({ rows }: {
    rows: { label: string; highlight?: boolean; breakdown?: boolean; get: (m: string) => number; sub?: (m: string) => string | null }[]
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider">Line</th>
            {completed.map(m => {
              const l = monthLabel(m)
              return <th key={m} className="text-right font-semibold px-4 py-3 text-xs">{l.top} <span className="text-slate-300">{l.sub}</span></th>
            })}
            <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500">{monthLabel(current).top} <span className="text-blue-300">MTD</span></th>
            <th className="text-right font-semibold px-4 py-3 text-xs">MoM</th>
            <th className="text-right font-semibold px-4 py-3 text-xs">Prorata</th>
            <th className="text-right font-semibold px-4 py-3 text-xs">vs prev</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(row => {
            const mtd      = row.get(current)
            const prevVal  = row.get(prevFull)
            const prorata  = proj(mtd)
            return (
              <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                <td className={`px-6 py-4 text-left ${row.highlight ? "font-bold text-slate-900" : row.breakdown ? "font-medium text-slate-500 pl-9" : "font-semibold text-slate-700"}`}>
                  {row.breakdown && <span className="text-slate-300 mr-1">›</span>}{row.label}
                </td>
                {completed.map((m, i) => {
                  const v = row.get(m)
                  const prev = i > 0 ? row.get(completed[i - 1]) : null
                  return (
                    <td key={m} className="px-4 py-4 text-right tabular-nums">
                      <div className="text-slate-800 font-semibold">{formatCompactNumber(v)}</div>
                      <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>
                      {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(m)}</div>}
                    </td>
                  )
                })}
                <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40">
                  <div className="text-slate-900 font-bold">{formatCompactNumber(mtd)}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">MTD</div>
                  {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(current)}</div>}
                </td>
                <td className="px-4 py-4 text-right"><Delta v={pct(mtd, prevVal)} /></td>
                <td className="px-4 py-4 text-right tabular-nums">
                  <div className="text-slate-800 font-semibold">{formatCompactNumber(prorata)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">run-rate</div>
                </td>
                <td className="px-4 py-4 text-right"><Delta v={pct(prorata, prevVal)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // KPI tab — actual vs target (theo tháng × VN/US/Total). Target nhập ở Settings → b2c_kpi_targets.
  const KpiTable = () => {
    if (!data) return null
    const targets = data.targets ?? {}
    const hasTarget = Object.values(targets).some(t => (t?.vn || 0) + (t?.us || 0) + (t?.total || 0) > 0)
    if (!hasTarget)
      return <AwaitingData note="Chưa có KPI target. Admin vào Settings → 'KPI Target B2C' để nhập target doanh thu theo tháng × thị trường (VN / US / Total). Sau khi lưu, tab này hiển thị MTD vs target, prorata vs KPI và % đạt." />

    const lines: { key: keyof KpiTarget; label: string; highlight?: boolean }[] = [
      { key: "vn",    label: "VN B2C" },
      { key: "us",    label: "US B2C" },
      { key: "total", label: "Total B2C", highlight: true },
    ]
    const Attain = ({ actual, target }: { actual: number; target: number }) => {
      if (!target) return <span className="text-slate-300 text-[11px]">—</span>
      const p = (actual / target) * 100
      const c = p >= 100 ? "text-emerald-600" : p >= 80 ? "text-amber-600" : "text-rose-500"
      return <span className={`text-[11px] font-semibold ${c}`}>{p.toFixed(0)}%</span>
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider">Line</th>
              {completed.map(m => {
                const l = monthLabel(m)
                return <th key={m} className="text-right font-semibold px-4 py-3 text-xs">{l.top} <span className="text-slate-300">{l.sub}</span></th>
              })}
              <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500">{monthLabel(current).top} <span className="text-blue-300">MTD</span></th>
              <th className="text-right font-semibold px-4 py-3 text-xs">Prorata</th>
              <th className="text-right font-semibold px-4 py-3 text-xs">% đạt KPI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lines.map(line => {
              const mtd      = data.markets[current]?.[line.key] ?? 0
              const prorata  = proj(mtd)
              const tgtCur   = targets[current]?.[line.key] ?? 0
              return (
                <tr key={line.key} className={line.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                  <td className={`px-6 py-4 text-left ${line.highlight ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{line.label}</td>
                  {completed.map(m => {
                    const v   = data.markets[m]?.[line.key] ?? 0
                    const tgt = targets[m]?.[line.key] ?? 0
                    return (
                      <td key={m} className="px-4 py-4 text-right tabular-nums">
                        <div className="text-slate-800 font-semibold">{formatCompactNumber(v)}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">KPI {tgt ? formatCompactNumber(tgt) : "—"}</div>
                        <div className="mt-0.5"><Attain actual={v} target={tgt} /></div>
                      </td>
                    )
                  })}
                  <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40">
                    <div className="text-slate-900 font-bold">{formatCompactNumber(mtd)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">KPI {tgtCur ? formatCompactNumber(tgtCur) : "—"}</div>
                    <div className="mt-0.5"><Attain actual={mtd} target={tgtCur} /></div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    <div className="text-slate-800 font-semibold">{formatCompactNumber(prorata)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">run-rate</div>
                  </td>
                  <td className="px-4 py-4 text-right"><Attain actual={prorata} target={tgtCur} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Bảng rolling gọn — value tự định dạng theo từng dòng, KHÔNG prorata (tránh chiếu sai tỷ số như CAC/ROAS).
  const SimpleRollTable = ({ rows }: {
    rows: { label: string; highlight?: boolean; breakdown?: boolean; delta?: boolean; fmt: (n: number) => string; get: (m: string) => number; sub?: (m: string) => string }[]
  }) => (
    <div className="overflow-x-auto px-0 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider">Chỉ số</th>
            {completed.map(m => {
              const l = monthLabel(m)
              return <th key={m} className="text-right font-semibold px-4 py-3 text-xs">{l.top} <span className="text-slate-300">{l.sub}</span></th>
            })}
            <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500">{monthLabel(current).top} <span className="text-blue-300">MTD</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(row => (
            <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
              <td className={`px-6 py-4 text-left ${row.highlight ? "font-bold text-slate-900" : row.breakdown ? "font-medium text-slate-500 pl-9" : "font-semibold text-slate-700"}`}>
                {row.breakdown && <span className="text-slate-300 mr-1">›</span>}{row.label}
              </td>
              {completed.map((m, i) => {
                const v = row.get(m)
                const prev = i > 0 ? row.get(completed[i - 1]) : null
                return (
                  <td key={m} className="px-4 py-4 text-right tabular-nums">
                    <div className="text-slate-800 font-semibold">{row.fmt(v)}</div>
                    {row.delta !== false && <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>}
                    {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(m)}</div>}
                  </td>
                )
              })}
              <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40">
                <div className="text-slate-900 font-bold">{row.fmt(row.get(current))}</div>
                <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">MTD</div>
                {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(current)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // helpers cho Section 3 & 5
  const spendOf  = (m: string) => data?.spend?.[m] ?? 0
  const budgetOf = (m: string) => data?.budget?.[m] ?? 0
  const leadsOf  = (m: string) => data?.leads?.[m] ?? 0
  const revOf    = (m: string) => data?.markets[m]?.total ?? 0
  const newOf    = (m: string) => data?.customers[m]?.new.count ?? 0
  const fmtX     = (n: number) => n > 0 ? `${n.toFixed(2)}×` : "—"
  const fmtPctV  = (n: number) => n > 0 ? `${n.toFixed(1)}%` : "—"
  const hasSpend = data ? data.months.some(m => spendOf(m) > 0) : false
  const hasBudget = data ? data.months.some(m => budgetOf(m) > 0) : false
  const hasLeads = data ? data.months.some(m => leadsOf(m) > 0) : false

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">B2C Performance</h1>
            <p className="text-sm text-slate-500 mt-0.5">Executive dashboard · rolling 6 tháng · {current ? `${monthLabel(current).top} ${current.split("-")[0]}` : "—"}</p>
          </div>
          {data && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              MTD: {data.elapsedDays}/{data.totalDays} ngày
            </span>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
        {loading && <div className="text-sm text-slate-400 py-8">Đang tải dữ liệu…</div>}

        {data && !loading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard icon={<DollarSign className="w-5 h-5" />} accent="bg-blue-50 text-blue-600"
                label="Doanh thu B2C (MTD)" value={formatCurrency(mtdTotal)} delta={pct(mtdTotal, prevTotal)} sub="vs tháng trước" />
              <KpiCard icon={<TrendingUp className="w-5 h-5" />} accent="bg-emerald-50 text-emerald-600"
                label="Dự phóng tháng" value={formatCurrency(proj(mtdTotal))} sub="run-rate prorata" />
              <KpiCard icon={<UserPlus className="w-5 h-5" />} accent="bg-indigo-50 text-indigo-600"
                label="Khách mới (MTD)" value={formatNumber(cust?.new.count ?? 0)} sub={`${formatCurrency(newRev)} doanh thu`} />
              <KpiCard icon={<Users className="w-5 h-5" />} accent="bg-purple-50 text-purple-600"
                label="Khách quay lại (MTD)" value={formatNumber(cust?.returning.count ?? 0)} sub={`${formatCurrency(retRev)} doanh thu`} />
              <KpiCard icon={<PieChartIcon className="w-5 h-5" />} accent="bg-orange-50 text-orange-600"
                label="Tỷ trọng khách mới" value={`${newShare.toFixed(1)}%`} sub="doanh thu khách mới / tổng" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue by market */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Globe className="w-4 h-4" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Doanh thu B2C theo thị trường</h3>
                    <p className="text-xs font-medium text-slate-500">VN vs US · rolling 6 tháng</p>
                  </div>
                </div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revSeries}>
                      <defs>
                        <linearGradient id="gvn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient>
                        <linearGradient id="gus" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} formatter={(v: number) => formatCurrency(v)} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="VN B2C" stackId="1" stroke="#2563eb" strokeWidth={2} fill="url(#gvn)" />
                      <Area type="monotone" dataKey="US B2C" stackId="1" stroke="#6366f1" strokeWidth={2} fill="url(#gus)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Customers new vs returning */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Users className="w-4 h-4" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Khách mới vs quay lại</h3>
                    <p className="text-xs font-medium text-slate-500">Doanh thu theo nhóm khách · rolling 6 tháng</p>
                  </div>
                </div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={custSeries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => formatCompactNumber(v)} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} formatter={(v: number) => formatCurrency(v)} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Khách mới" stackId="c" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={26} />
                      <Bar dataKey="Quay lại" stackId="c" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Section 1 — Revenue + Breakdown */}
            <Section
              icon={<DollarSign className="w-5 h-5" />}
              title="Doanh thu B2C & Breakdown"
              desc="Theo thị trường, rolling 6 tháng"
              source="admin"
              note={tab === "revenue"
                ? <><strong>MTD</strong> = doanh thu từ đầu tháng đến hiện tại · <strong>Prorata</strong> = MTD ÷ số ngày đã qua × số ngày trong tháng (run-rate) · <strong>MoM</strong> so với cùng kỳ tháng trước. Sub-row <strong>Web / App / Khác</strong> chia theo kênh bán (sub_group_name): Websites, Mobile-App, còn lại.</>
                : <><strong>% đạt KPI</strong> = doanh thu thực tế ÷ target. Tháng đang chạy so target theo <strong>Prorata</strong> (run-rate). Target nhập ở Settings → KPI Target B2C. <span className="text-emerald-600 font-semibold">≥100%</span> · <span className="text-amber-600 font-semibold">≥80%</span> · <span className="text-rose-500 font-semibold">&lt;80%</span>.</>}
              action={
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                  {(["revenue", "kpi"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all ${tab === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                      {t === "revenue" ? "Revenue" : "KPI"}
                    </button>
                  ))}
                </div>
              }
            >
              {tab === "revenue" ? (
                <RollingTable rows={[
                  { label: "VN B2C",    get: m => data.markets[m]?.vn ?? 0 },
                  { label: "US B2C",    get: m => data.markets[m]?.us ?? 0 },
                  { label: "Total B2C", get: m => data.markets[m]?.total ?? 0, highlight: true },
                  { label: "Web",       get: m => data.channels[m]?.web ?? 0,   breakdown: true },
                  { label: "App",       get: m => data.channels[m]?.app ?? 0,   breakdown: true },
                  { label: "Khác",      get: m => data.channels[m]?.other ?? 0, breakdown: true },
                ]} />
              ) : (
                <KpiTable />
              )}
            </Section>

            {/* Section 2 — Revenue by Customers */}
            <Section icon={<Users className="w-5 h-5" />} accent="indigo" title="Doanh thu theo Customers" desc="New vs Returning · revenue + số khách"
              source="admin"
              note={<><strong>Khách mới</strong> = tháng có đơn B2C ĐẦU TIÊN của khách · <strong>Quay lại</strong> = đã từng mua trước đó. Mỗi ô: doanh thu + số khách bên dưới.</>}>
              <RollingTable rows={[
                { label: "New",       get: m => data.customers[m]?.new.revenue ?? 0,       sub: m => `${formatNumber(data.customers[m]?.new.count ?? 0)} khách` },
                { label: "Returning", get: m => data.customers[m]?.returning.revenue ?? 0, sub: m => `${formatNumber(data.customers[m]?.returning.count ?? 0)} khách` },
                { label: "Total",     get: m => data.customers[m]?.total.revenue ?? 0,     sub: m => `${formatNumber(data.customers[m]?.total.count ?? 0)} khách`, highlight: true },
              ]} />
            </Section>

            {/* Section 3 — CAC, Users, Leads */}
            <Section icon={<UserPlus className="w-5 h-5" />} accent="slate" title="CAC · Leads · Khách mới" desc="Hiệu quả acquisition · rolling 6 tháng"
              source="admin"
              note={<><strong>Leads</strong> = hội thoại mới trên Chatwoot (Web/WhatsApp/Facebook/Instagram/Tiktok). <strong>CAC</strong> = chi phí ÷ khách mới · <strong>Chi phí/Lead</strong> = chi phí ÷ leads · <strong>Tỷ lệ chốt</strong> = khách mới ÷ leads. Chi phí từ Turso, khách mới từ gohub_dw.</>}>
              {hasSpend || hasLeads ? (
                <SimpleRollTable rows={[
                  { label: "Chi phí MKT", fmt: formatCompactNumber, get: spendOf },
                  ...(hasLeads ? [
                    { label: "Leads", fmt: formatNumber, get: leadsOf },
                    ...(data.leadsByChannel ?? []).map(ch => ({
                      label: ch.label, breakdown: true, delta: false, fmt: formatNumber,
                      get: (m: string) => ch.byMonth[m] ?? 0,
                    })),
                  ] : []),
                  { label: "Khách mới",   fmt: formatNumber,        get: newOf },
                  { label: "CAC / khách", fmt: (n: number) => n > 0 ? formatCurrency(n) : "—", delta: false, highlight: true,
                    get: m => { const nc = newOf(m); return nc > 0 ? spendOf(m) / nc : 0 } },
                  ...(hasLeads ? [
                    { label: "Chi phí / Lead", fmt: (n: number) => n > 0 ? formatCurrency(n) : "—", delta: false,
                      get: (m: string) => { const l = leadsOf(m); return l > 0 ? spendOf(m) / l : 0 } },
                    { label: "Tỷ lệ chốt", fmt: fmtPctV, delta: false,
                      get: (m: string) => { const l = leadsOf(m); return l > 0 ? newOf(m) / l * 100 : 0 } },
                  ] : []),
                ]} />
              ) : (
                <AwaitingData note="Chưa có dữ liệu chi phí marketing (Turso) lẫn leads (Chatwoot). Kiểm tra TURSO_* và CHATWOOT_* trong env." />
              )}
            </Section>

            {/* Section 4 — GA4 Conversion Rate Charts */}
            <Section icon={<TrendingUp className="w-5 h-5" />} accent="slate" title="GA4 Conversion Rate" desc="Sessions vs CR% theo site · 28 ngày" source="ga4"
              note={<><strong>CR%</strong> = conversions ÷ sessions (GA4). Cột = sessions, đường = CR%. Chi tiết hơn ở trang <strong>Website (GA4)</strong>.</>}
              action={<a href="/analytics/website" className="text-xs font-semibold text-blue-600 hover:underline">Xem chi tiết →</a>}>
              {ga4 === null ? (
                <div className="px-6 pb-6 pt-3 text-sm text-slate-400">Đang tải GA4…</div>
              ) : ga4.length === 0 ? (
                <AwaitingData note="GA4 chưa cấu hình hoặc không có dữ liệu. Vào Admin → Cài đặt để kết nối GA4." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 pb-6 pt-3">
                  {ga4.map(s => (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-700">{s.name}</h4>
                        <span className="text-xs font-semibold text-emerald-600">CR {s.cr.toFixed(2)}%</span>
                      </div>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={s.series}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => formatCompactNumber(v)} />
                            <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                            <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                              formatter={(v: number, n: string) => n === "CR%" ? `${v.toFixed(2)}%` : formatNumber(v)} />
                            <Bar yAxisId="l" dataKey="sessions" name="Sessions" fill="#2563eb" radius={[3, 3, 0, 0]} barSize={10} />
                            <Line yAxisId="r" type="monotone" dataKey="cr" name="CR%" stroke="#2f9d55" strokeWidth={2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Section 5 — Spend & ROAS */}
            <Section icon={<PieChartIcon className="w-5 h-5" />} accent="indigo" title="Chi phí Marketing & ROAS" desc="Budget · Spend · ROAS · rolling 6 tháng"
              source="admin"
              note={<><strong>ROAS</strong> = doanh thu B2C ÷ chi phí marketing · <strong>Spend pace</strong> = chi phí ÷ ngân sách · <strong>% Chi phí/DT</strong> = chi phí ÷ doanh thu. Chi phí từ Turso (nhập tay), ngân sách nhập ở Settings → Ngân sách Marketing B2C.</>}>
              {hasSpend ? (
                <SimpleRollTable rows={[
                  { label: "Chi phí MKT",  fmt: formatCompactNumber, get: spendOf },
                  ...(hasBudget ? [
                    { label: "Ngân sách",  fmt: formatCompactNumber, delta: false, get: budgetOf },
                    { label: "Spend pace", fmt: fmtPctV, delta: false,
                      get: (m: string) => { const b = budgetOf(m); return b > 0 ? spendOf(m) / b * 100 : 0 } },
                  ] : []),
                  { label: "Doanh thu B2C", fmt: formatCompactNumber, get: revOf },
                  { label: "ROAS",          fmt: fmtX, delta: false, highlight: true,
                    get: m => { const s = spendOf(m); return s > 0 ? revOf(m) / s : 0 } },
                  { label: "% Chi phí/DT",  fmt: fmtPctV, delta: false,
                    get: m => { const r = revOf(m); return r > 0 ? spendOf(m) / r * 100 : 0 } },
                ]} />
              ) : (
                <AwaitingData note="Chưa có dữ liệu chi phí marketing trong Turso (channel_group_costs, group_name='B2C'). Kiểm tra TURSO_URL / TURSO_AUTH_TOKEN trong env." />
              )}
            </Section>

            {/* Data readiness — cho biết độ tin của số liệu (theo mockup) */}
            <Section icon={<Globe className="w-5 h-5" />} accent="slate" title="Data Readiness" desc="Độ sẵn sàng của từng nguồn dữ liệu">
              <div className="px-6 pb-6 pt-1">
                <DataReadiness items={[
                  { label: "Admin GoHub — doanh thu & khách (Section 1, 2)",   status: "ready" },
                  { label: "Turso — chi phí MKT, CAC, ROAS (Section 3, 5)",     status: hasSpend ? "ready" : "pending" },
                  { label: "Chatwoot — leads (Section 3)",                     status: hasLeads ? "ready" : "pending" },
                  { label: "GA4 — traffic & conversion (Section 4)",           status: ga4 && ga4.length > 0 ? "ready" : "pending" },
                ]} />
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
