import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
vi.mock("@/lib/lark", () => ({ getLarkToken: async () => "tok", getLarkUserInfo: async () => null }))
vi.mock("@/lib/argon/context", () => ({ countTokens: async () => 1, sourceParts: async () => [] }))
vi.mock("@/lib/argon/ingest", () => ({ ingestBuffer: async () => ({}) }))
vi.mock("@/lib/argon/mail", () => ({ ATTACH_EXT: /\.(pdf|docx|xlsx|pptx|csv|txt|md)$/i, MAX_ATTACH_BYTES: 15 * 1024 * 1024 }))

import { fetchGroupThreads, sanitizeThreadRule, threadTitle, threadToText, type ThreadData } from "@/lib/argon/threads"
import { quickPromptsFor, templateById } from "@/lib/argon/templates"

const NOW = Date.now()
const msg = (id: string, over: Record<string, unknown> = {}) => ({
  message_id: id, msg_type: "text", create_time: String(NOW - 3600_000), sender: { id: "ou_a", sender_type: "user" }, body: { content: JSON.stringify({ text: `nội dung ${id}` }) }, ...over,
})
const ok = (data: unknown) => ({ json: async () => ({ code: 0, data }) })

afterEach(() => vi.unstubAllGlobals())

describe("fetchGroupThreads", () => {
  it("gom trả lời theo tin gốc, đọc cả thread, lấy tin gốc nằm ngoài cửa sổ, bỏ tin lẻ khi minReplies=1", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("container_id_type=chat")) {
        return ok({ items: [
          msg("A", { thread_id: "T1", create_time: String(NOW - 7200_000) }),
          msg("A1", { root_id: "A", thread_id: "T1", create_time: String(NOW - 3600_000) }),
          msg("B"),
          msg("C1", { root_id: "OLD", create_time: String(NOW - 1800_000) }),
        ], has_more: false })
      }
      if (url.includes("container_id_type=thread")) return ok({ items: [msg("A", { thread_id: "T1" }), msg("A1", { root_id: "A", thread_id: "T1" }), msg("A2", { root_id: "A", thread_id: "T1", create_time: String(NOW - 600_000) })], has_more: false })
      if (url.includes("/im/v1/messages/OLD")) return ok({ items: [msg("OLD", { create_time: String(NOW - 5 * 86_400_000) })] })
      return ok({ items: [] })
    }))
    const out = await fetchGroupThreads({ chatId: "oc_1", sinceDays: 7, maxThreads: 10, minReplies: 1 })
    expect(out.map(t => t.rootId)).toEqual(["OLD", "A"])
    const a = out.find(t => t.rootId === "A")!
    expect(a.messages.map(m => m.id)).toEqual(["A", "A1", "A2"])
    const old = out.find(t => t.rootId === "OLD")!
    expect(old.messages.map(m => m.id)).toEqual(["OLD", "C1"])
    expect(out.some(t => t.rootId === "B")).toBe(false)
  })

  it("group kiểu chủ đề (danh sách chỉ có trả lời): tin gốc lấy từ container thread, không gọi lấy-theo-id", async () => {
    const byId = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("container_id_type=chat")) return ok({ items: [msg("R1", { root_id: "ROOT", thread_id: "T9" }), msg("R2", { root_id: "ROOT", thread_id: "T9", create_time: String(NOW - 600_000) })], has_more: false })
      if (url.includes("container_id_type=thread")) return ok({ items: [msg("ROOT", { thread_id: "T9", create_time: String(NOW - 7200_000) }), msg("R1", { root_id: "ROOT", thread_id: "T9" }), msg("R2", { root_id: "ROOT", thread_id: "T9" })], has_more: false })
      byId(url); return ok({ items: [] })
    }))
    const out = await fetchGroupThreads({ chatId: "oc_1", sinceDays: 7, maxThreads: 5, minReplies: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].messages.map(m => m.id)).toEqual(["ROOT", "R1", "R2"])
    expect(byId).not.toHaveBeenCalled()
  })

  it("tin rich-text giữ từng hàng một dòng, thay @mention bằng tên, ảnh trong bài thành file đính kèm", async () => {
    const post = { title: "", content: [[{ tag: "text", text: "Cập nhật:" }], [{ tag: "text", text: "1. " }, { tag: "at", user_id: "@_user_1", user_name: "Huy Lê" }, { tag: "text", text: " check giúp" }], [{ tag: "img", image_key: "img_k1" }]] }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("container_id_type=chat")
      ? ok({ items: [msg("P", { msg_type: "post", body: { content: JSON.stringify(post) }, mentions: [{ key: "@_user_1", id: "ou_h", name: "Huy Lê" }] })], has_more: false })
      : ok({ items: [] }))))
    const [th] = await fetchGroupThreads({ chatId: "oc_1", sinceDays: 7, maxThreads: 5, minReplies: 0 })
    expect(th.messages[0].text).toBe("Cập nhật:\n1. @Huy Lê check giúp\n[ảnh]")
    expect(th.messages[0].files).toEqual([{ key: "img_k1", name: "ảnh", kind: "image" }])
    expect(th.messages[0].mentions).toEqual([{ id: "ou_h", name: "Huy Lê" }])
  })

  it("minReplies=0 giữ cả tin lẻ; maxThreads cắt theo hoạt động gần nhất", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("container_id_type=chat")
      ? ok({ items: [msg("B", { create_time: String(NOW - 1000) }), msg("D", { create_time: String(NOW - 9000) })], has_more: false })
      : ok({ items: [] }))))
    const out = await fetchGroupThreads({ chatId: "oc_1", sinceDays: 7, maxThreads: 1, minReplies: 0 })
    expect(out.map(t => t.rootId)).toEqual(["B"])
  })
})

