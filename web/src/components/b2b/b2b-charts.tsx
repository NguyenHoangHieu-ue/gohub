"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Legend } from "recharts"
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
          <p className="text-[12.5px] text-slate-500 mb-2">Cột cam: %CM1 thấp hơn trung bình nhóm này ({avg}%).</p>
          <ResponsiveContainer width="100%" height={Math.max(220, top.length * 30 + 20)}>
            <BarChart data={top} layout="vertical" margin={{ top: 2, right: 64, left: 4, bottom: 2 }} barCategoryGap="26%">
              <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12.5, fill: "#14233a" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(15,76,129,0.05)" }} contentStyle={chartTooltipStyle} formatter={(v: number, _n: string, p: any) => [`${formatCompactNumber(v)} · %CM1 ${p.payload.cm1Pct}%`, p.payload.full]} />
              <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={18}>
                {top.map((r, i) => <Cell key={i} fill={r.cm1Pct < avg ? "#eb6834" : "#2a78d6"} />)}
                <LabelList dataKey="revenue" position="right" formatter={(v: number) => formatCompactNumber(v)} style={{ fontSize: 12, fill: "#475569" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
