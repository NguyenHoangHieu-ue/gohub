"use client"

import React, { useState, useEffect } from "react"
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts"
import {
  ArrowUpRight, ArrowDownRight, Lock, DollarSign, TrendingUp, UserPlus, Users, PieChart as PieChartIcon, Globe,
} from "lucide-react"
import { formatCurrency, formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"
import { cn } from "@/lib/utils"
import { SourceBadge, LogicNote, type SourceKind } from "@/components/dashboard-kit"

// ── types ───────────────────────────────────────────────────────────────────
interface MarketCell { vn: number; us: number; total: number }
interface CustCell { revenue: number; count: number }
interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
interface ChannelCell { web: number; app: number; other: number }
interface MarketChannelCell { vnSales: number; vnWeb: number; usSales: number; usApp: number; usWeb: number }
interface KpiTarget { vn: number; us: number; total: number }
interface UserCell { vnNew: number; vnReturning: number; usNew: number; usReturning: number; total: number }
interface MarketBudgetCell { vn: number; us: number; total: number }
interface ProfitCell { revenue: number; cogs: number; grossProfit: number; opCost: number; cm1: number }
interface MonthlyData {
  dataAsOf?: string       // T-1 date khi live (YYYY-MM-DD)
  isLive?: boolean
  months:       string[]
  currentMonth: string
  elapsedDays:  number
  totalDays:    number
  markets:      Record<string, MarketCell>
  customers:    Record<string, CustRow>
  customerSource?: "admin-gohub" | "admin-gohub-snapshot" | "analytics-db"
  customerBreakdown?: "new-returning" | "total-only"
  customerError?: string
  channels:     Record<string, ChannelCell>
  marketChannels?: Record<string, MarketChannelCell>
  profitByChannel?: Record<string, Record<string, ProfitCell>>
  targets:      Record<string, KpiTarget>
  spend:        Record<string, number>
  budget:       Record<string, number>
  spendByMarket?: Record<string, MarketBudgetCell>
  budgetByMarket?: Record<string, MarketBudgetCell>
  leads:        Record<string, number>
  leadsByMarket?: Record<string, { vn: number; us: number }>
  users?:        Record<string, UserCell>
  leadsByChannel: { label: string; byMonth: Record<string, number> }[]
  refreshTimestamp?: string
}

const DEMO_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]
const demoMonthLabel = (m: string) => {
  const [y, mo] = m.split("-")
  return { top: `Thg ${parseInt(mo)}`, sub: `'${y.slice(2)}` }
}
const blankCust = (revenue = 0, count = 0): CustCell => ({ revenue, count })
const byMonth = <T,>(values: T[]) => Object.fromEntries(DEMO_MONTHS.map((m, i) => [m, values[i]])) as Record<string, T>
const DEMO_DATA: MonthlyData = {
  months: DEMO_MONTHS,
  currentMonth: "2026-07",
  elapsedDays: 13,
  totalDays: 31,
  markets: {
    "2026-01": { vn: 610_000_000, us: 190_000_000, total: 800_000_000 },
    "2026-02": { vn: 680_000_000, us: 220_000_000, total: 900_000_000 },
    "2026-03": { vn: 820_000_000, us: 340_000_000, total: 1_160_000_000 },
    "2026-04": { vn: 1_380_000_000, us: 520_000_000, total: 1_900_000_000 },
    "2026-05": { vn: 980_000_000, us: 390_000_000, total: 1_370_000_000 },
    "2026-06": { vn: 737_078_699, us: 146_061_727, total: 883_140_426 },
    "2026-07": { vn: 650_538_200, us: 65_792_220, total: 716_330_420 },
  },
  customers: {
    "2026-01": { new: blankCust(680_000_000, 1320), returning: blankCust(180_000_000, 340), total: blankCust(860_000_000, 1660) },
    "2026-02": { new: blankCust(760_000_000, 1450), returning: blankCust(210_000_000, 392), total: blankCust(970_000_000, 1842) },
    "2026-03": { new: blankCust(1_020_000_000, 1715), returning: blankCust(310_000_000, 480), total: blankCust(1_330_000_000, 2195) },
    "2026-04": { new: blankCust(1_510_000_000, 2480), returning: blankCust(680_000_000, 760), total: blankCust(2_190_000_000, 3240) },
    "2026-05": { new: blankCust(1_120_000_000, 1980), returning: blankCust(440_000_000, 520), total: blankCust(1_560_000_000, 2500) },
    "2026-06": { new: blankCust(1_210_000_000, 2248), returning: blankCust(675_000_000, 916), total: blankCust(1_885_000_000, 3164) },
    "2026-07": { new: blankCust(460_000_000, 1260), returning: blankCust(256_330_420, 420), total: blankCust(716_330_420, 1680) },
  },
  channels: {
    "2026-01": { web: 240_000_000, app: 180_000_000, other: 380_000_000 },
    "2026-02": { web: 280_000_000, app: 210_000_000, other: 410_000_000 },
    "2026-03": { web: 310_000_000, app: 250_000_000, other: 600_000_000 },
    "2026-04": { web: 420_000_000, app: 330_000_000, other: 1_150_000_000 },
    "2026-05": { web: 260_000_000, app: 190_000_000, other: 920_000_000 },
    "2026-06": { web: 288_604_224, app: 104_898_583, other: 489_637_619 },
    "2026-07": { web: 288_604_224, app: 49_994_096, other: 377_732_100 },
  },
  marketChannels: {
    "2026-01": { vnSales: 430_000_000, vnWeb: 180_000_000, usSales: 20_000_000, usApp: 120_000_000, usWeb: 50_000_000 },
    "2026-02": { vnSales: 480_000_000, vnWeb: 200_000_000, usSales: 30_000_000, usApp: 150_000_000, usWeb: 40_000_000 },
    "2026-03": { vnSales: 590_000_000, vnWeb: 230_000_000, usSales: 60_000_000, usApp: 170_000_000, usWeb: 110_000_000 },
    "2026-04": { vnSales: 1_050_000_000, vnWeb: 330_000_000, usSales: 100_000_000, usApp: 330_000_000, usWeb: 90_000_000 },
    "2026-05": { vnSales: 760_000_000, vnWeb: 220_000_000, usSales: 130_000_000, usApp: 190_000_000, usWeb: 70_000_000 },
    "2026-06": { vnSales: 489_637_619, vnWeb: 247_441_080, usSales: 0, usApp: 104_898_583, usWeb: 41_163_144 },
    "2026-07": { vnSales: 430_000_000, vnWeb: 220_538_200, usSales: 15_798_124, usApp: 49_994_096, usWeb: 0 },
  },
  targets: {
    "2026-01": { vn: 650_000_000, us: 230_000_000, total: 880_000_000 },
    "2026-02": { vn: 700_000_000, us: 260_000_000, total: 960_000_000 },
    "2026-03": { vn: 850_000_000, us: 350_000_000, total: 1_200_000_000 },
    "2026-04": { vn: 1_200_000_000, us: 460_000_000, total: 1_660_000_000 },
    "2026-05": { vn: 1_000_000_000, us: 410_000_000, total: 1_410_000_000 },
    "2026-06": { vn: 760_000_000, us: 150_000_000, total: 910_000_000 },
    "2026-07": { vn: 1_550_000_000, us: 156_000_000, total: 1_708_000_000 },
  },
  spend: {
    "2026-01": 132_000_000,
    "2026-02": 142_000_000,
    "2026-03": 156_000_000,
    "2026-04": 180_000_000,
    "2026-05": 158_000_000,
    "2026-06": 181_000_000,
    "2026-07": 72_000_000,
  },
  budget: {
    "2026-01": 145_000_000,
    "2026-02": 150_000_000,
    "2026-03": 160_000_000,
    "2026-04": 175_000_000,
    "2026-05": 170_000_000,
    "2026-06": 185_000_000,
    "2026-07": 200_000_000,
  },
  spendByMarket: {
    "2026-07": { vn: 52_000_000, us: 20_000_000, total: 72_000_000 },
  },
  budgetByMarket: {
    "2026-07": { vn: 145_000_000, us: 55_000_000, total: 200_000_000 },
  },
  leads: {
    "2026-01": 460,
    "2026-02": 510,
    "2026-03": 640,
    "2026-04": 890,
    "2026-05": 580,
    "2026-06": 837,
    "2026-07": 460,
  },
  leadsByMarket: {
    "2026-01": { vn: 350, us: 110 },
    "2026-02": { vn: 390, us: 120 },
    "2026-03": { vn: 480, us: 160 },
    "2026-04": { vn: 650, us: 240 },
    "2026-05": { vn: 430, us: 150 },
    "2026-06": { vn: 612, us: 225 },
    "2026-07": { vn: 340, us: 120 },
  },
  users: {
    "2026-01": { vnNew: 6800, vnReturning: 2800, usNew: 2600, usReturning: 1050, total: 13250 },
    "2026-02": { vnNew: 7200, vnReturning: 3100, usNew: 2900, usReturning: 1200, total: 14400 },
    "2026-03": { vnNew: 8100, vnReturning: 3600, usNew: 3300, usReturning: 1400, total: 16400 },
    "2026-04": { vnNew: 9800, vnReturning: 4100, usNew: 4200, usReturning: 1800, total: 19900 },
    "2026-05": { vnNew: 7600, vnReturning: 3400, usNew: 3100, usReturning: 1300, total: 15400 },
    "2026-06": { vnNew: 8400, vnReturning: 3900, usNew: 3600, usReturning: 1500, total: 17400 },
    "2026-07": { vnNew: 4200, vnReturning: 1900, usNew: 1800, usReturning: 700, total: 8600 },
  },
  leadsByChannel: [
    { label: "Live Chat", byMonth: byMonth([132, 150, 185, 255, 165, 238, 124]) },
    { label: "WhatsApp", byMonth: byMonth([72, 82, 98, 136, 88, 128, 72]) },
    { label: "Zalo OA", byMonth: byMonth([170, 188, 232, 322, 210, 304, 176]) },
    { label: "Messenger", byMonth: byMonth([56, 60, 78, 110, 72, 104, 58]) },
    { label: "Instagram", byMonth: byMonth([30, 30, 47, 67, 45, 63, 30]) },
  ],
  refreshTimestamp: "2026-07-13T09:00:00+07:00",
}

