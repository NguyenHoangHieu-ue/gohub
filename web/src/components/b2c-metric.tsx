"use client"

import { useState, useEffect, type ReactNode } from "react"
import { RefreshCw, DollarSign, TrendingUp, Percent, ShoppingBag, Globe, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { LogicNote, StatTile, type MetricAccent } from "@/components/dashboard-kit"

// Web/App dùng chung 1 màu xuyên suốt B2C (khớp b2c-advanced-dashboard.tsx) — người xem học 1 lần,
// dùng lại được ở cả 2 sub-tab Advanced/Metric.
const WEB_COLOR = "#00a6a6"
const APP_COLOR = "#2f9d55"

// B2C Metric table — YTD monthly breakdown (Revenue/GP/CM1/Orders/AOV/Traffic/User/Customer by Web+App)
// Data: /api/analytics/b2c/metric

type CellWA = { web: number; app: number; other: number; total: number }
type TrafficCell = { web: number; app: number; total: number }
type CustGroup = { new: number; returning: number; total: number }
interface MonthData {
  revenue: CellWA
  grossProfit: CellWA
  orders: CellWA
  cm1: number
  traffic: TrafficCell
  users: TrafficCell
  customers: { web: CustGroup; app: CustGroup }
}
interface MetricResponse {
  months: string[]
  currentMonth: string
  elapsedDays: number
  totalDays: number
  data: Record<string, MonthData>
}

const fmtM = (v: number) => {
  if (v === 0) return "—"
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  return v.toLocaleString("vi-VN")
}
const fmtN = (v: number) => v === 0 ? "—" : v.toLocaleString("vi-VN")
const fmtPct = (v: number) => v === 0 ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
const mom = (cur: number, prev: number): number | null => prev === 0 ? null : ((cur - prev) / prev) * 100

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function PctBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-slate-300 text-[10px]">—</span>
  return (
    <span className={cn("text-[10px] font-bold", v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-500" : "text-slate-400")}>
      {fmtPct(v)}
    </span>
  )
}

interface RowDef {
  label: string
  indent?: 1 | 2
  bold?: boolean
  getValue: (d: MonthData) => number
  fmt?: "money" | "num" | "pct"
}

const ROWS: RowDef[] = [
  { label: "Total Revenue",  bold: true,  getValue: d => d.revenue.total,     fmt: "money" },
  { label: "  - Web",        indent: 1,   getValue: d => d.revenue.web,       fmt: "money" },
  { label: "  - App",        indent: 1,   getValue: d => d.revenue.app,       fmt: "money" },
  { label: "Gross Profit",   bold: true,  getValue: d => d.grossProfit.total, fmt: "money" },
  { label: "  - Web",        indent: 1,   getValue: d => d.grossProfit.web,   fmt: "money" },
  { label: "  - App",        indent: 1,   getValue: d => d.grossProfit.app,   fmt: "money" },
  { label: "CM1",            bold: true,  getValue: d => d.cm1,               fmt: "money" },
  { label: "% CM1",          bold: true,  getValue: d => d.revenue.total > 0 ? d.cm1 / d.revenue.total * 100 : 0, fmt: "pct" },
  { label: "Orders",         bold: true,  getValue: d => d.orders.total,      fmt: "num" },
  { label: "  - Web",        indent: 1,   getValue: d => d.orders.web,        fmt: "num" },
  { label: "  - App",        indent: 1,   getValue: d => d.orders.app,        fmt: "num" },
  { label: "AOV",            bold: true,  getValue: d => d.orders.total > 0 ? d.revenue.total / d.orders.total : 0, fmt: "money" },
  { label: "  - Web",        indent: 1,   getValue: d => d.orders.web > 0 ? d.revenue.web / d.orders.web : 0,       fmt: "money" },
  { label: "  - App",        indent: 1,   getValue: d => d.orders.app > 0 ? d.revenue.app / d.orders.app : 0,       fmt: "money" },
  { label: "Traffic",        bold: true,  getValue: d => d.traffic.total,     fmt: "num" },
  { label: "  - Web",        indent: 1,   getValue: d => d.traffic.web,       fmt: "num" },
  { label: "  - App",        indent: 1,   getValue: d => d.traffic.app,       fmt: "num" },
  { label: "User",           bold: true,  getValue: d => d.users.total,       fmt: "num" },
  { label: "  - Web",        indent: 1,   getValue: d => d.users.web,         fmt: "num" },
  { label: "  - App",        indent: 1,   getValue: d => d.users.app,         fmt: "num" },
  { label: "Customer",       bold: true,  getValue: d => d.customers.web.total + d.customers.app.total, fmt: "num" },
  { label: "  Web",          indent: 1,   getValue: d => d.customers.web.total,     fmt: "num" },
  { label: "    New",        indent: 2,   getValue: d => d.customers.web.new,       fmt: "num" },
  { label: "    Returning",  indent: 2,   getValue: d => d.customers.web.returning, fmt: "num" },
  { label: "  App",          indent: 1,   getValue: d => d.customers.app.total,     fmt: "num" },
  { label: "    New",        indent: 2,   getValue: d => d.customers.app.new,       fmt: "num" },
  { label: "    Returning",  indent: 2,   getValue: d => d.customers.app.returning, fmt: "num" },
]

function formatValue(row: RowDef, v: number) {
  if (row.fmt === "pct") return v === 0 ? "—" : `${v.toFixed(1)}%`
  if (row.fmt === "money") return fmtM(v)
  return fmtN(v)
}

// Separator rows (empty between sections)
const SEPARATOR_AFTER = new Set([2, 5, 7, 10, 13, 16, 19])

export function B2CMetric() {
  const [data, setData] = useState<MetricResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/analytics/b2c/metric")
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Lỗi load data") }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">Đang tải dữ liệu...</span>
    </div>
  )

  if (error) return (
    <div className="p-8 text-center text-rose-500 text-sm">{error}</div>
  )

  if (!data) return null

  const { months, currentMonth, elapsedDays } = data
  const cur = data.data[currentMonth]
  const kpiTiles: { label: string; value: number; accent: MetricAccent; icon: ReactNode; unit?: string }[] = [
    { label: "Total Revenue", value: cur?.revenue.total ?? 0, accent: "revenue", icon: <DollarSign className="w-5 h-5" />, unit: "VND" },
    { label: "Gross Profit",  value: cur?.grossProfit.total ?? 0, accent: "margin", icon: <TrendingUp className="w-5 h-5" />, unit: "VND" },
    { label: "CM1",           value: cur?.cm1 ?? 0, accent: "margin", icon: <Percent className="w-5 h-5" />, unit: "VND" },
    { label: "Orders",        value: cur?.orders.total ?? 0, accent: "positive", icon: <ShoppingBag className="w-5 h-5" /> },
    { label: "Traffic",       value: cur?.traffic.total ?? 0, accent: "neutral", icon: <Globe className="w-5 h-5" /> },
    { label: "User",          value: cur?.users.total ?? 0, accent: "positive", icon: <Users className="w-5 h-5" /> },
  ]

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">GoHub Metric</h2>
          <p className="text-xs text-slate-500">YTD {new Date().getFullYear()} · Web + App breakdown · Tháng hiện tại: 1–{elapsedDays}</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
          <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {kpiTiles.map(t => (
          <StatTile key={t.label} icon={t.icon} label={t.label} accent={t.accent} unit={t.unit}
            value={t.unit ? Math.round(t.value).toLocaleString("vi-VN") : t.value.toLocaleString("vi-VN")} />
        ))}
      </div>

      <LogicNote>
        Revenue / GP / Orders / Customer: gohub_dw (fact_fulfillment_revenue · sub_group_name: Websites=Web, Mobile-App=App).
        CM1 = GP tổng – OpCost (channel + group costs). Traffic / User: GA4 yearMonth.
      </LogicNote>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-gradient-to-r from-brand-700 to-brand-600 text-white">
              <th className="sticky left-0 z-10 bg-brand-700 px-3 py-2.5 text-xs font-bold whitespace-nowrap min-w-[140px]">Metric</th>
              {months.map((m, i) => {
                const [yr, mo] = m.split("-")
                const isCurrent = m === currentMonth
                const label = isCurrent ? `${MONTH_SHORT[+mo - 1]} Actual (1-${elapsedDays})` : `${MONTH_SHORT[+mo - 1]} Actual`
                return (
                  <th key={m} colSpan={i === 0 ? 1 : 2} className={cn("px-3 py-2.5 text-xs font-bold text-center whitespace-nowrap border-l border-brand-500/40", isCurrent && "bg-brand-800/40")}>
                    {label}
                    {i > 0 && <span className="ml-2 text-brand-100/70 text-[10px] font-normal">%MoM</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => {
              const isGroupHeader = row.bold && (ri === 0 || ri === 3 || ri === 6 || ri === 8 || ri === 11 || ri === 14 || ri === 17 || ri === 20)
              const dotColor = row.label.includes("Web") ? WEB_COLOR : row.label.includes("App") ? APP_COLOR : undefined
              return (
                <>
                  <tr key={ri} className={cn(
                    "border-b border-slate-100",
                    ri % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                    row.bold && "font-semibold",
                    isGroupHeader && "bg-brand-50/50",
                  )}>
                    <td className={cn(
                      "sticky left-0 z-10 px-3 py-1.5 text-xs whitespace-nowrap border-r border-slate-100",
                      ri % 2 === 0 ? "bg-white" : "bg-slate-50",
                      isGroupHeader && "bg-brand-50/50",
                      row.indent === 1 && "pl-6 text-slate-600",
                      row.indent === 2 && "pl-10 text-slate-500",
                      !row.indent && "text-slate-800 font-semibold",
                      isGroupHeader && "text-brand-700",
                    )}>
                      {dotColor && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: dotColor }} />}
                      {row.label.trimStart()}
                    </td>
                    {months.map((m, mi) => {
                      const d = data.data[m]
                      const val = d ? row.getValue(d) : 0
                      const prevM = mi > 0 ? months[mi - 1] : null
                      const prevD = prevM ? data.data[prevM] : null
                      const prevVal = prevD ? row.getValue(prevD) : 0
                      const change = mi > 0 ? mom(val, prevVal) : null
                      const isCurrent = m === currentMonth
                      const fmt = formatValue(row, val)
                      return (
                        <>
                          {mi === 0 ? (
                            <td key={`${m}-val`} className={cn("px-3 py-1.5 text-xs text-right tabular-nums whitespace-nowrap border-l border-slate-100", isCurrent && "bg-brand-50/30")}>
                              {fmt}
                            </td>
                          ) : (
                            <>
                              <td key={`${m}-val`} className={cn("px-3 py-1.5 text-xs text-right tabular-nums whitespace-nowrap border-l border-slate-100", isCurrent && "bg-brand-50/30")}>
                                {fmt}
                              </td>
                              <td key={`${m}-mom`} className={cn("px-2 py-1.5 text-right whitespace-nowrap", isCurrent && "bg-brand-50/30")}>
                                <PctBadge v={change} />
                              </td>
                            </>
                          )}
                        </>
                      )
                    })}
                  </tr>
                  {SEPARATOR_AFTER.has(ri) && (
                    <tr key={`sep-${ri}`} className="h-1 bg-slate-100">
                      <td colSpan={1 + months.length * 2} />
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
