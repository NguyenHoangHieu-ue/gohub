import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockPage = {
  goto:      vi.fn().mockResolvedValue(undefined),
  title:     vi.fn().mockResolvedValue("Test Page"),
  innerText: vi.fn().mockResolvedValue("x".repeat(20000)),
  click:     vi.fn().mockResolvedValue(undefined),
  fill:      vi.fn().mockResolvedValue(undefined),
  evaluate:  vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
}
const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close:   vi.fn().mockResolvedValue(undefined),
}
const connectOverCDP = vi.fn().mockResolvedValue(mockBrowser)

vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: (...a: any[]) => connectOverCDP(...a) } }))

import { runBrowseWeb } from "@/lib/agents/creator/tools/browser"

describe("runBrowseWeb", () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...OLD_ENV, BROWSERLESS_WS_URL: "wss://browserless.test", BROWSERLESS_TOKEN: "tok123" }
  })
  afterEach(() => { process.env = OLD_ENV })

  it("báo lỗi rõ ràng khi thiếu env, không throw", async () => {
    process.env.BROWSERLESS_WS_URL = ""
    const res = await runBrowseWeb({ url: "https://example.com" })
    expect(res.error).toMatch(/BROWSERLESS/)
    expect(connectOverCDP).not.toHaveBeenCalled()
  })

  it("báo lỗi khi thiếu url", async () => {
    const res = await runBrowseWeb({ url: "" })
    expect(res.error).toMatch(/url/i)
  })

  it("happy path: cắt nội dung đúng 15000 ký tự + đóng browser", async () => {
    const res = await runBrowseWeb({ url: "https://example.com" })
    expect(res.error).toBeUndefined()
    expect(res.title).toBe("Test Page")
    expect(res.content?.length).toBe(15000)
    expect(mockBrowser.close).toHaveBeenCalledTimes(1)
    expect(connectOverCDP).toHaveBeenCalledWith(expect.stringContaining("token=tok123"))
  })

  it("1 action lỗi không chặn action sau, vẫn trả nội dung", async () => {
    mockPage.click.mockRejectedValueOnce(new Error("no such element"))
    const res = await runBrowseWeb({
      url: "https://example.com",
      actions: [
        { type: "click", selector: "#missing" },
        { type: "wait", ms: 100 },
      ],
    })
    expect(res.error).toBeUndefined()
    expect(res.action_log?.[0]).toMatch(/lỗi action click/)
    expect(res.action_log?.[1]).toMatch(/wait 100ms ok/)
    expect(res.content).toBeDefined()
  })

  it("luôn đóng browser dù goto lỗi", async () => {
    mockPage.goto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"))
    const res = await runBrowseWeb({ url: "https://not-a-real-domain.invalid" })
    expect(res.error).toMatch(/ERR_NAME_NOT_RESOLVED/)
    expect(mockBrowser.close).toHaveBeenCalledTimes(1)
  })
})
