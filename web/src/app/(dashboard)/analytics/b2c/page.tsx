"use client"

import React, { useState, useEffect } from "react"
import { ArrowUpRight, ArrowDownRight, Lock } from "lucide-react"
import { formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"

// ── types ───────────────────────────────────────────────────────────────────
interface MarketCell { vn: number; us: number; total: number }
interface CustCell { revenue: number; count: number }
interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
interface MonthlyData {
  months:       string[]
  currentMonth: string
  elapsedDays:  number
  totalDays:    number
  markets:      Record<string, MarketCell>
  customers:    Record<string, CustRow>
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

// Section shell — Apple-style soft card
const Section = ({ n, title, desc, children, action }: {
  n: number; title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode
}) => (
  <section className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <div className="px-7 pt-6 pb-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-[0.15em]">Section {n}</p>
        <h2 className="text-lg font-medium text-slate-800 mt-0.5">{title}</h2>
        {desc && <p className="text-sm text-slate-400 mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

// Placeholder for sections waiting on data sources
const AwaitingData = ({ note }: { note: string }) => (
  <div className="px-7 pb-8 pt-2">
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

  const completed = data ? data.months.slice(0, 5) : []
  const current   = data?.currentMonth ?? ""
  const prevFull  = data ? data.months[4] : ""
  const proj      = (mtd: number) => data && data.elapsedDays > 0 ? mtd / data.elapsedDays * data.totalDays : 0

  // generic rolling-table renderer
  const RollingTable = ({ rows }: {
    rows: { label: string; highlight?: boolean; get: (m: string) => number; sub?: (m: string) => string | null }[]
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-y border-slate-100">
            <th className="text-left font-medium px-7 py-3 text-xs uppercase tracking-wider">Line</th>
            {completed.map(m => {
              const l = monthLabel(m)
              return <th key={m} className="text-right font-medium px-4 py-3 text-xs">{l.top} <span className="text-slate-300">{l.sub}</span></th>
            })}
            <th className="text-right font-medium px-4 py-3 text-xs text-slate-500">{monthLabel(current).top} <span className="text-slate-300">MTD</span></th>
            <th className="text-right font-medium px-4 py-3 text-xs">MoM</th>
            <th className="text-right font-medium px-4 py-3 text-xs">Prorata</th>
            <th className="text-right font-medium px-4 py-3 text-xs">vs prev</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(row => {
            const mtd      = row.get(current)
            const prevVal  = row.get(prevFull)
            const prorata  = proj(mtd)
            return (
              <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                <td className={`px-7 py-4 text-left ${row.highlight ? "font-semibold text-slate-800" : "font-normal text-slate-600"}`}>{row.label}</td>
                {completed.map((m, i) => {
                  const v = row.get(m)
                  const prev = i > 0 ? row.get(completed[i - 1]) : null
                  return (
                    <td key={m} className="px-4 py-4 text-right tabular-nums">
                      <div className="text-slate-700">{formatCompactNumber(v)}</div>
                      <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>
                      {row.sub && <div className="text-[10px] text-slate-400 mt-0.5">{row.sub(m)}</div>}
                    </td>
                  )
                })}
                <td className="px-4 py-4 text-right tabular-nums bg-blue-50/30">
                  <div className="text-slate-900 font-medium">{formatCompactNumber(mtd)}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">MTD</div>
                  {row.sub && <div className="text-[10px] text-slate-400 mt-0.5">{row.sub(current)}</div>}
                </td>
                <td className="px-4 py-4 text-right"><Delta v={pct(mtd, prevVal)} /></td>
                <td className="px-4 py-4 text-right tabular-nums">
                  <div className="text-slate-700">{formatCompactNumber(prorata)}</div>
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

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6 lg:p-10">
      <div className="max-w-[1400px] mx-auto space-y-10">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">gohub b2c</h1>
            <p className="text-sm text-slate-400 mt-1">B2C executive dashboard · {current ? monthLabel(current).top + " " + current.split("-")[0] : "—"}</p>
          </div>
          {data && (
            <p className="text-xs text-slate-400">
              MTD: {data.elapsedDays}/{data.totalDays} ngày
            </p>
          )}
        </header>

        {error && <div className="bg-white border border-rose-100 text-rose-600 rounded-2xl p-5 text-sm">{error}</div>}
        {loading && <div className="text-sm text-slate-400">Đang tải dữ liệu…</div>}

        {data && !loading && (
          <>
            {/* Section 1 — Revenue + Breakdown */}
            <Section
              n={1}
              title="Doanh thu B2C & Breakdown"
              desc="Theo thị trường, rolling 6 tháng"
              action={
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                  {(["revenue", "kpi"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all capitalize ${tab === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
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
                ]} />
              ) : (
                <AwaitingData note="KPI target được nhập/import trong Settings (theo tháng, theo line item). Sau khi lưu, tab KPI sẽ hiển thị % đạt KPI, MTD vs target, prorata vs KPI." />
              )}
            </Section>

            {/* Section 2 — Revenue by Customers */}
            <Section n={2} title="Doanh thu theo Customers" desc="New vs Returning · revenue + số khách">
              <RollingTable rows={[
                { label: "New",       get: m => data.customers[m]?.new.revenue ?? 0,       sub: m => `${formatNumber(data.customers[m]?.new.count ?? 0)} khách` },
                { label: "Returning", get: m => data.customers[m]?.returning.revenue ?? 0, sub: m => `${formatNumber(data.customers[m]?.returning.count ?? 0)} khách` },
                { label: "Total",     get: m => data.customers[m]?.total.revenue ?? 0,     sub: m => `${formatNumber(data.customers[m]?.total.count ?? 0)} khách`, highlight: true },
              ]} />
            </Section>

            {/* Section 3 — CAC, Users, Leads */}
            <Section n={3} title="CAC · User Count · Leads" desc="Hiệu quả acquisition theo VN/US">
              <AwaitingData note="Cần nguồn: Marketing spend (CAC), GA4 (user count New/Returning theo VN/US), và Leads (Website chat / Zalo / WhatsApp / Messenger — dedup theo identity)." />
            </Section>

            {/* Section 4 — GA4 Conversion Rate Charts */}
            <Section n={4} title="GA4 Conversion Rate" desc="Combo chart App / .com / .vn (Purchase · Revenue · %CR · Traffic)">
              <AwaitingData note="Cần kết nối GA4 (Google service account + GA_PROPERTY_ID). Sau khi có, hiển thị 3 combo chart: % CR Gohub App, % CR Gohub .com, % CR Gohub .vn." />
            </Section>

            {/* Section 5 — Budget Management */}
            <Section n={5} title="Budget Management" desc="Budget · Spend MTD · Spend pace · ROAS">
              <AwaitingData note="Cần bảng marketing: monthly_budget, spend_mtd, attributed_revenue (theo VN/US/Total + refresh_timestamp). Công thức: Spend pace = Spend MTD / Budget · ROAS = Attributed revenue / Spend." />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
