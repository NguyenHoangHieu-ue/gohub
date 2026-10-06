"use client"

import React from "react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"
import { makeColorFor, type ColorFor } from "./market-colors"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// Nạp qua next/dynamic({ssr:false}) ở page.tsx (recharts tách khỏi bundle đầu, cùng pattern my-metrics-charts.tsx).
// Màu CỐ ĐỊNH theo giá trị cho cả trang — xem market-colors.ts.

/** Cột chồng theo nhóm. horizontal = thanh ngang (nhãn dài: tên nước/SKU). percent = chồng 100% (so tỷ trọng). */
export const StackedBars = React.memo(function StackedBars({ rows, cols, colorFor, horizontal, percent, grouped, onSelect, selected, labelWidth = 110 }: {
  rows: Record<string, number | string>[]; cols: string[]; colorFor?: ColorFor
  horizontal?: boolean; percent?: boolean; grouped?: boolean  // grouped = cột cạnh nhau (so 2 kỳ), không chồng
  onSelect?: (key: string) => void; selected?: string | null; labelWidth?: number
}) {
  const fmt = (v: number) => percent ? `${Math.round(v * 100)}%` : formatCompactNumber(v)
  const total = (r: Record<string, number | string>) => cols.reduce((a, c) => a + (Number(r[c]) || 0), 0)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} stackOffset={percent ? "expand" : "none"}
        margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap={horizontal ? 6 : "20%"}
        onClick={onSelect ? (e: any) => e?.activeLabel && onSelect(String(e.activeLabel)) : undefined}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={!horizontal} vertical={!!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={fmt} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis type="category" dataKey="key" width={labelWidth} axisLine={false} tickLine={false} interval={0}
              tick={(p: any) => (
                <text x={p.x} y={p.y} dy={4} textAnchor="end" fontSize={11}
                  fontWeight={p.payload.value === selected ? 700 : 500} fill={p.payload.value === selected ? "#0f4c81" : "#475569"}>
                  {String(p.payload.value).length > 18 ? String(p.payload.value).slice(0, 17) + "…" : p.payload.value}
                </text>
              )} />
          </>
        ) : (
          <>
            <XAxis dataKey="key" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tickFormatter={fmt} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={44} />
          </>
        )}
        <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(15,76,129,0.06)" }}
          formatter={(v: number, name: string, item: any) => {
            const t = grouped ? 0 : total(item.payload)
            return [`${formatCompactNumber(v)}${t ? ` · ${(v / t * 100).toFixed(1)}%` : ""}`, name]
          }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {cols.map((c, i) => (
          <Bar key={c} dataKey={c} stackId={grouped ? undefined : "a"} fill={grouped ? (i === cols.length - 1 ? "#0f4c81" : "#cbd5e1") : (colorFor ?? makeColorFor(cols))(c)} isAnimationActive={false}
            cursor={onSelect ? "pointer" : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
})

/** Thanh ngang đơn (top SKU…) — màu theo nhóm (vd vendor), tooltip kèm GM%. */
export const RankBars = React.memo(function RankBars({ rows, colorKey, colorFor, labelWidth = 120, gmLabel = "GM" }: {
  rows: { key: string; value: number; gm: number; group: string }[]
  colorKey?: string; colorFor: ColorFor; labelWidth?: number; gmLabel?: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap={5}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
        <XAxis type="number" tickFormatter={formatCompactNumber} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis type="category" dataKey="key" width={labelWidth} axisLine={false} tickLine={false} interval={0}
          tick={{ fill: "#475569", fontSize: 11, fontFamily: "ui-monospace, monospace" }} />
        <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(15,76,129,0.06)" }}
          formatter={(v: number, _n: string, item: any) => [`${formatCompactNumber(v)} · ${gmLabel} ${item.payload.gm.toFixed(1)}%`, `${colorKey ?? ""} ${item.payload.group}`]} />
        <Bar dataKey="value" isAnimationActive={false} radius={[0, 4, 4, 0]}>
          {rows.map(r => <Cell key={r.key} fill={colorFor(r.group)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})
