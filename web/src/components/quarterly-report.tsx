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
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</h3>
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-2.5 text-left font-bold text-slate-200 sticky left-0 bg-slate-800 min-w-[160px] border-r border-slate-700">
                  Kênh
                </th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  return (
                    <th key={m} colSpan={5}
                      className={cn("px-3 py-2.5 text-center font-bold text-slate-200 border-l border-slate-700 whitespace-nowrap",
                        projMap[m] && "bg-blue-900/40 text-blue-200")}>
                      T{parseInt(mo)}/{y}
                      {projMap[m] && <span className="ml-1 text-[9px] font-bold text-blue-300 bg-blue-800/50 px-1 py-0.5 rounded">(PR)</span>}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-slate-700/60 border-b border-slate-700 text-[10px] text-slate-300">
                <th className="px-4 py-1.5 sticky left-0 bg-slate-700/60 border-r border-slate-600" />
                {months.map(m => (
                  <React.Fragment key={m}>
                    <th className="px-3 py-1.5 text-right border-l border-slate-600 whitespace-nowrap font-normal text-slate-400">Revenue</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal text-emerald-300">GP</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal text-amber-300">Ch.Cost</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-bold text-indigo-300">CM1</th>
                    <th className="px-3 py-1.5 text-right whitespace-nowrap font-normal text-slate-400">%MoM</th>
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
              <BarChart3 className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Báo cáo CM1 theo Quý</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Revenue · Gross Profit · Channel Cost · Group Cost · <span className="font-semibold text-indigo-500">CM1</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-0.5 bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3.5 py-1.5 text-xs font-bold rounded-md transition-all",
                  selQ === q ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100")}>
                {q}
              </button>
            ))}
          </div>
          <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer shadow-sm">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={fetchReport} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-60 active:scale-95 shadow-sm shadow-indigo-200">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            Xem báo cáo
          </button>
          {report && !loading && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {selQ}-{selYear}
              {summary.filter(m => m.isProjected).length > 0 && <span className="text-blue-400">(có pro-rata)</span>}
              {companyCode !== "ALL" && <span className="font-medium text-slate-500">· {companyCode}</span>}
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
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tổng hợp theo tháng</h3>
                <span className="text-[10px] text-slate-400">· bấm hàng tháng để xem B2B / B2C</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-[10px] font-bold text-slate-200 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left sticky left-0 bg-slate-800 min-w-[160px] border-r border-slate-700">Tháng</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-slate-300">Revenue</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-emerald-300">Gross Profit</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-slate-400">GP%</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-amber-300">Ch. Cost</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-orange-300">Group Cost</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-indigo-300 font-black">CM1</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-indigo-300 font-black">CM1%</th>
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
                              className={cn("cursor-pointer select-none border-t border-slate-100",
                                m.isProjected ? "bg-blue-50/40 hover:bg-blue-50/70" : "bg-white hover:bg-slate-50/80")}
                              onClick={() => toggleMonth(m.month)}
                            >
                              <td className={cn("px-4 py-3 sticky left-0 border-r border-slate-100",
                                m.isProjected ? "bg-blue-50/50" : "bg-white")}>
                                <div className="flex items-center gap-2">
                                  <ChevronRight className={cn("w-3.5 h-3.5 text-slate-400 transition-transform shrink-0", expanded && "rotate-90")} />
                                  <span className="font-bold text-slate-800 text-[13px]">{monthLabel}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-800">{fc(m.total.revenue)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fc(m.total.gp)}</td>
                              <td className="px-4 py-3 text-right text-slate-500 text-[11px]">{pctStr(m.total.gpPct)}</td>
                              <td className="px-4 py-3 text-right text-amber-700 text-[11px]">{m.total.channelCost > 0 ? fc(m.total.channelCost) : <span className="text-slate-200">—</span>}</td>
                              <td className="px-4 py-3 text-right text-orange-700 text-[11px]">{m.total.groupCost > 0 ? fc(m.total.groupCost) : <span className="text-slate-200">—</span>}</td>
                              <td className={cn("px-4 py-3 text-right font-bold text-[14px]", m.total.cm1 >= 0 ? "text-indigo-700" : "text-rose-600")}>{fc(m.total.cm1)}</td>
                              <td className={cn("px-4 py-3 text-right font-bold text-[12px]", m.total.cm1 >= 0 ? "text-indigo-600" : "text-rose-500")}>
                                <span className={cn("px-1.5 py-0.5 rounded", m.total.cm1 >= 0 ? "bg-indigo-50" : "bg-rose-50")}>{pctStr(m.total.cm1Pct)}</span>
                              </td>
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
                          <tr className="bg-indigo-700 cursor-pointer select-none hover:bg-indigo-600"
                            onClick={() => setExpandedQTotal(v => !v)}>
                            <td className="px-4 py-3 sticky left-0 bg-indigo-700 border-r border-indigo-600">
                              <div className="flex items-center gap-2 font-bold text-white text-[11px] uppercase tracking-wider">
                                <ChevronRight className={cn("w-3.5 h-3.5 text-indigo-200 transition-transform shrink-0", expandedQTotal && "rotate-90")} />
                                Tổng {selQ}-{selYear}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-white">{fc(quarterTotal.revenue)}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-200">{fc(quarterTotal.gp)}</td>
                            <td className="px-4 py-3 text-right text-indigo-200 text-[11px]">{pctStr(quarterTotal.gpPct)}</td>
                            <td className="px-4 py-3 text-right text-amber-200 text-[11px]">{quarterTotal.channelCost > 0 ? fc(quarterTotal.channelCost) : "—"}</td>
                            <td className="px-4 py-3 text-right text-orange-200 text-[11px]">{quarterTotal.groupCost > 0 ? fc(quarterTotal.groupCost) : "—"}</td>
                            <td className={cn("px-4 py-3 text-right font-black text-[15px]", quarterTotal.cm1 >= 0 ? "text-yellow-200" : "text-rose-300")}>{fc(quarterTotal.cm1)}</td>
                            <td className={cn("px-4 py-3 text-right font-bold text-[12px]", quarterTotal.cm1 >= 0 ? "text-yellow-200" : "text-rose-300")}>
                              <span className="bg-white/10 px-1.5 py-0.5 rounded">{pctStr(quarterTotal.cm1Pct)}</span>
                            </td>
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
