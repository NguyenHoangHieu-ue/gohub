/**
 * Quarter month-projection engine — NGUỒN DUY NHẤT cho projection theo tháng trong 1 quý.
 * Dùng chung bởi quarterly-report + quarterly-b2b-customers (OOP: tránh 2 route tự viết → lệch nhau).
 *
 * Quy tắc (s135):
 *   - Tháng đã hoàn thành (mEnd < asOf) → isProjected=false, factor=1 (dùng actual).
 *   - Tháng tương lai (mStart > asOf) → isFuture=true, elapsed=0.
 *   - Tháng hiện tại: chỉ CHIẾU khi elapsed ≥ MIN_PROJECT_DAYS (tránh factor quá lớn đầu tháng → nhảy số).
 *     factor = dim / elapsed.
 */
import { getDaysInMonth, getDaysInRange } from "@/lib/bod-data"

// Ngưỡng ngày tối thiểu để chiếu tháng hiện tại. < 7 ngày → factor quá lớn (vd 31/3=10.3) → số nhảy dữ dội
// + mẫu quá nhỏ không tin cậy → giữ actual (factor=1) cho tới khi đủ 7 ngày.
export const MIN_PROJECT_DAYS = 7

export interface QuarterMonthMeta {
  month: string
  mStart: string
  mEnd: string
  actualEnd: string
  dim: number
  elapsed: number
  isProjected: boolean
  factor: number
  isFuture: boolean
}

/** Dựng metadata projection cho từng tháng của quý. asOf = mốc dữ liệu (thường HÔM QUA); todayStr = asOf ISO. */
export function buildQuarterMonthMeta(months: string[], asOf: Date, todayStr: string): QuarterMonthMeta[] {
  return months.map(m => {
    const mStart = `${m}-01`
    const mEndDate = new Date(parseInt(m.split("-")[0]), parseInt(m.split("-")[1]), 0)
    const mEnd = mEndDate.toISOString().split("T")[0]
    const actualEnd = mEnd < todayStr ? mEnd : todayStr
    const dim = getDaysInMonth(m)
    const isFuture = new Date(mStart) > asOf
    const isCurrent = !isFuture && mEndDate >= asOf
    const elapsed = isFuture ? 0 : getDaysInRange(mStart, actualEnd, m)
    const isProjected = isCurrent && elapsed >= MIN_PROJECT_DAYS && elapsed < dim
    const factor = isProjected ? dim / elapsed : 1
    return { month: m, mStart, mEnd, actualEnd, dim, elapsed, isProjected, factor, isFuture }
  })
}
