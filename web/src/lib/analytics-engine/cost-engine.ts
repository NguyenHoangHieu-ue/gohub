/**
 * Analytics Cost Engine — tính chi phí pro-rata đúng cho mọi loại cost.
 *
 * Công thức chuẩn hệ thống (s133):
 *   amount type → value × dayRatio  (dayRatio = days_in_range_for_month / days_in_month)
 *   percent type → (value/100) × moRevenue  (moRevenue = revenue thực kỳ từ SQL, không nhân dayRatio)
 *
 * Import bởi:
 *   - b2b/performance/route.ts (calcChCostForPeriod — customer-level CH.Cost)
 *   - channels/kpis/route.ts (calcChannelOpCost — channel-level op cost)
 *   - Các route analytics khác khi migrate về BE
 */

import { getDaysInRange, getDaysInMonth, type ChannelCostRow } from "@/lib/analytics-helpers"
import type { CostRecord, CostLine } from "@/lib/b2b-customer-cost"

export type { CostRecord, CostLine }
export const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

/**
 * Tính CH.Cost thực tế cho 1 record cost trong 1 tháng.
 * ← Pattern mẫu từ b2b/performance/route.ts (s133). Di chuyển ra đây để dùng chung.
 */
export function calcChCostForPeriod(rec: CostRecord, moRevenue: number, dayRatio: number): number {
  let lines: CostLine[] = []
  if (rec.cost_lines) {
    try { lines = typeof rec.cost_lines === "string" ? JSON.parse(rec.cost_lines) : (rec.cost_lines as unknown as CostLine[]) } catch {}
  }
  if (lines.length > 0) {
    return lines.reduce((tot, l) => {
      const val = Number(l?.value) || 0
      return tot + (l?.type === "percent" ? (val / 100) * moRevenue : val * dayRatio)
    }, 0)
  }
  const cval = Number(rec.cost_value) || 0
  return rec.cost_type === "percent" ? (cval / 100) * moRevenue : cval * dayRatio
}

/**
 * Tính channel-level op cost (ads/platform/sponsor/media) cho 1 channel trong 1 date range.
 * revByMonth: { "YYYY-MM": actual_revenue_in_period } — dùng cho percent costs.
 */
export function calcChannelOpCost(
  channelCosts: ChannelCostRow[],
  channelName: string,
  startDate: string,
  endDate: string,
  revByMonth: Record<string, number>,
): number {
  let opCost = 0
  channelCosts.filter(c => c.channel === channelName).forEach(c => {
    const dayRatio = getDaysInMonth(c.month) > 0
      ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
    const mRev = revByMonth[c.month] ?? 0
    COST_KEYS.forEach(key => {
      const cv = c[key]
      if (cv?.value) opCost += cv.type === "amount" ? cv.value * dayRatio : (mRev * cv.value) / 100
    })
  })
  return opCost
}

/**
 * Tính group-level op cost (B2B/B2C group costs) phân bổ theo revenue share.
 * channelRevShare: channel.revenue / totalGroupRevenue (0–1).
 */
export function calcGroupOpCost(
  groupCosts: Array<{ group_name: string; month: string; amount: string }>,
  groupName: string,
  channelRevShare: number,
  startDate: string,
  endDate: string,
): number {
  let opCost = 0
  groupCosts.filter(gc => gc.group_name === groupName).forEach(gc => {
    const dayRatio = getDaysInMonth(gc.month) > 0
      ? getDaysInRange(startDate, endDate, gc.month) / getDaysInMonth(gc.month) : 0
    opCost += parseFloat(gc.amount || "0") * dayRatio * channelRevShare
  })
  return opCost
}
