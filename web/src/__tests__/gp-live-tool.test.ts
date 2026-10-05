import { describe, it, expect, vi, beforeEach } from "vitest"

const dispatched: string[] = []
vi.mock("@/lib/agents/creator/live-auth", () => ({ liveUser: async () => ({ username: "u", isCreator: true }) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, resetMs: 0 }) }))
vi.mock("@/lib/agents/creator/tools/dispatch", () => ({
  dispatchTool: async (call: { name: string }) => { dispatched.push(call.name); return { functionResponse: { name: call.name, response: { ok: true } } } },
}))
vi.mock("@/lib/agents/creator-ai", () => ({
  LIVE_TOOLS: new Set(["executeSQL"]),
  LIVE_CONTROL_TOOLS: new Set(["readMyBrowser", "controlMyBrowser"]),
}))
import { POST } from "@/app/api/creator-ai/live/tool/route"

const call = (body: unknown) => POST(new Request("http://x/api/creator-ai/live/tool", { method: "POST", body: JSON.stringify(body) }) as any).then(r => r.json())

describe("Phiên Trực tiếp — công tắc Cho Gấu thao tác (G5 cách 2)", () => {
  beforeEach(() => { dispatched.length = 0 })

  it("tool đọc luôn chạy", async () => {
    expect((await call({ name: "executeSQL", args: {} })).response).toEqual({ ok: true })
  })
  it("thao tác Chrome khi công tắc TẮT → bị chặn, không chạy", async () => {
    const r = await call({ name: "controlMyBrowser", args: { action: "click" } })
    expect(r.response.error).toMatch(/CHƯA bật/)
    expect(dispatched).toEqual([])
  })
  it("thao tác Chrome khi công tắc BẬT → chạy", async () => {
    await call({ name: "controlMyBrowser", args: { action: "click" }, control: true })
    expect(dispatched).toEqual(["controlMyBrowser"])
  })
  it("tool gửi/ghi ra ngoài KHÔNG bao giờ chạy, kể cả khi bật công tắc", async () => {
    for (const name of ["sendLarkMessage", "localFiles", "writeKnowledgeBase"]) {
      const r = await call({ name, args: {}, control: true })
      expect(r.response.error).toBeTruthy()
    }
    expect(dispatched).toEqual([])
  })
})
