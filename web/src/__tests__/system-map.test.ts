import { describe, it, expect } from "vitest"
import { applyEvents, buildGraph, emptyActivity, groupOfTool, idsForEvent, isActive, isErrored, PULSE_MS, TOOL_GROUPS } from "@/lib/system-map"

describe("nhóm công cụ", () => {
  it("công cụ đã biết vào đúng nhóm, lạ → other, không công cụ nào nằm 2 nhóm", () => {
    expect(groupOfTool("executeSQL")).toBe("data"); expect(groupOfTool("timTrongNguon")).toBe("sources"); expect(groupOfTool("traSuViec")).toBe("facts"); expect(groupOfTool("congCuMoiLa")).toBe("other")
    const all = TOOL_GROUPS.flatMap(g => g.tools)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe("buildGraph", () => {
  const g = buildGraph({ "be-gau": ["executeSQL", "webSearch"], "gau-pro": ["executeSQL", "createLarkTask", "zzz"], argon: ["sql", "run_code", "traSuViec"] })
  it("chỉ có nhóm công cụ mà ít nhất một trợ lý dùng, kèm số công cụ", () => {
    const ids = g.nodes.filter(n => n.kind === "group").map(n => n.id)
    expect(ids).toEqual(expect.arrayContaining(["g-data", "g-web", "g-lark", "g-code", "g-facts", "g-other"]))
    expect(ids).not.toContain("g-media")
    expect(g.nodes.find(n => n.id === "g-data")?.count).toBe(2)   // executeSQL (Bé Gấu + Gấu Pro, đếm 1) + sql (Argon)
  })
  it("mỗi cạnh nối giữa hai nút có thật; id cạnh duy nhất", () => {
    const nodeIds = new Set(g.nodes.map(n => n.id))
    for (const e of g.edges) { expect(nodeIds.has(e.source)).toBe(true); expect(nodeIds.has(e.target)).toBe(true) }
    expect(new Set(g.edges.map(e => e.id)).size).toBe(g.edges.length)
  })
  it("Argon đi qua vòng chạy riêng, Bé Gấu/Gấu Pro qua vòng chung", () => {
    expect(g.edges.some(e => e.id === "c-argon>g-code:argon")).toBe(true)
    expect(g.edges.some(e => e.id === "c-loop>g-data:be-gau")).toBe(true)
    expect(g.edges.some(e => e.id === "c-argon>g-web:argon")).toBe(false)
  })
})

describe("hoạt động", () => {
  it("idsForEvent: tool sáng trợ lý, vòng lặp, nhóm, kho dữ liệu và cạnh", () => {
    const ids = idsForEvent({ agent: "gau-pro", kind: "tool", name: "executeSQL" })
    expect(ids).toEqual(expect.arrayContaining(["a-gau-pro", "c-loop", "g-data", "c-loop>g-data:gau-pro", "s-dw", "g-data>s-dw"]))
  })
  it("idsForEvent: model sáng Gemini; Argon dùng vòng riêng", () => {
    expect(idsForEvent({ agent: "argon", kind: "model" })).toEqual(expect.arrayContaining(["c-argon", "s-gemini", "c-argon>s-gemini"]))
  })
  it("applyEvents: sáng PULSE_MS rồi tắt; tool lỗi thì nhóm đỏ; không sửa trạng thái cũ", () => {
    const s0 = emptyActivity()
    const s1 = applyEvents(s0, [{ at: 1, agent: "be-gau", run: "r", kind: "tool", name: "queryGA4", ok: false }], 1000)
    expect(Object.keys(s0.until)).toHaveLength(0)
    expect(isActive(s1, "g-web", 1000 + PULSE_MS - 1)).toBe(true)
    expect(isActive(s1, "g-web", 1000 + PULSE_MS + 1)).toBe(false)
    expect(isErrored(s1, "g-web", 1000 + PULSE_MS + 1)).toBe(true)
  })
})
