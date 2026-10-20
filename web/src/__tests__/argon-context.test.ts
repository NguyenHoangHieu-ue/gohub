import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { storage: { from: () => ({ download: async () => ({ data: null, error: { message: "x" } }) }) } } }))
vi.mock("@/lib/agents/genai-stream", () => ({ genai: () => ({ models: { countTokens: async () => ({ totalTokens: 1 }) } }) }))

import { buildRunContext, sourceParts } from "@/lib/argon/context"
import type { ArgonProject, ArgonRun, ArgonSource } from "@/lib/argon/server"

const project: ArgonProject = { id: "p", username: "hieu", name: "Dự án thử", notes: "Quyết định: giữ 3HK trước.", instructions: "", created_at: "", updated_at: "" }
const src = (id: string, name: string, text: string, over: Partial<ArgonSource> = {}): ArgonSource => ({
  id, project_id: "p", kind: "note", name, mime: "text/markdown", size_bytes: text.length, storage_path: null, extracted_text: text, send_binary: false, tokens: 1,
  content_hash: null, external_url: null, external_id: null, sync_mode: null, synced_at: null, enabled: true, pinned: false, version: 1, meta: {},
  created_at: `2026-10-0${id}T00:00:00Z`, updated_at: "", ...over,
})
const run = (id: string, prompt: string, answer: string): ArgonRun => ({
  id, project_id: "p", username: "hieu", prompt, answer, status: "done", model: null, thinking: null, source_ids: [], tokens_in: 0, tokens_out: 0, cached_in: 0,
  cost_usd: 0, duration_ms: 0, segments: 1, error: null, created_at: "", finished_at: null,
})

describe("buildRunContext", () => {
  it("xếp sổ dự án trước, nguồn ghim trước nguồn thường, rồi lịch sử, rồi yêu cầu mới", async () => {
    const ctx = await buildRunContext({ project, sources: [src("1", "A", "nội dung A"), src("2", "B", "nội dung B", { pinned: true })], priorRuns: [run("r1", "hỏi 1", "đáp 1")], prompt: "hỏi 2" })
    const lead = ctx.contents[0].parts!.map(p => p.text).join("\n")
    expect(lead.indexOf("<so_du_an>")).toBeLessThan(lead.indexOf('ten="B"'))
    expect(lead.indexOf('ten="B"')).toBeLessThan(lead.indexOf('ten="A"'))
    expect(ctx.contents.map(c => c.role)).toEqual(["user", "model", "user", "model", "user"])
    expect(ctx.contents[ctx.contents.length - 1].parts![0].text).toBe("hỏi 2")
    expect(ctx.usedSourceIds).toEqual(["2", "1"])
  })
  it("bỏ nguồn rỗng; không có nguồn thì không dựng khối tài liệu", async () => {
    const ctx = await buildRunContext({ project: { ...project, notes: "" }, sources: [src("1", "Trống", "  ")], priorRuns: [], prompt: "chào" })
    expect(ctx.usedSourceIds).toEqual([])
    expect(ctx.contents).toHaveLength(1)
  })
  it("tiếp tục: nạp câu trả lời dở làm lượt model rồi yêu cầu viết tiếp, không lặp lại lượt đó trong lịch sử", async () => {
    const dở = run("r2", "viết báo cáo", "Phần 1…")
    const ctx = await buildRunContext({ project, sources: [], priorRuns: [run("r1", "hỏi 1", "đáp 1"), dở], prompt: "", resumeRun: dở })
    const texts = ctx.contents.map(c => c.parts![0].text)
    expect(texts.filter(t => t === "viết báo cáo")).toHaveLength(1)
    expect(texts[texts.length - 2]).toBe("Phần 1…")
    expect(texts[texts.length - 1]).toMatch(/Tiếp tục NGAY/)
  })
  it("file gốc vượt ngân sách nhúng còn lại thì bỏ và cảnh báo", async () => {
    const f = src("1", "Video", "", { kind: "file", send_binary: true, storage_path: "x", size_bytes: 5 * 1024 * 1024, mime: "video/mp4" })
    const warnings: string[] = []
    const parts = await sourceParts(f, { left: 1024 * 1024 }, warnings)
    expect(warnings[0]).toMatch(/quá lớn/)
    expect(parts).toEqual([])
  })
})

describe("buildRunContext — sứ mệnh", () => {
  it("khối sổ tay sứ mệnh đứng đầu tài liệu; chỉ dẫn theo pha + ghi chú sứ mệnh nằm trong system prompt; không có mission thì không có", async () => {
    const withM = await buildRunContext({ project, sources: [], priorRuns: [], prompt: "hỏi", mission: { block: "<su_menh pha=\"plan\">X</su_menh>", instruction: "PHA KẾ HOẠCH: soạn kế hoạch" } })
    const lead = withM.contents[0].parts!.map(p => p.text).join("\n")
    expect(lead.indexOf("<su_menh")).toBeLessThan(lead.indexOf("<so_du_an>"))
    expect(withM.systemInstruction).toContain("PHA KẾ HOẠCH")
    expect(withM.systemInstruction).toContain("SỨ MỆNH")
    const without = await buildRunContext({ project, sources: [], priorRuns: [], prompt: "hỏi" })
    expect(without.systemInstruction).not.toContain("lietKeFile")
  })
})
