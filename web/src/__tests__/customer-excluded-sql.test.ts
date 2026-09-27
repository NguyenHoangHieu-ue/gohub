import { vi, describe, it, expect } from "vitest"

// analytics-helpers kéo theo supabase/analytics-db/turso → mock để import được trong test (chỉ test hàm dựng SQL thuần).
vi.mock("@vercel/functions", () => ({ waitUntil: () => {}, getCache: () => ({ get: async () => undefined, set: async () => {}, delete: async () => {}, expireTag: async () => {} }) }))
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))

import { customerExcludedSql, buildGroupCaseByCustomerSql, excludeOpsByCode } from "@/lib/analytics-helpers"
import { exclHash } from "@/lib/quarterly-settings"

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

describe("excludeOpsByCode — cũng loại theo MÃ (không chỉ tên)", () => {
  it("sinh cả điều kiện theo tên (qua dim_customer) và theo mã trực tiếp", () => {
    const sql = excludeOpsByCode(["B2B Ops", "3tOAkFoh0j"])
    expect(sql).toContain("FROM dim_customer WHERE name IN ('B2B Ops', '3tOAkFoh0j')")
    expect(sql).toMatch(/NOT IN \('B2B Ops', '3tOAkFoh0j'\)$/)
  })
  it("danh sách rỗng → không thêm điều kiện", () => {
    expect(excludeOpsByCode([])).toBe("")
  })
})

describe("exclHash — hash thật của cả danh sách", () => {
  it("đổi mục ở cuối danh sách dài (>24 ký tự) VẪN đổi key; thứ tự đầu vào không ảnh hưởng", () => {
    const a = ["Alpha customer name long", "Beta customer name long", "Zeta"]
    const b = ["Alpha customer name long", "Beta customer name long", "Zulu"]
    expect(exclHash(a)).not.toBe(exclHash(b))
    expect(exclHash(a)).toBe(exclHash([...a].reverse()))
  })
})
