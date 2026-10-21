"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ScatterChart, Scatter, ZAxis, ReferenceLine } from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Hai biểu đồ đầu trang Channels (chế độ tổng quan): xếp hạng doanh thu từng kênh + "bán nhiều hay lãi cao" (doanh thu × %CM1).
// Dùng đúng dữ liệu `allChannelsData` của trang, không tính thêm.
interface Row { channel: string; group_name?: string; revenue?: number; gpm2_percent?: number; margin_percent?: number }
const BLUE = "#2a78d6", ORANGE = "#eb6834"

export function ChannelOverviewCharts({ data, onSelect }: { data: Row[]; onSelect?: (channel: string) => void }) {
  const rows = useMemo(() => data.filter(r => (r.revenue ?? 0) > 0).map(r => ({ name: r.channel, revenue: r.revenue ?? 0, cm1Pct: Number((r.gpm2_percent ?? 0).toFixed(1)) }))
    .sort((a, b) => b.revenue - a.revenue), [data])
  const avg = useMemo(() => { const tot = rows.reduce((s, r) => s + r.revenue, 0); return tot ? Math.round(rows.reduce((s, r) => s + r.revenue * r.cm1Pct, 0) / tot * 10) / 10 : 0 }, [rows])
  if (rows.length < 2) return null
  const top = rows.slice(0, 12)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 xl:col-span-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="font-bold text-slate-800">Doanh thu theo kênh</h3>
          <span className="text-[12.5px] text-slate-500">Cột cam: %CM1 dưới mức trung bình có trọng số ({avg}%)</span>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(240, top.length * 30 + 20)}>
          <BarChart data={top} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} />
            <XAxis type="number" tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12.5, fill: "#14233a" }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(15,76,129,0.05)" }} contentStyle={chartTooltipStyle} formatter={(v: number, _n: string, p: any) => [`${formatCompactNumber(v)} · %CM1 ${p.payload.cm1Pct}%`, "Doanh thu"]} />
            <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={20} onClick={(d: any) => onSelect?.(d.name)} cursor="pointer">
              {top.map((r, i) => <Cell key={i} fill={r.cm1Pct < avg ? ORANGE : BLUE} />)}
              <LabelList dataKey="revenue" position="right" formatter={(v: number) => formatCompactNumber(v)} style={{ fontSize: 12, fill: "#475569" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 xl:col-span-2">
        <h3 className="font-bold text-slate-800">Bán nhiều hay lãi cao?</h3>
        <p className="text-[12.5px] text-slate-500 mb-1">Mỗi chấm là một kênh. Dưới đường chấm là %CM1 thấp hơn trung bình.</p>
        <ResponsiveContainer width="100%" height={Math.max(240, top.length * 30 + 20)}>
          <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 18 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} />
            <XAxis type="number" dataKey="revenue" name="Doanh thu" tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} label={{ value: "Doanh thu", position: "insideBottom", offset: -8, fontSize: 12, fill: "#64748b" }} />
            <YAxis type="number" dataKey="cm1Pct" name="%CM1" unit="%" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={44} />
            <ZAxis range={[90, 90]} />
            <ReferenceLine y={avg} stroke="#14233a" strokeDasharray="3 4" strokeOpacity={0.5} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={chartTooltipStyle} formatter={(v: number, n: string) => [n === "Doanh thu" ? formatCompactNumber(v) : `${v}%`, n]} labelFormatter={() => ""}
              content={({ active, payload }) => active && payload?.length ? (
                <div style={chartTooltipStyle as any}><b>{(payload[0].payload as any).name}</b><br />Doanh thu {formatCompactNumber((payload[0].payload as any).revenue)}<br />%CM1 {(payload[0].payload as any).cm1Pct}%</div>
              ) : null} />
            <Scatter data={rows} onClick={(d: any) => onSelect?.(d.name)} cursor="pointer">
              {rows.map((r, i) => <Cell key={i} fill={r.cm1Pct < avg ? ORANGE : BLUE} stroke="#fff" strokeWidth={2} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
