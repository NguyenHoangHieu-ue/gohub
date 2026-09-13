/**
 * Eval harness (đề xuất F, roadmap audit Tổ Gấu s196+5) — Gấu Tổ AI trước không có test nào. Logic
 * agent nằm trong 1 route.ts (streaming SSE) nên không port được pattern LLM-judge live-DB như Bé Gấu/
 * Gấu Pro mà không refactor lớn; thay vào đó tách 2 phần THUẦN nhạy cảm nhất (đã từng gây bug thật/rủi ro
 * bảo mật) ra lib/to-gau-ai-helpers.ts và test deterministic — chạy trong suite thường, không cần Gemini.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

function makeChain(result: any, calls: any[]) {
  const chain: any = {
    select: () => chain,
    eq:  (...args: any[]) => { calls.push(["eq", ...args]); return chain },
    neq: (...args: any[]) => { calls.push(["neq", ...args]); return chain },
    or:  (...args: any[]) => { calls.push(["or", ...args]); return chain },
    limit: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

const fromCalls: Record<string, any[]> = {}
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      fromCalls[table] = fromCalls[table] || []
      return makeChain({ data: [], error: null }, fromCalls[table])
    },
  },
}))

import { buildChatHistory, isSummaryRequest, searchKB } from "@/lib/to-gau-ai-helpers"

describe("buildChatHistory — merge turn liên tiếp cùng role + cắt turn model đứng đầu", () => {
  it("merge nhiều turn 'user' liên tiếp thành 1 (group chat nhiều người nói liền nhau)", () => {
    const result = buildChatHistory([
      { role: "user", text: "Hiếu: câu 1" },
      { role: "user", text: "Ngọc: câu 2" },
      { role: "model", text: "Trả lời" },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe("user")
    expect(result[0].parts[0].text).toBe("Hiếu: câu 1\nNgọc: câu 2")
    expect(result[1].role).toBe("model")
  })

  it("cắt bỏ turn 'model' đứng đầu — lỗi thật đã gặp trên staging nếu không cắt", () => {
    const result = buildChatHistory([
      { role: "model", text: "AI nói trước (tin cũ nhất trong 20 tin tình cờ là câu trả lời AI)" },
      { role: "user", text: "Câu hỏi" },
    ])
    expect(result[0]?.role).toBe("user")
    expect(result.some(t => t.role === "model" && t.parts[0].text.includes("AI nói trước"))).toBe(false)
  })

  it("toàn bộ history chỉ có turn 'model' → trả mảng rỗng (không còn turn nào để gửi)", () => {
    const result = buildChatHistory([
      { role: "model", text: "A" },
      { role: "model", text: "B" },
    ])
    expect(result).toHaveLength(0)
  })

  it("history rỗng → trả mảng rỗng", () => {
    expect(buildChatHistory([])).toEqual([])
  })

  it("role luân phiên đúng chuẩn (user/model/user) → giữ nguyên không merge nhầm", () => {
    const result = buildChatHistory([
      { role: "user", text: "Hỏi 1" },
      { role: "model", text: "Đáp 1" },
      { role: "user", text: "Hỏi 2" },
    ])
    expect(result.map(t => t.role)).toEqual(["user", "model", "user"])
  })
})

describe("isSummaryRequest — phát hiện ý định tóm tắt", () => {
  it("nhận diện 'tóm tắt'", () => { expect(isSummaryRequest("tóm tắt hộ 50 tin gần nhất")).toBe(true) })
  it("nhận diện 'tóm lược'", () => { expect(isSummaryRequest("tóm lược cuộc thảo luận vừa rồi")).toBe(true) })
  it("nhận diện 'summary' không phân biệt hoa/thường", () => { expect(isSummaryRequest("give me a SUMMARY please")).toBe(true) })
  it("câu hỏi thường KHÔNG bị nhận nhầm", () => { expect(isSummaryRequest("giá gói eSIM Nhật bao nhiêu?")).toBe(false) })
})

// searchKB — group-scoping (đúng lớp bug/rủi ro đã fix P0 cho Gấu Pro s196+5: quên gate theo phạm vi).
describe("searchKB — group-scoping (chat_docs/chat_notes PHẢI lọc đúng group_id)", () => {
  beforeEach(() => { for (const k of Object.keys(fromCalls)) delete fromCalls[k] })

  it("query chat_docs/chat_notes có .eq('group_id', <đúng groupId truyền vào>), không lẫn group khác", async () => {
    await searchKB("giá vốn gói Nhật bản là bao nhiêu", true, "group-A")

    expect(fromCalls["chat_docs"]).toContainEqual(["eq", "group_id", "group-A"])
    expect(fromCalls["chat_notes"]).toContainEqual(["eq", "group_id", "group-A"])
    expect(fromCalls["chat_docs"].find(c => c[0] === "eq" && c[1] === "group_id" && c[2] !== "group-A")).toBeUndefined()
  })

  it("gọi cho group khác (group-B) → filter group_id đổi theo, không dính group-A", async () => {
    await searchKB("giá vốn gói Nhật bản là bao nhiêu", true, "group-B")
    expect(fromCalls["chat_docs"]).toContainEqual(["eq", "group_id", "group-B"])
    expect(fromCalls["chat_docs"].find(c => c[0] === "eq" && c[1] === "group_id" && c[2] === "group-A")).toBeUndefined()
  })

  it("non-privileged (staff thường) → wiki query lọc is_hidden=false + loại tab_guide", async () => {
    await searchKB("cấu trúc mã SKU", false, "group-A")
    expect(fromCalls["kb_wiki_pages"]).toContainEqual(["eq", "is_hidden", false])
    expect(fromCalls["kb_wiki_pages"]).toContainEqual(["neq", "page_type", "tab_guide"])
  })

  it("privileged (admin/creator) → wiki query KHÔNG bị ép is_hidden/page_type", async () => {
    await searchKB("cấu trúc mã SKU", true, "group-A")
    expect(fromCalls["kb_wiki_pages"].find(c => c[0] === "eq" && c[1] === "is_hidden")).toBeUndefined()
  })
})
