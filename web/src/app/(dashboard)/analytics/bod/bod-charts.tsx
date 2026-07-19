"use client"

import React from "react"
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Area,
} from "recharts"
import { formatCurrency, formatCompactNumber } from "@/lib/analytics-formatters"

// Biểu đồ BOD tách riêng khỏi page.tsx và bọc React.memo:
//  · chỉ vẽ lại khi `data` đổi (không re-render theo mỗi hover/dropdown của trang) — hết giật lag;
//  · nạp qua next/dynamic({ ssr:false }) ở page.tsx → recharts (~nặng) code-split khỏi bundle đầu.
// Bọc CẢ component (không phải từng primitive) để recharts vẫn nhận diện đúng children (Axis/Series).

interface ChartProps { data: any[] }

// Revenue vs COGS vs CM1 — ComposedChart (Area + 2 Line)
export const RevenueCompositeChart = React.memo(function RevenueCompositeChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={formatCompactNumber} />
        <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [formatCurrency(val), ""]} />
        <Legend iconType="circle" />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
        <Line type="monotone" dataKey="cogs" name="COGS" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
        <Line type="monotone" dataKey="gpm2" name="CM1" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
})

// Margin Analysis (%) — LineChart (Margin% + CM1%)
export const MarginTrendChart = React.memo(function MarginTrendChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(val) => `${val}%`} />
        <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} formatter={(val: number) => [`${(val || 0).toFixed(2)}%`, "Margin %"]} />
        <Legend iconType="circle" />
        <Line type="monotone" dataKey="margin_percent" name="Margin %" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
        <Line type="monotone" dataKey="gpm2_percent" name="CM1 %" stroke="#ec4899" strokeWidth={3} dot={{ r: 4, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  )
})