describe("threadToText", () => {
  const data: ThreadData = {
    rootId: "A", threadId: "T1",
    messages: [
      { id: "A", senderId: "ou_a", senderType: "user", ms: Date.UTC(2026, 9, 12, 2, 30), type: "text", text: "Vendor báo tăng giá 3HK", files: [] },
      { id: "A1", senderId: "ou_b", senderType: "user", ms: Date.UTC(2026, 9, 12, 3, 0), type: "file", text: "[file bao-gia.xlsx]", files: [{ key: "fk", name: "bao-gia.xlsx", kind: "file" }] },
    ],
  }
  it("có đầu thread, người tham gia, giờ Việt Nam, tên người và liên kết tới nguồn đính kèm", () => {
    const t = threadToText("Telecom Products", data, { ou_a: "Hiếu", ou_b: "Lan" }, { fk: "📎 bao-gia.xlsx — thread" })
    expect(t).toContain('Thread trong nhóm "Telecom Products"')
    expect(t).toContain("1 trả lời")
    expect(t).toContain("Người tham gia: Hiếu, Lan")
    expect(t).toContain("[12/10 09:30] Hiếu (tin gốc): Vendor báo tăng giá 3HK")
    expect(t).toContain('Lan: [đính kèm: bao-gia.xlsx → nguồn "📎 bao-gia.xlsx — thread"]')
  })
  it("tiêu đề thread lấy từ tin gốc, rút gọn", () => {
    expect(threadTitle(data)).toBe("Vendor báo tăng giá 3HK")
  })
})

describe("sanitizeThreadRule / templates", () => {
  it("kẹp giá trị về khoảng hợp lệ, mặc định lấy file, không lấy ảnh", () => {
    const r = sanitizeThreadRule({ chatId: "oc_1", sinceDays: 9999, maxThreads: 0, minReplies: -3 })
    expect(r).toMatchObject({ sinceDays: 180, maxThreads: 30, minReplies: 0, files: true, images: false })
    expect(sanitizeThreadRule({ chatId: "x", minReplies: undefined }).minReplies).toBe(1)
  })
  it("câu hỏi gợi ý theo loại nguồn; mẫu dự án tồn tại", () => {
    expect(quickPromptsFor({ mail: false, threads: false }).length).toBeGreaterThan(0)
    expect(quickPromptsFor({ mail: true, threads: false })[0].label).toContain("mail")
    expect(quickPromptsFor({ mail: false, threads: true })[0].label).toContain("thread")
    expect(templateById("mail")?.instructions).toContain("Kết luận")
    expect(templateById("nope")).toBeUndefined()
  })
})
