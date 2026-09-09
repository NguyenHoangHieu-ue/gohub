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
// date-math.ts thuần (zero-dep) — KHÔNG import từ bod-data.ts/analytics-helpers.ts (2 module đó kéo theo
// supabaseAdmin/pg, không an toàn bundle vào client component). Import trực tiếp giữ file này client-safe.
import { getDaysInMonth, getDaysInRange } from "@/lib/analytics-engine/date-math"

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

/**
 * Factor chiếu KHÔNG gate theo MIN_PROJECT_DAYS — dùng cho KPI cards / PR per-customer (khác `factor` ở
 * trên, vốn CHỜ đủ 7 ngày mới chiếu, dành riêng cho bảng "Tổng hợp theo tháng" để tránh số nhảy đầu
 * tháng). Đây là NGUỒN DUY NHẤT cho công thức `dim/elapsed` không-gate — trước s183, `quarterly/page.tsx`
 * (`kpiPrFactor`/`monthKpiFactor`) và `squad-progress/route.ts` (`kpiFactorOf`) mỗi nơi tự định nghĩa lại
 * hàm này, và việc chỉ đổi 1 nơi (bug s182) từng khiến Squad Progress lệch hẳn Quarter Report khi đầu
 * tháng cuối quý (elapsed < 7 ngày). Route/page nào cần factor "chiếu ngay từ ngày 1" phải import hàm này
 * thay vì viết lại.
 */
export function getKpiFactor(meta: Pick<QuarterMonthMeta, "elapsed" | "dim">): number {
  return meta.elapsed > 0 && meta.elapsed < meta.dim ? meta.dim / meta.elapsed : 1
}

/**
 * Tỷ lệ số-ngày-đã-qua/tổng-số-ngày-tháng (1 = tháng đã xong). Dùng để pro-rate chi phí dạng "amount"
 * (tiền cố định/tháng) đúng phần đã trải qua TRƯỚC KHI nhân với `getKpiFactor`/`factor` để chiếu hết
 * tháng — 2 phép nhân triệt tiêu đúng 1 lần `elapsedRatio × kpiFactor = 1` cho mọi tháng đã bắt đầu, nên
 * chi phí cố định chỉ bị trừ đúng 1 lần dù chiếu cả tháng. Thiếu bước này (elapsedRatio=1 cứng) làm cost
 * dạng amount bị nhân đúp theo factor — đây là root cause bug s166 (CM1 Squad Progress thấp hơn Quarter
 * Report có hệ thống với KH có cost cố định giữa tháng).
 */
export function getElapsedRatio(meta: Pick<QuarterMonthMeta, "elapsed" | "dim">): number {
  return meta.dim > 0 ? meta.elapsed / meta.dim : 1
}
