import { describe, it, expect, vi } from "vitest"

const turns: any[] = []
const streamTurn = vi.fn(async () => turns.shift())
vi.mock("@/lib/agents/genai-stream", () => ({ streamTurn: (...a: unknown[]) => (streamTurn as any)(...a) }))
import { runAgentLoop } from "@/lib/agents/core/agent-loop"

const turn = (calls: { name: string }[], text = "", finishReason = "STOP") => ({
  content: { role: "model", parts: calls.map(c => ({ functionCall: { name: c.name, args: {} } })).concat(text ? [{ text } as any] : []) },
  functionCalls: calls.map(c => ({ name: c.name, args: {} })), text, tokensIn: 1, tokensOut: 1, finishReason,
})

describe("agent-loop — stopWhen (P3c: Argon dừng ngay sau khi hỏi người dùng)", () => {
  it("stopWhen=true sau vòng công cụ → không gọi model thêm lần nữa, kết quả công cụ đã nằm trong contents", async () => {
    turns.length = 0; streamTurn.mockClear()
    turns.push(turn([{ name: "hoiHieu" }]), turn([], "không được gọi"))
    let asked = false
    const contents: any[] = [{ role: "user", parts: [{ text: "x" }] }]
    const loop = await runAgentLoop({
      model: "m", contents, configFor: () => ({}), maxRounds: 5,
      runTool: async c => { asked = true; return { functionResponse: { name: c.name ?? "", response: { ok: true } } } },
      stopWhen: () => asked,
    })
    expect(streamTurn).toHaveBeenCalledTimes(1)
    expect(loop.toolsUsed.has("hoiHieu")).toBe(true)
    expect(contents.some(c => c.role === "user" && c.parts.some((p: any) => p.functionResponse))).toBe(true)
  })
  it("không có stopWhen → chạy tiếp như cũ; finishReason của lượt cuối được trả về", async () => {
    turns.length = 0; streamTurn.mockClear()
    turns.push(turn([{ name: "a" }]), turn([], "xong", "MAX_TOKENS"))
    const loop = await runAgentLoop({ model: "m", contents: [], configFor: () => ({}), maxRounds: 5, runTool: async c => ({ functionResponse: { name: c.name ?? "", response: {} } }) })
    expect(streamTurn).toHaveBeenCalledTimes(2)
    expect(loop.last.finishReason).toBe("MAX_TOKENS")
  })
})

import { flagValueOn } from "@/lib/argon/core-loop-flag"
describe("cờ argon_core_loop", () => {
  it('"1" bật mọi nơi; "preview" chỉ bật ngoài production; khác → tắt', () => {
    expect(flagValueOn("1", "production")).toBe(true)
    expect(flagValueOn("preview", "preview")).toBe(true)
    expect(flagValueOn("preview", "production")).toBe(false)
    expect(flagValueOn("0", "preview")).toBe(false); expect(flagValueOn(undefined, "preview")).toBe(false); expect(flagValueOn("true", "preview")).toBe(false)
  })
})
