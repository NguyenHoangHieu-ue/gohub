import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// Mỗi route của tab Tính giá & Tạo sản phẩm phải có cổng quyền đúng mức (không route nào bị bỏ ngỏ).
const api = path.resolve(__dirname, "../app/api")
const src = (p: string) => readFileSync(path.join(api, p), "utf8")

describe("cổng quyền route Tính giá & Tạo sản phẩm", () => {
  test.each(["product-tools/options/route.ts", "product-tools/price/route.ts"])("%s chỉ cần quyền tính giá", p => {
    expect(src(p)).toContain('requireProductTools("price")')
    expect(src(p)).not.toContain("requireAdmin")
  })
  test.each([
    "admin/bc-datapool/route.ts", "admin/bc-datapool/build/route.ts",
    "admin/threehk-datapool/route.ts", "admin/threehk-datapool/build/route.ts",
  ])("%s cần quyền tạo sản phẩm", p => {
    expect(src(p)).toContain('requireProductTools("create")')
  })
  test.each(["admin/bc-datapool/price-list/route.ts", "admin/bc-datapool/plan-catalog/route.ts"])("%s (upload dữ liệu nền) vẫn chỉ Admin/Creator", p => {
    expect(src(p)).toContain("requireAdmin()")
  })
  test("kết quả tính giá không trả bảng giá gốc của vendor", () => {
    expect(src("product-tools/options/route.ts")).not.toMatch(/priceList|portalPlans|\bncc\b\s*[:,]/)
  })
})
