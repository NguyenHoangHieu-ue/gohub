import { describe, expect, it } from "vitest"
import { digest } from "@/lib/argon/digest"

describe("gói Kênh bán", () => {
  it("mảng kênh ở gốc phản hồi thành bảng markdown (bọc trong { kenh })", () => {
    const rows = [{ channel: "Momo", group_name: "B2B", revenue: 396723791, margin: 187226499.94, mom: -5.56 }, { channel: "Shopeepay", group_name: "B2B", revenue: 475963751.76, margin: 79881043.94, mom: 24.67 }]
    const t = digest({ kenh: rows }, "Channel Performance", { maxRows: 100 })
    expect(t).toContain("Momo")
    expect(t).toContain("Shopeepay")
    expect(t).toMatch(/\|/)
  })
})
