import { describe, expect, it } from "vitest"
import { MAX_BROWSER_ACTIONS_PER_TURN, approvalReason, newTurnSafety, recordToolResult } from "@/lib/agents/creator/tool-policy"

const click = { name: "controlMyBrowser", args: { action: "click", ref: "e1" } }

describe("trần thao tác browser mỗi lượt (P4b)", () => {
  it("chưa tới trần → chạy luôn (lượt chưa nhiễm); đúng trần → phải duyệt", () => {
    const s = newTurnSafety("điền form", false)
    for (let i = 0; i < MAX_BROWSER_ACTIONS_PER_TURN - 1; i++) recordToolResult(s, click, { ok: true })
    expect(approvalReason(click, s)).toBeNull()
    recordToolResult(s, click, { ok: true })
    expect(approvalReason(click, s)).toMatch(/cần anh xác nhận/)
  })
  it("thao tác chỉ đọc/cuộn/chờ không tính vào trần và không bị chặn", () => {
    const s = newTurnSafety("xem trang", false)
    for (let i = 0; i < 100; i++) recordToolResult(s, { name: "controlMyBrowser", args: { action: "scroll" } }, { ok: true })
    expect(s.browserActions).toBe(0)
    expect(approvalReason({ name: "controlMyBrowser", args: { action: "scroll" } }, s)).toBeNull()
    expect(approvalReason(click, s)).toBeNull()
  })
  it("công cụ khác không đụng bộ đếm; duyệt hằng ngày (dailyAuto) KHÔNG bỏ qua trần", () => {
    const s = newTurnSafety("x", false)
    recordToolResult(s, { name: "queryProduct", args: {} }, { rows: 1 })
    expect(s.browserActions).toBe(0)
    for (let i = 0; i < MAX_BROWSER_ACTIONS_PER_TURN; i++) recordToolResult(s, click, { ok: true })
    expect(approvalReason(click, s, { dailyAuto: true })).not.toBeNull()
  })
})
