"use client"

import { useMemo } from "react"
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Doanh thu cộng dồn theo ngày so với "đường đạt target" (target quý chia đều theo ngày). Đường cam nét đứt = dự phóng cuối quý
// (số Pro-rata của Quarter Report). Cuối đường thực tế phải bằng REV thực tế ở thẻ Tổng.
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function CumulativeRevenueChart({ days, start, end, target, projected, today }: {
  days: { d: string; rev: number }[]; start: string; end: string; target: number; projected: number; today: string
}) {
  const data = useMemo(() => {
    const byDay = new Map(days.map(x => [x.d, x.rev]))
    const out: { d: string; label: string; actual: number | null; pace: number | null; proj: number | null }[] = []
    const s = new Date(start + "T00:00:00Z"), e = new Date(end + "T00:00:00Z")
    const total = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
    let acc = 0, lastActual = 0, lastIdx = -1
    for (let i = 0; i < total; i++) {
      const iso = new Date(s.getTime() + i * 86_400_000).toISOString().slice(0, 10)
      const past = iso <= today
      if (past) { acc += byDay.get(iso) ?? 0; lastActual = acc; lastIdx = i }
      out.push({ d: iso, label: fmtDay(iso), actual: past ? acc : null, pace: target > 0 ? Math.round(target * (i + 1) / total) : null, proj: null })
    }
    if (lastIdx >= 0 && lastIdx < total - 1 && projected > 0) {
      out[lastIdx].proj = lastActual
      out[total - 1].proj = projected
    }
    return out
  }, [days, start, end, target, projected, today])

  const ticks = useMemo(() => data.filter((_, i) => i === 0 || i === data.length - 1 || data[i].d.slice(8, 10) === "01").map(x => x.label), [data])
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
        <YAxis tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, n: string) => [formatCompactNumber(v), n]} labelFormatter={l => `Ngày ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} iconType="circle" />
        <Area type="monotone" dataKey="actual" name="Thực tế" stroke="#2a78d6" fill="#2a78d6" fillOpacity={0.12} strokeWidth={2.5} dot={false} connectNulls={false} />
        <Line type="linear" dataKey="proj" name="Dự phóng cuối quý" stroke="#eb6834" strokeWidth={2.5} strokeDasharray="6 5" dot={false} connectNulls />
        {target > 0 && <Line type="linear" dataKey="pace" name="Đường đạt target" stroke="#14233a" strokeWidth={1.5} strokeDasharray="2 4" dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
