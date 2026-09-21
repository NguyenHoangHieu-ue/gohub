import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {}, supabaseAdmin: {} }))
import { excludedForB2C } from "@/lib/quarterly-settings"

describe("excludedForB2C", () => {
  it("bỏ các mã khách B2C dùng chung khỏi danh sách loại trừ, giữ mục còn lại", () => {
    const list = ["B2C Customer US", "B2C Customer VN", "B2B Ops", "VN B2C Website", "VN B2C Customer", "VN B2B Internal Ops", "3tOAkFoh0j"]
    expect(excludedForB2C(list)).toEqual(["B2B Ops", "VN B2B Internal Ops", "3tOAkFoh0j"])
  })
  it("danh sách rỗng trả rỗng", () => {
    expect(excludedForB2C([])).toEqual([])
  })
})
