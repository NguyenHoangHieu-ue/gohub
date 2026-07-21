"use client"

import React, { useState, useEffect, useCallback } from "react"
import { RefreshCw, Save, Building2, ShoppingBag, TrendingUp, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { useRoleGuard } from "@/lib/use-role-guard"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthStats {
  revenue: number; gp: number; gpPct: number
  channelCost: number; groupCost: number; cm1: number; cm1Pct: number
  hk3Pct?: number; actualRevenue?: number
}
interface MonthSummary {
  month: string; isProjected: boolean; factor: number; elapsed: number; dim: number
  hk3Pct: number; hk3Rev: number; actualHk3: number
  total: MonthStats; b2b: MonthStats; b2c: MonthStats
}
interface ChannelMonth { month: string; revenue: number; gp: number; channelCost: number; cm1: number; cm1Pct: number; momPct: number | null }
interface Channel { name: string; totalRevenue: number; months: ChannelMonth[] }
interface QReport {
  quarter: string; year: number; months: string[]
  summary: MonthSummary[]
  quarterTotal: MonthStats & { hk3Pct: number; b2b: MonthStats; b2c: MonthStats }
  b2bChannels: Channel[]; b2cChannels: Channel[]
}
interface Targets { b2bRev: number; b2bCm1: number; b2bThk: number; b2cRev: number; b2cCm1: number; b2cThk: number }

const EMPTY_TARGETS: Targets = { b2bRev: 0, b2bCm1: 0, b2bThk: 0, b2cRev: 0, b2cCm1: 0, b2cThk: 0 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fc  = formatCompactNumber
const pct = (v: number) => `${v.toFixed(1)}%`

function parseFmt(s: string): number { return parseFloat(s.replace(/[^\d.-]/g, "")) || 0 }
function fmtInput(n: number): string { return n > 0 ? Math.round(n).toLocaleString("vi-VN") : "" }

// Màu đơn giản: xanh lá = tốt, đỏ = xấu, slate = trung tính
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
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label} Revenue</span>
        </div>
        <span className={cn("text-2xl font-bold tabular-nums", pctColor)}>{pct(progress)}</span>
      </div>
      <ProgressBar value={actual} target={target} />

      {/* Values */}
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

const TH_COLS = ["Tháng", "Revenue", "PR Rev", "Gross Margin", "GM%", "Ch. Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"]
const QT_COLS = ["Chỉ số Quý", "Revenue", "PR Rev", "Gross Margin", "GM%", "Ch. Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"]

function TableHead({ cols }: { cols: string[] }) {
  return (
    <tr className="bg-slate-800">
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

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/quarterly-report?quarter=${selQ}&year=${selYear}&dateColumn=fulfiled_date&companyCode=ALL`)
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

  useEffect(() => { fetchReport(); loadTargets() }, [fetchReport, loadTargets])

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

  const totalActualRev = summary.reduce((s, m) => s + (m.total.actualRevenue ?? m.total.revenue), 0)
  const totalPrRev     = summary.reduce((s, m) => s + m.total.revenue, 0)
  const b2bActualRev   = summary.reduce((s, m) => s + (m.b2b.actualRevenue ?? m.b2b.revenue), 0)
  const b2bPrRev       = summary.reduce((s, m) => s + m.b2b.revenue, 0)
  const b2cActualRev   = summary.reduce((s, m) => s + (m.b2c.actualRevenue ?? m.b2c.revenue), 0)
  const b2cPrRev       = summary.reduce((s, m) => s + m.b2c.revenue, 0)
  const totalActualCm1 = summary.reduce((s, m) => s + (m.total.actualRevenue != null && m.isProjected ? m.total.cm1 / m.factor : m.total.cm1), 0)
  const totalPrCm1     = qt?.cm1 ?? 0
  const b2bActualCm1   = qt?.b2b?.cm1 ?? 0
  const b2bPrCm1       = qt?.b2b?.cm1 ?? 0
  const b2cActualCm1   = qt?.b2c?.cm1 ?? 0
  const b2cPrCm1       = qt?.b2c?.cm1 ?? 0
  const totalHk3Pct    = qt?.hk3Pct ?? 0

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quarter Report</h1>
          <p className="text-sm text-slate-400 mt-0.5">Doanh thu · Lợi nhuận · CM1 theo quý</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quarter pills */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", selQ === q ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50")}>
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
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
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
            actual={b2bActualRev} prRev={b2bPrRev} target={targets.b2bRev}
            cm1Actual={b2bActualCm1} prCm1={b2bPrCm1} cm1Target={targets.b2bCm1}
            hk3Pct={0} hk3Target={targets.b2bThk} />
          <KpiCard label="B2C" icon={ShoppingBag}
            actual={b2cActualRev} prRev={b2cPrRev} target={targets.b2cRev}
            cm1Actual={b2cActualCm1} prCm1={b2cPrCm1} cm1Target={targets.b2cCm1}
            hk3Pct={0} hk3Target={targets.b2cThk} />
          <KpiCard label="Tổng" icon={TrendingUp}
            actual={totalActualRev} prRev={totalPrRev} target={targets.b2bRev + targets.b2cRev}
            cm1Actual={totalActualCm1} prCm1={totalPrCm1} cm1Target={targets.b2bCm1 + targets.b2cCm1}
            hk3Pct={totalHk3Pct} hk3Target={0} />
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
                  const actRev = m.total.actualRevenue ?? m.total.revenue
                  const prRev  = m.total.revenue
                  const actCm1 = m.isProjected ? m.total.cm1 / m.factor : m.total.cm1
                  return (
                    <React.Fragment key={m.month}>
                      {/* Month total */}
                      <tr className={cn("border-b border-slate-100", m.isProjected ? "bg-blue-50/30" : "bg-white hover:bg-slate-50")}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {label}
                          {m.isProjected && <span className="ml-1.5 text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">PR ×{m.factor}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fc(actRev)}</td>
                        <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{m.isProjected ? fc(prRev) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(m.total.gp)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.total.gpPct)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.channelCost > 0 ? fc(m.total.channelCost) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.groupCost > 0 ? fc(m.total.groupCost) : <span className="text-slate-300">—</span>}</td>
                        <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(m.total.cm1))}>{fc(actCm1)}</td>
                        <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{m.isProjected ? fc(prRev) : <span className="text-slate-300">—</span>}</td>
                        <td className={cn("px-4 py-3 text-right font-semibold", cm1Color(m.total.cm1))}>{pct(m.total.cm1Pct)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.hk3Pct ?? 0)}</td>
                      </tr>
                      {/* B2B sub-row */}
                      <MonthSubRow label="B2B" stats={m.b2b} isProjected={m.isProjected} factor={m.factor} />
                      {/* B2C sub-row */}
                      <MonthSubRow label="B2C" stats={m.b2c} isProjected={m.isProjected} factor={m.factor} />
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
                    <QtSummaryRow label="B2B (Thực tế)" stats={qt.b2b} prRev={b2bPrRev} actRev={b2bActualRev} actCm1={b2bActualCm1} prCm1={b2bPrCm1} hk3Pct={0} />
                    {targets.b2bRev > 0 && <QtTargetRow label="↳ Target B2B" targetRev={targets.b2bRev} prRev={b2bPrRev} targetCm1={targets.b2bCm1} targetThk={targets.b2bThk} hk3Pct={0} />}
                  </>
                )}
                {qt.b2c && (
                  <>
                    <QtSummaryRow label="B2C (Thực tế)" stats={qt.b2c} prRev={b2cPrRev} actRev={b2cActualRev} actCm1={b2cActualCm1} prCm1={b2cPrCm1} hk3Pct={0} />
                    {targets.b2cRev > 0 && <QtTargetRow label="↳ Target B2C" targetRev={targets.b2cRev} prRev={b2cPrRev} targetCm1={targets.b2cCm1} targetThk={targets.b2cThk} hk3Pct={0} />}
                  </>
                )}
                {/* Grand total row */}
                <tr className="bg-slate-800 text-white">
                  <td className="px-4 py-3 font-bold text-white">Tổng {selQ}-{selYear}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{fc(totalActualRev)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fc(totalPrRev)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fc(qt.gp)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{pct(qt.gpPct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{qt.channelCost > 0 ? fc(qt.channelCost) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{qt.groupCost > 0 ? fc(qt.groupCost) : "—"}</td>
                  <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", qt.cm1 >= 0 ? "text-blue-300" : "text-red-300")}>{fc(totalActualCm1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fc(totalPrCm1)}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", qt.cm1 >= 0 ? "text-blue-300" : "text-red-300")}>{pct(qt.cm1Pct)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{pct(totalHk3Pct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Channel pivot tables ── */}
      {!loading && report && report.b2bChannels.length > 0 && (
        <PivotTable title="B2B — Chi tiết theo Kênh × Tháng" icon={Building2}
          channels={report.b2bChannels} months={activeMonths}
          expanded={expandB2B} onToggle={() => setExpandB2B(v => !v)} />
      )}
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

function MonthSubRow({ label, stats, isProjected, factor }:
  { label: string; stats: MonthStats; isProjected: boolean; factor: number }) {
  const actRev = stats.actualRevenue ?? stats.revenue
  const actCm1 = isProjected ? stats.cm1 / factor : stats.cm1
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px]">
      <td className="px-4 py-2 pl-9 text-slate-500 font-medium">↳ {label}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(actRev)}</td>
      <td className={cn("px-4 py-2 text-right tabular-nums", prColor)}>{isProjected ? fc(stats.revenue) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(stats.gp)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct(stats.gpPct)}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{stats.channelCost > 0 ? fc(stats.channelCost) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{stats.groupCost > 0 ? fc(stats.groupCost) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", cm1Color(stats.cm1))}>{fc(actCm1)}</td>
      <td className={cn("px-4 py-2 text-right tabular-nums", prColor)}>{isProjected ? fc(stats.cm1) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold", cm1Color(stats.cm1))}>{pct(stats.cm1Pct)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct((stats.hk3Pct as number | undefined) ?? 0)}</td>
    </tr>
  )
}

// ─── Quarter summary row ──────────────────────────────────────────────────────

function QtSummaryRow({ label, stats, prRev, actRev, actCm1, prCm1, hk3Pct }:
  { label: string; stats: MonthStats; prRev: number; actRev: number; actCm1: number; prCm1: number; hk3Pct: number }) {
  return (
    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50 text-[12px]">
      <td className="px-4 py-3 font-semibold text-slate-800">{label}</td>
      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fc(actRev)}</td>
      <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{fc(prRev)}</td>
      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(stats.gp)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(stats.gpPct)}</td>
      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{stats.channelCost > 0 ? fc(stats.channelCost) : "—"}</td>
      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{stats.groupCost > 0 ? fc(stats.groupCost) : "—"}</td>
      <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(stats.cm1))}>{fc(actCm1)}</td>
      <td className={cn("px-4 py-3 text-right tabular-nums", prColor)}>{fc(prCm1)}</td>
      <td className={cn("px-4 py-3 text-right font-semibold", cm1Color(stats.cm1))}>{pct(stats.cm1Pct)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(hk3Pct)}</td>
    </tr>
  )
}

// ─── Quarter target row ───────────────────────────────────────────────────────

function QtTargetRow({ label, targetRev, prRev, targetCm1, targetThk, hk3Pct }:
  { label: string; targetRev: number; prRev: number; targetCm1: number; targetThk: number; hk3Pct: number }) {
  const prPct = targetRev > 0 ? (prRev / targetRev) * 100 : 0
  const pctCls = prPct >= 100 ? "text-green-600 font-semibold" : prPct >= 75 ? "text-blue-600 font-semibold" : "text-red-500 font-semibold"
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
      <td className="px-4 py-2 pl-9 italic">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fc(targetRev)}</td>
      <td className={cn("px-4 py-2 text-right", pctCls)}>Đạt PR: {pct(prPct)}</td>
      <td className="px-4 py-2 text-right" colSpan={4}>—</td>
      <td className="px-4 py-2 text-right tabular-nums">{targetCm1 > 0 ? fc(targetCm1) : "—"}</td>
      <td className="px-4 py-2 text-right" />
      <td className="px-4 py-2 text-right">{targetCm1 > 0 && targetRev > 0 ? pct((targetCm1 / targetRev) * 100) : "—"}</td>
      <td className="px-4 py-2 text-right">{targetThk > 0 ? `Tgt ${pct(targetThk)}` : "—"}</td>
    </tr>
  )
}

// ─── Pivot table ──────────────────────────────────────────────────────────────

function PivotTable({ title, icon: Icon, channels, months, expanded, onToggle }:
  { title: string; icon: React.ElementType; channels: Channel[]; months: string[]; expanded: boolean; onToggle: () => void }) {
  const SUB = ["Revenue", "GP", "Ch.Cost", "CM1", "%CM1", "%MoM"]
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
          <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + months.length * 6 * 72)}px` }}>
            <thead>
              <tr className="bg-slate-800">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-slate-800 border-r border-slate-700 min-w-[160px]">Kênh</th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  return (
                    <th key={m} colSpan={6} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-slate-700 whitespace-nowrap">
                      T{parseInt(mo)}/{y}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-slate-700 text-[9px] text-slate-400 uppercase">
                <th className="px-4 py-1.5 sticky left-0 bg-slate-700 border-r border-slate-600" />
                {months.flatMap(m => SUB.map((h, i) => (
                  <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-slate-600", h === "CM1" && "text-blue-300")}>
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
                      <td key="gp"  className="px-2 py-2.5 text-right text-slate-600 tabular-nums">{fc(d.gp)}</td>,
                      <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.channelCost > 0 ? fc(d.channelCost) : "—"}</td>,
                      <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold tabular-nums", cm1Color(d.cm1))}>{fc(d.cm1)}</td>,
                      <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
                      <td key="mom" className={cn("px-2 py-2.5 text-right font-medium", momColor(d.momPct))}>
                        {d.momPct != null ? `${d.momPct >= 0 ? "+" : ""}${d.momPct.toFixed(1)}%` : "—"}
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
