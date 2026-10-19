import { beforeEach, describe, expect, test, vi } from "vitest"

// Quyền tab Tính giá & Tạo sản phẩm: Creator có cả hai; "tạo sản phẩm" kéo theo "tính giá"; người lạ không có gì.
const lists: Record<string, string[]> = {}
const roles: Record<string, string> = { hieu: "creator", sale1: "sales", sale2: "sales", sale3: "sales", nobody: "sales" }

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db-role", () => ({ getDbRole: async (u: string) => roles[u] ?? null }))
vi.mock("@/lib/memo", () => ({ memo: async (_k: string, _t: number, f: () => Promise<unknown>) => f(), memoInvalidate: () => {} }))
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: (_c: string, key: string) => ({ maybeSingle: async () => ({ data: lists[key] ? { value: JSON.stringify(lists[key]) } : null }) }) }) }) },
}))

import { canCreateProducts, canUsePricing, PRICING_USERS_KEY, PRODUCT_CREATE_USERS_KEY } from "@/lib/creator-access"

describe("quyền Tính giá & Tạo sản phẩm", () => {
  beforeEach(() => {
    lists[PRICING_USERS_KEY] = ["sale1"]
    lists[PRODUCT_CREATE_USERS_KEY] = ["sale2"]
  })
  test("Creator luôn có cả hai", async () => {
    expect(await canUsePricing("hieu")).toBe(true)
    expect(await canCreateProducts("hieu")).toBe(true)
  })
  test("chỉ được cấp tính giá → tính giá được, tạo sản phẩm không", async () => {
    expect(await canUsePricing("sale1")).toBe(true)
    expect(await canCreateProducts("sale1")).toBe(false)
  })
  test("được cấp tạo sản phẩm → có cả tính giá", async () => {
    expect(await canCreateProducts("sale2")).toBe(true)
    expect(await canUsePricing("sale2")).toBe(true)
  })
  test("người chưa được cấp, hoặc không có username → không có quyền nào", async () => {
    expect(await canUsePricing("nobody")).toBe(false)
    expect(await canCreateProducts("nobody")).toBe(false)
    expect(await canUsePricing(undefined)).toBe(false)
    expect(await canCreateProducts(null)).toBe(false)
  })
  test("thu quyền (xoá khỏi danh sách) có hiệu lực", async () => {
    lists[PRICING_USERS_KEY] = []
    expect(await canUsePricing("sale1")).toBe(false)
  })
})
