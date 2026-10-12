import { describe, expect, test } from "vitest"
import { allocateCustomerCostByKey } from "@/lib/analytics-engine/customer-cost-allocation"
import type { CostRecord } from "@/lib/b2b-customer-cost"

const pct = (v: number): CostRecord => ({ cost_type: "percent", cost_value: v, cost_lines: "" })
const amt = (v: number): CostRecord => ({ cost_type: "amount", cost_value: v, cost_lines: "" })

describe("allocateCustomerCostByKey", () => {
  const S = "2026-10-01", E = "2026-10-31"

  test("chi phí gắn đúng khách: kênh của khách không có chi phí không gánh gì", () => {
    const rows = [
      { customer_code: "VN", month: "2026-10", key: "A", revenue: 100 },
      { customer_code: "MY", month: "2026-10", key: "B", revenue: 900 },
    ]
    const r = allocateCustomerCostByKey(rows, new Map([["2026-10_VN", pct(10)]]), S, E)
    expect(r.get("A")).toBeCloseTo(10)
    expect(r.get("B")).toBeUndefined()
  })

  test("1 khách nhiều kênh: chia theo doanh thu khách trong từng kênh, tổng giữ nguyên", () => {
    const rows = [
      { customer_code: "X", month: "2026-10", key: "A", revenue: 300 },
      { customer_code: "X", month: "2026-10", key: "B", revenue: 700 },
    ]
    const r = allocateCustomerCostByKey(rows, new Map([["2026-10_X", pct(10)]]), S, E)
    expect(r.get("A")).toBeCloseTo(30); expect(r.get("B")).toBeCloseTo(70)
    expect((r.get("A") || 0) + (r.get("B") || 0)).toBeCloseTo(100)
  })

  test("chi phí cố định theo ngày: tính cả tháng trên tổng khách rồi chia theo tỷ trọng; ngoài phạm vi chỉ là mẫu số", () => {
    const rows = [
      { customer_code: "X", month: "2026-10", key: "A", revenue: 250, inScope: true },
      { customer_code: "X", month: "2026-10", key: "B", revenue: 750, inScope: false },
    ]
    const r = allocateCustomerCostByKey(rows, new Map([["2026-10_X", amt(1000)]]), S, E)
    expect(r.get("A")).toBeCloseTo(250)
    expect(r.has("B")).toBe(false)
  })

  test("khách không có doanh thu kỳ này bị bỏ qua", () => {
    expect(allocateCustomerCostByKey([], new Map([["2026-10_X", amt(1000)]]), S, E).size).toBe(0)
  })
})
