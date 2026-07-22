"use client"

import React, { useState, useEffect, useCallback } from "react"
import { RefreshCw, Save, Building2, ShoppingBag, TrendingUp, ChevronRight, ChevronDown, Search, Users, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { useRoleGuard } from "@/lib/use-role-guard"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthStats {
  revenue: number; gp: number; gpPct: number
  channelCost: number; groupCost: number; cm1: number; cm1Pct: number
  hk3Pct?: number
  actualRevenue?: number; actualGp?: number; actualCc?: number; actualGc?: number; actualCm1?: number; actualHk3?: number
}
interface MonthSummary {
  month: string; isProjected: boolean; factor: number; elapsed: number; dim: number
  hk3Pct: number; hk3Rev: number; actualHk3: number
  total: MonthStats; b2b: MonthStats; b2c: MonthStats
}
interface ChannelMonth {
  month: string; revenue: number; gp: number
  channelCost: number; cm1: number; cm1Pct: number; momPct: number | null
  three_hk_rev?: number; three_hk_pct?: number
}
interface Channel { name: string; totalRevenue: number; months: ChannelMonth[] }
interface QReport {
  quarter: string; year: number; months: string[]
  summary: MonthSummary[]
  quarterTotal: MonthStats & { hk3Pct: number; b2b: MonthStats; b2c: MonthStats }
  b2bChannels: Channel[]; b2cChannels: Channel[]
  elapsed_days: number; quarter_days: number
}
interface Targets { b2bRev: number; b2bCm1: number; b2bThk: number; b2cRev: number; b2cCm1: number; b2cThk: number }

const EMPTY_TARGETS: Targets = { b2bRev: 0, b2bCm1: 0, b2bThk: 0, b2cRev: 0, b2cCm1: 0, b2cThk: 0 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fc  = formatCompactNumber
const pct = (v: number) => `${v.toFixed(1)}%`

function parseFmt(s: string): number { return parseFloat(s.replace(/[^\d.-]/g, "")) || 0 }
function fmtInput(n: number): string { return n > 0 ? Math.round(n).toLocaleString("vi-VN") : "" }

const cm1Color  = (v: number) => v >= 0 ? "text-blue-700" : "text-red-600"
const momColor  = (v: number | null) => v == null ? "text-slate-400" : v >= 0 ? "text-green-600" : "text-red-500"
const prColor   = "text-slate-500"

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, target }: { value: number; target: number }) {
  const ratio = target > 0 ? Math.min((value / target) * 100, 100) : 0
  const fill = ratio >= 100 ? "bg-green-500" : ratio >= 75 ? "bg-blue-500" : "bg-slate-400"
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", fill)} style={{ width: `${ratio}%` }} />
    </div>
  )
}

// ─── KPI Progress Card ────────────────────────────────────────────────────────

