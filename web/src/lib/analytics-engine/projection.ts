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
