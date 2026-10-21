"use client"

// Đề xuất redesign (Hiếu duyệt qua mockup) — thay bảng "Tổng hợp theo Tháng" (10 cột/tháng) bằng
// line-chart Revenue + CM1. Nét đứt = đoạn Pro-rata của tháng đang chạy (chưa chốt sổ). Dùng ĐÚNG
// `summary` đã tính sẵn ở quarterly/page.tsx — không tính lại công thức nào, chỉ vẽ lại.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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
    return {
      label: mLabel(m.month) + (isCurrent ? " (đang chạy)" : ""),
      revenue: revAct,
      cm1: cm1Act,
      // Chỉ điểm nối liền trước tháng hiện tại mới có giá trị revenuePr/cm1Pr — Recharts vẽ đoạn nét đứt
      // đúng 1 khúc cuối (connectNulls mặc định false → null ở giữa cắt đường, không nối lung tung).
      revenuePr: isCurrent ? revPr : null,
      cm1Pr: isCurrent ? cm1Pr : null,
    }
  })

  // Cột nhóm thay đường: quý mới bắt đầu chỉ có 1 tháng nên đường chỉ hiện vài chấm rời. Cột đậm = thực tế, cột nhạt = pro-rata (tháng đang chạy).
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }} barCategoryGap="28%" barGap={4}>
        <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
        <YAxis tickFormatter={v => formatCompactNumber(v)} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={56} />
        <Tooltip cursor={{ fill: "rgba(15,76,129,0.05)" }} contentStyle={chartTooltipStyle} formatter={(v: number) => formatCompactNumber(v)} />
        <Legend wrapperStyle={{ fontSize: 12.5 }} iconType="circle" />
        <Bar dataKey="revenue" name="Doanh thu" fill="#1565c0" radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Bar dataKey="revenuePr" name="Doanh thu (pro-rata)" fill="#9ec5ee" radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Bar dataKey="cm1" name="CM1" fill="#2f9d55" radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Bar dataKey="cm1Pr" name="CM1 (pro-rata)" fill="#9bd7b0" radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  )
}
