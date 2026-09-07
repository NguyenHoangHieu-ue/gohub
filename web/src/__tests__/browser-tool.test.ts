import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockPage = {
  goto:      vi.fn().mockResolvedValue(undefined),
  title:     vi.fn().mockResolvedValue("Test Page"),
  innerText: vi.fn().mockResolvedValue("x".repeat(20000)),
  click:     vi.fn().mockResolvedValue(undefined),
  fill:      vi.fn().mockResolvedValue(undefined),
  evaluate:  vi.fn().mockResolvedValue(undefined),
  waitForTimeout:   vi.fn().mockResolvedValue(undefined),
  waitForLoadState: vi.fn().mockResolvedValue(undefined),
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

  it("urls[] — đọc lần lượt từng URL độc lập, gộp nội dung có đánh dấu trang", async () => {
    const res = await runBrowseWeb({ urls: ["https://a.test", "https://b.test", "https://c.test"] })
    expect(res.error).toBeUndefined()
    expect(res.pages_fetched).toBe(3)
    expect(mockPage.goto).toHaveBeenCalledTimes(3)
    expect(res.content).toContain("--- Trang 1: https://a.test")
    expect(res.content).toContain("--- Trang 2: https://b.test")
    expect(res.content).toContain("--- Trang 3: https://c.test")
  })

  it("urls[] — 1 URL lỗi vẫn tiếp tục các URL còn lại, ghi rõ lỗi trong nội dung", async () => {
    mockPage.goto.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(undefined)
    const res = await runBrowseWeb({ urls: ["https://a.test", "https://b.test", "https://c.test"] })
    expect(res.error).toBeUndefined()
    expect(res.pages_fetched).toBe(3)
    expect(res.content).toContain("Trang 2: https://b.test — LỖI: timeout")
  })

  it("pagination click_next thiếu next_selector → lỗi rõ ràng", async () => {
    const res = await runBrowseWeb({ url: "https://example.com", pagination: { mode: "click_next" } as any })
    expect(res.error).toMatch(/next_selector/)
  })

  it("pagination click_next — dừng sớm khi hết nút Next (click lỗi ở lần thứ 3)", async () => {
    mockPage.click
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("no next button"))
    const res = await runBrowseWeb({
      url: "https://example.com",
      pagination: { mode: "click_next", next_selector: ".next", max_pages: 5 },
    })
    expect(res.error).toBeUndefined()
    expect(res.pages_fetched).toBe(3)
  })

  it("pagination infinite_scroll — dừng khi nội dung không phát triển thêm", async () => {
    mockPage.innerText
      .mockResolvedValueOnce("A".repeat(100))
      .mockResolvedValueOnce("B".repeat(200))
      .mockResolvedValueOnce("C".repeat(200)) // bằng lần trước → dừng
      .mockResolvedValueOnce("D".repeat(250)) // đọc cuối sau vòng lặp
    const res = await runBrowseWeb({
      url: "https://example.com",
      pagination: { mode: "infinite_scroll", max_scrolls: 6, scroll_pause_ms: 10 },
    })
    expect(res.error).toBeUndefined()
    expect(res.pages_fetched).toBe(2)
    expect(res.content?.length).toBe(250)
  })
})
