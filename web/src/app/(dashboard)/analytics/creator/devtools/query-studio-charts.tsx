"use client"

import React from "react"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { CHART_PALETTE, CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"
import { formatCompactNumber, formatNumber } from "@/lib/analytics-formatters"
import type { ChartData, VisualType } from "@/lib/query-studio"

// Biểu đồ của Query Studio — bọc React.memo + nạp qua next/dynamic({ssr:false}) (cùng pattern *-charts.tsx khác).

const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 }
const trunc = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const tooltipFmt = (v: unknown) => formatNumber(Number(v))

export const StudioChart = React.memo(function StudioChart({ type, chart, stacked }: {
  type: Exclude<VisualType, "table" | "card">; chart: ChartData; stacked: boolean
}) {
  const { data, series, axisKey } = chart
  const color = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length]
  const showLegend = series.length > 1 || type === "donut"

  if (type === "donut") {
    const s = series[0]
    const pie = data.map(d => ({ name: String(d[axisKey]), value: Number(d[s.dataKey]) || 0 }))
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="#fff">
            {pie.map((_, i) => <Cell key={i} fill={color(i)} />)}
          </Pie>
          <Tooltip contentStyle={chartTooltipStyle} formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const horizontal = type === "bar"
  const common = { data, margin: { top: 8, right: 16, left: 0, bottom: 4 } }
  const xy = horizontal ? (
    <>
      <XAxis type="number" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={formatCompactNumber} />
      <YAxis type="category" dataKey={axisKey} axisLine={false} tickLine={false} tick={AXIS_TICK} width={110} tickFormatter={(v: string) => trunc(String(v), 16)} />
    </>
  ) : (
    <>
      <XAxis dataKey={axisKey} axisLine={false} tickLine={false} tick={AXIS_TICK} interval="preserveStartEnd" tickFormatter={(v: string) => trunc(String(v))} />
      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={formatCompactNumber} width={52} />
    </>
  )
  const grid = <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={horizontal} horizontal={!horizontal} />
  const tip = <Tooltip contentStyle={chartTooltipStyle} formatter={tooltipFmt} cursor={{ fill: "rgba(15,76,129,0.05)" }} />
  const legend = showLegend ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null

  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "line" ? (
        <LineChart {...common}>{grid}{xy}{tip}{legend}
          {series.map((s, i) => <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={color(i)} strokeWidth={2} dot={data.length <= 40} />)}
        </LineChart>
      ) : type === "area" ? (
        <AreaChart {...common}>{grid}{xy}{tip}{legend}
          {series.map((s, i) => <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={color(i)} fill={color(i)} fillOpacity={0.18} strokeWidth={2} stackId={stacked ? "s" : undefined} />)}
        </AreaChart>
      ) : (
        <BarChart {...common} layout={horizontal ? "vertical" : "horizontal"}>{grid}{xy}{tip}{legend}
          {series.map((s, i) => <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={color(i)} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} stackId={stacked ? "s" : undefined} />)}
        </BarChart>
      )}
    </ResponsiveContainer>
  )
})
