import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

let insertedRows: any[] = []
let statusSequence: { status: string; result?: any; error?: string }[] = []
let selectCallCount = 0

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: (row: any) => {
        insertedRows.push(row)
        return {
          select: () => ({
            single: async () => ({ data: { id: "cmd-1" }, error: null }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const row = statusSequence[Math.min(selectCallCount, statusSequence.length - 1)]
            selectCallCount++
            return { data: row, error: null }
          },
        }),
      }),
    })),
  },
}))

import { runReadMyBrowser, runControlMyBrowser } from "@/lib/agents/creator/tools/bridge"

describe("bridge tool — enqueueAndPoll", () => {
  beforeEach(() => {
    insertedRows = []
    statusSequence = []
    selectCallCount = 0
    vi.useFakeTimers()
  })
  afterEach(() => { vi.useRealTimers() })

  it("action đọc (list_tabs) → requires_confirm=false khi insert", async () => {
    statusSequence = [{ status: "done", result: [{ id: 1, title: "Tab A" }] }]
    const p = runReadMyBrowser({ action: "list_tabs" })
    await vi.advanceTimersByTimeAsync(2000)
    const res = await p
    expect(insertedRows[0].requires_confirm).toBe(false)
    expect(insertedRows[0].action).toBe("list_tabs")
    expect(res.result).toEqual([{ id: 1, title: "Tab A" }])
  })

  it("action click → requires_confirm=true khi insert", async () => {
    statusSequence = [{ status: "done", result: { ok: true } }]
    const p = runControlMyBrowser({ action: "click", tab_id: 5, selector: "#submit" })
    await vi.advanceTimersByTimeAsync(2000)
    await p
    expect(insertedRows[0].requires_confirm).toBe(true)
    expect(insertedRows[0].action).toBe("click")
    expect(insertedRows[0].payload.selector).toBe("#submit")
  })

  it("action scroll → requires_confirm=false (không cần duyệt)", async () => {
    statusSequence = [{ status: "done", result: { ok: true } }]
    const p = runControlMyBrowser({ action: "scroll", tab_id: 5 })
    await vi.advanceTimersByTimeAsync(2000)
    await p
    expect(insertedRows[0].requires_confirm).toBe(false)
  })

  it("thiếu tab_id ở controlMyBrowser → lỗi rõ ràng, không insert", async () => {
    const res = await runControlMyBrowser({ action: "click", tab_id: 0, selector: "#x" })
    expect(res.error).toMatch(/tab_id/)
    expect(insertedRows.length).toBe(0)
  })

  it("status=error → trả về error message từ row", async () => {
    statusSequence = [{ status: "error", error: "selector không tồn tại" }]
    const p = runControlMyBrowser({ action: "click", tab_id: 5, selector: "#missing" })
    await vi.advanceTimersByTimeAsync(2000)
    const res = await p
    expect(res.error).toBe("selector không tồn tại")
  })

  it("timeout (luôn pending) → trả lỗi thân thiện, không throw", async () => {
    statusSequence = [{ status: "pending" }]
    const p = runReadMyBrowser({ action: "read_tab" })
    // maxPolls cho action đọc = 60s / 2s = 30 lần
    for (let i = 0; i < 31; i++) await vi.advanceTimersByTimeAsync(2000)
    const res = await p
    expect(res.error).toMatch(/Bridge chưa phản hồi/)
  })
})
