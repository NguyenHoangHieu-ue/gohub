"use client"

import React from "react"
import { CartesianGrid, Tooltip, ResponsiveContainer, Area, Line, ComposedChart, XAxis, YAxis } from "recharts"
import { formatCurrency, formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_PALETTE, CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Tách khỏi page.tsx (s196+21, roadmap performance s196+20 — recharts code-split, cùng pattern
// bod-charts.tsx/my-metrics-charts.tsx) — nạp qua next/dynamic({ssr:false}) ở page.tsx.

interface RevenueTrendChartProps {
  data: any[]
  comparisonType: string
}

export const RevenueTrendChart = React.memo(function RevenueTrendChart({ data, comparisonType }: RevenueTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_PALETTE[0]} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} tickFormatter={(val) => formatCompactNumber(val)} />
        <Tooltip
          contentStyle={{ ...chartTooltipStyle, padding: "12px" }}
          formatter={(val: number, name: string) => [formatCurrency(val), name === "revenue" ? "Current" : "Previous"]}
        />
        <Area type="monotone" dataKey="revenue" stroke={CHART_PALETTE[0]} strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="revenue" />
        <Line type="monotone" dataKey="margin" stroke={CHART_PALETTE[1]} strokeWidth={2} dot={false} name="Gross Profit" />
        {comparisonType !== "none" && (
          <Area type="monotone" dataKey="prevRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="prevRevenue" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
})