const DEMO_GA4 = [
  {
    name: "% CR Gohub App",
    cr: 2.9,
    kpis: { activeUsers: 9750, sessions: 18200, purchases: 528, revenue: 124_295_198, cr: 2.9 },
    series: DEMO_MONTHS.map((m, i) => ({ date: `${demoMonthLabel(m).top} ${demoMonthLabel(m).sub}`, sessions: [9100, 9800, 11200, 13400, 10600, 12100, 6200][i], users: [4700, 5100, 5800, 6900, 5400, 6100, 3300][i], purchases: [198, 220, 260, 320, 240, 300, 170][i], revenue: [176_900_000, 201_203_640, 165_463_546, 168_185_318, 113_375_731, 104_898_583, 49_994_096][i], cr: [2.1, 2.2, 2.3, 2.4, 2.3, 2.5, 2.7][i] })),
  },
  {
    name: "% CR Gohub .com",
    cr: 1.8,
    kpis: { activeUsers: 6800, sessions: 14300, purchases: 258, revenue: 41_063_220, cr: 1.8 },
    series: DEMO_MONTHS.map((m, i) => ({ date: `${demoMonthLabel(m).top} ${demoMonthLabel(m).sub}`, sessions: [7600, 8200, 9000, 10200, 7800, 8600, 4200][i], users: [3800, 4100, 4500, 5200, 3900, 4300, 2200][i], purchases: [125, 140, 155, 180, 118, 150, 78][i], revenue: [54_200_000, 63_790_320, 87_449_472, 106_795_656, 31_157_016, 41_163_144, 7_947_720][i], cr: [1.6, 1.7, 1.7, 1.8, 1.5, 1.7, 1.9][i] })),
  },
  {
    name: "% CR Gohub .vn",
    cr: 3.1,
    kpis: { activeUsers: 15400, sessions: 26400, purchases: 818, revenue: 650_538_200, cr: 3.1 },
    series: DEMO_MONTHS.map((m, i) => ({ date: `${demoMonthLabel(m).top} ${demoMonthLabel(m).sub}`, sessions: [13200, 14800, 16900, 21200, 16500, 18800, 9200][i], users: [6800, 7200, 8100, 9800, 7600, 8400, 4200][i], purchases: [420, 480, 540, 690, 510, 590, 310][i], revenue: [410_000_000, 454_843_608, 508_040_724, 759_612_231, 482_210_789, 737_078_699, 650_538_200][i], cr: [3.1, 3.2, 3.1, 3.3, 3.1, 3.1, 3.4][i] })),
  },
]

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

// ── Apple-style design tokens (từ mockup) ──────────────────────────────────
const APPLE_CARD = "rounded-lg border border-black/[0.09] overflow-hidden"
const APPLE_CARD_STYLE = { background: "rgba(255,255,255,0.82)", backdropFilter: "blur(18px)", boxShadow: "0 18px 48px rgba(0,0,0,0.07)" }
const APPLE_BG_STYLE = { background: "radial-gradient(circle at 16% 8%,rgba(0,113,227,0.08),transparent 28%),radial-gradient(circle at 86% 16%,rgba(0,166,166,0.09),transparent 26%),linear-gradient(180deg,#fbfbfd 0%,#f5f5f7 50%,#eef1f5 100%)" }

