import { describe, it, expect, vi, beforeEach } from "vitest"

let selectResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }
const inserted: unknown[] = []
const updates: any[] = []
let queue: { data: unknown; error: { message: string } | null }[] = []   // kết quả trả lần lượt (nếu rỗng dùng selectResult)

// Chain giả của supabase-js: mọi method lọc trả lại chính nó, await → selectResult.
function chain(): any {
  const c: any = {
    select: () => c, eq: () => c, order: () => c, limit: () => c, ilike: () => c,
    update: (patch: unknown) => { updates.push(patch); return c },
    insert: (row: unknown) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) } },
    then: (res: (v: unknown) => unknown) => Promise.resolve(queue.length ? queue.shift() : selectResult).then(res),
  }
  return c
}
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => chain() } }))

import { buildMemoryBlock, runAssistantMemory, rankMemories } from "@/lib/assistant-memory"

describe("assistant memory", () => {
  beforeEach(() => { selectResult = { data: [], error: null }; inserted.length = 0; updates.length = 0; queue = [] })

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

  it("v72: nạp kèm giá trị cũ (⟲ trước đây), mới nhất trước", async () => {
    selectResult = { data: [{ id: 3, kind: "project", content: "Phụ trách Châu Âu", pinned: false, updated_at: "",
      history: [{ c: "Phụ trách Hàn Quốc", at: "2026-08-01T00:00:00Z" }, { c: "Phụ trách Nhật", at: "2026-09-02T00:00:00Z" }] }], error: null }
    const block = await buildMemoryBlock("hieu")
    expect(block).toContain('⟲ trước đây: "Phụ trách Nhật" (đến 2026-09-02); "Phụ trách Hàn Quốc" (đến 2026-08-01)')
  })

  it("v72: update đổi nội dung → đẩy giá trị cũ vào history, tối đa 5 bản", async () => {
    const old = Array.from({ length: 5 }, (_, i) => ({ c: `v${i}`, at: "2026-01-01" }))
    selectResult = { data: [{ id: 3, content: "Gói 10 ngày", history: old }], error: null }
    const r = await runAssistantMemory({ action: "update", id: 3, content: "Gói 7 ngày" }, "hieu", "test")
    expect(r.result.updated).toBe(3)
    const patch = updates[0]
    expect(patch.content).toBe("Gói 7 ngày")
    expect(patch.history).toHaveLength(5)
    expect(patch.history[4].c).toBe("Gói 10 ngày")
    expect(patch.history[0].c).toBe("v1")
  })

  it("v72: update cùng nội dung → không thêm history", async () => {
    selectResult = { data: [{ id: 3, content: "Gói 7 ngày", history: [] }], error: null }
    await runAssistantMemory({ action: "update", id: 3, content: "Gói 7 ngày" }, "hieu", "test")
    expect(updates[0].history).toBeUndefined()
  })

  it("chưa chạy v72 → đọc lại không có cột history, không làm hỏng chat", async () => {
    queue = [{ data: null, error: { message: "column assistant_memory.history does not exist" } }]
    selectResult = { data: [{ id: 1, kind: "other", content: "abc", pinned: false, updated_at: "" }], error: null }
    const block = await buildMemoryBlock("hieu")
    expect(block).toContain("[#1] (Khác) abc")
  })

  it("validate tham số", async () => {
    expect((await runAssistantMemory({ action: "save" }, "hieu", "t")).error).toBeTruthy()
    expect((await runAssistantMemory({ action: "update" }, "hieu", "t")).error).toContain("id")
    expect((await runAssistantMemory({ action: "save", content: "a" }, "", "t")).error).toBeTruthy()
    expect((await runAssistantMemory({ action: "nope" }, "hieu", "t")).error).toBeTruthy()
  })

  it("rankMemories: ưu tiên mục chứa tên riêng hiếm, bỏ qua dấu tiếng Việt, vẫn kèm mục mới nhất", () => {
    const rows = [
      { id: 1, kind: "profile", content: "Tên là Minh Anh, làm Account Manager" },
      ...Array.from({ length: 200 }, (_, i) => ({ id: 100 + i, kind: "project", content: `Khách Công ty ${i} thuộc thị trường Nhật Bản` })),
      { id: 999, kind: "project", content: "Khách Zephyr Voyages đầu mối anh Hải, mục tiêu 300 SIM" },
    ]
    const out = rankMemories("Khách zephyr voyages đổi đầu mối sang chị Chi", rows, 5, 2)
    expect(out[0].id).toBe(999)
    expect(out.map(r => r.id)).toContain(1)   // mục mới nhất (đứng đầu mảng) làm ngữ cảnh nền
    expect(out.length).toBeLessThanOrEqual(7)
    expect(rankMemories("Phụ trách Châu Âu", [{ id: 5, kind: "x", content: "Phu trach chau au tu 1/9" }], 3, 0)[0].id).toBe(5)
  })

  it("rankMemories: không có từ chung → chỉ trả mục mới nhất", () => {
    const rows = [{ id: 1, kind: "x", content: "alpha beta" }, { id: 2, kind: "x", content: "gamma delta" }]
    expect(rankMemories("zzz qqq", rows, 5, 1).map(r => r.id)).toEqual([1])
    expect(rankMemories("abc", [], 5, 1)).toEqual([])
  })
})
