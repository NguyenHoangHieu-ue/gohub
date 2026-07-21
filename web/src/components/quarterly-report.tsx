"use client"

import React, { useState, useCallback, useEffect } from "react"
import { X, Download, TrendingUp, TrendingDown } from "lucide-react"
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

const fc = formatCompactNumber
const pct = (v: number) => `${v.toFixed(1)}%`

// ─── Mini charts ──────────────────────────────────────────────────────────────

function MiniBarChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-1 h-10 mt-2">
      {values.map((v, i) => (
        <div key={i} style={{ height: `${Math.max(20, (v / max) * 100)}%` }}
          className={cn("flex-1 rounded-sm transition-all",
            i === values.length - 1 ? "bg-blue-600" : "bg-blue-200")} />
      ))}
    </div>
  )
}

function Sparkline({ values, color = "#10b981" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const W = 100; const H = 36
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 6) - 3,
  }))
  // Smooth curve via cubic bezier
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cp = (pts[i].x + pts[i - 1].x) / 2
    d += ` C${cp},${pts[i - 1].y} ${cp},${pts[i].y} ${pts[i].x},${pts[i].y}`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 mt-2" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RingProgress({ value, size = 60 }: { value: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(Math.max(value, 0), 100) / 100) * c
  const color = value >= 100 ? "#10b981" : value >= 75 ? "#6366f1" : "#f59e0b"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${c}`} strokeDashoffset={`${offset}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuarterlyReport({ isOpen, onClose, companyCode = "ALL", dateColumn = "fulfiled_date" }: Props) {
  const today = new Date()
  const [selQ, setSelQ] = useState(`Q${Math.ceil((today.getMonth() + 1) / 3)}`)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [report, setReport] = useState<QReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = `/api/analytics/quarterly-report?quarter=${selQ}&year=${selYear}&dateColumn=${dateColumn}&companyCode=${companyCode}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setReport(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selQ, selYear, dateColumn, companyCode])

  // Auto-fetch khi mở modal hoặc đổi quý/năm
  useEffect(() => { if (isOpen) fetchReport() }, [isOpen, fetchReport])

  if (!isOpen) return null

  const years = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const quarters = ["Q1", "Q2", "Q3", "Q4"]
  const summary = report?.summary ?? []
  const qtotal  = report?.quarterTotal
  const projMap: Record<string, boolean> = Object.fromEntries(summary.map(m => [m.month, m.isProjected]))

  // KPI values từ quarter total
  const revenues   = summary.map(m => m.total.revenue)
  const gps        = summary.map(m => m.total.gp)
  const cm1s       = summary.map(m => m.total.cm1)

  // MoM change: last vs first month trong quý
  const revMoM = revenues.length >= 2 && revenues[0] > 0
    ? ((revenues[revenues.length - 1] - revenues[0]) / revenues[0]) * 100 : null
  const gpMargin = qtotal && qtotal.revenue > 0 ? qtotal.gpPct : null

  // Xuất Excel đơn giản
  const exportExcel = () => {
    if (!report) return
    const rows = [
      ["Tháng", "Revenue", "Gross Profit", "GP%", "CH. Cost", "CM1", "CM1%"],
      ...summary.map(m => [
        `T${parseInt(m.month.split("-")[1])}/${m.month.split("-")[0]}`,
        m.total.revenue, m.total.gp, m.total.gpPct,
        m.total.channelCost, m.total.cm1, m.total.cm1Pct,
      ]),
      qtotal ? ["TỔNG", qtotal.revenue, qtotal.gp, qtotal.gpPct, qtotal.channelCost, qtotal.cm1, qtotal.cm1Pct] : [],
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = `quarterly-report-${selQ}-${selYear}.csv`
    a.click()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[88rem]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Báo cáo CHT Theo Quý</h2>
            <p className="text-sm text-slate-400 mt-0.5">Thống kê chi tiết doanh thu, lợi nhuận và hiệu suất theo kênh</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Quarter selector */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
              {quarters.map(q => (
                <button key={q} onClick={() => setSelQ(q)}
                  className={cn("px-4 py-1.5 text-sm font-semibold rounded-lg transition-all",
                    selQ === q ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                  {q}
                </button>
              ))}
              <div className="w-px h-5 bg-slate-300 mx-1" />
              <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
                className="px-3 py-1.5 text-sm font-semibold bg-transparent text-slate-700 outline-none cursor-pointer">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Loading / Error ── */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Đang tải {selQ}-{selYear}…</span>
            </div>
          )}
          {error && !loading && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {!loading && report && (
            <>
              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-3 gap-4">

                {/* Revenue card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Revenue</span>
                    {revMoM != null && (
                      <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
                        revMoM >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600")}>
                        {revMoM >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {revMoM >= 0 ? "+" : ""}{revMoM.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-black text-slate-900 mt-1">{qtotal ? fc(qtotal.revenue) : "—"}</p>
                  <MiniBarChart values={revenues} />
                </div>

                {/* Gross Profit card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Gross Profit</span>
                    {gpMargin != null && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        {pct(gpMargin)} Margin
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-black text-emerald-700 mt-1">{qtotal ? fc(qtotal.gp) : "—"}</p>
                  <Sparkline values={gps} color="#10b981" />
                </div>

                {/* CM1 card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Net CM1</span>
                    {qtotal && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        {pct(qtotal.cm1Pct)} CM1%
                      </span>
                    )}
                  </div>
                  <p className={cn("text-3xl font-black mt-1", qtotal && qtotal.cm1 >= 0 ? "text-indigo-700" : "text-rose-600")}>
                    {qtotal ? fc(qtotal.cm1) : "—"}
                  </p>
                  <div className="flex items-end justify-between mt-2">
                    <Sparkline values={cm1s} color="#6366f1" />
                    {qtotal && (
                      <div className="ml-3 flex-shrink-0">
                        <div className="relative w-14 h-14">
                          <RingProgress value={qtotal.cm1Pct * 4} size={56} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-black text-indigo-700">{pct(qtotal.cm1Pct)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Summary Table ── */}
              {summary.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tổng hợp theo tháng</h3>
                    <button onClick={exportExcel}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                      <Download className="w-3.5 h-3.5" />Xuất Excel
                    </button>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest w-36">Tháng</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gross Profit</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">GP%</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ch. Cost</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">CM1</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">CM1%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map(m => {
                        const [y, mo] = m.month.split("-")
                        return (
                          <tr key={m.month} className={cn("border-b border-slate-50 hover:bg-slate-50/60 transition-colors", m.isProjected && "bg-blue-50/20")}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">T{parseInt(mo)}/{y}</span>
                                {m.isProjected && (
                                  <span className="text-[9px] font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
                                    ×{m.factor}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right text-slate-700 font-medium">{fc(m.total.revenue)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-emerald-600">{fc(m.total.gp)}</td>
                            <td className="px-4 py-3.5 text-right text-slate-500 text-[12px]">{pct(m.total.gpPct)}</td>
                            <td className="px-4 py-3.5 text-right font-medium text-rose-500">{m.total.channelCost > 0 ? fc(m.total.channelCost) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-indigo-700 text-[15px]">{fc(m.total.cm1)}</td>
                            <td className="px-4 py-3.5 text-right text-slate-500 text-[12px]">{pct(m.total.cm1Pct)}</td>
                          </tr>
                        )
                      })}

                      {/* Total row */}
                      {qtotal && summary.length > 1 && (
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td className="px-5 py-4">
                            <span className="font-bold text-indigo-700 text-[13px] uppercase tracking-wide">Tổng {selQ}-{selYear}</span>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-slate-800">{fc(qtotal.revenue)}</td>
                          <td className="px-4 py-4 text-right font-bold text-emerald-700">{fc(qtotal.gp)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-600">{pct(qtotal.gpPct)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-rose-600">{qtotal.channelCost > 0 ? fc(qtotal.channelCost) : "—"}</td>
                          <td className="px-4 py-4 text-right font-black text-indigo-800 text-[16px]">{fc(qtotal.cm1)}</td>
                          <td className="px-4 py-4 text-right font-bold text-indigo-700">{pct(qtotal.cm1Pct)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Channel sections ── */}
              {(report.b2bChannels.length > 0 || report.b2cChannels.length > 0) && (
                <div className="grid grid-cols-2 gap-4">

                  {/* B2B top channels */}
                  {report.b2bChannels.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Kênh B2B trọng yếu</h3>
                        <span className="text-[10px] text-slate-400 font-medium">Top Performance</span>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {report.b2bChannels.slice(0, 6).map(ch => {
                          const momPcts = ch.months.map(m => m.momPct).filter(v => v != null) as number[]
                          const avgMom = momPcts.length > 0 ? momPcts.reduce((a, b) => a + b, 0) / momPcts.length : null
                          return (
                            <div key={ch.name} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-black text-indigo-600">{ch.name.slice(0, 2).toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 text-sm truncate">{ch.name}</p>
                                <p className="text-[10px] text-slate-400">B2B Network</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-slate-800 text-sm">{fc(ch.totalRevenue)}</p>
                                {avgMom != null && (
                                  <p className={cn("text-[10px] font-semibold flex items-center justify-end gap-0.5",
                                    avgMom >= 0 ? "text-emerald-600" : "text-rose-500")}>
                                    {avgMom >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {avgMom >= 0 ? "+" : ""}{avgMom.toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* B2C channels */}
                  {report.b2cChannels.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Ma trận hiệu quả kênh B2C</h3>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Revenue</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />GP</span>
                        </div>
                      </div>
                      <div className="px-5 py-3 space-y-2">
                        {report.b2cChannels.slice(0, 6).map(ch => {
                          const totalGp = ch.months.reduce((s, m) => s + m.gp, 0)
                          const gpRatio = ch.totalRevenue > 0 ? (totalGp / ch.totalRevenue) * 100 : 0
                          const maxRev  = Math.max(...report.b2cChannels.map(c => c.totalRevenue), 1)
                          const revBar  = (ch.totalRevenue / maxRev) * 100
                          const gpBar   = Math.min((totalGp / maxRev) * 100, revBar)
                          return (
                            <div key={ch.name}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-700 truncate max-w-[60%]">{ch.name}</span>
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="text-slate-500">{fc(ch.totalRevenue)}</span>
                                  <span className={cn("font-semibold", gpRatio >= 25 ? "text-emerald-600" : "text-slate-400")}>{pct(gpRatio)}</span>
                                </div>
                              </div>
                              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden relative">
                                <div className="absolute inset-y-0 left-0 bg-blue-200 rounded-full" style={{ width: `${revBar}%` }} />
                                <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${gpBar}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Empty */}
              {summary.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm">Chưa có dữ liệu cho {selQ}-{selYear}.</div>
              )}
            </>
          )}

          {/* Prompt to select */}
          {!loading && !report && !error && (
            <div className="text-center py-16 text-slate-400 text-sm">Đang tải dữ liệu…</div>
          )}

        </div>
      </div>
    </div>
  )
}
