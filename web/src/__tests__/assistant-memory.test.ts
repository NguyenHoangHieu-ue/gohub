import { describe, it, expect, vi, beforeEach } from "vitest"

let selectResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }
const inserted: unknown[] = []

// Chain giả của supabase-js: mọi method lọc trả lại chính nó, await → selectResult.
function chain(): any {
  const c: any = {
    select: () => c, eq: () => c, order: () => c, limit: () => c, ilike: () => c,
    update: () => c,
    insert: (row: unknown) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) } },
    then: (res: (v: unknown) => unknown) => Promise.resolve(selectResult).then(res),
  }
  return c
}
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => chain() } }))

import { buildMemoryBlock, runAssistantMemory } from "@/lib/assistant-memory"

describe("assistant memory", () => {
  beforeEach(() => { selectResult = { data: [], error: null }; inserted.length = 0 })

  it("nạp trí nhớ kèm id, ghim có 📌", async () => {
    selectResult = { data: [
      { id: 1, kind: "project", content: "Đang làm trợ lý toàn diện P1-P4", pinned: true, updated_at: "" },
      { id: 2, kind: "person", content: "Minh làm B2C Advanced dashboard", pinned: false, updated_at: "" },
    ], error: null }
    const block = await buildMemoryBlock("hieu")
    expect(block).toContain("[#1 📌] (Dự án/việc đang theo) Đang làm trợ lý")
    expect(block).toContain("[#2] (Người liên quan) Minh")
  })

  it("có trần ký tự — mục vượt trần bị bỏ và báo số lượng", async () => {
    selectResult = { data: Array.from({ length: 30 }, (_, i) => ({ id: i, kind: "other", content: "x".repeat(300), pinned: false, updated_at: "" })), error: null }
    const block = await buildMemoryBlock("hieu")
    expect(block).toMatch(/còn \d+ mục cũ hơn không nạp/)
  })

  it("chưa chạy migration → không làm hỏng chat (khối rỗng) và tool báo cách sửa", async () => {
    selectResult = { data: null, error: { message: 'relation "assistant_memory" does not exist' } }
    expect(await buildMemoryBlock("hieu")).toBe("")
    const r = await runAssistantMemory({ action: "list" }, "hieu", "test")
    expect(r.error).toContain("v63_assistant_memory.sql")
  })

  it("save cắt 500 ký tự, kind lạ → other", async () => {
    const r = await runAssistantMemory({ action: "save", kind: "abc", content: "y".repeat(800) }, "hieu", "test")
    expect(r.result.saved).toBe(7)
    expect((inserted[0] as any).kind).toBe("other")
    expect((inserted[0] as any).content).toHaveLength(500)
  })

  it("validate tham số", async () => {
    expect((await runAssistantMemory({ action: "save" }, "hieu", "t")).error).toBeTruthy()
    expect((await runAssistantMemory({ action: "update" }, "hieu", "t")).error).toContain("id")
    expect((await runAssistantMemory({ action: "save", content: "a" }, "", "t")).error).toBeTruthy()
    expect((await runAssistantMemory({ action: "nope" }, "hieu", "t")).error).toBeTruthy()
  })
})
