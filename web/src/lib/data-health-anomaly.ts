// Rule-based anomaly detection cho tab "Giám sát Dữ liệu" — cố tình ĐƠN GIẢN/giải thích được (median +
// ngưỡng %), không dùng mô hình thống kê phức tạp khó tự tin diễn giải cho Hiếu.

export interface DailyPoint { date: string; value: number }
export interface AnomalyPoint extends DailyPoint { baseline: number; diffPct: number; anomaly: boolean }

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Baseline = median của tối đa `windowSize` ngày liền TRƯỚC ngày đang xét (không gồm chính nó).
 * Đánh dấu bất thường khi có đủ `minWindow` ngày làm baseline VÀ lệch >= `thresholdPct`.
 */
export function detectAnomalies(
  rows: DailyPoint[],
  opts: { windowSize?: number; minWindow?: number; thresholdPct?: number } = {},
): AnomalyPoint[] {
  const windowSize = opts.windowSize ?? 7
  const minWindow = opts.minWindow ?? 4
  const thresholdPct = opts.thresholdPct ?? 0.35

  return rows.map((row, i) => {
    const window = rows.slice(Math.max(0, i - windowSize), i).map(r => r.value)
    const baseline = median(window)
    const diffPct = baseline > 0 ? (row.value - baseline) / baseline : 0
    const anomaly = window.length >= minWindow && Math.abs(diffPct) >= thresholdPct
    return { ...row, baseline, diffPct, anomaly }
  })
}
