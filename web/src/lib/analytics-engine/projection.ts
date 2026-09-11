/**
 * Analytics Projection Engine — logic dùng chung mọi tab analytics.
 *
 * Rule chuẩn hệ thống (s133):
 *   - Cross-month range (start.month ≠ end.month) → factor = 1, không project
 *   - Tháng đã hoàn thành (end.month ≠ today.month) → factor = 1
 *   - MTD tháng hiện tại (same month, chưa hoàn thành) → factor = daysInMonth / daysElapsed
 *
 * Dùng cho cả FE và BE:
 *   - FE: import trong page.tsx thay thế getProjectionInfo() / getProjectionFactor() local
 *   - BE: import trong route.ts để trả `projection_factor` cho FE
 */
export function getProjectionFactor(startDate: string, endDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  const end   = new Date(endDate)
  if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) return 1
  if (end.getMonth() !== today.getMonth() || end.getFullYear() !== today.getFullYear()) return 1
  const daysElapsed = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
  const targetDays  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return Math.max(1, targetDays / daysElapsed)
}

export const isProjectable = (startDate: string, endDate: string): boolean =>
  getProjectionFactor(startDate, endDate) > 1

/**
 * Tổng quát hoá getProjectionFactor cho khoảng NGÀY BẤT KỲ (không giới hạn trong 1 tháng — vd cả quý,
 * 3 tháng) — dùng khi cần chiếu 1 kỳ dài hơn 1 tháng đang CHẠY DỞ (ví dụ My Metrics GmHierarchySection,
 * s195+18-B). getProjectionFactor gốc CỐ Ý trả 1 cho range cross-month (đúng hợp đồng đã dùng ở B2B/BOD/
 * Channels/monthly-kpis — KHÔNG đổi hàm đó, nhiều nơi đang phụ thuộc "cross-month = actual, không chiếu"
 * ở mức THÁNG). Hàm mới này dùng elapsed/total NGÀY thô trên chính khoảng [startDate,endDate] — kỳ đã
 * kết thúc (endDate < hôm nay) hoặc chưa bắt đầu → factor=1 (actual/không áp dụng), kỳ đang chạy dở →
 * factor = tổng ngày / số ngày đã qua.
 */
export function getRangeProjectionFactor(startDate: string, endDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  const end   = new Date(endDate)
  if (end < today || start > today) return 1
  const totalDays   = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const elapsedDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1)
  return elapsedDays < totalDays ? totalDays / elapsedDays : 1
}