// Section shell — Apple glass card
const Section = ({ icon, title, desc, children, action, source }: {
  icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode
  accent?: string; source?: SourceKind; note?: React.ReactNode
}) => (
  <section className={APPLE_CARD} style={APPLE_CARD_STYLE}>
    <div className="px-6 py-5 border-b border-black/[0.06] flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center flex-shrink-0">{icon}</div>
        <div>
          <h2 className="text-[15px] font-[650] text-[#1d1d1f]">{title}</h2>
          {desc && <p className="text-[12px] text-[#6e6e73] mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {action}
        {source && <SourceBadge source={source} />}
      </div>
    </div>
    {children}
  </section>
)

// KPI metric card — Apple .metric style từ mockup
const KpiCard = ({ label, value, sub, delta, source: src }: {
  label: string; value: string; sub?: string; delta?: number | null; source?: string; accent?: string; icon?: React.ReactNode
}) => (
  <div className="rounded-lg border border-black/[0.09] p-4 flex flex-col justify-between min-h-[120px]" style={APPLE_CARD_STYLE}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-[560] text-[#6e6e73] leading-tight">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {src && <span className="text-[9px] font-[650] px-1.5 py-0.5 rounded-full bg-[#eaf4ff] text-[#0071e3] uppercase tracking-wide">{src}</span>}
        {delta !== undefined && delta !== null && (
          <span className={cn("text-[10px] font-[620] px-1.5 py-0.5 rounded-full whitespace-nowrap",
            delta >= 0 ? "bg-[#eaf6ee] text-[#2f9d55]" : "bg-[#fdecea] text-[#d93025]")}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
    <div>
      <div className="text-[24px] font-[560] text-[#1d1d1f] leading-none mt-2">{value}</div>
      {sub && <div className="text-[11px] text-[#6e6e73] mt-1.5 leading-tight">{sub}</div>}
    </div>
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

const monthlyRollup = (series: { date: string; sessions: number; cr: number; purchases: number; revenue: number; users: number }[]) => {
  const now = new Date()
  const year = now.getFullYear()
  const rows = new Map<string, { date: string; sessions: number; purchases: number; revenue: number; users: number }>()
  for (const row of series) {
    const [mm, dd] = row.date.split("/").map(Number)
    if (!mm || !dd) continue
    const inferredYear = mm > now.getMonth() + 1 ? year - 1 : year
    const key = `${inferredYear}-${String(mm).padStart(2, "0")}`
    const label = `${monthLabel(key).top} ${monthLabel(key).sub}`
    const acc = rows.get(key) ?? { date: label, sessions: 0, purchases: 0, revenue: 0, users: 0 }
    acc.sessions += row.sessions ?? 0
    acc.purchases += row.purchases ?? 0
    acc.revenue += row.revenue ?? 0
    acc.users += row.users ?? 0
    rows.set(key, acc)
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, row]) => ({ ...row, cr: row.sessions > 0 ? (row.purchases / row.sessions) * 100 : 0 }))
}

// Dashboard B2C tùy biến (GA4/leads/CAC/spend, session 66-70) — giữ làm tab "Advanced" (admin).
export function B2CAdvancedDashboard({ demoMode = false, localPreview = false }: { demoMode?: boolean; localPreview?: boolean } = {}) {
  const [data, setData]       = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"month" | "quarter">("month")
  const [profitMonth, setProfitMonth] = useState<string>("")
  // GA4 per site (Section 3 + 4) — load lazy, graceful nếu chưa cấu hình
  const [ga4, setGa4] = useState<{
    name:   string
    cr:     number
    kpis:   { activeUsers: number; sessions: number; purchases: number; revenue: number; cr: number }
    series: { date: string; sessions: number; cr: number; purchases: number; revenue: number; users: number }[]
  }[] | null>(null)

  // Luôn query live (nocache=1) để bypass snapshot → số liệu real-time đến T-1.
  const loadData = async () => {
    if (demoMode) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (localPreview) params.set("localPreview", "1")
      params.set("skipLeads", "1")
      params.set("nocache", "1")   // luôn live, không đọc snapshot
      const res = await fetch(`/api/analytics/b2c/monthly?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      console.error(err); setError((err as Error).message || "Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (demoMode) {
      setData(DEMO_DATA)
      setLoading(false)
      setError(null)
      return
    }
    loadData()
  }, [demoMode, localPreview]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (demoMode || !data?.months?.length) return
    (async () => {
      try {
        const params = new URLSearchParams()
        if (localPreview) params.set("localPreview", "1")
        params.set("onlyLeads", "1")
        const res = await fetch(`/api/analytics/b2c/monthly?${params.toString()}`)
        if (!res.ok) return
        const leadsData = await res.json()
        setData(prev => prev ? {
          ...prev,
          leads: leadsData.leads ?? prev.leads,
          leadsByChannel: leadsData.leadsByChannel ?? prev.leadsByChannel,
        } : prev)
      } catch {}
    })()
  }, [demoMode, localPreview, data?.currentMonth])

  useEffect(() => {
    if (!data?.months?.length) return
    setProfitMonth(prev => data.months.includes(prev) ? prev : data.currentMonth)
  }, [data?.currentMonth, data?.months])

  // GA4 (Section 4) — riêng, không chặn main load
  useEffect(() => {
    if (demoMode) {
      setGa4(DEMO_GA4)
      return
    }
    (async () => {
      try {
        const qs = localPreview ? "?localPreview=1" : ""
        const sd = await (await fetch(`/api/config/ga4${qs}`)).json()
        const sites: { id: string; name: string }[] = sd.sites ?? []
        if (!sites.length) { setGa4([]); return }
        // GA4 properties độc lập → fetch song song thay vì tuần tự
        const out = (await Promise.all(
          sites.map(async (s) => {
            const r = await fetch(`/api/analytics/website?siteId=${encodeURIComponent(s.id)}&days=180${localPreview ? "&localPreview=1" : ""}`)
            if (!r.ok) return null
            const d = await r.json()
            const series = monthlyRollup((d.series ?? []).map((row: any) => ({ date: row.date, sessions: row.sessions ?? 0, cr: row.cr ?? 0, purchases: row.purchases ?? 0, revenue: row.revenue ?? 0, users: row.users ?? 0 })))
            return {
              name: s.name, cr: d.kpis?.cr ?? 0,
              kpis: { activeUsers: d.kpis?.activeUsers ?? 0, sessions: d.kpis?.sessions ?? 0, purchases: d.kpis?.purchases ?? 0, revenue: d.kpis?.revenue ?? 0, cr: d.kpis?.cr ?? 0 },
              series,
            }
          })
        )).filter((r): r is NonNullable<typeof r> => r !== null)
        setGa4(out)
      } catch { setGa4([]) }
    })()
  }, [demoMode, localPreview])

  const quarterKey = (m: string) => {
    const [y, mo] = m.split("-")
    return `${y}-Q${Math.ceil(parseInt(mo) / 3)}`
  }
  const displayLabel = (key: string) => {
    if (key.includes("-Q")) {
      const [y, q] = key.split("-")
      return { top: q, sub: `'${y.slice(2)}` }
    }
    return monthLabel(key)
  }
  const viewMonths = data ? (viewMode === "quarter" ? Array.from(new Set(data.months.map(quarterKey))) : data.months) : []
  const current   = data ? (viewMode === "quarter" ? quarterKey(data.currentMonth) : data.currentMonth) : ""
  const currentIndex = viewMonths.indexOf(current)
  const completed = viewMonths.slice(0, currentIndex >= 0 ? currentIndex : Math.max(0, viewMonths.length - 1))
  const prevFull  = completed[completed.length - 1] ?? ""
  const calendarMonthsForPeriod = (key: string) => {
    if (!key.includes("-Q")) return [key]
    const [year, qRaw] = key.split("-Q")
    const quarter = Number(qRaw)
    const startMonth = (quarter - 1) * 3 + 1
    return [0, 1, 2].map(offset => `${year}-${String(startMonth + offset).padStart(2, "0")}`)
  }
  const daysInMonthKey = (m: string) => {
    const [year, month] = m.split("-").map(Number)
    return new Date(year, month, 0).getDate()
  }
  const actualMonthsForPeriod = (key: string) => {
    if (!data) return []
    if (viewMode === "month") return data.months.includes(key) ? [key] : []
    return calendarMonthsForPeriod(key).filter(m => data.months.includes(m) && m <= data.currentMonth)
  }
  const planningMonthsForPeriod = (key: string) => viewMode === "quarter" ? calendarMonthsForPeriod(key) : [key]
  const monthsFor = actualMonthsForPeriod
  const sumActualFor = (key: string, get: (m: string) => number) => actualMonthsForPeriod(key).reduce((s, m) => s + get(m), 0)
  const sumPlanningFor = (key: string, get: (m: string) => number) => planningMonthsForPeriod(key).reduce((s, m) => s + get(m), 0)
  const isCurrentPeriod = (key: string) => key === current
  const periodTotalDays = (key: string) => planningMonthsForPeriod(key).reduce((sum, m) => sum + daysInMonthKey(m), 0)
  const periodElapsedDays = (key: string) => {
    if (!data) return 0
    if (!key.includes("-Q")) return key === data.currentMonth ? data.elapsedDays : daysInMonthKey(key)
    if (key !== current) return periodTotalDays(key)
    return calendarMonthsForPeriod(key).reduce((sum, m) => (
      sum + (m === data.currentMonth ? data.elapsedDays : m < data.currentMonth ? daysInMonthKey(m) : 0)
    ), 0)
  }
  const proj = (mtd: number, key = current) => {
    if (!data || !isCurrentPeriod(key)) return mtd
    const elapsed = periodElapsedDays(key)
    const total = periodTotalDays(key)
    return elapsed > 0 && total > 0 ? mtd / elapsed * total : mtd
  }
  const partialPeriodValue = (key: string, elapsedDays: number, get: (m: string) => number) => {
    let remaining = elapsedDays
    let value = 0
    for (const month of planningMonthsForPeriod(key)) {
      if (remaining <= 0) break
      const days = daysInMonthKey(month)
      const used = Math.min(remaining, days)
      value += get(month) * (used / days)
      remaining -= used
    }
    return value
  }
  const comparablePrevPeriodValue = (get: (m: string) => number) => {
    if (!prevFull) return 0
    return partialPeriodValue(prevFull, Math.min(periodElapsedDays(current), periodTotalDays(prevFull)), get)
  }
  const periodSuffix = viewMode === "quarter" ? "QTD" : "MTD"
  const periodTitle = viewMode === "quarter" ? "Quarterly B2C report" : "Monthly B2C report"
  const periodProgressLabel = current ? `${periodElapsedDays(current)}/${periodTotalDays(current)} ngày` : "—"
  const prorataLabel = viewMode === "quarter" ? "Prorata quarter-end" : "Prorata month-end"

  // ── KPI values (MTD tháng hiện tại) ─────────────────────────────────────────
  const marketOf = (key: string): MarketCell => ({
    vn: sumActualFor(key, m => data?.markets[m]?.vn ?? 0),
    us: sumActualFor(key, m => data?.markets[m]?.us ?? 0),
    total: sumActualFor(key, m => data?.markets[m]?.total ?? 0),
  })
  const channelOf = (key: string): ChannelCell => ({
    web: sumActualFor(key, m => data?.channels[m]?.web ?? 0),
    app: sumActualFor(key, m => data?.channels[m]?.app ?? 0),
    other: sumActualFor(key, m => data?.channels[m]?.other ?? 0),
  })
  const marketChannelOf = (key: string): MarketChannelCell => ({
    vnSales: sumActualFor(key, m => data?.marketChannels?.[m]?.vnSales ?? 0),
    vnWeb:   sumActualFor(key, m => data?.marketChannels?.[m]?.vnWeb ?? 0),
    usSales: sumActualFor(key, m => data?.marketChannels?.[m]?.usSales ?? 0),
    usApp:   sumActualFor(key, m => data?.marketChannels?.[m]?.usApp ?? 0),
    usWeb:   sumActualFor(key, m => data?.marketChannels?.[m]?.usWeb ?? 0),
  })
  const customerOf = (key: string): CustRow => ({
    new: { revenue: sumActualFor(key, m => data?.customers[m]?.new.revenue ?? 0), count: sumActualFor(key, m => data?.customers[m]?.new.count ?? 0) },
    returning: { revenue: sumActualFor(key, m => data?.customers[m]?.returning.revenue ?? 0), count: sumActualFor(key, m => data?.customers[m]?.returning.count ?? 0) },
    total: { revenue: sumActualFor(key, m => data?.customers[m]?.total.revenue ?? 0), count: sumActualFor(key, m => data?.customers[m]?.total.count ?? 0) },
  })
  const targetOf = (key: string): KpiTarget => ({
    vn: sumPlanningFor(key, m => data?.targets[m]?.vn ?? 0),
    us: sumPlanningFor(key, m => data?.targets[m]?.us ?? 0),
    total: sumPlanningFor(key, m => data?.targets[m]?.total ?? 0),
  })
  const userAggOf = (key: string): UserCell => ({
    vnNew: sumActualFor(key, m => data?.users?.[m]?.vnNew ?? 0),
    vnReturning: sumActualFor(key, m => data?.users?.[m]?.vnReturning ?? 0),
    usNew: sumActualFor(key, m => data?.users?.[m]?.usNew ?? 0),
    usReturning: sumActualFor(key, m => data?.users?.[m]?.usReturning ?? 0),
    total: sumActualFor(key, m => data?.users?.[m]?.total ?? 0),
  })
  const mtdTotal   = marketOf(current).total
  const prevTotal  = marketOf(prevFull).total
  const cust       = customerOf(current)
  const newRev     = cust.new.revenue
  const retRev     = cust.returning.revenue
  const totRev     = cust.total.revenue
  const newShare   = totRev > 0 ? (newRev / totRev) * 100 : 0

  // ── chart series (rolling 6 tháng) ──────────────────────────────────────────
  const revSeries = viewMonths.map(m => ({
    name: `${displayLabel(m).top} ${displayLabel(m).sub}`,
    "VN B2C": marketOf(m).vn,
    "US B2C": marketOf(m).us,
  }))
  const custSeries = viewMonths.map(m => ({
    name: `${displayLabel(m).top} ${displayLabel(m).sub}`,
    "Khách mới": customerOf(m).new.revenue,
    "Quay lại":  customerOf(m).returning.revenue,
  }))
  // Tách doanh thu New/Returning theo thị trường VN/US = doanh thu × tỷ trọng thị trường của kỳ
  // (nhất quán cách xấp xỉ newVnOf ở bảng Acquisition; VN+US = phần VN+US của tổng, chênh nhỏ = thị trường khác NA/TN).
  const mktRatio = (m: string, which: "vn" | "us") => {
    const mk = marketOf(m)
    return mk.total > 0 ? mk[which] / mk.total : 0
  }

  // generic rolling-table renderer
  const RollingTable = ({ rows, mtdCompare = false }: {
    rows: { key?: string; label: string; highlight?: boolean; breakdown?: boolean; get: (m: string) => number; sub?: (m: string) => string | null }[]
    mtdCompare?: boolean
  }) => (
    <div className="overflow-x-auto">
      <table className="min-w-max w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider min-w-[180px]">Line</th>
            {completed.map(m => {
              const l = displayLabel(m)
              return <th key={m} className="text-right font-semibold px-4 py-3 text-xs min-w-[170px]">{l.top} <span className="text-slate-300">{l.sub}</span></th>
            })}
            <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500 min-w-[170px]">{displayLabel(current).top} <span className="text-blue-300">{periodSuffix}</span></th>
            <th className="text-right font-semibold px-4 py-3 text-xs min-w-[120px]">{mtdCompare ? periodSuffix : "MoM"}</th>
            <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">Prorata</th>
            <th className="text-right font-semibold px-4 py-3 text-xs min-w-[120px]">vs prev</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(row => {
            const mtd      = row.get(current)
            const prevVal  = row.get(prevFull)
            const compareVal = mtdCompare ? comparablePrevPeriodValue(row.get) : prevVal
            const prorata  = proj(mtd, current)
            return (
              <tr key={row.key ?? row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                <td className={`sticky left-0 z-10 bg-white/95 px-6 py-4 text-left min-w-[180px] ${row.highlight ? "font-bold text-slate-900" : row.breakdown ? "font-medium text-slate-500 pl-9" : "font-semibold text-slate-700"}`}>
                  {row.breakdown && <span className="text-slate-300 mr-1">›</span>}{row.label}
                </td>
                {completed.map((m, i) => {
                  const v = row.get(m)
                  const prev = i > 0 ? row.get(completed[i - 1]) : null
                  return (
                    <td key={m} className="px-4 py-4 text-right tabular-nums min-w-[170px]">
                      <div className="text-slate-800 font-semibold">{formatCompactNumber(v)}</div>
                      <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>
                      {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(m)}</div>}
                    </td>
                  )
                })}
                <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40 min-w-[170px]">
                  <div className="text-slate-900 font-bold">{formatCompactNumber(mtd)}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">{periodSuffix}</div>
                  {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(current)}</div>}
                </td>
                <td className="px-4 py-4 text-right min-w-[120px]"><Delta v={pct(mtd, compareVal)} /></td>
                <td className="px-4 py-4 text-right tabular-nums min-w-[150px]">
                  <div className="text-slate-800 font-semibold">{formatCompactNumber(prorata)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">run-rate</div>
                </td>
                <td className="px-4 py-4 text-right min-w-[120px]"><Delta v={pct(prorata, prevVal)} /></td>
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
      return <AwaitingData note="Chưa có KPI target. Vào KPI / Target → 'KPI Target B2C' để nhập target doanh thu theo tháng × thị trường (VN / US / Total). Sau khi lưu, tab này hiển thị MTD/QTD vs target, prorata vs KPI và % đạt." />

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
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider min-w-[180px]">Line</th>
              {completed.map(m => {
                const l = displayLabel(m)
                return <th key={m} className="text-right font-semibold px-4 py-3 text-xs min-w-[170px]">{l.top} <span className="text-slate-300">{l.sub}</span></th>
              })}
              <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500 min-w-[170px]">{displayLabel(current).top} <span className="text-blue-300">{periodSuffix}</span></th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">Prorata</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[120px]">% đạt KPI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lines.map(line => {
              const mtd      = marketOf(current)[line.key] ?? 0
              const prorata  = proj(mtd, current)
              const tgtCur   = targetOf(current)[line.key] ?? 0
              return (
                <tr key={line.key} className={line.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                  <td className={`sticky left-0 z-10 bg-white/95 px-6 py-4 text-left min-w-[180px] ${line.highlight ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{line.label}</td>
                  {completed.map(m => {
                    const v   = marketOf(m)[line.key] ?? 0
                    const tgt = targetOf(m)[line.key] ?? 0
                    return (
                      <td key={m} className="px-4 py-4 text-right tabular-nums min-w-[170px]">
                        <div className="text-slate-800 font-semibold">{formatCompactNumber(v)}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">KPI {tgt ? formatCompactNumber(tgt) : "—"}</div>
                        <div className="mt-0.5"><Attain actual={v} target={tgt} /></div>
                      </td>
                    )
                  })}
                  <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40 min-w-[170px]">
                    <div className="text-slate-900 font-bold">{formatCompactNumber(mtd)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">KPI {tgtCur ? formatCompactNumber(tgtCur) : "—"}</div>
                    <div className="mt-0.5"><Attain actual={mtd} target={tgtCur} /></div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums min-w-[150px]">
                    <div className="text-slate-800 font-semibold">{formatCompactNumber(prorata)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">run-rate</div>
                  </td>
                  <td className="px-4 py-4 text-right min-w-[120px]"><Attain actual={prorata} target={tgtCur} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Bảng rolling gọn — value tự định dạng theo từng dòng, KHÔNG prorata (tránh chiếu sai tỷ số như CAC/ROAS).
  const SimpleRollTable = ({ rows, startMonth }: {
    rows: { label: string; highlight?: boolean; breakdown?: boolean; delta?: boolean; mom?: boolean; fmt: (n: number) => string; get: (m: string) => number; sub?: (m: string) => string }[]
    startMonth?: string
  }) => {
    const tableCompleted = startMonth
      ? completed.filter(m => monthsFor(m).some(month => month >= startMonth))
      : completed
    const tablePrevFull = tableCompleted[tableCompleted.length - 1] ?? prevFull
    return (
      <div className="overflow-x-auto px-0 pb-2">
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider min-w-[180px]">Chỉ số</th>
              {tableCompleted.map(m => {
                const l = displayLabel(m)
                return <th key={m} className="text-right font-semibold px-4 py-3 text-xs min-w-[170px]">{l.top} <span className="text-slate-300">{l.sub}</span></th>
              })}
              <th className="text-right font-semibold px-4 py-3 text-xs text-blue-500 min-w-[170px]">{displayLabel(current).top} <span className="text-blue-300">{periodSuffix}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => (
              <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
                <td className={`sticky left-0 z-10 bg-white/95 px-6 py-4 text-left min-w-[180px] ${row.highlight ? "font-bold text-slate-900" : row.breakdown ? "font-medium text-slate-500 pl-9" : "font-semibold text-slate-700"}`}>
                  {row.breakdown && <span className="text-slate-300 mr-1">›</span>}{row.label}
                </td>
                {tableCompleted.map((m, i) => {
                  const v = row.get(m)
                  const prev = i > 0 ? row.get(tableCompleted[i - 1]) : null
                  return (
                    <td key={m} className="px-4 py-4 text-right tabular-nums min-w-[170px]">
                      <div className="text-slate-800 font-semibold">{row.fmt(v)}</div>
                      {row.delta !== false && <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>}
                      {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(m)}</div>}
                    </td>
                  )
                })}
                <td className="px-4 py-4 text-right tabular-nums bg-blue-50/40 min-w-[170px]">
                  <div className="text-slate-900 font-bold">{row.fmt(row.get(current))}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">{periodSuffix}</div>
                  {row.mom && tablePrevFull && (
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      <Delta v={pct(proj(row.get(current), current), row.get(tablePrevFull))} />
                      <span className="text-[9px] text-slate-400 uppercase">MoM</span>
                    </div>
                  )}
                  {row.sub && <div className="text-[11px] font-medium text-slate-500 mt-0.5">{row.sub(current)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // helpers cho Section 3 & 5
  const spendOf  = (m: string) => sumActualFor(m, month => data?.spend?.[month] ?? 0)
  const budgetOf = (m: string) => sumPlanningFor(m, month => data?.budget?.[month] ?? 0)
  const spendVnOf = (m: string) => sumActualFor(m, month => data?.spendByMarket?.[month]?.vn ?? ((data?.spend?.[month] ?? 0) * 0.7))
  const spendUsOf = (m: string) => sumActualFor(m, month => data?.spendByMarket?.[month]?.us ?? ((data?.spend?.[month] ?? 0) * 0.3))
  const budgetVnOf = (m: string) => sumPlanningFor(m, month => data?.budgetByMarket?.[month]?.vn ?? ((data?.budget?.[month] ?? 0) * 0.7))
  const budgetUsOf = (m: string) => sumPlanningFor(m, month => data?.budgetByMarket?.[month]?.us ?? ((data?.budget?.[month] ?? 0) * 0.3))
  const leadsOf  = (m: string) => sumActualFor(m, month => data?.leads?.[month] ?? 0)
  const leadChannelOf = (key: string, byMonthMap: Record<string, number>) => sumActualFor(key, month => byMonthMap[month] ?? 0)
  const revOf    = (m: string) => marketOf(m).total
  const profitChannelOf = (key: string) => {
    const rows = new Map<string, ProfitCell>()
    for (const month of actualMonthsForPeriod(key)) {
      const monthRows = data?.profitByChannel?.[month] ?? {}
      for (const [channel, cell] of Object.entries(monthRows)) {
        const acc = rows.get(channel) ?? { revenue: 0, cogs: 0, grossProfit: 0, opCost: 0, cm1: 0 }
        acc.revenue += cell.revenue ?? 0
        acc.cogs += cell.cogs ?? 0
        acc.grossProfit += cell.grossProfit ?? 0
        acc.opCost += cell.opCost ?? 0
        acc.cm1 += cell.cm1 ?? 0
        rows.set(channel, acc)
      }
    }
    return [...rows.entries()]
      .map(([channel, cell]) => ({ channel, ...cell }))
      .filter(row => row.revenue > 0 || row.grossProfit !== 0 || row.opCost > 0)
      .sort((a, b) => b.revenue - a.revenue)
  }
  const selectedProfitMonth = profitMonth || data?.currentMonth || current
  const profitRows = data ? profitChannelOf(selectedProfitMonth) : []
  const profitTotal = profitRows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    opCost: acc.opCost + row.opCost,
    cm1: acc.cm1 + row.cm1,
  }), { revenue: 0, cogs: 0, grossProfit: 0, opCost: 0, cm1: 0 })
  const selectedProfitIndex = data?.months.indexOf(selectedProfitMonth) ?? -1
  const prevProfitMonth = data && selectedProfitIndex > 0 ? data.months[selectedProfitIndex - 1] : ""
  const prevProfitRows = data && prevProfitMonth ? profitChannelOf(prevProfitMonth) : []
  const prevProfitTotal = prevProfitRows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    cogs: acc.cogs + row.cogs,
    grossProfit: acc.grossProfit + row.grossProfit,
    opCost: acc.opCost + row.opCost,
    cm1: acc.cm1 + row.cm1,
  }), { revenue: 0, cogs: 0, grossProfit: 0, opCost: 0, cm1: 0 })
  const prevProfitByChannel = new Map<string, ProfitCell>([
    ["Total B2C", prevProfitTotal],
    ...prevProfitRows.map(row => [row.channel, row] as [string, ProfitCell]),
  ])
  const profitRate = (num: number, den: number) => den > 0 ? (num / den) * 100 : null
  const profitPct = (num: number, den: number) => {
    const rate = profitRate(num, den)
    return rate === null ? "—" : `${rate.toFixed(1)}%`
  }
  const newOf    = (m: string) => customerOf(m).new.count
  const newVnOf   = (m: string) => {
    const market = data?.markets[m]
    const totalNew = newOf(m)
    return market && market.total > 0 ? totalNew * (market.vn / market.total) : totalNew * 0.75
  }
  const newUsOf   = (m: string) => Math.max(0, newOf(m) - newVnOf(m))
  const userOf    = (m: string, key: keyof UserCell) => userAggOf(m)[key] ?? 0
  const fmtX     = (n: number) => n > 0 ? `${n.toFixed(2)}×` : "—"
  const fmtPctV  = (n: number) => n > 0 ? `${n.toFixed(1)}%` : "—"
  const fmtMaybeInt = (n: number) => n > 0 ? formatNumber(Math.round(n)) : "—"
  const fmtInt0 = (n: number) => formatNumber(Math.round(n || 0))
  const hasSpend = data ? data.months.some(m => spendOf(m) > 0) : false
  const hasBudget = data ? data.months.some(m => budgetOf(m) > 0) : false
  const hasLeads = data ? data.months.some(m => leadsOf(m) > 0) : false
  const hasUsers = data ? data.months.some(m => (data.users?.[m]?.total ?? 0) > 0) : false
  const hasProfitTrend = profitRows.length > 0

  // ── B2C MKT Profit Report (spend Meta/Google nhập tay, port từ prod s153) ──
  const manualMktSpend: Record<string, { meta: number; google: number }> = {
    "2026-01": { meta: 27_072_086, google: 63_028_659 },
    "2026-02": { meta: 52_489_693, google: 69_445_647 },
    "2026-03": { meta: 53_167_619, google: 74_709_661 },
    "2026-04": { meta: 59_193_440, google: 74_627_703 },
    "2026-05": { meta: 32_463_652, google: 66_394_132 },
    "2026-06": { meta: 36_056_174, google: 64_273_619 },
    "2026-07": { meta: 42_070_736, google: 70_479_701 },
    "2026-08": { meta: 10_623_472, google: 19_567_666 },
  }
  const mktReportMonths = data ? data.months.filter(m => manualMktSpend[m]) : []
  const profitTotalForMonth = (month: string) => {
    const rows = Object.values(data?.profitByChannel?.[month] ?? {})
    return rows.reduce((acc, cell) => ({
      revenue: acc.revenue + (cell.revenue ?? 0),
      cogs: acc.cogs + (cell.cogs ?? 0),
      grossProfit: acc.grossProfit + (cell.grossProfit ?? 0),
    }), { revenue: 0, cogs: 0, grossProfit: 0 })
  }
  const mktMetric = (month: string, metric: "meta" | "google" | "totalMkt" | "revenue" | "mktRate" | "grossProfit" | "gpRate" | "cm1" | "cm1Rate") => {
    const spend = manualMktSpend[month]
    if (!spend) return 0
    const profit = profitTotalForMonth(month)
    const totalMkt = spend.meta + spend.google
    const cm1 = profit.grossProfit - totalMkt
    if (metric === "meta") return spend.meta
    if (metric === "google") return spend.google
    if (metric === "totalMkt") return totalMkt
    if (metric === "revenue") return profit.revenue
    if (metric === "mktRate") return profit.revenue > 0 ? totalMkt / profit.revenue : 0
    if (metric === "grossProfit") return profit.grossProfit
    if (metric === "gpRate") return profit.revenue > 0 ? profit.grossProfit / profit.revenue : 0
    if (metric === "cm1") return cm1
    return profit.revenue > 0 ? cm1 / profit.revenue : 0
  }
  const MktDelta = ({ month, metric }: { month: string; metric: Parameters<typeof mktMetric>[1] }) => {
    const idx = mktReportMonths.indexOf(month)
    if (idx <= 0) return <div className="mt-0.5 text-[11px] text-slate-300">—</div>
    const currentValue = mktMetric(month, metric)
    const prevValue = mktMetric(mktReportMonths[idx - 1], metric)
    if (!prevValue) return <div className="mt-0.5 text-[11px] text-slate-300">—</div>
    const diff = currentValue - prevValue
    const change = (diff / Math.abs(prevValue)) * 100
    const positive = diff >= 0
    return (
      <div className={`mt-0.5 text-[11px] font-semibold ${positive ? "text-emerald-600" : "text-rose-500"}`}>
        {positive ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
      </div>
    )
  }
  const MktProfitReportTable = () => (
    <div className="overflow-x-auto px-0 pb-2">
      <table className="min-w-max w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider min-w-[210px]">Chỉ số</th>
            {mktReportMonths.map(month => {
              const label = monthLabel(month)
              return (
                <th key={month} className="text-right font-semibold px-4 py-3 text-xs min-w-[175px]">
                  {label.top} <span className="text-slate-300">{label.sub}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {[
            { label: "Meta Spend", metric: "meta" as const, fmt: formatCurrency },
            { label: "Google Spend", metric: "google" as const, fmt: formatCurrency },
            { label: "Total chi phí MKT", metric: "totalMkt" as const, fmt: formatCurrency, highlight: true },
            { label: "Revenue B2C total", metric: "revenue" as const, fmt: formatCurrency, highlight: true },
            { label: "% chi phí MKT / revenue", metric: "mktRate" as const, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
            { label: "Gross profit", metric: "grossProfit" as const, fmt: formatCurrency },
            { label: "Gross profit %", metric: "gpRate" as const, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
            { label: "CM1 = Gross profit - Spend", metric: "cm1" as const, fmt: formatCurrency, highlight: true },
            { label: "(Gross profit - MKT) / revenue", metric: "cm1Rate" as const, fmt: (n: number) => `${(n * 100).toFixed(1)}%`, highlight: true },
          ].map(row => (
            <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
              <td className={`sticky left-0 z-10 bg-white/95 px-6 py-4 text-left min-w-[210px] ${row.highlight ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                {row.label}
              </td>
              {mktReportMonths.map(month => (
                <td key={month} className={`px-4 py-4 text-right tabular-nums min-w-[175px] ${month === data?.currentMonth ? "bg-blue-50/40" : ""}`}>
                  <div className={row.highlight ? "font-bold text-slate-900" : "font-semibold text-slate-700"}>{row.fmt(mktMetric(month, row.metric))}</div>
                  <MktDelta month={month} metric={row.metric} />
                  {month === data?.currentMonth && <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">MTD</div>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  type AcquisitionRow = {
    label: string
    highlight?: boolean
    breakdown?: boolean
    fmt: (n: number) => string
    get: (m: string) => number
  }
  const acquisitionCustomerOf = (m: string) => {
    const row = customerOf(m)
    return row.new.count > 0 ? row.new.count : row.total.count
  }
  const acquisitionRows: AcquisitionRow[] = data ? [
    { label: "Chi phí MKT", fmt: formatCompactNumber, get: spendOf },
    { label: "Leads", fmt: fmtInt0, highlight: true, get: leadsOf },
    ...(data.leadsByChannel ?? []).map(ch => ({
      label: ch.label,
      breakdown: true,
      fmt: fmtInt0,
      get: (m: string) => leadChannelOf(m, ch.byMonth),
    })),
    { label: "Khách mới", fmt: fmtInt0, get: acquisitionCustomerOf },
    {
      label: "CAC / khách",
      fmt: (n: number) => n > 0 ? formatCurrency(n) : "—",
      get: (m: string) => {
        const customers = acquisitionCustomerOf(m)
        return customers > 0 ? spendOf(m) / customers : 0
      },
    },
    {
      label: "Chi phí / Lead",
      fmt: (n: number) => n > 0 ? formatCurrency(n) : "—",
      get: (m: string) => {
        const leads = leadsOf(m)
        return leads > 0 ? spendOf(m) / leads : 0
      },
    },
    {
      label: "Tỷ lệ chốt",
      fmt: (n: number) => n > 0 ? `${n.toFixed(1)}%` : "—",
      get: (m: string) => {
        const leads = leadsOf(m)
        return leads > 0 ? (acquisitionCustomerOf(m) / leads) * 100 : 0
      },
    },
  ] : []
  const acquisitionStartMonth = "2026-05"
  const acquisitionCompleted = completed.filter(m => {
    const months = monthsFor(m)
    return months.some(month => month >= acquisitionStartMonth)
  })

  const AcquisitionTable = () => (
    <div className="overflow-x-auto px-0 pb-1">
      <table className="min-w-max w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
            <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-2.5 text-xs uppercase tracking-wider min-w-[190px]">Chỉ số</th>
            {acquisitionCompleted.map(m => {
              const l = displayLabel(m)
              return <th key={m} className="text-right font-semibold px-4 py-2.5 text-xs min-w-[180px]">{l.top} <span className="text-slate-300">{l.sub}</span></th>
            })}
            <th className="text-right font-semibold px-4 py-2.5 text-xs text-blue-500 min-w-[180px]">{displayLabel(current).top} <span className="text-blue-300">{periodSuffix}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {acquisitionRows.map(row => (
            <tr key={row.label} className={row.highlight ? "bg-slate-50/60" : "hover:bg-slate-50/40"}>
              <td className={`sticky left-0 z-10 bg-white/95 px-6 py-3 text-left min-w-[190px] ${row.highlight ? "font-bold text-slate-900" : row.breakdown ? "font-medium text-slate-500 pl-9" : "font-semibold text-slate-700"}`}>
                {row.breakdown && <span className="text-slate-300 mr-1">›</span>}{row.label}
              </td>
              {acquisitionCompleted.map((m, i) => {
                const v = row.get(m)
                const prev = i > 0 ? row.get(acquisitionCompleted[i - 1]) : null
                return (
                  <td key={m} className="px-4 py-3 text-right tabular-nums min-w-[180px]">
                    <div className="text-slate-800 font-semibold">{row.fmt(v)}</div>
                    <div className="mt-0.5">{prev !== null ? <Delta v={pct(v, prev)} /> : <span className="text-slate-300 text-[11px]">—</span>}</div>
                  </td>
                )
              })}
              <td className="px-4 py-3 text-right tabular-nums bg-blue-50/40 min-w-[180px]">
                <div className="text-slate-900 font-bold">{row.fmt(row.get(current))}</div>
                <div className="text-[10px] text-blue-500 mt-0.5 uppercase tracking-wide">{periodSuffix}</div>
                {prevFull && (
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <Delta v={pct(row.get(current), row.get(prevFull))} />
                    <span className="text-[9px] text-slate-400 uppercase">MoM</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const ProfitTrendTable = () => {
    const rows: (ProfitCell & { channel: string; highlight?: boolean })[] = [
      { channel: "Total B2C", ...profitTotal, highlight: true },
      ...profitRows,
    ].filter(row => row.revenue > 0 || row.grossProfit !== 0 || row.opCost > 0)
    const RateCell = ({ value, previous }: { value: number | null; previous: number | null }) => {
      if (value === null) return <span className="text-slate-300">—</span>
      const diff = previous === null ? null : value - previous
      const tone = diff === null ? "text-slate-700" : diff >= 0 ? "text-emerald-600" : "text-rose-500"
      return (
        <div className={`flex flex-col items-end leading-tight ${tone}`}>
          <span className="font-semibold">{value.toFixed(1)}%</span>
          {diff !== null && (
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px]">
              {diff >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(diff).toFixed(1)}%
            </span>
          )}
        </div>
      )
    }

    return (
      <div className="overflow-x-auto px-0 pb-1">
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="sticky left-0 z-10 bg-white/95 text-left font-semibold px-6 py-3 text-xs uppercase tracking-wider min-w-[210px]">Kênh</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">Revenue</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">COGS</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">Gross Profit</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[105px]">Margin %</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">Operation Cost</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[150px]">CM1</th>
              <th className="text-right font-semibold px-4 py-3 text-xs min-w-[105px]">CM1%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => {
              const prev = prevProfitByChannel.get(row.channel)
              const marginRate = profitRate(row.grossProfit, row.revenue)
              const prevMarginRate = prev ? profitRate(prev.grossProfit, prev.revenue) : null
              const cm1Rate = profitRate(row.cm1, row.revenue)
              const prevCm1Rate = prev ? profitRate(prev.cm1, prev.revenue) : null
              return (
                <tr key={row.channel} className={row.highlight ? "bg-slate-50/70" : "hover:bg-slate-50/40"}>
                  <td className={`sticky left-0 z-10 bg-white/95 px-6 py-3.5 text-left min-w-[210px] ${row.highlight ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                    {row.highlight ? row.channel : <><span className="text-slate-300 mr-1">›</span>{row.channel}</>}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">{formatCompactNumber(row.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{formatCompactNumber(row.cogs)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">{formatCompactNumber(row.grossProfit)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums"><RateCell value={marginRate} previous={prevMarginRate} /></td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{row.opCost > 0 ? formatCompactNumber(row.opCost) : "—"}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${row.cm1 >= 0 ? "text-slate-800" : "text-rose-500"}`}>{formatCompactNumber(row.cm1)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums"><RateCell value={cm1Rate} previous={prevCm1Rate} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // GA4 totals cho KPI cards (Section trên cùng)
  const ga4Total  = ga4?.reduce((s, site) => s + (site.cr ?? 0), 0) ?? 0
  const ga4Users  = ga4?.reduce((s, site) => s + (site.kpis.activeUsers ?? 0), 0) ?? 0
  const spendCur  = spendOf(current)
  const roasCur   = spendCur > 0 ? mtdTotal / spendCur : 0
  const leadsCur  = leadsOf(current)
  const customersForCac = acquisitionCustomerOf(current)
  const cacCur    = spendCur > 0 && customersForCac > 0 ? spendCur / customersForCac : 0
  const cplCur     = spendCur > 0 && leadsCur > 0 ? spendCur / leadsCur : 0

  return (
    <div className="min-h-screen p-4 lg:p-6" style={APPLE_BG_STYLE}>
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
	          <div>
	            <h1 className="text-[28px] font-[640] text-[#1d1d1f] leading-tight">Gohub B2C</h1>
	            <p className="text-[13px] text-[#6e6e73] mt-1">
	              {periodTitle} · {current ? `${displayLabel(current).top} ${displayLabel(current).sub}` : "—"} · GA4 + Admin GoHub
	            </p>
	          </div>
	          {data && (
	            <div className="flex flex-wrap items-center gap-2">
	              <div className="flex bg-white/72 border border-black/[0.09] p-0.5 rounded-full text-xs" style={{ backdropFilter: "blur(8px)" }}>
	                {(["month", "quarter"] as const).map(mode => (
	                  <button
	                    key={mode}
	                    onClick={() => setViewMode(mode)}
	                    className={`px-3 py-1.5 rounded-full font-[650] transition-all ${viewMode === mode ? "bg-[#0071e3] text-white shadow-sm" : "text-[#6e6e73] hover:text-[#1d1d1f]"}`}
	                  >
	                    {mode === "month" ? "Month" : "Quarter"}
	                  </button>
	                ))}
	              </div>
	              <span className="inline-flex items-center gap-1.5 text-[12px] font-[560] text-[#6e6e73] bg-white/72 border border-black/[0.09] px-3 py-1.5 rounded-full" style={{ backdropFilter: "blur(8px)" }}>
	                {periodSuffix}: {periodProgressLabel}
	              </span>
	              <span className="inline-flex items-center gap-1.5 text-[12px] font-[560] text-[#0071e3] bg-[#eaf4ff] border border-[#0071e3]/20 px-3 py-1.5 rounded-full">
	                {periodSuffix} + Prorata
	              </span>
	            </div>
	          )}
        </div>

        {error && <div className="rounded-lg bg-[#fdecea] border border-[#d93025]/20 text-[#d93025] p-4 text-[13px]">{error}</div>}
        {loading && <div className="text-[13px] text-[#6e6e73] py-8 text-center">Đang tải dữ liệu…</div>}

        {data && !loading && (
          <>
            {/* Hero card — big number MTD + mini meter bars (từ mockup) */}
            <div className={APPLE_CARD} style={{ ...APPLE_CARD_STYLE, borderRadius: 10 }}>
              <div className="p-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-center">
                <div>
	                  <span className="inline-flex items-center gap-1.5 text-[11px] font-[650] text-[#34a853] bg-[#e6f4ea] px-2.5 py-1 rounded-full">
                    Live · T-1{data?.dataAsOf ? ` (đến ${data.dataAsOf})` : ""}
                  </span>
	                  <div className="mt-4 text-[56px] font-[560] text-[#1d1d1f] leading-none">
	                    {formatCurrency(mtdTotal)} <span className="text-[22px] font-[500] text-[#6e6e73]">{periodSuffix} B2C</span>
	                  </div>
	                  <div className="mt-3 text-[14px] text-[#6e6e73] leading-relaxed max-w-lg">
	                    {prorataLabel}: <strong className="text-[#1d1d1f]">{formatCurrency(proj(mtdTotal))}</strong>
	                    {periodTotalDays(current) > 0 && <> · {periodSuffix} {((periodElapsedDays(current) / periodTotalDays(current)) * 100).toFixed(0)}%</>}
                    {prevTotal > 0 && <> · MoM <span className={pct(mtdTotal, prevTotal)! >= 0 ? "text-[#2f9d55]" : "text-[#d93025]"}>{pct(mtdTotal, prevTotal)! >= 0 ? "↑" : "↓"}{Math.abs(pct(mtdTotal, prevTotal)!).toFixed(1)}%</span></>}
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "VN B2C", val: marketOf(current).vn, total: mtdTotal, proj: proj(marketOf(current).vn), color: "#0071e3" },
                    { label: "US B2C", val: marketOf(current).us, total: mtdTotal, proj: proj(marketOf(current).us), color: "#6366f1" },
                    { label: "Web",    val: channelOf(current).web, total: mtdTotal, proj: proj(channelOf(current).web), color: "#00a6a6" },
                    { label: "App",    val: channelOf(current).app, total: mtdTotal, proj: proj(channelOf(current).app), color: "#2f9d55" },
                    { label: "Khác",   val: channelOf(current).other, total: mtdTotal, proj: proj(channelOf(current).other), color: "#b7791f" },
                  ].map(({ label, val, total, proj: p, color }) => (
                    <div key={label} className="grid grid-cols-[90px_1fr_140px] items-center gap-3">
                      <span className="text-[13px] font-[600] text-[#1d1d1f]">{label}</span>
                      <div className="h-[10px] rounded-full bg-[#e8ecf1] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, total > 0 ? (val / total) * 100 : 0)}%`, background: color }} />
                      </div>
                      <span className="text-[13px] font-[560] text-[#1d1d1f] text-right">{formatCurrency(val)} <span className="text-[#6e6e73]">/ {formatCurrency(p)}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 6 KPI cards — y chang mockup: Users, Customers, Budget, ROAS, CAC, Leads */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="Users" value={ga4Users > 0 ? formatNumber(ga4Users) : "—"}
                sub={ga4 && ga4.length > 0 ? `CR ${(ga4Total / ga4.length).toFixed(1)}%` : "GA4 chưa kết nối"} source="GA4" />
              <KpiCard label="ROAS" value={roasCur > 0 ? `${roasCur.toFixed(2)}×` : "—"}
                sub="Paid media blended" source="Chat" />
              <KpiCard label="Customers" value={formatNumber(cust?.total.count ?? 0)}
                sub={data.customerError ? "Admin API lỗi" : data.customerBreakdown === "total-only" ? "Total từ Admin API" : `Mới ${formatNumber(cust?.new.count ?? 0)} · QL ${formatNumber(cust?.returning.count ?? 0)}`} source="Admin" />
              <KpiCard label="CAC" value={cacCur > 0 ? formatCurrency(cacCur) : "—"}
                sub="Spend ÷ khách mới" source="Chat" />
              <KpiCard label="Leads" value={leadsCur > 0 ? formatNumber(leadsCur) : "—"}
                sub="Chatwoot all channels" source="Chat" />
              <KpiCard label="CPL" value={cplCur > 0 ? formatCurrency(cplCur) : "—"}
                sub="Spend ÷ Leads" source="Chat" />
            </div>

            <Section
              icon={<DollarSign className="w-5 h-5" />}
              title="B2C MKT Profit Report"
              desc="Total chi phí MKT = Meta + Google · Revenue/COGS/GP lấy từ fulfillment B2C"
              source="admin"
            >
              {mktReportMonths.length > 0 ? (
                <MktProfitReportTable />
              ) : (
                <AwaitingData note="Chưa có đủ dữ liệu tháng để render bảng report MKT." />
              )}
            </Section>

            <Section
              icon={<TrendingUp className="w-5 h-5" />}
              title="Revenue & Gross Profit Trend"
              action={
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#0071e3]">Chọn tháng</span>
                  <select
                    value={selectedProfitMonth}
                    onChange={e => setProfitMonth(e.target.value)}
                    className="h-9 rounded-lg border-2 border-[#0071e3] bg-[#0071e3]/[0.06] px-3 text-[13px] font-bold text-[#0071e3] shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-[#0071e3]/30 hover:bg-[#0071e3]/[0.1] transition-colors"
                  >
                    {(data.months ?? []).map(month => {
                      const label = monthLabel(month)
                      return <option key={month} value={month}>{label.top} {label.sub}</option>
                    })}
                  </select>
                </div>
              }
              source="admin"
            >
              {hasProfitTrend ? (
                <ProfitTrendTable />
              ) : (
                <AwaitingData note="Chưa có dữ liệu Revenue/COGS/Gross Profit theo kênh từ Admin/Warehouse cho period này." />
              )}
            </Section>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Revenue by market */}
              <div className={`${APPLE_CARD} p-5`} style={APPLE_CARD_STYLE}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center"><Globe className="w-4 h-4" /></div>
                  <div>
                    <h3 className="text-[14px] font-[650] text-[#1d1d1f]">Doanh thu B2C theo thị trường</h3>
                    <p className="text-[12px] text-[#6e6e73]">VN vs US · rolling 6 tháng</p>
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
              <div className={`${APPLE_CARD} p-5`} style={APPLE_CARD_STYLE}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center"><Users className="w-4 h-4" /></div>
                  <div>
                    <h3 className="text-[14px] font-[650] text-[#1d1d1f]">Khách mới vs quay lại</h3>
                    <p className="text-[12px] text-[#6e6e73]">Doanh thu theo nhóm khách · rolling 6 tháng</p>
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
            >
              <RollingTable mtdCompare rows={[
                { label: "VN B2C",        get: m => marketOf(m).vn },
                { key: "vn-sales", label: "VN Sales B2C", get: m => marketChannelOf(m).vnSales, breakdown: true },
                { key: "vn-web",   label: "Web",          get: m => marketChannelOf(m).vnWeb,   breakdown: true },
                { label: "US B2C",        get: m => marketOf(m).us },
                { key: "us-sales", label: "US Sales B2C", get: m => marketChannelOf(m).usSales, breakdown: true },
                { key: "us-app",   label: "App",          get: m => marketChannelOf(m).usApp,   breakdown: true },
                { key: "us-web",   label: "Web",          get: m => marketChannelOf(m).usWeb,   breakdown: true },
                { label: "Total B2C",     get: m => marketOf(m).total, highlight: true },
              ]} />
            </Section>

            {/* Section 2 — Revenue by Customers */}
            <Section icon={<Users className="w-5 h-5" />} accent="indigo" title="Doanh thu theo Customers" desc="New vs Returning × All/VN/US · revenue + số khách"
              source="admin"
>
              {data.customerError && (
                <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                  Customer Admin API lỗi: {data.customerError}.
                </div>
              )}
              {data.customerBreakdown === "total-only" && !data.customerError && (
                <div className="mx-6 mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-800">
                  Admin API summary hiện có Total Customers/Revenue; New vs Returning cần snapshot item-level hoặc API summary breakdown riêng.
                </div>
              )}
	              <RollingTable rows={data.customerBreakdown === "total-only" ? [
	                { label: "Total (All)", get: m => customerOf(m).total.revenue, sub: m => `${formatNumber(customerOf(m).total.count)} khách`, highlight: true },
	                { label: "Total · VN",  breakdown: true, get: m => customerOf(m).total.revenue * mktRatio(m, "vn") },
	                { label: "Total · US",  breakdown: true, get: m => customerOf(m).total.revenue * mktRatio(m, "us") },
	              ] : [
	                { label: "New (All)",       get: m => customerOf(m).new.revenue,       sub: m => `${formatNumber(customerOf(m).new.count)} khách` },
	                { label: "New · VN",        breakdown: true, get: m => customerOf(m).new.revenue * mktRatio(m, "vn") },
	                { label: "New · US",        breakdown: true, get: m => customerOf(m).new.revenue * mktRatio(m, "us") },
	                { label: "Returning (All)", get: m => customerOf(m).returning.revenue, sub: m => `${formatNumber(customerOf(m).returning.count)} khách` },
	                { label: "Returning · VN",  breakdown: true, get: m => customerOf(m).returning.revenue * mktRatio(m, "vn") },
	                { label: "Returning · US",  breakdown: true, get: m => customerOf(m).returning.revenue * mktRatio(m, "us") },
	                { label: "Total (All)",     get: m => customerOf(m).total.revenue,     sub: m => `${formatNumber(customerOf(m).total.count)} khách`, highlight: true },
	              ]} />
            </Section>

            <Section
              icon={<UserPlus className="w-5 h-5" />}
              title="Acquisition Performance"
              desc="Chi phí MKT · Leads theo kênh · Khách mới · CAC/CPL · tỷ lệ chốt"
              source="admin"
            >
              {hasSpend || hasLeads ? (
                <>
                  {data.customerBreakdown === "total-only" && (
                    <div className="mx-6 mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-800">
                      Dòng Khách mới đang dùng total customer từ Admin API vì API summary hiện chưa trả breakdown New/Returning trong snapshot này.
                    </div>
                  )}
                  <AcquisitionTable />
                </>
              ) : (
                <AwaitingData note="Chưa có spend hoặc lead để tính CAC/CPL. Cần dữ liệu chi phí MKT và lead theo kênh." />
              )}
            </Section>

            {/* Section 4 (GA4 Conversion Rate Charts) — ĐÃ BỎ theo yêu cầu (2026-08-05). GA4 chi tiết ở tab Website. */}

            {/* Section 5 — Spend & ROAS (Budget · Spend MTD · Spend Pace · Spend Prorata · ROAS) */}
            <Section
              icon={<PieChartIcon className="w-5 h-5" />}
              title="Budget Management"
              desc={`Budget từ Manage Costs/B2C Channels · Spend · Spend Pace · Prorata · ROAS${data.refreshTimestamp ? ` · refresh ${new Date(data.refreshTimestamp).toLocaleString("vi-VN")}` : ""}`}
              source="admin"
            >
              {hasSpend ? (
                <SimpleRollTable rows={[
                  ...(hasBudget ? [
                    { label: "Monthly budget", fmt: formatCompactNumber, delta: false, highlight: true, get: budgetOf },
                    { label: "VN B2C Budget", fmt: formatCompactNumber, delta: false, breakdown: true, get: budgetVnOf },
                    { label: "US B2C Budget", fmt: formatCompactNumber, delta: false, breakdown: true, get: budgetUsOf },
                  ] : []),
                  { label: "Spend MTD",    fmt: formatCompactNumber, highlight: true, get: spendOf },
                  { label: "VN Spend MTD", fmt: formatCompactNumber, breakdown: true, get: spendVnOf },
                  { label: "US Spend MTD", fmt: formatCompactNumber, breakdown: true, get: spendUsOf },
                  ...(hasBudget ? [
                    { label: "Spend Pace", fmt: fmtPctV, delta: false,
                      get: (m: string) => { const b = budgetOf(m); return b > 0 ? spendOf(m) / b * 100 : 0 } },
                  ] : []),
                  // Spend Prorata: chỉ áp cho tháng hiện tại (tháng trước đã hoàn thành)
                  { label: "Spend Prorata", fmt: formatCompactNumber, delta: false,
                    get: (m: string) => m === current ? proj(spendOf(m)) : spendOf(m) },
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
          </>
        )}
      </div>
    </div>
  )
}
