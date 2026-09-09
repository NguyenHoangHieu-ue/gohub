"use client"

// Đề xuất redesign (Hiếu duyệt qua mockup) — thay bảng "Tổng hợp theo Tháng" (10 cột/tháng) bằng
// line-chart Revenue + CM1. Nét đứt = đoạn Pro-rata của tháng đang chạy (chưa chốt sổ). Dùng ĐÚNG
// `summary` đã tính sẵn ở quarterly/page.tsx — không tính lại công thức nào, chỉ vẽ lại.
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { CHART_GRID_COLOR, chartTooltipStyle } from "@/components/dashboard-kit"
import type { MonthSummary } from "@/lib/quarterly-types"

const mLabel = (m: string) => { const [y, mo] = m.split("-"); return `T${parseInt(mo)}/${y}` }

export function MonthlyTrendChart({ summary }: { summary: MonthSummary[] }) {
  const data = summary.map((m, i) => {
    const isCurrent  = m.elapsed > 0 && m.elapsed < m.dim
    const factor     = isCurrent ? m.dim / m.elapsed : 1
    const revAct     = m.total.actualRevenue ?? m.total.revenue
    const cm1Act     = m.total.actualCm1 ?? m.total.cm1
    const revPr      = isCurrent ? Math.round(revAct * factor) : null
    const cm1Pr      = isCurrent ? Math.round(cm1Act * factor) : null
    const prevIsLast = i === summary.length - 2 && summary[summary.length - 1].elapsed > 0 && summary[summary.length - 1].elapsed < summary[summary.length - 1].dim
    return {
      label: mLabel(m.month) + (isCurrent ? " (đang chạy)" : ""),
      revenue: revAct,
      cm1: cm1Act,
      // Chỉ điểm nối liền trước tháng hiện tại mới có giá trị revenuePr/cm1Pr — Recharts vẽ đoạn nét đứt
      // đúng 1 khúc cuối (connectNulls mặc định false → null ở giữa cắt đường, không nối lung tung).
      revenuePr: isCurrent ? revPr : (prevIsLast ? revAct : null),
      cm1Pr: isCurrent ? cm1Pr : (prevIsLast ? cm1Act : null),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
        <YAxis tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCompactNumber(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1565c0" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="revenuePr" name="Revenue (Pro-rata)" stroke="#1565c0" strokeWidth={2} strokeDasharray="6 5" dot={{ r: 4, fill: "#fff", stroke: "#1565c0" }} connectNulls={false} legendType="none" />
        <Line type="monotone" dataKey="cm1" name="CM1" stroke="#2f9d55" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="cm1Pr" name="CM1 (Pro-rata)" stroke="#2f9d55" strokeWidth={2} strokeDasharray="6 5" dot={{ r: 4, fill: "#fff", stroke: "#2f9d55" }} connectNulls={false} legendType="none" />
      </LineChart>
    </ResponsiveContainer>
  )
}
