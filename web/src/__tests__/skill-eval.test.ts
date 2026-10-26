import { describe, expect, it } from "vitest"
import { evalSummary, parseVerdict, skillSlot, tally, type EvalCase } from "@/lib/agents/creator/skill-eval"

describe("skill A/B eval — phần thuần", () => {
  it("skillSlot xen kẽ A/B theo thứ tự câu", () => { expect([0, 1, 2, 3].map(skillSlot)).toEqual(["A", "B", "A", "B"]) })

  it("parseVerdict đổi A/B về skill/baseline theo vị trí đã đặt; hòa → tie; sai định dạng → null", () => {
    expect(parseVerdict('{"winner":"A","why":"đủ bước"}', "A")).toEqual({ winner: "skill", why: "đủ bước" })
    expect(parseVerdict('{"winner":"A","why":"x"}', "B")).toEqual({ winner: "baseline", why: "x" })
    expect(parseVerdict('```json\n{"winner":"b","why":"y"}\n```', "B")?.winner).toBe("skill")
    expect(parseVerdict('{"winner":"tie","why":"như nhau"}', "A")?.winner).toBe("tie")
    expect(parseVerdict('{"winner":"C"}', "A")).toBeNull()
    expect(parseVerdict("không phải JSON", "A")).toBeNull()
  })

  it("tally đếm thắng/hòa/thua; evalSummary cảnh báo khi không có skill lại thắng nhiều hơn", () => {
    const c = (winner: EvalCase["winner"]): EvalCase => ({ prompt: "p", winner, why: "" })
    const good = tally([c("skill"), c("skill"), c("tie")], "t")
    expect(good).toMatchObject({ skillWins: 2, baselineWins: 0, ties: 1 })
    expect(evalSummary(good)).toBe("A/B 3 câu: có skill thắng 2, không skill thắng 0, hòa 1")
    const bad = tally([c("baseline"), c("baseline"), c("skill")], "t")
    expect(evalSummary(bad)).toMatch(/^⚠ .*KHÔNG làm câu trả lời tốt hơn/)
  })
})
