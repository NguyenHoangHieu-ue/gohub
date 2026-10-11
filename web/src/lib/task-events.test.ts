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

import { loadChatEvents, isCountedTask, taskSource } from "./task-events"
import { isDataTask } from "./okr-helpers"

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

describe("isDataTask (s230)", () => {
  it("tính tool đọc dữ liệu mới: GA4/GSC/Lark Base/báo cáo", () => {
    for (const t of ["executeSQL", "queryGA4", "queryGSC", "queryLarkBase", "buildReport", "b2bCustomerCm1", "compareVendorQuotes", "trackSKUWinRate"])
      expect(isDataTask([t], "staff")).toBe(true)
  })
  it("không tính web search/KB/trả lời chay", () => {
    expect(isDataTask(["webSearch", "readKnowledgeBase"], "staff")).toBe(false)
    expect(isDataTask(null, "staff")).toBe(false)
    expect(isDataTask([], "staff")).toBe(false)
  })
  it("câu của Creator không tính", () => {
    expect(isDataTask(["executeSQL"], "creator")).toBe(false)
  })
})

describe("taskSource", () => {
  it("phân nguồn theo agent_id và user_email", () => {
    expect(taskSource({ agent_id: "be-gau-job", user_email: "a" })).toBe("job")
    expect(taskSource({ agent_id: "be-gau-live", user_email: "a" })).toBe("live")
    expect(taskSource({ agent_id: "be-gau", user_email: "lark:ou_1" })).toBe("lark")
    expect(taskSource({ agent_id: "gau_pro", user_email: "a@b.c" })).toBe("web")
  })
})
