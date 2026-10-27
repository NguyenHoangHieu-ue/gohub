import { describe, expect, it } from "vitest"
import { usesKhoScope } from "@/lib/argon/context-pure"
import { CHAT_PREFIX } from "@/lib/argon/missions"

describe("cuộc trò chuyện của Trợ lý", () => {
  it("tên bắt đầu bằng tiền tố vẫn đọc toàn Kho (dù đổi tên thành gì)", () => {
    expect(usesKhoScope(`${CHAT_PREFIX}Cuộc trò chuyện mới`)).toBe(true)
    expect(usesKhoScope(`${CHAT_PREFIX}So giá 3HK với BC`)).toBe(true)
  })
  it("sứ mệnh thường không đọc toàn Kho", () => {
    expect(usesKhoScope("Sứ mệnh khác")).toBe(false)
    expect(usesKhoScope("Cuộc trò chuyện mới")).toBe(false)
  })
})
