import { CHART_PALETTE } from "@/components/dashboard-kit"

// Màu CỐ ĐỊNH theo giá trị cho cả trang (vd Truemove luôn 1 màu ở mọi biểu đồ): page dựng từ thứ hạng toàn bộ dữ liệu.
// Tách khỏi market-charts.tsx để page dùng được mà không kéo recharts vào bundle đầu.
const OTHER = "#94a3b8"
const PALETTE = [...CHART_PALETTE, "#e11d48", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#a16207", "#db2777", "#475569"]

export type ColorFor = (value: string) => string

export function makeColorFor(ranked: string[]): ColorFor {
  const idx = new Map(ranked.map((v, i) => [v, i]))
  return v => {
    if (v === "Khác") return OTHER
    const i = idx.get(v)
    if (i !== undefined) return PALETTE[i % PALETTE.length]
    let h = 0
    for (const ch of v) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return PALETTE[h % PALETTE.length]
  }
}
