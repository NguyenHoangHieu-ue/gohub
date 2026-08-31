"use client"

import React from "react"
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Cell, LabelList,
} from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// Biểu đồ My Metrics tách riêng + React.memo (khớp pattern bod-charts.tsx): chỉ vẽ lại khi data đổi,
// nạp qua next/dynamic({ssr:false}) ở page.tsx để recharts code-split khỏi bundle đầu.
// Màu dùng lại đúng bảng đã chuẩn hoá cho tab này (brand-600 = accent duy nhất, emerald/amber = trạng
// thái đạt/chưa đạt — KHÔNG thêm hue mới, xem docs/wiki/Tab/analytics-my-metrics.md mục "UI/màu").

const BRAND = "#0f4c81"
const EMERALD = "#059669"
const AMBER = "#d97706"
const tooltipStyle = { borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.15)", fontSize: 12 }

// ── 1. Weighted OKR Score — radar 5 trục ────────────────────────────────────
// "target" luôn = 100 cho mọi trục — vẽ như 1 vòng nét đứt riêng để mắt thấy ngay "trong/ngoài vòng đạt".
export interface RadarPoint { metric: string; value: number; weight: number; target: 100 }
export const ScoreRadarChart = React.memo(function ScoreRadarChart({ data }: { data: RadarPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(255,255,255,0.15)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700 }} />
        <PolarRadiusAxis domain={[0, 120]} tick={false} axisLine={false} tickCount={4} />
        <Radar dataKey="target" stroke="rgba(255,255,255,0.35)" fill="transparent" strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
        <Radar dataKey="value" stroke="#5f9de3" fill="#5f9de3" fillOpacity={0.35} strokeWidth={2}
          isAnimationActive dot={{ r: 3, fill: "#5f9de3" }} />
        <Tooltip contentStyle={{ ...tooltipStyle, background: "#0a3560", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
          formatter={(val: number, name: string) => name === "target" ? [`${val.toFixed(0)}%`, "Mốc"] : [`${val.toFixed(0)}%`, "Đạt"]} />
      </RadarChart>
    </ResponsiveContainer>
  )
})

// ── 2. %Datapool Rev theo tháng — area chart so target ──────────────────────
export interface DatapoolTrendPoint { month: string; pct: number }
export const DatapoolTrendChart = React.memo(function DatapoolTrendChart({ data, target }: { data: DatapoolTrendPoint[]; target: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="mm-datapool-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.25} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => v.slice(5)} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${v}%`} width={36} />
        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [`${val.toFixed(1)}%`, "%Datapool"]} labelFormatter={l => `Tháng ${String(l).slice(5)}`} />
        {target > 0 && <ReferenceLine y={target} stroke={AMBER} strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Target ${target}%`, position: "insideTopRight", fill: AMBER, fontSize: 10, fontWeight: 700 }} />}
        <Area type="monotone" dataKey="pct" stroke={BRAND} strokeWidth={2.5} fill="url(#mm-datapool-fill)" dot={{ r: 3, fill: BRAND, strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
})

// ── 3. Bé Gấu tasks theo tháng — stacked bar Web/Lark ────────────────────────
export interface BegauTrendPoint { month: string; web: number; lark: number }
export const BegauTrendChart = React.memo(function BegauTrendChart({ data }: { data: BegauTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={20}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => v.slice(5)} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={formatCompactNumber} width={36} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={l => `Tháng ${String(l).slice(5)}`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="web" name="Web" stackId="s" fill={BRAND} radius={[0, 0, 0, 0]} maxBarSize={36} />
        <Bar dataKey="lark" name="Lark" stackId="s" fill="#5f9de3" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
})

// ── 4. Top người dùng Bé Gấu — bar ngang, 1 màu (chỉ xếp hạng, không phân cực như SKU movers) ──
export interface UserCountPoint { user: string; count: number }
export const TopUsersChart = React.memo(function TopUsersChart({ data }: { data: UserCountPoint[] }) {
  const longest = data.reduce((max, d) => Math.max(max, d.user.length), 0)
  const yAxisWidth = Math.min(170, Math.max(70, longest * 6.5 + 16))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis type="category" dataKey="user" width={yAxisWidth} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [val, "Task"]} />
        <Bar dataKey="count" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={16}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})

// ── 5. SKU GM movers — top tăng/giảm delta (diverging, chỉ SKU key/new) ──────
export interface SkuMoverPoint { sku: string; delta: number }
// SKU dài quá cột tên (VD hàng chục ký tự) vẫn tràn vào vùng bar nếu ước lượng width theo px/ký tự —
// SVG text không tự wrap/clip theo width layout của YAxis, chỉ là gợi ý bố cục. Cắt cứng chuỗi hiển thị
// (ellipsis) theo width CỐ ĐỊNH thay vì đoán px/ký tự → không bao giờ lấn, dù font/SKU dài cỡ nào. Tên
// đầy đủ vẫn xem được qua Tooltip khi hover.
const SKU_AXIS_WIDTH = 92
const SKU_TICK_MAXLEN = 11
function truncateSku(v: string): string {
  return v.length > SKU_TICK_MAXLEN ? `${v.slice(0, SKU_TICK_MAXLEN - 1)}…` : v
}
export const SkuMoversChart = React.memo(function SkuMoversChart({ data }: { data: SkuMoverPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis type="category" dataKey="sku" width={SKU_AXIS_WIDTH} tickFormatter={truncateSku} axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l: string) => l} formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val.toFixed(2)}%`, "Δ GM%"]} />
        <ReferenceLine x={0} stroke="#cbd5e1" />
        <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={16}>
          {data.map((d, i) => <Cell key={i} fill={d.delta >= 0 ? EMERALD : AMBER} />)}
          <LabelList dataKey="delta" position="right" formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`} style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})
