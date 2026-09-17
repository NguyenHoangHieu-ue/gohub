"use client"

import React from "react"
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { CHART_GRID_COLOR, CHART_PALETTE } from "@/components/dashboard-kit"

// Tách khỏi page.tsx (s196+21, roadmap performance s196+20 — recharts code-split, cùng pattern
// bod-charts.tsx/my-metrics-charts.tsx) — nạp qua next/dynamic({ssr:false}) ở page.tsx.

interface SpeedComparisonChartProps { data: any[] }

export const SpeedComparisonChart = React.memo(function SpeedComparisonChart({ data }: SpeedComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" GB" width={60} />
        <Tooltip formatter={(v: number, n: string) => [`${Number(v).toFixed(2)} GB`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="assume" name="Kế hoạch (GB/ngày)" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
        <Bar dataKey="actual" name="Thực tế (GB/ngày/SIM)" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.actual > d.assume ? "#e11d48" : "#10b981"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})

interface UsageDistChartProps { rows: any[]; groups: string[] }

export const UsageDistChart = React.memo(function UsageDistChart({ rows, groups }: UsageDistChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} unit=" GB" />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={48} allowDecimals={false} />
        <Tooltip formatter={(v: number, n: string) => [`${v} SIM`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {groups.map((g, i) => (
          <Bar key={g} dataKey={g} name={g} stackId="d"
            fill={["#6366f1", "#f59e0b", "#10b981", "#0ea5e9"][i % 4]} radius={[0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
})

// Mã SKU nào chiếm bao nhiêu SIM (s200+3, Hiếu yêu cầu) — bar ngang, top N + "Khác" gộp phần đuôi dài.
interface SkuCountChartProps { data: { sku: string; active_sims: number }[] }

export const SkuCountChart = React.memo(function SkuCountChart({ data }: SkuCountChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <YAxis type="category" dataKey="sku" width={130} tick={{ fontSize: 10, fill: "#475569" }} />
        <Tooltip formatter={(v: number) => [`${v} SIM`, "Active SIMs"]} />
        <Bar dataKey="active_sims" name="Active SIMs" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={d.sku} fill={d.sku.startsWith("Khác") ? "#cbd5e1" : CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})
