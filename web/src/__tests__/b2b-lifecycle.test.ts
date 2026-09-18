// Unit test cho New/Recurring/Inactive B2B Customers (s200) — hàm thuần `classifyB2BLifecycle`,
// không chạm DB. Khoá lại đúng định nghĩa đã chốt với Hiếu: "trước đây" = toàn bộ lịch sử trước quý đang
// xem (không chỉ quý liền trước).

import { vi, describe, test, expect } from "vitest"

// b2b-lifecycle.ts import cachedQuery từ analytics-helpers.ts → kéo theo supabase/analytics-db thật,
// throw lỗi thiếu env khi chạy test. Mock cô lập giống analytics-engine.test.ts (classifyB2BLifecycle
// là hàm thuần, không thật sự cần DB — chỉ cần import không crash).
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))
vi.mock("@/lib/quarterly-settings", () => ({
  fetchQuarterlySettings: vi.fn(),
  exclHash: () => "",
}))

import { classifyB2BLifecycle, type B2BLifecycleRow } from "@/lib/analytics-engine/b2b-lifecycle"

const row = (customer_code: string, first_order_date: string): B2BLifecycleRow => ({
  customer_code, customer_name: customer_code, sales_pic_code: "PIC1", first_order_date,
})

describe("classifyB2BLifecycle", () => {
  const qStart = "2026-07-01"
  const qEnd = "2026-09-30"

  test("KH mua đơn đầu tiên trong quý đang xem → new", () => {
    const rows = [row("A", "2026-08-05")]
    const map = classifyB2BLifecycle(rows, new Set(["A"]), qStart, qEnd)
    expect(map.get("A")).toBe("new")
  })

  test("KH mua từ trước quý (nhiều quý trước, không chỉ quý liền trước) và có mua lại trong quý → recurring", () => {
    const rows = [row("B", "2024-01-10")] // hơn 2 năm trước, không phải chỉ quý liền trước
    const map = classifyB2BLifecycle(rows, new Set(["B"]), qStart, qEnd)
    expect(map.get("B")).toBe("recurring")
  })

  test("KH mua từ trước quý nhưng KHÔNG mua trong quý này → inactive", () => {
    const rows = [row("C", "2025-03-01")]
    const map = classifyB2BLifecycle(rows, new Set(), qStart, qEnd)
    expect(map.get("C")).toBe("inactive")
  })

  test("KH có đơn đầu tiên SAU quý đang xem (xem lại quý cũ) → bỏ qua, không map", () => {
    const rows = [row("D", "2026-11-01")]
    const map = classifyB2BLifecycle(rows, new Set(), qStart, qEnd)
    expect(map.has("D")).toBe(false)
  })

  test("first_order_date đúng ngày đầu quý (biên dưới) → new", () => {
    const rows = [row("E", qStart)]
    const map = classifyB2BLifecycle(rows, new Set(["E"]), qStart, qEnd)
    expect(map.get("E")).toBe("new")
  })

  test("first_order_date đúng ngày cuối quý (biên trên) → new", () => {
    const rows = [row("F", qEnd)]
    const map = classifyB2BLifecycle(rows, new Set(["F"]), qStart, qEnd)
    expect(map.get("F")).toBe("new")
  })

  test("first_order_date ngay trước ngày đầu quý 1 ngày, có mua lại → recurring (không lẫn sang new)", () => {
    const rows = [row("G", "2026-06-30")]
    const map = classifyB2BLifecycle(rows, new Set(["G"]), qStart, qEnd)
    expect(map.get("G")).toBe("recurring")
  })

  test("nhiều KH cùng lúc, phân loại độc lập từng dòng", () => {
    const rows = [row("A", "2026-08-05"), row("B", "2024-01-10"), row("C", "2025-03-01")]
    const map = classifyB2BLifecycle(rows, new Set(["A", "B"]), qStart, qEnd)
    expect(map.get("A")).toBe("new")
    expect(map.get("B")).toBe("recurring")
    expect(map.get("C")).toBe("inactive")
  })
})
