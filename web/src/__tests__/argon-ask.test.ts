import { beforeEach, describe, expect, it, vi } from "vitest"
import { askBlock, execAsk, normalizeAsk } from "@/lib/argon/ask-tool"
import { chotLine, PLAN_PATH, phaseInstruction } from "@/lib/argon/missions"

describe("hoiHieu", () => {
  it("chuẩn hoá câu hỏi và lựa chọn (cắt dài, tối đa 6, bỏ rỗng)", () => {
    const a = normalizeAsk({ cauHoi: "  Có đổi vendor Nhật không?  ", luaChon: ["Có", " ", "Không", "x".repeat(300), "4", "5", "6", "7"] })
    expect("error" in a).toBe(false)
    if (!("error" in a)) { expect(a.question).toBe("Có đổi vendor Nhật không?"); expect(a.options).toHaveLength(6); expect(a.options[2].length).toBe(120) }
    expect("error" in normalizeAsk({ cauHoi: "  " })).toBe(true)
  })
  it("askBlock: hiện câu hỏi + lựa chọn trong chat", () => {
    expect(askBlock({ cauHoi: "Chọn nguồn?", luaChon: ["A", "B"] })).toContain("❓ **Cần anh quyết:** Chọn nguồn?\n- A\n- B")
    expect(askBlock({})).toBe("")
  })
  let saved: unknown, msg: string
  beforeEach(() => { saved = null; msg = "" })
  const deps = (over: { notify?: () => Promise<void>; save?: () => Promise<void> } = {}) => ({
    save: over.save ?? (async (_id: string, ask: unknown) => { saved = ask }),
    notify: over.notify ?? (async (t: string) => { msg = t }),
  })
  const ctx = { missionId: "m1", missionName: "Giữ %Datapool", phase: "run" as const, origin: "https://x.test" }
  it("lưu câu hỏi chờ + nhắn Lark có link; báo ok để engine dừng", async () => {
    const r = await execAsk({ cauHoi: "Dùng BC hay 3HK?", luaChon: ["BC", "3HK"] }, ctx, deps())
    expect(r.ok).toBe(true)
    expect(saved).toMatchObject({ question: "Dùng BC hay 3HK?", options: ["BC", "3HK"] })
    expect(msg).toContain("Giữ %Datapool"); expect(msg).toContain("1. BC"); expect(msg).toContain("https://x.test/analytics/creator/argon")
  })
  it("Lark lỗi vẫn giữ câu hỏi (hiện trong chat); lưu lỗi thì báo không ok", async () => {
    expect((await execAsk({ cauHoi: "Q?" }, ctx, deps({ notify: async () => { throw new Error("lark down") } }))).ok).toBe(true)
    const bad = await execAsk({ cauHoi: "Q?" }, ctx, deps({ save: async () => { throw new Error("db") } }))
    expect(bad.ok).toBe(false)
    expect((await execAsk({}, ctx, deps())).ok).toBe(false)
  })
})

describe("Chốt: dấu vào decisions.md + chỉ dẫn pha", () => {
  it("chotLine: ngày theo giờ VN, nêu phiên bản kế hoạch hoặc báo chưa có", () => {
    expect(chotLine(new Date("2026-10-20T20:00:00Z"), 3)).toBe(`- 21/10/2026: Hiếu CHỐT kế hoạch (${PLAN_PATH} bản v3). Argon bắt đầu làm.`)
    expect(chotLine(new Date("2026-10-20T05:00:00Z"), null)).toContain("chưa có file kế hoạch")
  })
  it("chỉ dẫn pha kế hoạch bắt ghi file kế hoạch; pha chạy bắt đọc kế hoạch và dùng hoiHieu", () => {
    expect(phaseInstruction("plan")).toContain("notes/ke-hoach.md")
    expect(phaseInstruction("run")).toContain("hoiHieu")
    expect(phaseInstruction("run")).toContain("notes/tong-ket.md")
  })
})

// Engine: sau khi hoiHieu thành công, lượt dừng ngay (không gọi model lần nữa) và câu hỏi được đẩy vào câu trả lời.
const streamCalls: unknown[] = []
vi.mock("@/lib/agents/genai-stream", () => ({
  genai: () => ({ models: { generateContentStream: async (req: unknown) => {
    streamCalls.push(req)
    async function* gen() { yield { candidates: [{ content: { parts: [{ text: "Em cần hỏi." }, { functionCall: { name: "hoiHieu", args: { cauHoi: "Chọn A hay B?", luaChon: ["A", "B"] } } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } }
    return gen()
  } } }),
}))
vi.mock("@/lib/argon/ws-tools", () => ({
  MISSION_TOOL_NAMES: ["docFile", "ghiFile", "lietKeFile", "sql", "run_code", "hoiHieu"], WS_TOOLS: [],
  execMissionAsk: async (args: Record<string, unknown>) => ({ name: "hoiHieu", args, ok: true, chars: 1, result: "ok", at: "" }),
  execMissionCode: async () => { throw new Error("không được gọi") }, execMissionSql: async () => { throw new Error("không được gọi") }, execWsTool: async () => { throw new Error("không được gọi") },
}))

describe("run-engine dừng sau hoiHieu", () => {
  it("không vòng lại model, answer có khối ❓", async () => {
    const { runSegment } = await import("@/lib/argon/run-engine")
    const log: never[] = []
    let text = ""
    const seg = await runSegment({
      ctx: { systemInstruction: "s", contents: [], usedSourceIds: [], warnings: [] }, thinking: "low", segmentMs: 5000, maxOut: 100,
      tools: { origin: "http://x", log, dataTools: false, missionId: "m1", onTool: () => {} }, onDelta: t => { text += t },
    })
    expect(seg.status).toBe("done")
    expect(streamCalls).toHaveLength(1)
    expect(text).toContain("Em cần hỏi.")
    expect(text).toContain("❓ **Cần anh quyết:** Chọn A hay B?")
    expect(seg.added).toContain("- A\n- B")
  })
})
