import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))

import { buildReportCards } from "@/lib/lark"

const section = (n: number) => `**【${n}】 Mục ${n}**\n\n| A | B |\n|---|---|\n| ${n} | x |\n\nNhận xét ${n}.`
const report = (sections: number) => Array.from({ length: sections }, (_, i) => section(i + 1)).join("\n\n")
const tablesOf = (card: any) => card.body.elements.filter((e: any) => e.tag === "table").length

describe("buildReportCards", () => {
  it("≤5 bảng → 1 card, giữ nguyên tiêu đề", () => {
    const cards = buildReportCards("Daily", report(5), "kw")
    expect(cards).toHaveLength(1)
    expect(cards[0].header.title.content).toBe("Daily")
    expect(tablesOf(cards[0])).toBe(5)
  })

  it("8 bảng (Daily 【1】→【8】) → 2 card ≤5 bảng, keyword ở mỗi card, tiêu đề mục đi cùng bảng", () => {
    const cards = buildReportCards("Daily", report(8), "kw")
    expect(cards).toHaveLength(2)
    expect(cards.map(tablesOf)).toEqual([5, 3])
    expect(cards.map((c: any) => c.header.title.content)).toEqual(["Daily (1/2)", "Daily (2/2)"])
    for (const c of cards) expect(c.body.elements[0]).toEqual({ tag: "markdown", content: "kw" })
    expect(cards[1].body.elements[1].content).toBe("**【6】 Mục 6**")
    const card1Text = cards[0].body.elements.filter((e: any) => e.tag === "markdown").map((e: any) => e.content).join("\n")
    expect(card1Text).toContain("Nhận xét 5.")
    expect(card1Text).not.toContain("【6】")
  })

  it("không có bảng → 1 card", () => {
    const cards = buildReportCards("T", "chỉ có chữ")
    expect(cards).toHaveLength(1)
    expect(cards[0].body.elements).toEqual([{ tag: "markdown", content: "chỉ có chữ" }])
  })
})
