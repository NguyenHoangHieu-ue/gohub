import type { CostRecord } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "./cost-engine"
import { getDaysInMonth, getDaysInRange } from "./date-math"

export interface CustKeyRev {
  customer_code: string
  month: string
  key: string
  revenue: number
  /** false = chỉ dùng làm mẫu số (doanh thu khách ngoài phạm vi đang xem), không nhận chi phí. Mặc định true. */
  inScope?: boolean
}

/**
 * Chia chi phí khách B2B (Turso) về từng "key" (kênh / sub-channel) theo KHÁCH THẬT: chi phí mỗi khách×tháng tính trên
 * TỔNG doanh thu khách đó (mọi key, kể cả ngoài phạm vi), rồi chia cho từng key theo tỷ trọng doanh thu của khách trong key.
 * Khách chưa nhập chi phí thì không gánh gì — khác cách cũ (gộp mọi chi phí B2B rồi chia theo doanh thu kênh).
 * Tổng các key (khi mọi doanh thu của khách đều nằm trong rows) = tổng chi phí khách, không đổi so với cách cũ.
 */
export function allocateCustomerCostByKey(
  rows: CustKeyRev[],
  costMap: Map<string, CostRecord>,
  startDate: string,
  endDate: string,
): Map<string, number> {
  const byCust = new Map<string, CustKeyRev[]>()
  for (const r of rows) {
    const k = `${r.month}_${r.customer_code}`
    const arr = byCust.get(k)
    if (arr) arr.push(r); else byCust.set(k, [r])
  }
  const out = new Map<string, number>()
  costMap.forEach((rec, ck) => {
    const list = byCust.get(ck)
    if (!list) return
    const month = ck.slice(0, 7)
    const total = list.reduce((s, r) => s + r.revenue, 0)
    if (total === 0) return
    const dim = getDaysInMonth(month)
    const ratio = dim > 0 ? getDaysInRange(startDate, endDate, month) / dim : 0
    const cost = calcChCostForPeriod(rec, total, ratio)
    for (const r of list) {
      if (r.inScope === false || r.revenue === 0) continue
      out.set(r.key, (out.get(r.key) || 0) + cost * (r.revenue / total))
    }
  })
  return out
}
