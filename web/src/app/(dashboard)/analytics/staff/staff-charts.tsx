"use client"

import React from "react"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR } from "@/components/dashboard-kit"

// Tách khỏi page.tsx (s196+21, roadmap performance s196+20 — recharts code-split, cùng pattern
// bod-charts.tsx/my-metrics-charts.tsx) — nạp qua next/dynamic({ssr:false}) ở page.tsx.

export const STAFF_COLORS = [
  "#0f4c81","#E04E1B","#10b981","#8b5cf6","#f59e0b",
  "#ef4444","#06b6d4","#84cc16","#ec4899","#6366f1",
]

const fck = (n: number) => formatCompactNumber(n)

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-black text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold flex justify-between gap-4">
          <span className="truncate max-w-[120px]">{p.name}</span>
          <span>{fck(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

interface BarChartProps { data: { name: string; [key: string]: string | number }[] }

export const StaffRevenueBarChart = React.memo(function StaffRevenueBarChart({ data }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 32 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false}
          angle={-25} textAnchor="end" height={52} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
          tickFormatter={v => fck(v)} width={64} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Tổng Rev" radius={[4,4,0,0]} maxBarSize={40}>
          {data.map((_, i) => <Cell key={i} fill={STAFF_COLORS[i % STAFF_COLORS.length]} />)}
        </Bar>
        <Bar dataKey="3HK Rev" fill="#F97316" radius={[4,4,0,0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
})

export const CustomerRevenueBarChart = React.memo(function CustomerRevenueBarChart({ data }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 32 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e7ff" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4338ca" }} axisLine={false} tickLine={false}
          angle={-25} textAnchor="end" height={52} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
          tickFormatter={v => fck(v)} width={64} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Revenue" radius={[4,4,0,0]} maxBarSize={40}>
          {data.map((_, i) => <Cell key={i} fill={STAFF_COLORS[i % STAFF_COLORS.length]} />)}
        </Bar>
        <Bar dataKey="3HK Rev" fill="#F97316" radius={[4,4,0,0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
})

interface LineChartProps { data: any[]; lineKeys: string[] }

export const StaffMonthlyLineChart = React.memo(function StaffMonthlyLineChart({ data, lineKeys }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => fck(v)} width={64} />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {lineKeys.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key}
            stroke={STAFF_COLORS[i % STAFF_COLORS.length]} strokeWidth={2.5}
            dot={{ r: 4, fill: STAFF_COLORS[i % STAFF_COLORS.length], strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6, strokeWidth: 0 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
})

export const CustomerMonthlyLineChart = React.memo(function CustomerMonthlyLineChart({ data, lineKeys }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e7ff" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#4338ca", fontWeight: 700 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => fck(v)} width={64} />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {lineKeys.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key}
            stroke={STAFF_COLORS[i % STAFF_COLORS.length]} strokeWidth={2.5}
            dot={{ r: 4, fill: STAFF_COLORS[i % STAFF_COLORS.length], strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6, strokeWidth: 0 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
})
