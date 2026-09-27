import { vi, describe, it, expect } from "vitest"

// analytics-helpers kéo theo supabase/analytics-db/turso → mock để import được trong test (chỉ test hàm dựng SQL thuần).
vi.mock("@vercel/functions", () => ({ waitUntil: () => {}, getCache: () => ({ get: async () => undefined, set: async () => {}, delete: async () => {}, expireTag: async () => {} }) }))
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))

import { customerExcludedSql, buildGroupCaseByCustomerSql } from "@/lib/analytics-helpers"

describe("customerExcludedSql — loại KH theo tên HOẶC mã", () => {
  it("khớp cả tên (đã fallback mã khi thiếu tên) lẫn mã KH", () => {
    const sql = customerExcludedSql(["B2B Ops", "3tOAkFoh0j"])
    expect(sql).toContain("COALESCE(c.name, TRIM(f.customer_code)) IN ('B2B Ops','3tOAkFoh0j')")
    expect(sql).toContain("TRIM(f.customer_code) IN ('B2B Ops','3tOAkFoh0j')")
    expect(sql).toMatch(/ OR /)
  })
  it("danh sách rỗng → FALSE (không sinh `IN ()` lỗi cú pháp)", () => {
    expect(customerExcludedSql([])).toBe("FALSE")
  })
  it("escape dấu nháy đơn", () => {
    expect(customerExcludedSql(["O'Brien"])).toContain("'O''Brien'")
  })
  it("CASE nhóm KH đánh dấu 'Excluded' bằng điều kiện tên/mã; không có exclude thì bỏ dòng", () => {
    const withEx = buildGroupCaseByCustomerSql({ Strategic: ["x"] } as any, ["3tOAkFoh0j"])
    expect(withEx).toContain("THEN 'Excluded'")
    expect(withEx).toContain("TRIM(f.customer_code) IN ('3tOAkFoh0j')")
    expect(buildGroupCaseByCustomerSql({ Strategic: ["x"] } as any, [])).not.toContain("Excluded")
  })
})
