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

const fc   = formatCompactNumber
const pct  = (v: number) => `${v.toFixed(1)}%`
const dash = <span className="text-slate-300 select-none">—</span>

function parseFmt(s: string): number {
  return parseFloat(s.replace(/[^\d.-]/g, "")) || 0
}
function fmtInput(n: number): string {
  return n > 0 ? Math.round(n).toLocaleString("vi-VN") : ""
}

function ProgressBar({ value, target }: { value: number; target: number }) {
  const pctVal = target > 0 ? Math.min((value / target) * 100, 120) : 0
  const color = pctVal >= 100 ? "bg-emerald-500" : pctVal >= 75 ? "bg-amber-500" : "bg-rose-400"
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.min(pctVal, 100)}%` }} />
    </div>
  )
}

// ─── Progress KPI Card ────────────────────────────────────────────────────────

function KpiCard({ label, icon: Icon, actual, prRev, target, cm1Actual, prCm1, cm1Target, hk3Pct, hk3Target }:
  { label: string; icon: React.ElementType; actual: number; prRev: number; target: number; cm1Actual: number; prCm1: number; cm1Target: number; hk3Pct: number; hk3Target: number }) {
  const progress = target > 0 ? (actual / target) * 100 : 0
  const prProgress = target > 0 ? (prRev / target) * 100 : 0
  const color = progress >= 100 ? "text-emerald-600" : progress >= 75 ? "text-amber-600" : "text-rose-500"
  const bgColor = progress >= 100 ? "bg-emerald-50" : progress >= 75 ? "bg-amber-50" : "bg-rose-50"

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-600" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label} REV PROGRESS</span>
        </div>
        <span className={cn("text-xl font-black", color)}>{pct(progress)}</span>
      </div>
      <ProgressBar value={actual} target={target} />
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-400 font-medium">Actual:</span>
          <span className="font-mono font-bold text-slate-700">{fc(actual)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400 font-medium">Target:</span>
          <span className="font-mono text-slate-500">{target > 0 ? fc(target) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className={cn("font-bold", bgColor === "bg-emerald-50" ? "text-emerald-600" : "text-amber-600")}>PR Rev:</span>
          <span className="font-mono font-bold text-indigo-600">{fc(prRev)}</span>
        </div>
        <div className={cn("flex justify-between items-center px-1.5 py-0.5 rounded", bgColor)}>
          <span className={cn("font-bold", color)}>PR:</span>
          <span className={cn("font-mono font-bold text-[12px]", color)}>{pct(prProgress)}</span>
        </div>
        <div className="flex justify-between col-span-2 border-t border-slate-100 pt-1 mt-0.5">
          <span className="text-amber-700 font-bold">CM1:</span>
          <span className="font-mono font-bold text-amber-700">{fc(cm1Actual)}</span>
          <span className="text-slate-300 mx-1">|</span>
          <span className="text-indigo-500 font-bold text-[10px]">PR CM1:</span>
          <span className="font-mono text-indigo-500">{fc(prCm1)}</span>
        </div>
        <div className="flex justify-between col-span-2">
          <span className="text-slate-400 font-medium">3HK:</span>
          <span className="font-mono font-bold text-slate-600">{pct(hk3Pct)}</span>
          <span className="text-slate-300 mx-1">|</span>
          <span className="text-slate-400 font-medium">Tgt:</span>
          <span className="font-mono text-slate-500">{hk3Target > 0 ? pct(hk3Target) : "—"}</span>
          {hk3Target > 0 && (
            <span className={cn("font-bold ml-1", hk3Pct >= hk3Target ? "text-emerald-600" : "text-rose-500")}>
              Đạt: {pct((hk3Pct / hk3Target) * 100)}
            </span>
          )}
        </div>
      </div>
    </div>
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
  const [selQ, setSelQ] = useState(`Q${Math.ceil((today.getMonth() + 1) / 3)}`)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [report, setReport] = useState<QReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [targets, setTargets] = useState<Targets>(EMPTY_TARGETS)
  const [tgtInputs, setTgtInputs] = useState({ b2bRev: "", b2bCm1: "", b2bThk: "", b2cRev: "", b2cCm1: "", b2cThk: "" })
  const [expandB2B, setExpandB2B] = useState(true)
  const [expandB2C, setExpandB2C] = useState(false)
  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/quarterly-report?quarter=${selQ}&year=${selYear}&dateColumn=fulfiled_date&companyCode=ALL`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
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
      if (res.ok) { setTargets(t); notify(true, "Đã lưu target") }
      else notify(false, "Lưu thất bại")
    } catch { notify(false, "Lỗi kết nối") }
    finally { setSaving(false) }
  }

  const years = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const quarters = ["Q1", "Q2", "Q3", "Q4"]
  const summary = report?.summary ?? []
  const qt = report?.quarterTotal

  // Tính PR values: "revenue" trong API đã là projected (×factor) cho tháng hiện tại
  // PR Rev = m.total.revenue (= projected). Actual = m.total.actualRevenue (revenue/factor)
  const totalActualRev  = summary.reduce((s, m) => s + (m.total.actualRevenue ?? m.total.revenue), 0)
  const totalPrRev      = summary.reduce((s, m) => s + m.total.revenue, 0)
  const b2bActualRev    = summary.reduce((s, m) => s + (m.b2b.actualRevenue ?? m.b2b.revenue), 0)
  const b2bPrRev        = summary.reduce((s, m) => s + m.b2b.revenue, 0)
  const b2cActualRev    = summary.reduce((s, m) => s + (m.b2c.actualRevenue ?? m.b2c.revenue), 0)
  const b2cPrRev        = summary.reduce((s, m) => s + m.b2c.revenue, 0)
  const totalActualCm1  = summary.reduce((s, m) => s + (m.total.actualRevenue != null && m.isProjected ? m.total.cm1 / m.factor : m.total.cm1), 0)
  const totalPrCm1      = qt?.cm1 ?? 0
  const b2bActualCm1    = qt?.b2b?.cm1 ? qt.b2b.cm1 : 0
  const b2bPrCm1        = qt?.b2b?.cm1 ?? 0
  const b2cActualCm1    = qt?.b2c?.cm1 ? qt.b2c.cm1 : 0
  const b2cPrCm1        = qt?.b2c?.cm1 ?? 0
  const totalHk3Pct     = qt?.hk3Pct ?? 0
  const b2bHk3Pct       = 0  // channel-level 3HK not tracked separately
  const b2cHk3Pct       = 0

  const activeMonths = summary.map(m => m.month)

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quarter Report</h1>
          <p className="text-sm text-slate-400 mt-0.5">Báo cáo hiệu suất doanh thu, lợi nhuận và CM1 theo quý</p>
        </div>
        {/* Quarter selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-0.5 shadow-sm">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all", selQ === q ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50")}>
                {q}
              </button>
            ))}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
              className="px-2 py-1.5 text-xs font-bold bg-transparent text-slate-700 outline-none cursor-pointer">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 shadow-sm">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Đang tải…" : "Xem báo cáo"}
          </button>
          {summary.some(m => m.isProjected) && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pro-rata áp dụng cho tháng hiện tại
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div className={cn("px-4 py-2.5 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700")}>
          {msg.text}
        </div>
      )}

      {/* Target inputs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Target Quý {selQ}-{selYear}</h2>
          <button onClick={saveTargets} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-sm">
            <Save className="w-3.5 h-3.5" />{saving ? "Đang lưu…" : "Lưu Target"}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            { id: "b2bRev",  label: "TARGET B2B DOANH THU", placeholder: "VD: 26.790.751.074" },
            { id: "b2bCm1",  label: "TARGET B2B CM1 (VND)", placeholder: "VD: 4.390.860.165" },
            { id: "b2bThk",  label: "TARGET B2B %3HK",      placeholder: "VD: 70.0" },
            { id: "b2cRev",  label: "TARGET B2C DOANH THU", placeholder: "VD: 7.447.795.000" },
            { id: "b2cCm1",  label: "TARGET B2C CM1 (VND)", placeholder: "VD: 3.420.663.650" },
            { id: "b2cThk",  label: "TARGET B2C %3HK",      placeholder: "VD: 60.0" },
          ].map(f => (
            <div key={f.id} className="space-y-1.5 col-span-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">{f.label}</label>
              <input
                type="text" value={(tgtInputs as any)[f.id]} placeholder={f.placeholder}
                onChange={e => setTgtInputs(prev => ({ ...prev, [f.id]: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-amber-700 font-bold text-sm font-mono rounded-lg px-3 py-2 transition-colors"
              />
            </div>
          ))}
          {/* placeholder for alignment */}
          <div className="hidden lg:block" />
        </div>
      </div>

      {/* 3 KPI Progress cards */}
      {report && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="B2B" icon={Building2}
            actual={b2bActualRev} prRev={b2bPrRev} target={targets.b2bRev}
            cm1Actual={b2bActualCm1} prCm1={b2bPrCm1} cm1Target={targets.b2bCm1}
            hk3Pct={b2bHk3Pct} hk3Target={targets.b2bThk} />
          <KpiCard label="B2C" icon={ShoppingBag}
            actual={b2cActualRev} prRev={b2cPrRev} target={targets.b2cRev}
            cm1Actual={b2cActualCm1} prCm1={b2cPrCm1} cm1Target={targets.b2cCm1}
            hk3Pct={b2cHk3Pct} hk3Target={targets.b2cThk} />
          <KpiCard label="Total" icon={TrendingUp}
            actual={totalActualRev} prRev={totalPrRev} target={targets.b2bRev + targets.b2cRev}
            cm1Actual={totalActualCm1} prCm1={totalPrCm1} cm1Target={targets.b2bCm1 + targets.b2cCm1}
            hk3Pct={totalHk3Pct} hk3Target={0} />
        </div>
      )}

      {/* Monthly summary table */}
      {!loading && summary.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tổng hợp theo tháng (B2B + B2C Sub-Row)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {["Tháng", "Revenue", "PR Rev", "Gross Margin", "GM%", "Ch. Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map(m => {
                  const [y, mo] = m.month.split("-")
                  const label = `T${parseInt(mo)}/${y}`
                  const prRev  = m.total.revenue  // projected (= actual × factor for current month)
                  const actRev = m.total.actualRevenue ?? m.total.revenue
                  const prCm1  = m.total.cm1
                  const actCm1 = m.isProjected ? m.total.cm1 / m.factor : m.total.cm1
                  return (
                    <React.Fragment key={m.month}>
                      {/* Month total row */}
                      <tr className={cn("border-b border-slate-100 hover:bg-amber-50/30 transition-colors", m.isProjected && "bg-amber-50/20")}>
                        <td className="px-4 py-3 font-bold text-slate-800">
                          {label}
                          {m.isProjected && <span className="ml-1.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">PR ×{m.factor}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 font-semibold">{fc(actRev)}</td>
                        <td className="px-4 py-3 text-right text-indigo-500 font-semibold">{m.isProjected ? fc(prRev) : dash}</td>
                        <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{fc(m.total.gp)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.total.gpPct)}</td>
                        <td className="px-4 py-3 text-right text-rose-500">{m.total.channelCost > 0 ? fc(m.total.channelCost) : dash}</td>
                        <td className="px-4 py-3 text-right text-orange-600">{m.total.groupCost > 0 ? fc(m.total.groupCost) : dash}</td>
                        <td className={cn("px-4 py-3 text-right font-black text-[14px]", m.total.cm1 >= 0 ? "text-amber-700" : "text-rose-600")}>{fc(actCm1)}</td>
                        <td className="px-4 py-3 text-right text-indigo-500 font-semibold">{m.isProjected ? fc(prCm1) : dash}</td>
                        <td className={cn("px-4 py-3 text-right font-bold", m.total.cm1 >= 0 ? "text-amber-600" : "text-rose-500")}>{pct(m.total.cm1Pct)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{pct(m.hk3Pct ?? 0)}</td>
                      </tr>
                      {/* B2B sub-row */}
                      <SubRow label="B2B" stats={m.b2b} isProjected={m.isProjected} factor={m.factor} color="text-blue-700" />
                      {/* B2C sub-row */}
                      <SubRow label="B2C" stats={m.b2c} isProjected={m.isProjected} factor={m.factor} color="text-indigo-600" />
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarter total vs target */}
      {!loading && qt && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tổng hợp cả Quý (So với Mục tiêu / Target)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {["Chỉ số Quý", "Revenue", "PR Rev", "Gross Margin", "GM%", "Ch. Cost", "Group Cost", "CM1", "PR CM1", "CM1%", "3HK%"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qt.b2b && (
                  <>
                    <QtRow label="B2B Quý (Thực tế)" stats={qt.b2b} prRev={b2bPrRev} actRev={b2bActualRev} actCm1={b2bActualCm1} prCm1={b2bPrCm1} hk3Pct={b2bHk3Pct} bold />
                    {targets.b2bRev > 0 && <TargetRow label="↳ Target B2B" targetRev={targets.b2bRev} prRev={b2bPrRev} targetCm1={targets.b2bCm1} targetThk={targets.b2bThk} hk3Pct={b2bHk3Pct} />}
                  </>
                )}
                {qt.b2c && (
                  <>
                    <QtRow label="B2C Quý (Thực tế)" stats={qt.b2c} prRev={b2cPrRev} actRev={b2cActualRev} actCm1={b2cActualCm1} prCm1={b2cPrCm1} hk3Pct={b2cHk3Pct} bold />
                    {targets.b2cRev > 0 && <TargetRow label="↳ Target B2C" targetRev={targets.b2cRev} prRev={b2cPrRev} targetCm1={targets.b2cCm1} targetThk={targets.b2cThk} hk3Pct={b2cHk3Pct} />}
                  </>
                )}
                <QtRow label={`Tổng ${selQ}-${selYear}`} stats={qt} prRev={totalPrRev} actRev={totalActualRev} actCm1={totalActualCm1} prCm1={totalPrCm1} hk3Pct={totalHk3Pct} bold highlight />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* B2B channel pivot */}
      {!loading && report && report.b2bChannels.length > 0 && (
        <PivotTable
          title="Chi tiết B2B — theo Kênh (Hàng) × Tháng (Cột)"
          icon={Building2}
          channels={report.b2bChannels}
          months={activeMonths}
          expanded={expandB2B}
          onToggle={() => setExpandB2B(v => !v)}
        />
      )}

      {/* B2C channel pivot */}
      {!loading && report && report.b2cChannels.length > 0 && (
        <PivotTable
          title="Chi tiết B2C — theo Kênh (Hàng) × Tháng (Cột)"
          icon={ShoppingBag}
          channels={report.b2cChannels}
          months={activeMonths}
          expanded={expandB2C}
          onToggle={() => setExpandB2C(v => !v)}
        />
      )}

      {/* Empty */}
      {!loading && summary.length === 0 && report && (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có dữ liệu cho {selQ}-{selYear}.</div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubRow({ label, stats, isProjected, factor, color }: { label: string; stats: MonthStats; isProjected: boolean; factor: number; color: string }) {
  const actRev = stats.actualRevenue ?? stats.revenue
  const actCm1 = isProjected ? stats.cm1 / factor : stats.cm1
  const prRev  = stats.revenue
  const prCm1  = stats.cm1
  return (
    <tr className="border-b border-slate-50 bg-slate-50/30 text-[11px]">
      <td className="px-4 py-2 pl-9">
        <span className={cn("font-bold", color)}>↳ {label}</span>
      </td>
      <td className="px-4 py-2 text-right text-slate-600">{fc(actRev)}</td>
      <td className="px-4 py-2 text-right text-indigo-400">{isProjected ? fc(prRev) : <span className="text-slate-200">—</span>}</td>
      <td className="px-4 py-2 text-right text-emerald-600">{fc(stats.gp)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct(stats.gpPct)}</td>
      <td className="px-4 py-2 text-right text-rose-400">{stats.channelCost > 0 ? fc(stats.channelCost) : <span className="text-slate-200">—</span>}</td>
      <td className="px-4 py-2 text-right text-orange-500">{stats.groupCost > 0 ? fc(stats.groupCost) : <span className="text-slate-200">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-bold", stats.cm1 >= 0 ? "text-amber-600" : "text-rose-500")}>{fc(actCm1)}</td>
      <td className="px-4 py-2 text-right text-indigo-400">{isProjected ? fc(prCm1) : <span className="text-slate-200">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-bold", stats.cm1 >= 0 ? "text-amber-500" : "text-rose-400")}>{pct(stats.cm1Pct)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct((stats.hk3Pct as number | undefined) ?? 0)}</td>
    </tr>
  )
}

function QtRow({ label, stats, prRev, actRev, actCm1, prCm1, hk3Pct, bold, highlight }:
  { label: string; stats: MonthStats; prRev: number; actRev: number; actCm1: number; prCm1: number; hk3Pct: number; bold?: boolean; highlight?: boolean }) {
  return (
    <tr className={cn("border-b border-slate-100 text-xs", highlight ? "bg-amber-50" : "hover:bg-slate-50/60")}>
      <td className={cn("px-4 py-3", bold ? "font-bold text-slate-800" : "text-slate-600 pl-7")}>{label}</td>
      <td className={cn("px-4 py-3 text-right", bold ? "font-bold text-slate-800" : "text-slate-600")}>{fc(actRev)}</td>
      <td className="px-4 py-3 text-right text-indigo-500 font-semibold">{fc(prRev)}</td>
      <td className={cn("px-4 py-3 text-right", bold ? "font-semibold text-emerald-700" : "text-emerald-600")}>{fc(stats.gp)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(stats.gpPct)}</td>
      <td className="px-4 py-3 text-right text-rose-500">{stats.channelCost > 0 ? fc(stats.channelCost) : "—"}</td>
      <td className="px-4 py-3 text-right text-orange-600">{stats.groupCost > 0 ? fc(stats.groupCost) : "—"}</td>
      <td className={cn("px-4 py-3 text-right font-black text-[14px]", stats.cm1 >= 0 ? "text-amber-700" : "text-rose-600")}>{fc(actCm1)}</td>
      <td className="px-4 py-3 text-right text-indigo-500 font-semibold">{fc(prCm1)}</td>
      <td className={cn("px-4 py-3 text-right font-bold", stats.cm1 >= 0 ? "text-amber-600" : "text-rose-500")}>{pct(stats.cm1Pct)}</td>
      <td className="px-4 py-3 text-right text-slate-500">{pct(hk3Pct)}</td>
    </tr>
  )
}

function TargetRow({ label, targetRev, prRev, targetCm1, targetThk, hk3Pct }:
  { label: string; targetRev: number; prRev: number; targetCm1: number; targetThk: number; hk3Pct: number }) {
  const prPct  = targetRev > 0 ? (prRev / targetRev) * 100 : 0
  const hkDiff = targetThk > 0 ? hk3Pct - targetThk : null
  const color  = prPct >= 100 ? "text-emerald-600" : prPct >= 75 ? "text-amber-600" : "text-rose-500"
  return (
    <tr className="border-b border-slate-50 bg-slate-50/20 text-[11px] text-slate-500">
      <td className="px-4 py-2 pl-9 italic font-semibold text-slate-400">{label}</td>
      <td className="px-4 py-2 text-right">{fc(targetRev)}</td>
      <td className={cn("px-4 py-2 text-right font-bold", color)}>Đạt PR: {pct(prPct)}</td>
      <td className="px-4 py-2 text-right" colSpan={4}>—</td>
      <td className="px-4 py-2 text-right">{targetCm1 > 0 ? fc(targetCm1) : "—"}</td>
      <td className="px-4 py-2 text-right" />
      <td className="px-4 py-2 text-right">{targetCm1 > 0 && targetRev > 0 ? pct((targetCm1 / targetRev) * 100) : "—"}</td>
      <td className="px-4 py-2 text-right">
        {targetThk > 0 ? (
          <span className={cn("font-bold", hkDiff != null && hkDiff >= 0 ? "text-emerald-600" : "text-rose-500")}>
            Tgt: {pct(targetThk)}{hkDiff != null && ` · Đạt: ${pct((hk3Pct / targetThk) * 100)}`}
          </span>
        ) : "—"}
      </td>
    </tr>
  )
}

// ─── Pivot table for B2B/B2C channel breakdown ───────────────────────────────

function PivotTable({ title, icon: Icon, channels, months, expanded, onToggle }:
  { title: string; icon: React.ElementType; channels: { name: string; totalRevenue: number; months: { month: string; revenue: number; gp: number; channelCost: number; cm1: number; cm1Pct: number; momPct: number | null }[] }[]; months: string[]; expanded: boolean; onToggle: () => void }) {

  const SUB_COLS = ["Revenue", "GP", "Ch.Cost", "CM1", "%CM1", "%MoM"]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button className="w-full px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-600" />
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse font-mono" style={{ minWidth: `${Math.max(500, 160 + months.length * 6 * 72)}px` }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase sticky left-0 bg-slate-50 border-r border-slate-200 min-w-[160px]">Kênh</th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  return (
                    <th key={m} colSpan={6} className="px-3 py-2 text-center font-bold text-slate-600 border-l border-slate-200 whitespace-nowrap">
                      T{parseInt(mo)}/{y}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[9px] text-slate-400 uppercase">
                <th className="px-4 py-1.5 sticky left-0 bg-slate-50/70 border-r border-slate-200" />
                {months.flatMap(m => SUB_COLS.map((h, i) => (
                  <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap", i === 0 && "border-l border-slate-100", h === "CM1" ? "font-bold text-amber-500" : "font-normal")}>
                    {h}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {channels.map(ch => (
                <tr key={ch.name} className="hover:bg-amber-50/20 transition-colors">
                  <td className="px-4 py-2 font-semibold text-slate-700 sticky left-0 bg-white border-r border-slate-100">{ch.name}</td>
                  {months.flatMap(m => {
                    const d = ch.months.find(x => x.month === m)
                    if (!d || d.revenue === 0) {
                      return SUB_COLS.map((_, i) => (
                        <td key={`${m}-${i}`} className={cn("px-2 py-2 text-right text-slate-200", i === 0 && "border-l border-slate-100")}>—</td>
                      ))
                    }
                    return [
                      <td key={`${m}-rev`} className="px-2 py-2 text-right text-slate-700 border-l border-slate-100">{fc(d.revenue)}</td>,
                      <td key={`${m}-gp`}  className="px-2 py-2 text-right text-emerald-600">{fc(d.gp)}</td>,
                      <td key={`${m}-cc`}  className="px-2 py-2 text-right text-rose-400">{d.channelCost > 0 ? fc(d.channelCost) : "—"}</td>,
                      <td key={`${m}-cm1`} className={cn("px-2 py-2 text-right font-bold", d.cm1 >= 0 ? "text-amber-700" : "text-rose-600")}>{fc(d.cm1)}</td>,
                      <td key={`${m}-pct`} className={cn("px-2 py-2 text-right", d.cm1 >= 0 ? "text-amber-500" : "text-rose-400")}>{pct(d.cm1Pct)}</td>,
                      <td key={`${m}-mom`} className={cn("px-2 py-2 text-right text-[10px] font-bold", d.momPct != null && d.momPct >= 0 ? "text-emerald-600" : "text-rose-500")}>
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
