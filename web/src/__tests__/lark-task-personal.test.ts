import { describe, it, expect, vi, beforeEach } from "vitest"

const lark = vi.hoisted(() => ({
  getLarkToken: vi.fn(async () => "app-token"),
  getLarkUserToken: vi.fn(),
  getLarkUserOpenId: vi.fn(),
}))
vi.mock("@/lib/lark", () => lark)

import { runLarkTask, runLarkBase } from "@/lib/agents/creator/tools/lark"

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  lark.getLarkToken.mockResolvedValue("app-token")
  fetchMock.mockResolvedValue({ json: async () => ({ code: 0, data: { task: { guid: "g1" } } }) })
  vi.stubGlobal("fetch", fetchMock)
})

describe("task Lark theo từng người (Gấu Pro = trợ lý cá nhân)", () => {
  it("người dùng thường chưa kết nối Lark → báo lỗi, KHÔNG rơi về token app / tài khoản Creator", async () => {
    lark.getLarkUserToken.mockResolvedValue(null)
    const r = await runLarkTask("createLarkTask", { summary: "x" }, { username: "nv1", isCreator: false })
    expect(r.error).toMatch(/chưa kết nối Lark/i)
    expect(lark.getLarkUserToken).toHaveBeenCalledWith("nv1")
    expect(lark.getLarkToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("người dùng thường đã kết nối → dùng token + open_id của CHÍNH họ", async () => {
    lark.getLarkUserToken.mockResolvedValue("tok-nv1")
    lark.getLarkUserOpenId.mockResolvedValue("ou_nv1")
    await runLarkTask("createLarkTask", { summary: "x" }, { username: "nv1", isCreator: false })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe("Bearer tok-nv1")
    expect(JSON.parse(init.body).members[0].id).toBe("ou_nv1")
    expect(lark.getLarkUserOpenId).toHaveBeenCalledWith("nv1")
  })

  it("thiếu username khi không phải Creator → từ chối", async () => {
    const r = await runLarkTask("listLarkTasks", {}, { isCreator: false })
    expect(r.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Lark Base trong Gấu Pro của người thường: chưa kết nối → báo lỗi, không dùng token app", async () => {
    lark.getLarkUserToken.mockResolvedValue(null)
    const r = await runLarkBase({}, { username: "nv1", isCreator: false, gauPro: true })
    expect(r.error).toMatch(/chưa kết nối Lark/i)
    expect(lark.getLarkToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Lark Base trong Gấu Pro: đã kết nối → dùng token riêng, không gắn open_id Creator", async () => {
    lark.getLarkUserToken.mockResolvedValue("tok-nv1")
    process.env.LARK_CREATOR_USER_ID = "ou_creator"
    await runLarkBase({}, { username: "nv1", isCreator: false, gauPro: true })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe("Bearer tok-nv1")
    expect(init.headers["X-Lark-Request-User-Open-Id"]).toBeUndefined()
    delete process.env.LARK_CREATOR_USER_ID
  })

  it("Lark Base của Bé Gấu (không phải Gấu Pro) giữ cách cũ: app token", async () => {
    await runLarkBase({}, { username: "nv1", isCreator: false, gauPro: false })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer app-token")
    expect(lark.getLarkUserToken).not.toHaveBeenCalled()
  })

  it("Creator và luồng không ctx (cron, trợ lý task) giữ token cũ của Hiếu", async () => {
    lark.getLarkUserToken.mockResolvedValue("tok-hieu")
    lark.getLarkUserOpenId.mockResolvedValue("ou_hieu")
    await runLarkTask("createLarkTask", { summary: "x" }, { username: "hieu", isCreator: true })
    await runLarkTask("createLarkTask", { summary: "y" })
    expect(lark.getLarkUserToken).toHaveBeenNthCalledWith(1, undefined)
    expect(lark.getLarkUserToken).toHaveBeenNthCalledWith(2, undefined)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-hieu")
  })
})
