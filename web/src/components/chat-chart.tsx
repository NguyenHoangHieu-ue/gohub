"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts"

interface ChartData {
  chart_type: "line" | "bar" | "pie"
  title:      string
  x_axis?:    string
  y_axis?:    string
  data:       { label: string; value: number }[]
}

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"]

const fmtVal = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString("vi-VN")
}

export default function ChatChart({ data }: { data: ChartData }) {
  const { chart_type, title, data: chartData } = data
  if (!chartData?.length) return null

  const tooltipStyle = { borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0/0.1)" }

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 my-3 shadow-sm w-full max-w-[600px] overflow-hidden">
      <h3 className="text-sm font-bold text-slate-800 mb-4">{title}</h3>

      {chart_type === "bar" && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={fmtVal} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtVal(v), "Giá trị"]} />
            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart_type === "line" && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={fmtVal} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtVal(v), "Giá trị"]} />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5}
              dot={{ r: 3, fill: "#6366f1", strokeWidth: 1.5, stroke: "#fff" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {chart_type === "pie" && (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
              paddingAngle={4} dataKey="value" nameKey="label">
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtVal(v), "Giá trị"]} />
            <Legend verticalAlign="bottom" height={30} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
