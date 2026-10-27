import { describe, expect, it } from "vitest"
import { countTools, median, parityOf, removalCriteria, upRate } from "@/lib/assistant/parity-pure"
import { ACT_TOOLS } from "@/lib/argon/act-tool"

describe("đối chiếu Gấu Pro ↔ Gấu Prime", () => {
  it("đếm công cụ trong nhật ký gp_runs, bỏ qua bước không có tool", () => {
    const r = countTools([[{ r: 1, tool: "webSearch" }, { r: 2, model_ms: 5 }, { tool: "webSearch" }], [{ tool: "sendLarkMessage" }], null, "x"])
    expect(r).toEqual([{ tool: "webSearch", count: 2 }, { tool: "sendLarkMessage", count: 1 }])
  })
  it("công cụ chưa có trong bảng được coi là chưa có tương đương", () => {
    expect(parityOf("toolLa")).toMatchObject({ status: "not_yet" })
    expect(parityOf("webSearch").status).toBe("covered")
    expect(parityOf("sendLarkMessage").status).toBe("approval")
    expect(parityOf("controlMyBrowser").status).toBe("covered")
    expect(parityOf("khongCoTrongBang").status).toBe("not_yet")
  })
  it("mọi công cụ đề xuất được qua thẻ duyệt đều được đánh dấu approval/covered", () => {
    for (const t of ACT_TOOLS) expect(["approval", "covered"], t).toContain(parityOf(t).status)
  })
  it("trung vị và tỉ lệ hài lòng", () => {
    expect(median([])).toBeNull(); expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 10])).toBe(3)
    expect(upRate(0, 0)).toBeNull(); expect(upRate(3, 1)).toBe(75)
  })
  it("tiêu chí gỡ: khoảng trống công cụ, số ngày, chất lượng; mục của anh để null", () => {
    const base = { primeRuns: 40, daysWithPrimeRuns: 8, used: [{ tool: "webSearch", count: 10 }, { tool: "deepResearch", count: 5 }, { tool: "generateVideo", count: 1 }], primeUp: 9, primeDown: 1, proUp: 8, proDown: 2 }
    const c = removalCriteria(base)
    const by = Object.fromEntries(c.map(x => [x.id, x]))
    expect(by.parity.ok).toBe(false)
    expect(by.parity.detail).toContain("deepResearch (5)")
    expect(by.parity.detail).not.toContain("generateVideo")   // dùng < 3 lần: chưa tính
    expect(by.days.ok).toBe(true)
    expect(by.quality.ok).toBe(true)
    expect(by.perm.ok).toBeNull(); expect(by.owner.ok).toBeNull()
    expect(removalCriteria({ ...base, used: [{ tool: "webSearch", count: 10 }], daysWithPrimeRuns: 3, primeUp: 0, primeDown: 0 }).map(x => x.ok)).toEqual([true, false, null, null, null])
  })
})

import { isAutoRun } from "@/lib/assistant/parity-pure"
describe("lượt tự động không tính vào so sánh tốc độ", () => {
  it("nhận ra tuần tra đêm / bản tin / Chốt; câu anh hỏi tay thì không", () => {
    for (const p of ["🌙 Tuần tra đêm: đọc Kho…", "🔧 Việc tự động", "Cập nhật bản tin hôm nay và ghi vào notes", "Anh đã Chốt. Đọc notes/ke-hoach.md"]) expect(isAutoRun(p), p).toBe(true)
    for (const p of ["Mail nào đang chờ tôi trả lời?", "Cập nhật giúp anh giá Aurora", "", null, undefined]) expect(isAutoRun(p as string), String(p)).toBe(false)
  })
})