function KpiCard({ label, icon: Icon, actual, prRev, target, cm1Actual, prCm1, hk3Pct, hk3Target }:
  { label: string; icon: React.ElementType; actual: number; prRev: number; target: number; cm1Actual: number; prCm1: number; cm1Target: number; hk3Pct: number; hk3Target: number }) {
  const progress   = target > 0 ? (actual / target) * 100 : 0
  const prProgress = target > 0 ? (prRev / target) * 100 : 0
  const pctColor   = progress >= 100 ? "text-green-600" : progress >= 75 ? "text-blue-600" : "text-slate-600"

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label} Revenue</span>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums", pctColor)}>{pct(progress)}</span>
      </div>
      <ProgressBar value={actual} target={target} />

      <div className="mt-3 space-y-1.5 text-[12px]">
        <div className="flex justify-between">
          <span className="text-slate-400">Thực tế</span>
          <span className="font-semibold text-slate-800 tabular-nums">{fc(actual)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Target</span>
          <span className="text-slate-500 tabular-nums">{target > 0 ? fc(target) : "—"}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-1.5">
          <span className="text-slate-400">PR Rev</span>
          <span className={cn("tabular-nums font-medium", pctColor)}>{fc(prRev)} <span className="text-[11px]">({pct(prProgress)})</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">CM1</span>
          <span className={cn("font-semibold tabular-nums", cm1Color(cm1Actual))}>{fc(cm1Actual)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">PR CM1</span>
          <span className="text-slate-500 tabular-nums">{fc(prCm1)}</span>
        </div>
        {hk3Target > 0 && (
          <div className="flex justify-between border-t border-slate-100 pt-1.5">
            <span className="text-slate-400">3HK%</span>
            <span className="text-slate-700 tabular-nums">{pct(hk3Pct)} / Tgt {pct(hk3Target)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Table header row ─────────────────────────────────────────────────────────

const TH_COLS = ["Tháng", "Revenue", "PR Rev", "Gross Margin", "GM%", "Channel Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"]
const QT_COLS = ["Chỉ số Quý", "Revenue", "PR Rev", "Gross Margin", "GM%", "Channel Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"]

function TableHead({ cols }: { cols: string[] }) {
  return (
    <tr className="bg-[#003B95]">
      {cols.map((h, i) => (
        <th key={h} className={cn("px-4 py-2.5 text-[10px] font-semibold text-slate-300 uppercase tracking-wider whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>
          {h}
        </th>
      ))}
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuarterlyPage() {
  const { ready } = useRoleGuard(["admin", "creator", "bod", "b2b", "b2c", "staff"])
  if (!ready) return null
  return <QuarterlyContent />
}

function QuarterlyContent() {
  const today = new Date()
  const [selQ, setSelQ]       = useState(`Q${Math.ceil((today.getMonth() + 1) / 3)}`)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [report, setReport]   = useState<QReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [targets, setTargets] = useState<Targets>(EMPTY_TARGETS)
  const [tgtInputs, setTgtInputs] = useState({ b2bRev: "", b2bCm1: "", b2bThk: "", b2cRev: "", b2cCm1: "", b2cThk: "" })
  const [expandB2B, setExpandB2B] = useState(true)
  const [expandB2C, setExpandB2C] = useState(false)
  const [b2bRegion, setB2bRegion] = useState<"ALL" | "VN" | "US">("ALL")
  const [b2bTiers, setB2bTiers]   = useState<any>(null)
  const [b2bTiersLoading, setB2bTiersLoading] = useState(false)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/quarterly-report?quarter=${selQ}&year=${selYear}&companyCode=ALL`)
      if (!res.ok) throw new Error(`${res.status}`)
      setReport(await res.json())
    } catch (e: any) { notify(false, `Lỗi tải dữ liệu: ${e.message}`) }
    finally { setLoading(false) }
  }, [selQ, selYear])

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/quarterly-targets?quarter=${selQ}&year=${selYear}`)
      if (res.ok) {
        const d = await res.json()
        const t: Targets = d.targets ?? EMPTY_TARGETS
        setTargets(t)
        setTgtInputs({ b2bRev: fmtInput(t.b2bRev), b2bCm1: fmtInput(t.b2bCm1), b2bThk: t.b2bThk > 0 ? t.b2bThk.toString() : "", b2cRev: fmtInput(t.b2cRev), b2cCm1: fmtInput(t.b2cCm1), b2cThk: t.b2cThk > 0 ? t.b2cThk.toString() : "" })
      }
    } catch {}
  }, [selQ, selYear])

  const fetchB2BTiers = useCallback(async () => {
    setB2bTiersLoading(true)
    try {
      // Không truyền region — server trả đủ VN+US, filter ALL/VN/US xử lý client-side (tức thì, không re-fetch)
      const res = await fetch(`/api/analytics/quarterly-b2b-customers?quarter=${selQ}&year=${selYear}&companyCode=ALL`)
      if (res.ok) setB2bTiers(await res.json())
    } catch {} finally { setB2bTiersLoading(false) }
  }, [selQ, selYear])

  useEffect(() => { fetchReport(); loadTargets() }, [fetchReport, loadTargets])
  useEffect(() => { fetchB2BTiers() }, [fetchB2BTiers])

  const saveTargets = async () => {
    const t: Targets = { b2bRev: parseFmt(tgtInputs.b2bRev), b2bCm1: parseFmt(tgtInputs.b2bCm1), b2bThk: parseFloat(tgtInputs.b2bThk) || 0, b2cRev: parseFmt(tgtInputs.b2cRev), b2cCm1: parseFmt(tgtInputs.b2cCm1), b2cThk: parseFloat(tgtInputs.b2cThk) || 0 }
    setSaving(true)
    try {
      const res = await fetch("/api/analytics/quarterly-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quarter: selQ, year: selYear, targets: t }) })
      if (res.ok) { setTargets(t); notify(true, "Đã lưu target") } else notify(false, "Lưu thất bại")
    } catch { notify(false, "Lỗi kết nối") }
    finally { setSaving(false) }
  }

  const years   = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const quarters = ["Q1", "Q2", "Q3", "Q4"]
  const summary  = report?.summary ?? []
  const qt       = report?.quarterTotal
  const activeMonths = summary.map(m => m.month)

  // ── Reference computeSummary() logic (gohub.html) ─────────────────────────
  // qFactor = quarter_days / elapsed_days — dùng để project từ thực tế → cả quý
  const qElapsed = report?.elapsed_days ?? 0
  const qTotal   = report?.quarter_days ?? 92
  const qFactor  = qElapsed > 0 ? qTotal / qElapsed : 1

  // rev_act = sum projected monthly (reference "Actual" trong KPI cards)
  // rev_raw = sum actual monthly (reference "Revenue" trong bảng quý)
  const b2bRevAct  = summary.reduce((s, m) => s + m.b2b.revenue, 0)
  const b2bRevRaw  = summary.reduce((s, m) => s + (m.b2b.actualRevenue ?? m.b2b.revenue), 0)
  const b2bGmRaw   = summary.reduce((s, m) => s + (m.b2b.actualGp ?? m.b2b.gp), 0)
  const b2bCcRaw   = summary.reduce((s, m) => s + (m.b2b.actualCc ?? m.b2b.channelCost), 0)
  const b2bGcRaw   = summary.reduce((s, m) => s + (m.b2b.actualGc ?? m.b2b.groupCost), 0)
  const b2bCm1Raw  = summary.reduce((s, m) => s + (m.b2b.actualCm1 ?? m.b2b.cm1), 0)
  const b2bCm1Act  = summary.reduce((s, m) => s + m.b2b.cm1, 0)
  const b2bThkAct  = summary.reduce((s, m) => s + (m.b2b.actualHk3 ?? 0), 0)
  const b2bRevPr   = b2bRevRaw * qFactor
  const b2bCm1Pr   = b2bCm1Raw * qFactor
  const b2bThkPct  = b2bRevAct > 0 ? b2bThkAct / b2bRevAct * 100 : 0

  const b2cRevAct  = summary.reduce((s, m) => s + m.b2c.revenue, 0)
  const b2cRevRaw  = summary.reduce((s, m) => s + (m.b2c.actualRevenue ?? m.b2c.revenue), 0)
  const b2cGmRaw   = summary.reduce((s, m) => s + (m.b2c.actualGp ?? m.b2c.gp), 0)
  const b2cCcRaw   = summary.reduce((s, m) => s + (m.b2c.actualCc ?? m.b2c.channelCost), 0)
  const b2cGcRaw   = summary.reduce((s, m) => s + (m.b2c.actualGc ?? m.b2c.groupCost), 0)
  const b2cCm1Raw  = summary.reduce((s, m) => s + (m.b2c.actualCm1 ?? m.b2c.cm1), 0)
  const b2cCm1Act  = summary.reduce((s, m) => s + m.b2c.cm1, 0)
  const b2cThkAct  = summary.reduce((s, m) => s + (m.b2c.actualHk3 ?? 0), 0)
  const b2cRevPr   = b2cRevRaw * qFactor
  const b2cCm1Pr   = b2cCm1Raw * qFactor
  const b2cThkPct  = b2cRevAct > 0 ? b2cThkAct / b2cRevAct * 100 : 0

  const totRevAct  = b2bRevAct + b2cRevAct
  const totRevRaw  = b2bRevRaw + b2cRevRaw
  const totGmRaw   = b2bGmRaw + b2cGmRaw
  const totCcRaw   = b2bCcRaw + b2cCcRaw
  const totGcRaw   = b2bGcRaw + b2cGcRaw
  const totCm1Raw  = b2bCm1Raw + b2cCm1Raw
  const totCm1Act  = b2bCm1Act + b2cCm1Act
  const totRevPr   = totRevRaw * qFactor
  const totCm1Pr   = totCm1Raw * qFactor
  const totThkPct  = totRevAct > 0 ? (b2bThkAct + b2cThkAct) / totRevAct * 100 : 0
  // ──────────────────────────────────────────────────────────────────────────

  // Khoảng ngày dữ liệu đang được tính (khớp API: đầu quý → min(cuối quý, hôm nay))
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  const qNum = parseInt(selQ.replace("Q", "")) || 1
  const periodStart   = new Date(selYear, (qNum - 1) * 3, 1)
  const periodQEnd    = new Date(selYear, (qNum - 1) * 3 + 3, 0)   // ngày cuối quý
  const periodThrough = periodQEnd < today ? periodQEnd : today    // cắt tại hôm nay nếu quý đang chạy
  const isFutureQ     = periodStart > today
  const isCurrentQ    = !isFutureQ && periodThrough < periodQEnd

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quarter Report</h1>
          <p className="text-sm text-slate-400 mt-0.5">Doanh thu · Lợi nhuận · CM1 theo quý</p>
          {!isFutureQ && (
            <p className="text-[13px] mt-1.5 flex items-center gap-1.5 flex-wrap">
              <CalendarDays className="w-3.5 h-3.5 text-[#003B95]" />
              <span className="text-slate-600">Dữ liệu tính:{" "}
                <b className="text-slate-800 tabular-nums">{fmtD(periodStart)} → {fmtD(periodThrough)}</b>
                {isCurrentQ && <span className="text-[#003B95] font-medium"> (đến hôm nay)</span>}
              </span>
              {report && report.quarter_days > 0 && (
                <span className="text-slate-400 tabular-nums">· {report.elapsed_days}/{report.quarter_days} ngày</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", selQ === q ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {q}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
              className="px-2 py-1.5 text-xs font-semibold bg-transparent text-slate-700 outline-none cursor-pointer">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] hover:bg-[#00337f] text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Đang tải…" : "Xem báo cáo"}
          </button>
          {summary.some(m => m.isProjected) && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">
              Pro-rata tháng hiện tại
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div className={cn("px-4 py-2.5 rounded-lg text-sm", msg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700")}>
          {msg.text}
        </div>
      )}

      {/* ── Target inputs ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Target {selQ}-{selYear}</h2>
          <button onClick={saveTargets} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003B95] hover:bg-[#00337f] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
            <Save className="w-3.5 h-3.5" />{saving ? "Đang lưu…" : "Lưu Target"}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { id: "b2bRev",  label: "B2B Doanh thu" },
            { id: "b2bCm1",  label: "B2B CM1 (VND)" },
            { id: "b2bThk",  label: "B2B %3HK" },
            { id: "b2cRev",  label: "B2C Doanh thu" },
            { id: "b2cCm1",  label: "B2C CM1 (VND)" },
            { id: "b2cThk",  label: "B2C %3HK" },
          ].map(f => (
            <div key={f.id} className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">{f.label}</label>
              <input
                type="text" value={(tgtInputs as any)[f.id]}
                onChange={e => setTgtInputs(prev => ({ ...prev, [f.id]: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-800 font-semibold text-sm font-mono rounded-lg px-3 py-2 transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Progress cards ── */}
      {report && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="B2B" icon={Building2}
            actual={b2bRevAct} prRev={b2bRevPr} target={targets.b2bRev}
            cm1Actual={b2bCm1Act} prCm1={b2bCm1Pr} cm1Target={targets.b2bCm1}
            hk3Pct={b2bThkPct} hk3Target={targets.b2bThk} />
          <KpiCard label="B2C" icon={ShoppingBag}
            actual={b2cRevAct} prRev={b2cRevPr} target={targets.b2cRev}
            cm1Actual={b2cCm1Act} prCm1={b2cCm1Pr} cm1Target={targets.b2cCm1}
            hk3Pct={b2cThkPct} hk3Target={targets.b2cThk} />
          <KpiCard label="Tổng" icon={TrendingUp}
            actual={totRevAct} prRev={totRevPr} target={targets.b2bRev + targets.b2cRev}
            cm1Actual={totCm1Act} prCm1={totCm1Pr} cm1Target={targets.b2bCm1 + targets.b2cCm1}
            hk3Pct={totThkPct} hk3Target={0} />
        </div>
      )}

      {/* ── Monthly summary table ── */}
      {!loading && summary.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">Tổng hợp theo Tháng</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead><TableHead cols={TH_COLS} /></thead>
              <tbody>
                {summary.map(m => {
                  const [y, mo] = m.month.split("-")
                  const label  = `T${parseInt(mo)}/${y}`
                  return (
                    <React.Fragment key={m.month}>
                      {/* Revenue = projected (g.revenue), PR Rev = "—", CM1 = projected, PR CM1 = "—" */}
                      <tr className={cn("border-b border-slate-100", m.isProjected ? "bg-blue-50/30" : "bg-white hover:bg-slate-50")}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {label}
                          {m.isProjected && <span className="ml-1.5 text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">PR ×{m.factor}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fc(m.total.revenue)}</td>
                        <td className="px-4 py-3 text-right"><span className="text-slate-300">—</span></td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(m.total.gp)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.total.gpPct)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.channelCost > 0 ? fc(m.total.channelCost) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.groupCost > 0 ? fc(m.total.groupCost) : <span className="text-slate-300">—</span>}</td>
                        <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(m.total.cm1))}>{fc(m.total.cm1)}</td>
                        <td className="px-4 py-3 text-right"><span className="text-slate-300">—</span></td>
                        <td className={cn("px-4 py-3 text-right font-semibold", cm1Color(m.total.cm1))}>{pct(m.total.cm1Pct)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.hk3Pct ?? 0)}</td>
                      </tr>
                      <MonthSubRow label="B2B" stats={m.b2b} />
                      <MonthSubRow label="B2C" stats={m.b2c} />
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quarter total vs target ── */}
      {!loading && qt && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">Tổng hợp cả Quý — So sánh với Target</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead><TableHead cols={QT_COLS} /></thead>
              <tbody>
                {qt.b2b && (
                  <>
                    <QtSummaryRow
                      label="B2B (Thực tế)"
                      actRev={b2bRevRaw} prRev={b2bRevPr}
                      gmRaw={b2bGmRaw} ccRaw={b2bCcRaw} gcRaw={b2bGcRaw}
                      cm1Raw={b2bCm1Raw} prCm1={b2bCm1Pr}
                      hk3Pct={b2bThkPct}
                    />
                    {targets.b2bRev > 0 && (
                      <QtTargetRow
                        label="↳ Target B2B"
                        targetRev={targets.b2bRev} revPr={b2bRevPr} revAct={b2bRevAct}
                        targetCm1={targets.b2bCm1} cm1Pr={b2bCm1Pr} cm1Act={b2bCm1Act}
                      />
                    )}
                  </>
                )}
                {qt.b2c && (
                  <>
                    <QtSummaryRow
                      label="B2C (Thực tế)"
                      actRev={b2cRevRaw} prRev={b2cRevPr}
                      gmRaw={b2cGmRaw} ccRaw={b2cCcRaw} gcRaw={b2cGcRaw}
                      cm1Raw={b2cCm1Raw} prCm1={b2cCm1Pr}
                      hk3Pct={b2cThkPct}
                    />
                    {targets.b2cRev > 0 && (
                      <QtTargetRow
                        label="↳ Target B2C"
                        targetRev={targets.b2cRev} revPr={b2cRevPr} revAct={b2cRevAct}
                        targetCm1={targets.b2cCm1} cm1Pr={b2cCm1Pr} cm1Act={b2cCm1Act}
                      />
                    )}
                  </>
                )}
                <tr className="bg-[#003B95] text-white">
                  <td className="px-4 py-3 font-bold text-white">Tổng {selQ}-{selYear}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{fc(totRevRaw)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fc(totRevPr)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fc(totGmRaw)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{totRevRaw > 0 ? pct(totGmRaw / totRevRaw * 100) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{totCcRaw > 0 ? fc(totCcRaw) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{totGcRaw > 0 ? fc(totGcRaw) : "—"}</td>
                  <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", totCm1Raw >= 0 ? "text-blue-300" : "text-red-300")}>{fc(totCm1Raw)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fc(totCm1Pr)}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", totCm1Raw >= 0 ? "text-blue-300" : "text-red-300")}>{totRevRaw > 0 ? pct(totCm1Raw / totRevRaw * 100) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{pct(totThkPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── B2B tier breakdown (replaces channel pivot for B2B) ── */}
      <B2BTierSection
        b2bTiers={b2bTiers}
        loading={b2bTiersLoading}
        months={activeMonths}
        region={b2bRegion}
        onRegionChange={r => setB2bRegion(r as "ALL" | "VN" | "US")}
        expanded={expandB2B}
        onToggle={() => setExpandB2B(v => !v)}
      />

      {/* ── B2C channel pivot ── */}
      {!loading && report && report.b2cChannels.length > 0 && (
        <PivotTable title="B2C — Chi tiết theo Kênh × Tháng" icon={ShoppingBag}
          channels={report.b2cChannels} months={activeMonths}
          expanded={expandB2C} onToggle={() => setExpandB2C(v => !v)} />
      )}

      {!loading && summary.length === 0 && report && (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có dữ liệu cho {selQ}-{selYear}.</div>
      )}
    </div>
  )
}

// ─── Sub-row (B2B / B2C within a month) ──────────────────────────────────────
// Revenue = projected (g.revenue), PR Rev = "—", CM1 = projected (g.cm1), PR CM1 = "—"

function MonthSubRow({ label, stats }: { label: string; stats: MonthStats }) {
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px]">
      <td className="px-4 py-2 pl-9 text-slate-500 font-medium">↳ {label}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(stats.revenue)}</td>
      <td className="px-4 py-2 text-right"><span className="text-slate-300">—</span></td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(stats.gp)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct(stats.gpPct)}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{stats.channelCost > 0 ? fc(stats.channelCost) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{stats.groupCost > 0 ? fc(stats.groupCost) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", cm1Color(stats.cm1))}>{fc(stats.cm1)}</td>
      <td className="px-4 py-2 text-right"><span className="text-slate-300">—</span></td>
      <td className={cn("px-4 py-2 text-right font-semibold", cm1Color(stats.cm1))}>{pct(stats.cm1Pct)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct((stats.hk3Pct as number | undefined) ?? 0)}</td>
    </tr>
  )
}

// ─── Quarter summary row — actual (raw) values ────────────────────────────────

function QtSummaryRow({ label, actRev, prRev, gmRaw, ccRaw, gcRaw, cm1Raw, prCm1, hk3Pct }:
  { label: string; actRev: number; prRev: number; gmRaw: number; ccRaw: number; gcRaw: number; cm1Raw: number; prCm1: number; hk3Pct: number }) {
  const gmPct  = actRev > 0 ? gmRaw  / actRev * 100 : 0
  const cm1Pct = actRev > 0 ? cm1Raw / actRev * 100 : 0
  return (
    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50 text-[12px]">
      <td className="px-4 py-3 font-semibold text-slate-800">{label}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fc(actRev)}</td>
      <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{fc(prRev)}</td>
      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(gmRaw)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(gmPct)}</td>
      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{ccRaw > 0 ? fc(ccRaw) : "—"}</td>
      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{gcRaw > 0 ? fc(gcRaw) : "—"}</td>
      <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(cm1Raw))}>{fc(cm1Raw)}</td>
      <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{fc(prCm1)}</td>
      <td className={cn("px-4 py-3 text-right font-semibold", cm1Color(cm1Raw))}>{pct(cm1Pct)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(hk3Pct)}</td>
    </tr>
  )
}

// ─── Quarter target row ───────────────────────────────────────────────────────
// Layout: label | target_rev | Đạt PR (rev_pr/tgt) | Đạt TT (rev_act/tgt) | — | — | — | target_cm1 | Đạt PR (cm1_pr/tgt) | Đạt TT (cm1_act/tgt) | —

function QtTargetRow({ label, targetRev, revPr, revAct, targetCm1, cm1Pr, cm1Act }:
  { label: string; targetRev: number; revPr: number; revAct: number; targetCm1: number; cm1Pr: number; cm1Act: number }) {
  const revPrPct  = targetRev > 0 ? revPr  / targetRev * 100 : 0
  const revActPct = targetRev > 0 ? revAct / targetRev * 100 : 0
  const cm1PrPct  = targetCm1 > 0 ? cm1Pr  / targetCm1 * 100 : 0
  const cm1ActPct = targetCm1 > 0 ? cm1Act / targetCm1 * 100 : 0
  const prCls  = (p: number) => p >= 100 ? "text-green-600 font-semibold" : p >= 75 ? "text-blue-600 font-semibold" : "text-red-500 font-semibold"
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
      <td className="px-4 py-2 pl-9 italic">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fc(targetRev)}</td>
      <td className={cn("px-4 py-2 text-right", prCls(revPrPct))}>Đạt PR: {pct(revPrPct)}</td>
      <td className={cn("px-4 py-2 text-right", prCls(revActPct))}>Đạt TT: {pct(revActPct)}</td>
      <td className="px-4 py-2 text-right text-slate-300">—</td>
      <td className="px-4 py-2 text-right text-slate-300">—</td>
      <td className="px-4 py-2 text-right text-slate-300">—</td>
      <td className="px-4 py-2 text-right tabular-nums">{targetCm1 > 0 ? fc(targetCm1) : "—"}</td>
      <td className={cn("px-4 py-2 text-right", prCls(cm1PrPct))}>{targetCm1 > 0 ? `Đạt PR: ${pct(cm1PrPct)}` : "—"}</td>
      <td className={cn("px-4 py-2 text-right", prCls(cm1ActPct))}>{targetCm1 > 0 ? `Đạt TT: ${pct(cm1ActPct)}` : "—"}</td>
      <td className="px-4 py-2 text-right text-slate-300">—</td>
    </tr>
  )
}

// ─── B2B Tier Section ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  Strategic: { bg: "bg-blue-50", text: "text-[#003B95]", badge: "bg-blue-100 text-[#003B95]" },
  VIP:       { bg: "bg-purple-50", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
  Gold:      { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-700" },
  Silver:    { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-200 text-slate-600" },
}

const REGION_META: Record<string, { flag: string; label: string }> = {
  VN: { flag: "🇻🇳", label: "Việt Nam (VND)" },
  US: { flag: "🇺🇸", label: "Quốc tế (USD)" },
}

function B2BTierSection({ b2bTiers, loading, months, region, onRegionChange, expanded, onToggle }:
  { b2bTiers: any; loading: boolean; months: string[]; region: string; onRegionChange: (r: string) => void; expanded: boolean; onToggle: () => void }) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [custSearch, setCustSearch] = useState("")
  const allTiers: any[] = b2bTiers?.tiers ?? []

  const SUB = ["Revenue", "Gross Margin", "Ch.Cost", "CM1", "%CM1", "%MoM", "3HK%"]
  const colCount = SUB.length

  // Lấy view theo region hiện tại: ALL → dùng tổng tier; VN/US → dùng byRegion
  const pickView = (t: any) => (region === "ALL" ? t : { ...t, ...(t.byRegion?.[region] ?? {}) })
  // Chỉ hiện nhóm có dữ liệu ở region đang chọn
  const tiers = allTiers.filter((t: any) => (region === "ALL" ? t.totalRevenue > 0 : (t.byRegion?.[region]?.totalRevenue ?? 0) > 0))

  const selectedTierData = allTiers.find((t: any) => t.tier === selectedTier)
  // Các region cần hiển thị trong panel chi tiết
  const regionsToShow: ("VN" | "US")[] = region === "ALL" ? ["VN", "US"] : [region as "VN" | "US"]
  const matchSearch = (c: any) => !custSearch || c.name?.toLowerCase().includes(custSearch.toLowerCase()) || c.code?.toLowerCase().includes(custSearch.toLowerCase())

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">B2B — Chi tiết theo Nhóm (Hàng) × Tháng (Cột)</h2>
        </div>
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {/* Region filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(["ALL", "VN", "US"] as const).map(r => (
              <button key={r} onClick={() => onRegionChange(r)}
                className={cn("px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                  region === r ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {r === "ALL" ? "ALL" : `${REGION_META[r].flag} ${r}`}
              </button>
            ))}
          </div>
          {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
          <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
        </div>
      </button>

      {expanded && (
        <div>
          {/* Tier pivot table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + months.length * colCount * 72)}px` }}>
              <thead>
                <tr className="bg-[#003B95]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#003B95] border-r border-[#0a4a9e] min-w-[160px]">Nhóm</th>
                  {months.map(m => {
                    const [y, mo] = m.split("-")
                    const tierMonth = allTiers[0]?.months.find((x: any) => x.month === m)
                    const isPr = tierMonth?.isProjected ?? false
                    return (
                      <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a4a9e] whitespace-nowrap">
                        T{parseInt(mo)}/{y}{isPr ? " (PR)" : ""}
                      </th>
                    )
                  })}
                </tr>
                <tr className="bg-[#1a4d99] text-[9px] text-blue-100 uppercase">
                  <th className="px-4 py-1.5 sticky left-0 bg-[#1a4d99] border-r border-[#1a56b0]" />
                  {months.flatMap(m => SUB.map((h, i) => (
                    <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#1a56b0]", h === "CM1" && "text-blue-300")}>
                      {h}
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={1 + months.length * colCount} className="px-4 py-8 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Đang tải dữ liệu nhóm...
                  </td></tr>
                )}
                {!loading && tiers.length === 0 && (
                  <tr><td colSpan={1 + months.length * colCount} className="px-4 py-8 text-center text-slate-400 text-xs italic">Chưa có dữ liệu B2B {region !== "ALL" ? `${REGION_META[region]?.flag} ${region} ` : ""}cho kỳ này.</td></tr>
                )}
                {!loading && tiers.map((tierRaw: any, ri: number) => {
                  const tier = pickView(tierRaw)
                  const colors = TIER_COLORS[tierRaw.tier] || TIER_COLORS.Strategic
                  const isSel = selectedTier === tierRaw.tier
                  return (
                    <tr key={tierRaw.tier}
                      onClick={() => setSelectedTier(isSel ? null : tierRaw.tier)}
                      className={cn("border-b border-slate-100 cursor-pointer transition-colors",
                        ri % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                        isSel && "ring-1 ring-inset ring-[#003B95]",
                        "hover:bg-blue-50/30")}>
                      <td className="px-4 py-2.5 sticky left-0 border-r border-slate-100 font-bold" style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                        <div className="flex items-center gap-2">
                          {isSel ? <ChevronDown className="w-3.5 h-3.5 text-[#003B95]" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          <span className={cn("text-xs font-bold", colors.text)}>{tierRaw.tier}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold", colors.badge)}>{tier.customerCount} KH</span>
                        </div>
                      </td>
                      {months.flatMap((m: string) => {
                        const d = tier.months.find((x: any) => x.month === m)
                        if (!d?.hasData) {
                          return SUB.map((_: string, i: number) => (
                            <td key={`${m}-${i}`} className={cn("px-2 py-2.5 text-right text-slate-300", i === 0 && "border-l border-slate-100")}>—</td>
                          ))
                        }
                        const momCls = d.momPct == null ? "text-slate-300" : d.momPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"
                        return [
                          <td key="rev" className="px-2 py-2.5 text-right text-slate-700 tabular-nums border-l border-slate-100">{fc(d.revenue)}</td>,
                          <td key="gm"  className="px-2 py-2.5 text-right text-slate-600 tabular-nums">{fc(d.gm)}</td>,
                          <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.cc > 0 ? fc(d.cc) : "—"}</td>,
                          <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold tabular-nums", cm1Color(d.cm1))}>{fc(d.cm1)}</td>,
                          <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
                          <td key="mom" className={cn("px-2 py-2.5 text-right", momCls)}>
                            {d.momPct != null ? `${d.momPct >= 0 ? "+" : ""}${d.momPct.toFixed(1)}%` : "—"}
                          </td>,
                          <td key="3hk" className="px-2 py-2.5 text-right text-slate-500">{pct(d.hk3Pct)}</td>,
                        ]
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Customer detail panel — tách theo region VN / US */}
          {selectedTierData && (
            <div className="border-t border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Khách hàng nhóm: <span className={TIER_COLORS[selectedTierData.tier]?.text ?? "text-slate-700"}>{selectedTierData.tier}</span>
                  </h3>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text" placeholder="Tìm tên, mã KH..."
                    value={custSearch} onChange={e => setCustSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003B95]/40 w-56"
                  />
                </div>
              </div>

              {regionsToShow.map(reg => {
                const rd = selectedTierData.byRegion?.[reg]
                const custs = (rd?.customers ?? []).filter(matchSearch)
                if (!rd || (rd.customerCount ?? 0) === 0) return null
                return (
                  <div key={reg} className="space-y-2">
                    {/* Region sub-header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{REGION_META[reg].flag}</span>
                      <span className="text-xs font-bold text-[#003B95] uppercase tracking-wide">{reg} — {REGION_META[reg].label}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">{rd.customerCount} KH</span>
                      <span className="text-[10px] text-slate-400">Revenue {fc(rd.totalRevenue)} · CM1 <span className={cm1Color(rd.totalCm1)}>{fc(rd.totalCm1)}</span> ({pct(rd.totalCm1Pct)})</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Mã KH</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tên Khách hàng</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Revenue</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Gross Margin</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">GM%</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Ch.Cost</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">CM1</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">%CM1</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">%MoM</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">3HK%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {custs.map((c: any, i: number) => {
                            const momCls = c.momPct == null ? "text-slate-300" : c.momPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"
                            return (
                              <tr key={c.code} className={cn("border-t border-slate-50", i % 2 === 0 ? "bg-white" : "bg-slate-50/50", "hover:bg-blue-50/20")}>
                                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{c.code}</td>
                                <td className="px-3 py-2 text-slate-700 font-medium max-w-[200px] truncate" title={c.name}>{c.name}</td>
                                <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{fc(c.revenue)}</td>
                                <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{fc(c.gm)}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{pct(c.gmPct)}</td>
                                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{c.cc > 0 ? fc(c.cc) : "—"}</td>
                                <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", cm1Color(c.cm1))}>{fc(c.cm1)}</td>
                                <td className={cn("px-3 py-2 text-right", cm1Color(c.cm1))}>{pct(c.cm1Pct)}</td>
                                <td className={cn("px-3 py-2 text-right", momCls)}>{c.momPct != null ? `${c.momPct >= 0 ? "+" : ""}${c.momPct.toFixed(1)}%` : "—"}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{pct(c.hk3Pct)}</td>
                              </tr>
                            )
                          })}
                          {custs.length === 0 && (
                            <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400 italic text-xs">
                              {custSearch ? `Không tìm thấy KH khớp "${custSearch}"` : "Không có khách hàng"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              {regionsToShow.every(reg => (selectedTierData.byRegion?.[reg]?.customerCount ?? 0) === 0) && (
                <p className="text-center text-slate-400 italic text-xs py-4">Nhóm này không có khách hàng ở {region !== "ALL" ? region : "khu vực nào"}.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pivot table ──────────────────────────────────────────────────────────────

function PivotTable({ title, icon: Icon, channels, months, expanded, onToggle }:
  { title: string; icon: React.ElementType; channels: Channel[]; months: string[]; expanded: boolean; onToggle: () => void }) {
  const SUB = ["Revenue", "Gross Margin", "Ch.Cost", "CM1", "%CM1", "%MoM", "3HK%"]
  const colCount = SUB.length
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + months.length * colCount * 72)}px` }}>
            <thead>
              <tr className="bg-[#003B95]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#003B95] border-r border-[#0a4a9e] min-w-[160px]">Kênh</th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  return (
                    <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a4a9e] whitespace-nowrap">
                      T{parseInt(mo)}/{y}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-[#1a4d99] text-[9px] text-blue-100 uppercase">
                <th className="px-4 py-1.5 sticky left-0 bg-[#1a4d99] border-r border-[#1a56b0]" />
                {months.flatMap(m => SUB.map((h, i) => (
                  <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#1a56b0]", h === "CM1" && "text-blue-300")}>
                    {h}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, ri) => (
                <tr key={ch.name} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/60", "hover:bg-blue-50/30 transition-colors")}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 sticky left-0 border-r border-slate-100" style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#f8fafc" }}>{ch.name}</td>
                  {months.flatMap(m => {
                    const d = ch.months.find(x => x.month === m)
                    if (!d || d.revenue === 0) {
                      return SUB.map((_, i) => (
                        <td key={`${m}-${i}`} className={cn("px-2 py-2.5 text-right text-slate-300", i === 0 && "border-l border-slate-100")}>—</td>
                      ))
                    }
                    return [
                      <td key="rev" className="px-2 py-2.5 text-right text-slate-700 tabular-nums border-l border-slate-100">{fc(d.revenue)}</td>,
                      <td key="gm"  className="px-2 py-2.5 text-right text-slate-600 tabular-nums">{fc(d.gp)}</td>,
                      <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.channelCost > 0 ? fc(d.channelCost) : "—"}</td>,
                      <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold tabular-nums", cm1Color(d.cm1))}>{fc(d.cm1)}</td>,
                      <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
                      <td key="mom" className={cn("px-2 py-2.5 text-right font-medium", momColor(d.momPct))}>
                        {d.momPct != null ? `${d.momPct >= 0 ? "+" : ""}${d.momPct.toFixed(1)}%` : "—"}
                      </td>,
                      <td key="3hk" className="px-2 py-2.5 text-right text-slate-500">
                        {d.three_hk_pct != null ? pct(d.three_hk_pct) : "—"}
                      </td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
