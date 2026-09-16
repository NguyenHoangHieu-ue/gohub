"use client"

import React from "react"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Dot } from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// Sparkline doanh thu theo ngày, chấm đỏ ở ngày bị đánh dấu bất thường (tính sẵn từ BE) — bọc
// React.memo + nạp qua next/dynamic({ssr:false}) ở page.tsx, cùng pattern bod-charts.tsx.

interface AnomalyPoint { date: string; value: number; baseline: number; diffPct: number; anomaly: boolean }

function AnomalyDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload?.anomaly) return null
  return <Dot cx={cx} cy={cy} r={4} fill="#d93025" stroke="#fff" strokeWidth={1.5} />
}

export const RevenueSparkline = React.memo(function RevenueSparkline({ data }: { data: AnomalyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }}
          tickFormatter={(val: string) => val.slice(5)} interval="preserveStartEnd" />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={formatCompactNumber} width={44} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
          formatter={(val: number, name: string, props: any) => {
            if (name !== "value") return [formatCompactNumber(val), name]
            const p = props.payload as AnomalyPoint
            const pctTxt = p.baseline > 0 ? `${p.diffPct >= 0 ? "+" : ""}${Math.round(p.diffPct * 100)}% vs TB` : ""
            return [`${formatCompactNumber(val)}${pctTxt ? ` (${pctTxt})` : ""}`, "Doanh thu"]
          }}
        />
        <Line type="monotone" dataKey="value" stroke="#0f4c81" strokeWidth={2} dot={<AnomalyDot />} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
})
