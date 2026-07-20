"use client"

import React, { useState, useCallback } from "react"
import { X, BarChart3, RefreshCw, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthStats {
  revenue: number; gp: number; gpPct: number
  channelCost: number; groupCost: number; cm1: number; cm1Pct: number
}
interface MonthSummary {
  month: string; isProjected: boolean; factor: number; elapsed: number; dim: number
  total: MonthStats; b2b: MonthStats; b2c: MonthStats
}
interface ChannelMonth {
  month: string; revenue: number; gp: number
  channelCost: number; cm1: number; cm1Pct: number; momPct: number | null
}
interface Channel { name: string; totalRevenue: number; months: ChannelMonth[] }
interface QReport {
  quarter: string; year: number; months: string[]
  summary: MonthSummary[]
  quarterTotal: MonthStats
  b2bChannels: Channel[]; b2cChannels: Channel[]
}
interface Props {
  isOpen: boolean; onClose: () => void
  companyCode?: string; dateColumn?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fc = formatCompactNumber
const pctStr = (v: number) => `${v.toFixed(1)}%`
const momCls = (v: number | null) => v == null ? "" : v >= 0 ? "text-emerald-600" : "text-rose-500"
const momStr = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`

function MonthLabel({ month, isProjected, factor, elapsed, dim }: Pick<MonthSummary, "month" | "isProjected" | "factor" | "elapsed" | "dim">) {
  const [, mo] = month.split("-")
  return (
    <span className="flex items-center gap-1.5">
      <span>T{parseInt(mo)}</span>
      {isProjected && (
        <span className="text-[9px] font-bold text-blue-500 bg-blue-100 px-1 py-0.5 rounded">
          {elapsed}/{dim}d · ×{factor}
        </span>
      )}
    </span>
  )
}

// ─── Channel detail table ─────────────────────────────────────────────────────

function ChannelTable({ title, channels, months, projMap }: {
  title: string; channels: Channel[]; months: string[]; projMap: Record<string, boolean>
}) {
  if (channels.length === 0) return null
  return (
    <section>
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{title}</h3>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-50 min-w-[160px] border-r border-slate-200">
                  Kênh
                </th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  return (
                    <th key={m} colSpan={5}
                      className={cn("px-3 py-2 text-center font-bold text-slate-600 border-l border-slate-200 whitespace-nowrap",
                        projMap[m] && "bg-blue-50/40")}>
                      T{parseInt(mo)}/{y}
                      {projMap[m] && <span className="ml-1 text-[9px] font-bold text-blue-500">(PR)</span>}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] text-slate-400">
                <th className="px-4 py-1.5 sticky left-0 bg-slate-50/70 border-r border-slate-200" />
                {months.map(m => (
                  <React.Fragment key={m}>
                    <th className="px-3 py-1.5 text-right border-l border-slate-100 whitespace-nowrap font-normal">Revenue</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal">GP</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal">Ch.Cost</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-semibold text-indigo-400">CM1</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal">%MoM</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {channels.map(ch => (
                <tr key={ch.name} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-4 py-2 font-medium text-slate-700 sticky left-0 bg-white border-r border-slate-100">
                    {ch.name}
                  </td>
                  {months.map(m => {
                    const d = ch.months.find(x => x.month === m)
                    const isProj = projMap[m]
                    const cellBase = cn("px-3 py-2 text-right", isProj && "bg-blue-50/20")
                    if (!d || d.revenue === 0) {
                      return (
                        <React.Fragment key={m}>
                          {[0, 1, 2, 3, 4].map(i => (
                            <td key={i} className={cn(cellBase, "text-slate-200", i === 0 && "border-l border-slate-100")}>—</td>
                          ))}
                        </React.Fragment>
                      )
                    }
                    return (
                      <React.Fragment key={m}>
                        <td className={cn(cellBase, "text-slate-700 font-medium border-l border-slate-100")}>{fc(d.revenue)}</td>
                        <td className={cn(cellBase, "text-emerald-700")}>{fc(d.gp)}</td>
                        <td className={cn(cellBase, "text-slate-500")}>{d.channelCost > 0 ? fc(d.channelCost) : "—"}</td>
                        <td className={cn(cellBase, "font-bold", d.cm1 >= 0 ? "text-indigo-700" : "text-rose-600")}>{fc(d.cm1)}</td>
                        <td className={cn(cellBase, "text-[10px] font-bold", momCls(d.momPct))}>{momStr(d.momPct)}</td>
                      </React.Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuarterlyReport({ isOpen, onClose, companyCode = "ALL", dateColumn = "fulfiled_date" }: Props) {
  const today = new Date()
  const defaultQ = `Q${Math.ceil((today.getMonth() + 1) / 3)}`
  const [selQ, setSelQ] = useState(defaultQ)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [report, setReport] = useState<QReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [expandedQTotal, setExpandedQTotal] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = `/api/analytics/quarterly-report?quarter=${selQ}&year=${selYear}&dateColumn=${dateColumn}&companyCode=${companyCode}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data: QReport = await res.json()
      setReport(data)
      // Auto-expand all months
      setExpandedMonths(new Set(data.summary.map(m => m.month)))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selQ, selYear, dateColumn, companyCode])

  if (!isOpen) return null

  const years = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const quarters = ["Q1", "Q2", "Q3", "Q4"]

  const toggleMonth = (m: string) => setExpandedMonths(prev => {
    const next = new Set(prev)
    next.has(m) ? next.delete(m) : next.add(m)
    return next
  })

  const summary = report?.summary ?? []
  const quarterTotal = report?.quarterTotal
  const activeMonths = summary.map(m => m.month)
  const projMap: Record<string, boolean> = Object.fromEntries(summary.map(m => [m.month, m.isProjected]))

  // Stats row builder for summary table
  const StatsRow = ({
    d, label, indent = false, isProjected = false, bold = false,
  }: { d: MonthStats; label: string; indent?: boolean; isProjected?: boolean; bold?: boolean }) => (
    <tr className={cn("hover:bg-slate-50/30 transition-colors", isProjected && !indent && "bg-blue-50/30")}>
      <td className={cn(
        "px-4 py-2 sticky left-0 border-r border-slate-100 whitespace-nowrap",
        isProjected && !indent ? "bg-blue-50/50" : "bg-white",
        indent ? "pl-8 text-slate-400 text-[11px]" : bold ? "font-bold text-slate-800" : "text-slate-600",
      )}>
        {label}
      </td>
      <td className={cn("px-4 py-2 text-right", bold ? "font-bold text-slate-900" : "text-slate-700")}>{d.revenue > 0 ? fc(d.revenue) : "—"}</td>
      <td className={cn("px-4 py-2 text-right", bold ? "font-bold text-emerald-700" : "text-emerald-600")}>{d.gp > 0 ? fc(d.gp) : "—"}</td>
      <td className="px-4 py-2 text-right text-slate-500">{d.revenue > 0 ? pctStr(d.gpPct) : "—"}</td>
      <td className="px-4 py-2 text-right text-slate-500">{d.channelCost > 0 ? fc(d.channelCost) : "—"}</td>
      <td className="px-4 py-2 text-right text-slate-500">{d.groupCost > 0 ? fc(d.groupCost) : "—"}</td>
      <td className={cn("px-4 py-2 text-right font-bold", d.cm1 >= 0 ? "text-indigo-700" : "text-rose-600")}>{d.revenue > 0 ? fc(d.cm1) : "—"}</td>
      <td className={cn("px-4 py-2 text-right font-bold", d.cm1 >= 0 ? "text-indigo-600" : "text-rose-500")}>{d.revenue > 0 ? pctStr(d.cm1Pct) : "—"}</td>
    </tr>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[90rem]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Báo cáo CM1 theo Quý</h2>
              <p className="text-xs text-slate-400">Revenue · Gross Margin · CM1 (B2B / B2C)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center">
          <div className="flex gap-0.5 bg-white rounded-lg border border-slate-200 p-0.5">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                  selQ === q ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50")}>
                {q}
              </button>
            ))}
          </div>
          <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-60 active:scale-95">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            Xem báo cáo
          </button>
          {report && !loading && (
            <span className="text-[11px] text-slate-400 italic">
              {selQ}-{selYear} · {summary.filter(m => m.isProjected).length > 0 ? "có tháng pro-rata" : "đủ dữ liệu"}
              {companyCode !== "ALL" && ` · ${companyCode}`}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="p-6 space-y-8">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}

          {!report && !loading && !error && (
            <div className="text-center py-16 text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Chọn quý và bấm <span className="font-bold text-slate-500">Xem báo cáo</span></p>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400 mb-3" />
              <p className="text-sm text-slate-400">Đang tải dữ liệu quý {selQ}-{selYear}…</p>
            </div>
          )}

          {/* ── Summary table ── */}
          {!loading && summary.length > 0 && (
            <section>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                TỔNG HỢP — MỖI THÁNG 1 HÀNG = B2B + B2C SUB-ROW
              </h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5 text-left sticky left-0 bg-slate-50 min-w-[160px] border-r border-slate-200">Tháng</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Revenue</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Gross Margin</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">GP%</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Ch. Cost</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Group Cost</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap text-indigo-600">CM1</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap text-indigo-600">CM1%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.map(m => {
                        const expanded = expandedMonths.has(m.month)
                        const [y, mo] = m.month.split("-")
                        const monthLabel = (
                          <span className="flex items-center gap-1.5">
                            <span className="font-bold">T{parseInt(mo)}/{y}</span>
                            {m.isProjected && (
                              <span className="text-[9px] font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
                                {m.elapsed}/{m.dim}d ×{m.factor}
                              </span>
                            )}
                          </span>
                        )
                        return (
                          <React.Fragment key={m.month}>
                            {/* Month header row — clickable to expand */}
                            <tr
                              className={cn("cursor-pointer select-none", m.isProjected ? "bg-blue-50/30" : "bg-white", "hover:bg-slate-50/60")}
                              onClick={() => toggleMonth(m.month)}
                            >
                              <td className={cn("px-4 py-3 sticky left-0 border-r border-slate-100", m.isProjected ? "bg-blue-50/50" : "bg-white")}>
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <ChevronRight className={cn("w-3.5 h-3.5 text-slate-400 transition-transform shrink-0", expanded && "rotate-90")} />
                                  {monthLabel}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">{fc(m.total.revenue)}</td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-700">{fc(m.total.gp)}</td>
                              <td className="px-4 py-3 text-right text-slate-600">{pctStr(m.total.gpPct)}</td>
                              <td className="px-4 py-3 text-right text-slate-600">{m.total.channelCost > 0 ? fc(m.total.channelCost) : "—"}</td>
                              <td className="px-4 py-3 text-right text-slate-600">{m.total.groupCost > 0 ? fc(m.total.groupCost) : "—"}</td>
                              <td className={cn("px-4 py-3 text-right font-bold text-base", m.total.cm1 >= 0 ? "text-indigo-700" : "text-rose-600")}>{fc(m.total.cm1)}</td>
                              <td className={cn("px-4 py-3 text-right font-bold", m.total.cm1 >= 0 ? "text-indigo-600" : "text-rose-500")}>{pctStr(m.total.cm1Pct)}</td>
                            </tr>
                            {expanded && (
                              <>
                                <StatsRow d={m.b2b} label="↳ B2B" indent isProjected={m.isProjected} />
                                <StatsRow d={m.b2c} label="↳ B2C" indent isProjected={m.isProjected} />
                              </>
                            )}
                          </React.Fragment>
                        )
                      })}

                      {/* Quarter total row */}
                      {quarterTotal && summary.length > 1 && (
                        <>
                          <tr className="bg-indigo-50/60 cursor-pointer select-none hover:bg-indigo-50/80"
                            onClick={() => setExpandedQTotal(v => !v)}>
                            <td className="px-4 py-3 sticky left-0 bg-indigo-50/70 border-r border-indigo-100 border-t border-indigo-100">
                              <div className="flex items-center gap-1.5 font-bold text-indigo-800 text-[11px] uppercase tracking-wider">
                                <ChevronRight className={cn("w-3.5 h-3.5 transition-transform shrink-0", expandedQTotal && "rotate-90")} />
                                Tổng {selQ}-{selYear}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-900 border-t border-indigo-100">{fc(quarterTotal.revenue)}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700 border-t border-indigo-100">{fc(quarterTotal.gp)}</td>
                            <td className="px-4 py-3 text-right text-indigo-700 border-t border-indigo-100">{pctStr(quarterTotal.gpPct)}</td>
                            <td className="px-4 py-3 text-right text-indigo-700 border-t border-indigo-100">{quarterTotal.channelCost > 0 ? fc(quarterTotal.channelCost) : "—"}</td>
                            <td className="px-4 py-3 text-right text-indigo-700 border-t border-indigo-100">{quarterTotal.groupCost > 0 ? fc(quarterTotal.groupCost) : "—"}</td>
                            <td className={cn("px-4 py-3 text-right font-bold text-base border-t border-indigo-100", quarterTotal.cm1 >= 0 ? "text-indigo-800" : "text-rose-600")}>{fc(quarterTotal.cm1)}</td>
                            <td className={cn("px-4 py-3 text-right font-bold border-t border-indigo-100", quarterTotal.cm1 >= 0 ? "text-indigo-700" : "text-rose-500")}>{pctStr(quarterTotal.cm1Pct)}</td>
                          </tr>
                          {expandedQTotal && (() => {
                            const b2bTot = summary.reduce((a, m) => ({
                              revenue: a.revenue + m.b2b.revenue, gp: a.gp + m.b2b.gp,
                              channelCost: a.channelCost + m.b2b.channelCost, groupCost: a.groupCost + m.b2b.groupCost,
                              cm1: a.cm1 + m.b2b.cm1,
                            }), { revenue: 0, gp: 0, channelCost: 0, groupCost: 0, cm1: 0 })
                            const b2cTot = summary.reduce((a, m) => ({
                              revenue: a.revenue + m.b2c.revenue, gp: a.gp + m.b2c.gp,
                              channelCost: a.channelCost + m.b2c.channelCost, groupCost: a.groupCost + m.b2c.groupCost,
                              cm1: a.cm1 + m.b2c.cm1,
                            }), { revenue: 0, gp: 0, channelCost: 0, groupCost: 0, cm1: 0 })
                            const mk = (x: { revenue: number; gp: number; channelCost: number; groupCost: number; cm1: number }): MonthStats => ({
                              ...x,
                              gpPct: x.revenue > 0 ? Math.round(x.gp / x.revenue * 1000) / 10 : 0,
                              cm1Pct: x.revenue > 0 ? Math.round(x.cm1 / x.revenue * 1000) / 10 : 0,
                            })
                            return (
                              <>
                                <StatsRow d={mk(b2bTot)} label="↳ B2B (cộng dồn)" indent />
                                <StatsRow d={mk(b2cTot)} label="↳ B2C (cộng dồn)" indent />
                              </>
                            )
                          })()}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ── Channel detail tables ── */}
          {!loading && report && (
            <>
              <ChannelTable
                title="CHI TIẾT B2B — THEO KÊNH × THÁNG (CỘT)"
                channels={report.b2bChannels}
                months={activeMonths}
                projMap={projMap}
              />
              <ChannelTable
                title="CHI TIẾT B2C — THEO KÊNH × THÁNG (CỘT)"
                channels={report.b2cChannels}
                months={activeMonths}
                projMap={projMap}
              />
            </>
          )}

          {/* No data */}
          {!loading && report && summary.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">Chưa có dữ liệu cho {selQ}-{selYear}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
