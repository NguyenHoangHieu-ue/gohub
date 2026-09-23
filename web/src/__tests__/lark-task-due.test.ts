import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/lark", () => ({ getLarkToken: vi.fn(), getLarkUserToken: vi.fn(), getLarkUserOpenId: vi.fn() }))

import { dueMs } from "@/lib/agents/creator/tools/lark"

describe("dueMs (Lark Task v2 due.timestamp = mili giây, mặc định giờ VN)", () => {
  it("giờ không kèm múi giờ → hiểu là giờ VN", () => {
    expect(dueMs("2026-09-24T15:00")).toBe(String(Date.UTC(2026, 8, 24, 8, 0)))
  })
  it("chỉ có ngày → 23:59 giờ VN", () => {
    expect(dueMs("2026-09-24")).toBe(String(Date.UTC(2026, 8, 24, 16, 59)))
  })
  it("có múi giờ → giữ nguyên", () => {
    expect(dueMs("2026-09-24T15:00:00+07:00")).toBe(String(Date.UTC(2026, 8, 24, 8, 0)))
    expect(dueMs("2026-09-24T08:00:00Z")).toBe(String(Date.UTC(2026, 8, 24, 8, 0)))
  })
  it("là mili giây (13 chữ số), không phải giây", () => {
    expect(dueMs("2026-09-24")).toHaveLength(13)
  })
  it("chuỗi rác → lỗi", () => {
    expect(() => dueMs("mai nhé")).toThrow()
  })
})
