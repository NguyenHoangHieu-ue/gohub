"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend,
} from "recharts"
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, RefreshCw, Smartphone, AlertCircle,
  CalendarDays, CalendarRange, Layers, ChevronsUpDown, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportAOA } from "@/lib/export-excel"
import { StatTile, Skeleton, EmptyState, LogicNote, CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"
import type { Granularity, Period, PeriodMetric, TimelineRow } from "@/lib/b2b-ecom-timeline"

// VN Ecom theo thời gian — trang riêng nằm trong B2B (nút từ bảng "VN Ecom — Breakdown SIM / eSIM").
// Mặc định: Tháng, từ T1 đến tháng hiện tại (tháng đang chạy hiện Actual + Est.). Có Tuần (trong 1 tháng) và Quý.
// Số liệu + Est. + CH.Cost do API `b2b/ecom-timeline` tính; trang này chỉ hiển thị.

interface Timeline {
  granularity: Granularity; year: number; month: number; asOf: string
  periods: Period[]; rows: TimelineRow[]
  totals: { metrics: PeriodMetric[]; total: PeriodMetric } | null
}

type MetricKey = "revenue" | "margin" | "cm1" | "orders" | "units"
const METRICS: { key: MetricKey; label: string; money: boolean; pctLabel?: string }[] = [
  { key: "revenue", label: "Doanh thu", money: true },
  { key: "margin",  label: "GP",        money: true, pctLabel: "GP%" },
  { key: "cm1",     label: "CM1",       money: true, pctLabel: "CM1%" },
  { key: "orders",  label: "Đơn hàng",  money: false },
  { key: "units",   label: "Units",     money: false },
]
const GRANULARITIES: { key: Granularity; label: string; icon: React.ReactNode }[] = [
  { key: "month",   label: "Tháng", icon: <CalendarDays className="w-3.5 h-3.5" /> },
  { key: "week",    label: "Tuần",  icon: <CalendarRange className="w-3.5 h-3.5" /> },
  { key: "quarter", label: "Quý",   icon: <Layers className="w-3.5 h-3.5" /> },
]
const CUSTOMER_COLORS: Record<string, string> = { Shopee: "#ee4d2d", Lazada: "#2563eb", Tiktokshop: "#0f172a" }
const FALLBACK_COLORS = ["#0891b2", "#7c5cbf", "#b7791f", "#2f9d55"]
const EST_COLOR = "#a5f3fc"

const nf0 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtMoney = (v: number, compact: boolean) => (compact ? nf1.format(v / 1e6) : nf0.format(Math.round(v)))
const fmtVal = (v: number, money: boolean, compact: boolean) => (money ? fmtMoney(v, compact) : nf0.format(Math.round(v)))
const shortCust = (name: string) => name.replace(/^VN Ecom\s+/i, "")
const colorOf = (name: string, i: number) => CUSTOMER_COLORS[shortCust(name)] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
const pctOf = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—")
const getVal = (m: PeriodMetric | PeriodMetric["est"], k: MetricKey) => m[k]

function yesterdayVN() {
  const d = new Date(Date.now() - 86400000)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

function Segmented<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { key: T; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <div className="inline-flex bg-slate-100 p-1 rounded-xl">
      {items.map(it => (
        <button key={it.key} onClick={() => onChange(it.key)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
            value === it.key ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  )
}

function Stepper({ label, onPrev, onNext, prevDisabled, nextDisabled }: {
  label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean
}) {
  const btn = "p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 shadow-sm">
      <button className={btn} onClick={onPrev} disabled={prevDisabled} aria-label="Kỳ trước"><ChevronLeft className="w-4 h-4" /></button>
      <span className="min-w-[88px] text-center text-xs font-bold text-slate-800 tabular-nums">{label}</span>
      <button className={btn} onClick={onNext} disabled={nextDisabled} aria-label="Kỳ sau"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}

function DeltaChip({ cur, prev }: { cur: number; prev: number }) {
  if (!(Math.abs(prev) > 0)) return <span className="text-[10px] text-slate-300">—</span>
  const d = ((cur - prev) / Math.abs(prev)) * 100
  const up = d >= 0
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
      up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
      {up ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%
    </span>
  )
}

export default function B2BEcomTimelinePage() {
  const init = useMemo(yesterdayVN, [])
  const [gran, setGran] = useState<Granularity>("month")
  const [year, setYear] = useState(init.y)
  const [month, setMonth] = useState(init.m)
  const [metric, setMetric] = useState<MetricKey>("revenue")
  const [compact, setCompact] = useState(true)
  const [includeShip, setIncludeShip] = useState(true)
  const [data, setData] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  // Nhớ lựa chọn xem gần nhất (chỉ tiện ích cá nhân — hỏng/chặn storage thì dùng mặc định)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("b2b-ecom-timeline") || "{}")
      if (["month", "week", "quarter"].includes(s.gran)) setGran(s.gran)
      if (METRICS.some(m => m.key === s.metric)) setMetric(s.metric)
      if (typeof s.compact === "boolean") setCompact(s.compact)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem("b2b-ecom-timeline", JSON.stringify({ gran, metric, compact })) } catch { /* ignore */ }
  }, [gran, metric, compact])

  const load = useCallback(async (fresh = false) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ granularity: gran, year: String(year), month: String(month), includeShip: includeShip ? "1" : "0" })
      if (fresh) qs.set("nocache", "1")
      const res = await fetch(`/api/analytics/b2b/ecom-timeline?${qs}`, { signal: ctrl.signal, ...(fresh ? { cache: "no-store" as const } : {}) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Lỗi tải dữ liệu")
      setData(await res.json())
    } catch (e: any) {
      if (e?.name === "AbortError") return
      setError("Hiếu đang fix, vui lòng đợi")
    } finally {
      if (abortRef.current === ctrl) setLoading(false)
    }
  }, [gran, year, month, includeShip])
  useEffect(() => { load() }, [load])

  const periods = useMemo(() => data?.periods ?? [], [data])
  const rows = useMemo(() => data?.rows ?? [], [data])
  const totals = data?.totals ?? null
  const meta = METRICS.find(m => m.key === metric)!
  const hasEst = periods.some(p => p.projected)
  const custRows = rows.filter(r => r.level === 0)

  const childInfo = useMemo(() => {
    const has = new Set<string>()
    rows.forEach((r, i) => { const n = rows[i + 1]; if (n && n.level > r.level) has.add(r.id) })
    return has
  }, [rows])
  const isHidden = (r: TimelineRow) =>
    (r.level >= 1 && collapsed.has(`${r.customer}::::`)) || (r.level === 2 && collapsed.has(`${r.customer}::${r.shop}::`))
  const toggle = (id: string) => setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const allCollapsible = rows.filter(r => childInfo.has(r.id)).map(r => r.id)
  const allCollapsed = allCollapsible.length > 0 && allCollapsible.every(id => collapsed.has(id))

  // Mốc bước: năm không vượt năm hiện tại; tuần: tháng không vượt tháng đã có dữ liệu
  const maxYear = init.y
  const stepMonth = (d: number) => {
    let y = year, m = month + d
    if (m < 1) { m = 12; y-- } else if (m > 12) { m = 1; y++ }
    if (y > init.y || (y === init.y && m > init.m)) return
    setYear(y); setMonth(m)
  }

  const chartData = useMemo(() => periods.map((p, i) => {
    const row: Record<string, number | string> = { label: p.label, sub: p.sub }
    let actual = 0
    custRows.forEach(c => { const v = getVal(c.metrics[i], metric); row[c.customer] = v; actual += v })
    const est = totals ? getVal(totals.metrics[i].est, metric) : actual
    row["Dự kiến thêm"] = p.projected ? Math.max(0, est - actual) : 0
    return row
  }), [periods, custRows, totals, metric])

  const scope = periods.length === 0 ? "" : gran === "week" ? `Tháng ${month}/${year}` : `${periods[0].label} → ${periods[periods.length - 1].label} / ${year}`
  const t = totals?.total
  const kpi = (k: MetricKey, estDelta = true) => {
    if (!t) return { value: "—", deltas: undefined }
    const money = METRICS.find(m => m.key === k)!.money
    return {
      value: fmtVal(t[k], money, compact),
      deltas: estDelta && hasEst ? [{ label: "Est. cuối kỳ", value: fmtVal(t.est[k], money, compact), kind: "flat" as const }] : undefined,
    }
  }

  const doExport = async () => {
    if (!data || !totals) return
    const heads = ["Cấp", "Customer", "Shop", "Sub-shop"]
    periods.forEach(p => {
      const tag = `${p.label} ${p.sub}`
      ;["Revenue", "GP", "CH.Cost", "CM1", "Orders", "Units"].forEach(h => heads.push(`${tag} ${h}`))
      if (p.projected) ["Revenue", "GP", "CM1"].forEach(h => heads.push(`${tag} ${h} (Est.)`))
    })
    ;["Revenue", "GP", "CH.Cost", "CM1", "Orders", "Units"].forEach(h => heads.push(`Tổng ${h}`))
    const body = (name: string, r: { level: number; customer: string; shop: string; subshop: string; metrics: PeriodMetric[]; total: PeriodMetric }) => {
      const line: (string | number)[] = [name, r.customer, r.shop, r.subshop]
      periods.forEach((p, i) => {
        const m = r.metrics[i]
        line.push(m.revenue, m.margin, m.chCost, m.cm1, m.orders, m.units)
        if (p.projected) line.push(m.est.revenue, m.est.margin, m.est.cm1)
      })
      line.push(r.total.revenue, r.total.margin, r.total.chCost, r.total.cm1, r.total.orders, r.total.units)
      return line
    }
    const lines = rows.map(r => body(r.level === 0 ? "Customer" : r.level === 1 ? "Shop" : "Sub-shop", r))
    lines.push(body("TOTAL", { level: 0, customer: "TOTAL VN ECOM", shop: "", subshop: "", metrics: totals.metrics, total: totals.total }))
    await exportAOA(heads, lines, `VN_Ecom_${gran}_${year}${gran === "week" ? `-${String(month).padStart(2, "0")}` : ""}`, "VN Ecom")
  }

  const cell = (m: PeriodMetric, p: Period, small = false) => {
    const v = getVal(m, metric)
    const empty = m.revenue === 0 && m.orders === 0
    return (
      <div className="flex flex-col items-end leading-tight">
        <span className={cn("tabular-nums", small ? "text-[11px]" : "text-xs", empty ? "text-slate-300" : "text-slate-800 font-semibold")}>
          {empty ? "—" : fmtVal(v, meta.money, compact)}
        </span>
        {!empty && meta.pctLabel && (
          <span className="text-[9px] text-slate-400 tabular-nums">{pctOf(v, m.revenue)}</span>
        )}
        {!empty && p.projected && (
          <span className="text-[9px] font-bold text-cyan-600 tabular-nums">Est. {fmtVal(getVal(m.est, metric), meta.money, compact)}</span>
        )}
      </div>
    )
  }

  const unitLabel = meta.money ? (compact ? "triệu VND" : "VND") : meta.label.toLowerCase()
  const thBase = "px-3 py-2.5 text-right whitespace-nowrap"

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link href="/analytics/b2b" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-cyan-700 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />B2B Performance
            </Link>
            <div className="flex items-center gap-3 mt-2">
              <div className="p-2.5 bg-cyan-600 rounded-xl"><Smartphone className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">VN Ecom — Theo thời gian</h1>
                <p className="text-sm text-slate-500 font-medium">Lazada · Shopee · Tiktokshop — SIM / eSIM, theo Tháng · Tuần · Quý{data ? ` · dữ liệu đến ${data.asOf}` : ""}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(true)} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />Tải lại mới
            </button>
            <button onClick={doExport} disabled={loading || !totals}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" />Export Excel
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <Segmented value={gran} onChange={setGran} items={GRANULARITIES} />
          {gran === "week"
            ? <Stepper label={`T${month}/${year}`} onPrev={() => stepMonth(-1)} onNext={() => stepMonth(1)}
                nextDisabled={year === init.y && month >= init.m} />
            : <Stepper label={String(year)} onPrev={() => setYear(y => y - 1)} onNext={() => setYear(y => y + 1)}
                prevDisabled={year <= 2024} nextDisabled={year >= maxYear} />}
          <div className="h-5 w-px bg-slate-200 hidden md:block" />
          <Segmented value={metric} onChange={setMetric} items={METRICS.map(m => ({ key: m.key, label: m.label }))} />
          <div className="flex items-center gap-4 ml-auto">
            <Segmented value={compact ? "m" : "full"} onChange={v => setCompact(v === "m")}
              items={[{ key: "m", label: "Triệu" }, { key: "full", label: "Đầy đủ" }]} />
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={includeShip} onChange={e => setIncludeShip(e.target.checked)} className="w-3.5 h-3.5 accent-cyan-600" />
              <span className={cn("text-xs font-semibold", includeShip ? "text-cyan-700" : "text-slate-500")}>Phí ship</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" /><p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
            <Skeleton className="h-72 rounded-3xl" />
            <Skeleton className="h-96 rounded-3xl" />
          </div>
        ) : periods.length === 0 || rows.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10">
            <EmptyState message={periods.length === 0 ? "Kỳ này chưa bắt đầu — chưa có dữ liệu." : "Không có dữ liệu VN Ecom trong khoảng đã chọn."} />
          </div>
        ) : (
          <div className={cn("space-y-6 transition-opacity", loading && "opacity-50 pointer-events-none")}>
            {/* KPI */}
            <div>
              <div className="flex items-center justify-between px-1 mb-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />Tổng {scope}
                </h3>
                {hasEst && <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-600"><Zap className="w-3 h-3" />Kỳ đang chạy có số dự kiến (Est.)</span>}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {(() => {
                  const rev = kpi("revenue"), gp = kpi("margin"), cm = kpi("cm1"), od = kpi("orders")
                  return <>
                    <StatTile label="Doanh thu" accent="revenue" value={rev.value} unit={meta.money ? (compact ? "Tr" : "VND") : undefined} deltas={rev.deltas} />
                    <StatTile label={`GP · ${t ? pctOf(t.margin, t.revenue) : "—"}`} accent="margin" value={gp.value} unit={compact ? "Tr" : "VND"} deltas={gp.deltas} />
                    <StatTile label={`CM1 · ${t ? pctOf(t.cm1, t.revenue) : "—"}`} accent="positive" value={cm.value} unit={compact ? "Tr" : "VND"} deltas={cm.deltas} />
                    <StatTile label="Đơn hàng" accent="neutral" value={od.value} deltas={od.deltas} />
                  </>
                })()}
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{meta.label} theo {gran === "month" ? "tháng" : gran === "week" ? "tuần" : "quý"}</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Chia theo khách hàng · đơn vị {unitLabel}</p>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(v: number) => (meta.money ? nf0.format(Math.round(v / 1e6)) : nf0.format(v))} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(8,145,178,0.06)" }}
                      labelFormatter={(l, pl) => `${l} · ${(pl?.[0]?.payload as any)?.sub ?? ""}`}
                      formatter={(v) => [fmtVal(Number(v), meta.money, true) + (meta.money ? " Tr" : ""), undefined]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {custRows.map((c, i) => (
                      <Bar key={c.id} dataKey={c.customer} name={shortCust(c.customer)} stackId="a" fill={colorOf(c.customer, i)} maxBarSize={56} />
                    ))}
                    {hasEst && <Bar dataKey="Dự kiến thêm" stackId="a" fill={EST_COLOR} stroke="#0891b2" strokeDasharray="3 2" radius={[4, 4, 0, 0]} maxBarSize={56} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pivot */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Chi tiết — {meta.label}</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Đơn vị {unitLabel}{meta.pctLabel ? ` · dòng nhỏ = ${meta.pctLabel} trên doanh thu` : ""}</p>
                </div>
                <button onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allCollapsible))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-bold text-[11px]">
                  <ChevronsUpDown className="w-3.5 h-3.5" />{allCollapsed ? "Mở rộng tất cả" : "Thu gọn tất cả"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: `${220 + (periods.length + 1) * 118}px` }}>
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="sticky left-0 z-10 bg-slate-50 px-5 py-2.5 text-left min-w-[220px] border-r border-slate-100">Shop</th>
                      {periods.map(p => (
                        <th key={p.key} className={cn(thBase, p.isCurrent && "bg-amber-50/70")}>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="flex items-center gap-1 text-[11px] text-slate-700">
                              {p.label}
                              {p.projected && <span className="px-1 py-px rounded bg-cyan-600 text-white text-[8px] font-black tracking-wide">PR</span>}
                              {p.isCurrent && !p.projected && <span className="px-1 py-px rounded bg-amber-500 text-white text-[8px] font-black tracking-wide">ĐANG CHẠY</span>}
                            </span>
                            <span className="text-[9px] font-semibold text-slate-400 normal-case tracking-normal">{p.sub}</span>
                          </div>
                        </th>
                      ))}
                      <th className={cn(thBase, "bg-slate-100/80 text-slate-700")}>
                        <div className="flex flex-col items-end gap-0.5"><span className="text-[11px]">Tổng</span><span className="text-[9px] font-semibold text-slate-400 normal-case tracking-normal">{periods.length} kỳ</span></div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      if (isHidden(r)) return null
                      const canToggle = childInfo.has(r.id)
                      const open = !collapsed.has(r.id)
                      const rowCls = r.level === 0 ? "bg-cyan-50/50" : r.level === 2 ? "bg-sky-100 hover:bg-sky-200/70" : "bg-white hover:bg-slate-50/70"
                      const stickyBg = r.level === 0 ? "#ecfeff" : r.level === 2 ? "#e0f2fe" : "#ffffff"
                      return (
                        <tr key={r.id} className={cn("border-b border-slate-100 transition-colors", rowCls)}>
                          <td className={cn("sticky left-0 z-[1] border-r border-slate-100 py-2.5 pr-3", r.level === 2 && "border-l-4 border-l-sky-400")}
                            style={{ backgroundColor: stickyBg, paddingLeft: r.level === 0 ? 20 : r.level === 1 ? 40 : 56 }}>
                            <button type="button" disabled={!canToggle} onClick={() => toggle(r.id)} className="flex items-center gap-1.5 text-left disabled:cursor-default">
                              {canToggle
                                ? <ChevronRight className={cn("w-3.5 h-3.5 text-slate-400 transition-transform shrink-0", open && "rotate-90")} />
                                : <span className="w-3.5 shrink-0" />}
                              <span className={cn(r.level === 0 ? "text-sm font-black text-cyan-800" : r.level === 1 ? "text-xs font-bold text-slate-700" : "text-[11px] font-semibold text-slate-600")}>
                                {r.level === 0 ? r.customer : r.name}
                              </span>
                            </button>
                          </td>
                          {periods.map((p, i) => (
                            <td key={p.key} className={cn("px-3 py-2.5 text-right", p.isCurrent && r.level !== 2 && "bg-amber-50/40")}>{cell(r.metrics[i], p, r.level === 2)}</td>
                          ))}
                          <td className="px-3 py-2.5 text-right bg-slate-100/60">
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-xs font-black text-slate-900 tabular-nums">{fmtVal(getVal(r.total, metric), meta.money, compact)}</span>
                              {meta.pctLabel && <span className="text-[9px] text-slate-400 tabular-nums">{pctOf(getVal(r.total, metric), r.total.revenue)}</span>}
                              {hasEst && <span className="text-[9px] font-bold text-cyan-600 tabular-nums">Est. {fmtVal(getVal(r.total.est, metric), meta.money, compact)}</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {totals && (
                      <tr className="bg-slate-900 text-white">
                        <td className="sticky left-0 z-[1] bg-slate-900 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em]">TOTAL VN ECOM</td>
                        {periods.map((p, i) => {
                          const m = totals.metrics[i]
                          const cur = getVal(m.est, metric)
                          const prev = i > 0 ? getVal(totals.metrics[i - 1], metric) : 0
                          return (
                            <td key={p.key} className="px-3 py-3 text-right">
                              <div className="flex flex-col items-end gap-0.5 leading-tight">
                                <span className="text-xs font-black tabular-nums">{fmtVal(getVal(m, metric), meta.money, compact)}</span>
                                {meta.pctLabel && <span className="text-[9px] text-slate-400 tabular-nums">{pctOf(getVal(m, metric), m.revenue)}</span>}
                                {p.projected && <span className="text-[9px] font-bold text-cyan-300 tabular-nums">Est. {fmtVal(cur, meta.money, compact)}</span>}
                                {i > 0 && <DeltaChip cur={cur} prev={prev} />}
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-3 py-3 text-right bg-slate-800">
                          <div className="flex flex-col items-end leading-tight">
                            <span className="text-xs font-black tabular-nums">{fmtVal(getVal(totals.total, metric), meta.money, compact)}</span>
                            {meta.pctLabel && <span className="text-[9px] text-slate-400 tabular-nums">{pctOf(getVal(totals.total, metric), totals.total.revenue)}</span>}
                            {hasEst && <span className="text-[9px] font-bold text-cyan-300 tabular-nums">Est. {fmtVal(getVal(totals.total.est, metric), meta.money, compact)}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <LogicNote collapsible label="Cách tính">
              <ul className="list-disc pl-4 space-y-1">
                <li><b>Est.</b> = số thực tế × (số ngày cả kỳ ÷ số ngày đã qua), chỉ cho kỳ đang chạy khi đã qua đủ 7 ngày (tháng/quý) hoặc 3 ngày (tuần); chưa đủ thì chỉ hiện số thực tế.</li>
                <li><b>Tuần</b> = Thứ 2 → Chủ nhật, cắt theo tháng đang xem (tuần đầu/cuối của tháng có thể ngắn hơn 7 ngày).</li>
                <li><b>Dòng ▲/▼ ở TOTAL</b> = so với kỳ liền trước (kỳ đang chạy dùng số Est.).</li>
                <li><b>CH.Cost / CM1</b> dùng chi phí nhập ở bảng VN Ecom trang B2B Performance (nút Cost); amount chia theo số ngày của kỳ, percent × doanh thu kỳ. Dữ liệu tính đến hôm qua.</li>
                <li>Mặc định tính cả phí ship (khớp trang B2B); bỏ tick để về doanh thu sản phẩm thuần.</li>
              </ul>
            </LogicNote>
          </div>
        )}
      </div>
    </div>
  )
}
