"use client"

import React from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts"
import { CHART_PALETTE, CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"

// Tách khỏi page.tsx (s196+21, roadmap performance s196+20 — recharts code-split, cùng pattern
// bod-charts.tsx/my-metrics-charts.tsx) — nạp qua next/dynamic({ssr:false}) ở page.tsx.

interface TrafficOverviewChartProps { data: any[]; compareEnabled: boolean }

export const TrafficOverviewChart = React.memo(function TrafficOverviewChart({ data, compareEnabled }: TrafficOverviewChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_PALETTE[0]} stopOpacity={0.15} /><stop offset="95%" stopColor={CHART_PALETTE[0]} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCompareUsers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} /><stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8) + "/" + val.substring(4, 6)} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
        <Tooltip contentStyle={chartTooltipStyle} />
        {compareEnabled && (<Area type="monotone" dataKey="compareUsers" name="Previous Users" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} fillOpacity={1} fill="url(#colorCompareUsers)" />)}
        <Area type="monotone" dataKey="users" name="Users" stroke={CHART_PALETTE[0]} strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
      </AreaChart>
    </ResponsiveContainer>
  )
})

interface SearchTrendsChartProps { data: any[]; compareEnabled: boolean }

export const SearchTrendsChart = React.memo(function SearchTrendsChart({ data, compareEnabled }: SearchTrendsChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8) + "/" + val.substring(4, 6)} />
        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
        <Tooltip contentStyle={chartTooltipStyle} />
        {compareEnabled && (<Line yAxisId="left" type="monotone" name="Previous Clicks" dataKey="compareClicks" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={2} dot={false} />)}
        <Line yAxisId="left" type="monotone" name="Clicks" dataKey="clicks" stroke={CHART_PALETTE[0]} strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" name="Impressions" dataKey="impressions" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  )
})

interface RevenueBreakdownChartProps { data: any[]; compareEnabled: boolean; currency?: string }

export const RevenueBreakdownChart = React.memo(function RevenueBreakdownChart({ data, compareEnabled, currency }: RevenueBreakdownChartProps) {
  const formatRevenue = (val: number) => {
    if (currency === "VND") return `${val.toLocaleString("vi-VN")}₫`
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(val) => val.substring(6, 8)} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(val: number) => [formatRevenue(val), "Revenue"]} />
        <Bar dataKey="revenue" name="Revenue" fill={CHART_PALETTE[2]} radius={[4, 4, 0, 0]} />
        {compareEnabled && (<Bar dataKey="compareRevenue" name="Previous Revenue" fill="#cbd5e1" radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
})
