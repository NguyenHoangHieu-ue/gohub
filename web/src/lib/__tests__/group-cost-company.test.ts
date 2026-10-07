import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))
import { filterGroupCostsByCompany } from "@/lib/bod-data"

const rows = [
  { group_name: "B2C", month: "2026-09", amount: 29045837, item_name: "Global B2C" },
  { group_name: "B2C", month: "2026-09", amount: 91025342, item_name: "VN ads" },
  { group_name: "B2C", month: "2026-08", amount: 24332420, item_name: "Global Ads" },
  { group_name: "B2C", month: "2026-08", amount: 16009439, item_name: "Branding & media" },
  { group_name: "B2C", month: "2026-06", amount: 130549091, item_name: null },
]
const sum = (xs: typeof rows) => xs.reduce((s, r) => s + r.amount, 0)

describe("filterGroupCostsByCompany", () => {
  it("tên có Global (không phân biệt hoa thường) chỉ thuộc US", () => {
    expect(filterGroupCostsByCompany(rows, "US").map(r => r.item_name)).toEqual(["Global B2C", "Global Ads"])
  })
  it("còn lại (kể cả không tên) thuộc VN", () => {
    expect(filterGroupCostsByCompany(rows, "VN").map(r => r.item_name)).toEqual(["VN ads", "Branding & media", null])
  })
  it("ALL giữ nguyên và VN + US = ALL", () => {
    expect(filterGroupCostsByCompany(rows, "ALL")).toHaveLength(rows.length)
    expect(sum(filterGroupCostsByCompany(rows, "VN")) + sum(filterGroupCostsByCompany(rows, "US"))).toBe(sum(rows))
  })
})
