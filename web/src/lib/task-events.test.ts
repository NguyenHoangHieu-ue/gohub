import { describe, it, expect, vi } from "vitest"

const TOTAL = 2500
const data = Array.from({ length: TOTAL }, (_, i) => ({ id: i + 1, used_db_tool: true, ai_response: "x".repeat(20) }))

vi.mock("@/lib/supabase", () => {
  const chain: any = {
    select: () => chain, eq: () => chain, not: () => chain, gte: () => chain, lte: () => chain, order: () => chain,
    range: (a: number, b: number) => Promise.resolve({ data: data.slice(a, Math.min(b, a + 999) + 1), error: null }),
  }
  return { supabaseAdmin: { from: () => chain } }
})

import { loadChatEvents, isCountedTask } from "./task-events"

describe("loadChatEvents", () => {
  it("đọc đủ dòng khi vượt 1.000 dòng/lần", async () => {
    const { rows, error } = await loadChatEvents("id", "2026-07-01", "2026-09-30")
    expect(error).toBeUndefined()
    expect(rows).toHaveLength(TOTAL)
    expect(rows.filter(isCountedTask)).toHaveLength(TOTAL)
  })

  it("loại câu quá ngắn hoặc không dùng tool", () => {
    expect(isCountedTask({ used_db_tool: true, ai_response: "ok" })).toBe(false)
    expect(isCountedTask({ used_db_tool: false, ai_response: "x".repeat(30) })).toBe(false)
  })
})
