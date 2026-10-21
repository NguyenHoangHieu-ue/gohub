"use client"

import { ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Biểu đồ thác: Doanh thu → trừ giá vốn → GP → trừ chi phí kênh và nhóm → CM1. Chỉ dùng số tổng đã có của tab BOD (không tính công thức mới):
// GP = total_margin, CM1 = total_gpm2, "chi phí" = GP − CM1.
export function BodWaterfall({ revenue, cogs, gp, cm1 }: { revenue: number; cogs: number; gp: number; cm1: number }) {
  const cost = Math.max(0, gp - cm1)
  const rows = [
    { name: "Doanh thu", base: 0, v: revenue, color: "#2a78d6", tip: "Doanh thu" },
    { name: "Giá vốn", base: Math.max(0, revenue - cogs), v: cogs, color: "#eb6834", tip: "Trừ giá vốn" },
    { name: "GP", base: 0, v: gp, color: "#2a78d6", tip: "GP" },
    { name: "Chi phí kênh và nhóm", base: Math.max(0, gp - cost), v: cost, color: "#eb6834", tip: "Trừ chi phí kênh và nhóm" },
    { name: "CM1", base: 0, v: cm1, color: "#1baf7a", tip: "CM1" },
  ]
  return (
    <ResponsiveContainer width="100%" height={270}>
      <ComposedChart data={rows} margin={{ top: 22, right: 16, left: 8, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12.5, fill: "#475569" }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
        <YAxis tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} />
        <Tooltip cursor={{ fill: "rgba(15,76,129,0.05)" }} contentStyle={chartTooltipStyle}
          formatter={(_: number, __: string, p: any) => [formatCompactNumber(p.payload.v), p.payload.tip]} labelFormatter={() => ""} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="v" stackId="w" radius={[6, 6, 0, 0]} maxBarSize={72}>
          {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          <LabelList dataKey="v" position="top" formatter={(v: number) => formatCompactNumber(v)} style={{ fontSize: 12.5, fontWeight: 600, fill: "#14233a" }} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}
