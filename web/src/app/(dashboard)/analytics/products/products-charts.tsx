"use client"

import React from "react"
import { AreaChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCompactNumber, formatTruncatedString } from "@/lib/analytics-formatters"
import { CHART_PALETTE, CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Tách khỏi page.tsx (s196+21, roadmap performance s196+20 — recharts code-split, cùng pattern
// bod-charts.tsx/my-metrics-charts.tsx) — nạp qua next/dynamic({ssr:false}) ở page.tsx.

interface SalesUnitsTrendChartProps { data: any[] }

export const SalesUnitsTrendChart = React.memo(function SalesUnitsTrendChart({ data }: SalesUnitsTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_PALETTE[0]} stopOpacity={0.15} /><stop offset="95%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => formatCompactNumber(val)} />
        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: CHART_PALETTE[1], fontSize: 12 }} />
        <Tooltip contentStyle={chartTooltipStyle} />
        <Area yAxisId="left" type="monotone" dataKey="revenue" stroke={CHART_PALETTE[0]} strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" name="Revenue" />
        <Line yAxisId="right" type="monotone" dataKey="units" stroke={CHART_PALETTE[1]} strokeWidth={2} dot={false} name="Units" />
      </AreaChart>
    </ResponsiveContainer>
  )
})

interface TopRegionsChartProps { data: any[] }

export const TopRegionsChart = React.memo(function TopRegionsChart({ data }: TopRegionsChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 40, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_GRID_COLOR} />
        <XAxis type="number" hide />
        <YAxis dataKey="region" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} width={180} interval={0} tickFormatter={(value) => formatTruncatedString(value, 20)} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(val: number) => [formatCompactNumber(val), "Revenue"]} />
        <Bar dataKey="revenue" fill={CHART_PALETTE[0]} radius={[0, 4, 4, 0]} barSize={32} />
      </BarChart>
    </ResponsiveContainer>
  )
})
