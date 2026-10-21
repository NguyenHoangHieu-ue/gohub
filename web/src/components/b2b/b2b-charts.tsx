"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"
import type { MonthSummary } from "@/lib/quarterly-types"

// Hai biểu đồ cho tab B2B (theo tháng): doanh thu và CM1 B2B qua các tháng (số đã có của Quarter Report) + top khách theo doanh thu (cột cam = %CM1 thấp hơn trung bình).
const mLabel = (m: string) => `T${parseInt(m.split("-")[1])}`
interface Cust { name: string; revenue: number; cm1Pct?: number }

export function B2BCharts({ months, customers, currentMonth }: { months: MonthSummary[]; customers: Cust[]; currentMonth: string }) {
  const trend = useMemo(() => months.filter(m => m.b2b).map(m => ({ label: mLabel(m.month) + (m.isProjected ? " (PR)" : ""), month: m.month, revenue: m.b2b.revenue, cm1: m.b2b.cm1 })), [months])
  const top = useMemo(() => customers.filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8).map(c => ({ name: c.name.length > 16 ? c.name.slice(0, 15).trimEnd() + "…" : c.name, full: c.name, revenue: c.revenue, cm1Pct: Number((c.cm1Pct ?? 0).toFixed(1)) })), [customers])
  const avg = useMemo(() => { const t = top.reduce((s, r) => s + r.revenue, 0); return t ? Math.round(top.reduce((s, r) => s + r.revenue * r.cm1Pct, 0) / t * 10) / 10 : 0 }, [top])
  if (trend.length === 0 && top.length === 0) return null
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      {trend.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 xl:col-span-3">
          <h3 className="font-bold text-slate-800 mb-1">Doanh thu và CM1 B2B theo tháng</h3>
          <p className="text-[12.5px] text-slate-500 mb-2">Tháng đang xem ({mLabel(currentMonth)}) in đậm. (PR) là số pro-rata của tháng đang chạy.</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap="26%">
              <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
              <YAxis tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={58} />
              <Tooltip cursor={{ fill: "rgba(15,76,129,0.05)" }} contentStyle={chartTooltipStyle} formatter={(v: number, n: string) => [formatCompactNumber(v), n]} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} iconType="circle" />
              <Bar dataKey="revenue" name="Doanh thu" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {trend.map((r, i) => <Cell key={i} fill="#2a78d6" fillOpacity={r.month === currentMonth ? 1 : 0.55} />)}
              </Bar>
              <Bar dataKey="cm1" name="CM1" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {trend.map((r, i) => <Cell key={i} fill="#1baf7a" fillOpacity={r.month === currentMonth ? 1 : 0.55} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {top.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 xl:col-span-2">
          <h3 className="font-bold text-slate-800 mb-1">Khách lớn nhất của quý</h3>
          <p className="text-[12.5px] text-slate-500 mb-3">Thanh cam: %CM1 thấp hơn trung bình nhóm này ({avg}%). Rê chuột vào tên để xem tên đầy đủ.</p>
          <ul className="space-y-3">
            {top.map(r => (
              <li key={r.full} title={`${r.full}: ${formatCompactNumber(r.revenue)} · %CM1 ${r.cm1Pct}%`}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.full}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-slate-700">{formatCompactNumber(r.revenue)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, r.revenue / top[0].revenue * 100)}%`, background: r.cm1Pct < avg ? "#eb6834" : "#2a78d6" }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-slate-500">{r.cm1Pct}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
