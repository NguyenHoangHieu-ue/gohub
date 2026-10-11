import { describe, it, expect, vi } from "vitest"

const turns: any[] = []
vi.mock("@/lib/agents/genai-stream", () => ({
  streamTurn: vi.fn(async () => turns.shift()),
}))
import { runAgentLoop } from "@/lib/agents/core/agent-loop"

const turn = (calls: { name: string }[], text = "") => ({
  content: { role: "model", parts: calls.map(c => ({ functionCall: { name: c.name, args: {} } })).concat(text ? [{ text } as any] : []) },
  functionCalls: calls.map(c => ({ name: c.name, args: {} })), text, tokensIn: 1, tokensOut: 1,
})

describe("agent-loop — part phụ (ảnh) đi kèm kết quả tool", () => {
  it("ảnh inlineData được nối SAU mọi functionResponse, `__extra` không lọt vào nội dung gửi model", async () => {
    turns.length = 0
    turns.push(turn([{ name: "readMyBrowser" }, { name: "queryProduct" }]), turn([], "xong"))
    const contents: any[] = [{ role: "user", parts: [{ text: "chụp" }] }]
    await runAgentLoop({
      model: "m", contents, configFor: () => ({}), maxRounds: 3,
      runTool: async (call) => call.name === "readMyBrowser"
        ? { functionResponse: { name: "readMyBrowser", response: { ok: true } }, __extra: [{ inlineData: { mimeType: "image/jpeg", data: "AAA" } }] }
        : { functionResponse: { name: "queryProduct", response: { rows: 1 } } },
    })
    const toolTurn = contents.find(c => c.role === "user" && c.parts.some((p: any) => p.functionResponse))
    expect(toolTurn.parts.map((p: any) => Object.keys(p)[0])).toEqual(["functionResponse", "functionResponse", "inlineData"])
    expect(JSON.stringify(toolTurn)).not.toContain("__extra")
  })
})
