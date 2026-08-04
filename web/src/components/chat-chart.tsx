"use client"

import { useRef, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts"
import { Download, Loader2 } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
// Format A (legacy — bi-analyst / data-explorer): single series
interface SingleSeriesData {
  chart_type: "bar" | "line" | "pie"
  title:      string
  x_axis?:    string
  y_axis?:    string
  data:       { label: string; value: number }[]
}

// Format B (multi-series — Creator AI / advanced): multiple bars or lines
interface SeriesDef {
  key:    string
  label:  string
  color?: string
}
interface MultiSeriesData {
  chart_type: "bar" | "line" | "area" | "pie"
  title:      string
  data:       Record<string, any>[]
  x_key:      string
  bars?:      SeriesDef[]
  lines?:     SeriesDef[]
}

type ChartData = SingleSeriesData | MultiSeriesData

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_COLORS = [
  "#7c3aed", "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#ec4899", "#06b6d4", "#84cc16", "#8b5cf6", "#f97316",
]

const fmtVal = (v: any) => {
  const n = Number(v)
  if (isNaN(n)) return String(v)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString("vi-VN")
}

const tooltipStyle = {
  borderRadius: "10px",
  border:       "1px solid #e2e8f0",
  boxShadow:    "0 4px 6px -1px rgb(0 0 0/0.08)",
  fontSize:     "12px",
}

function isMultiSeries(data: ChartData): data is MultiSeriesData {
  return "x_key" in data && typeof (data as any).x_key === "string"
}

// Normalise single-series data → {label,value}[] so XAxis can always use dataKey="label"
function normalise(d: SingleSeriesData["data"]) {
  return d.map(item => ({ ...item, label: item.label ?? "", value: Number(item.value) || 0 }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatChart({ data }: { data: ChartData }) {
  const chartRef  = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)

  async function exportPNG() {
    if (!chartRef.current) return
    setLoading(true)
    try {
      const { default: html2canvas } = await import("html2canvas")
      const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
      const a = document.createElement("a")
      a.href = canvas.toDataURL("image/png")
      a.download = `${title || "chart"}_${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch (e) { console.error("Export PNG failed:", e) }
    finally { setLoading(false) }
  }

  if (!data?.data?.length) return null

  const { chart_type, title } = data
  const PNGBtn = () => (
    <button onClick={exportPNG} title="Tải PNG"
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} PNG
    </button>
  )

  if (isMultiSeries(data)) {
    // ── Multi-series ───────────────────────────────────────────────────────
    const { data: rows, x_key } = data
    const series: SeriesDef[] = data.bars?.length
      ? data.bars
      : data.lines?.length
        ? data.lines
        : []

    // Infer series from data keys if none declared
    const resolvedSeries: SeriesDef[] = series.length
      ? series
      : Object.keys(rows[0] || {})
          .filter(k => k !== x_key && typeof rows[0][k] === "number")
          .map((k, i) => ({ key: k, label: k, color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }))

    const isPie = chart_type === "pie"

    if (isPie) {
      // Pie with multi-series: use first series key
      const pieKey = resolvedSeries[0]?.key || "value"
      const pieData = rows.map((r, i) => ({
        name:  String(r[x_key] ?? `#${i}`),
        value: Number(r[pieKey]) || 0,
      }))
      return (
        <div ref={chartRef} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 my-3 shadow-sm w-full max-w-[620px] overflow-hidden">
          <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3><PNGBtn /></div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                paddingAngle={4} dataKey="value" nameKey="name">
                {pieData.map((_, i) => <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtVal(v), ""]} />
              <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )
    }

    const isArea = chart_type === "area"
    const isLine = chart_type === "line" || isArea

    return (
      <div ref={chartRef} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 my-3 shadow-sm w-full max-w-[700px] overflow-hidden">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">{title}</h3>
        <ResponsiveContainer width="100%" height={300}>
          {isLine ? (
            isArea ? (
              <AreaChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                <defs>
                  {resolvedSeries.map((s, i) => {
                    const col = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                    return (
                      <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={col} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={col} stopOpacity={0.02} />
                      </linearGradient>
                    )
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey={x_key} axisLine={false} tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtVal} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => [fmtVal(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                {resolvedSeries.map((s, i) => {
                  const col = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                  return (
                    <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                      stroke={col} strokeWidth={2.5} fill={`url(#grad-${s.key})`}
                      dot={{ r: 3, fill: col, strokeWidth: 1.5, stroke: "#fff" }} activeDot={{ r: 5 }} />
                  )
                })}
              </AreaChart>
            ) : (
              <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey={x_key} axisLine={false} tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtVal} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => [fmtVal(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                {resolvedSeries.map((s, i) => {
                  const col = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                  return (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                      stroke={col} strokeWidth={2.5}
                      dot={{ r: 3, fill: col, strokeWidth: 1.5, stroke: "#fff" }} activeDot={{ r: 5 }} />
                  )
                })}
              </LineChart>
            )
          ) : (
            <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={x_key} axisLine={false} tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtVal} width={52} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => [fmtVal(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {resolvedSeries.map((s, i) => {
                const col = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                return (
                  <Bar key={s.key} dataKey={s.key} name={s.label}
                    fill={col} radius={[4, 4, 0, 0]} />
                )
              })}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    )
  }

  // ── Single-series (legacy format) ─────────────────────────────────────────
  const single = data as SingleSeriesData
  const chartData = normalise(single.data)

  return (
    <div ref={chartRef} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 my-3 shadow-sm w-full max-w-[620px] overflow-hidden">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">{title}</h3>

      {chart_type === "bar" && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" axisLine={false} tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtVal} width={52} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtVal(v), single.y_axis || "Giá trị"]} />
            <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart_type === "line" && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" axisLine={false} tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={fmtVal} width={52} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtVal(v), single.y_axis || "Giá trị"]} />
            <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2.5}
              dot={{ r: 3, fill: "#7c3aed", strokeWidth: 1.5, stroke: "#fff" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {chart_type === "pie" && (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
              paddingAngle={4} dataKey="value" nameKey="label">
              {chartData.map((_, i) => <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtVal(v), ""]} />
            <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
