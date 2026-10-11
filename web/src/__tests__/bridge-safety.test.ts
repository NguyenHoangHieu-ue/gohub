import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { BRIDGE_SAFETY_RULES, isBridgeBlockedUrl } from "@/lib/bridge-safety"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
import { runControlMyBrowser, runReadMyBrowser } from "@/lib/agents/creator/tools/bridge"

describe("bridge-safety (chặn trang nhạy cảm)", () => {
  it("quy tắc trên server TRÙNG đúng file của extension (browser-extension/safety-rules.json)", () => {
    const ext = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "browser-extension", "safety-rules.json"), "utf8"))
    expect(ext).toEqual(BRIDGE_SAFETY_RULES)
  })

  it("chặn ngân hàng, thanh toán, đổi mật khẩu, trình quản lý mật khẩu, trang nội bộ trình duyệt", () => {
    for (const u of [
      "https://online.vietcombank.com.vn/login", "https://www.techcombank.com.vn/", "https://ebanking.somebank.vn/x",
      "https://www.paypal.com/signin", "https://checkout.stripe.com/c/pay_123", "https://accounts.google.com/signin",
      "https://vault.bitwarden.com/", "chrome://settings/passwords", "chrome-extension://abc/popup.html", "file:///C:/Users/a/secret.txt",
      "https://shop.example.com/checkout/step1", "https://example.com/account/change-password", "https://example.com/thanh-toan",
    ]) expect(isBridgeBlockedUrl(u), u).toBe(true)
  })

  it("không chặn nhầm trang làm việc bình thường", () => {
    for (const u of [
      "https://intel-v2.gohub.cloud/chatbot", "https://docs.google.com/spreadsheets/d/abc/edit", "https://www.larksuite.com/",
      "https://portal.3hk.example.com/quotes", "https://www.google.com/search?q=esim", "https://example.com/products/checkout-guide-blog",
    ]) expect(isBridgeBlockedUrl(u), u).toBe(false)
  })

  it("URL hỏng bị coi là chặn; rỗng thì không", () => {
    expect(isBridgeBlockedUrl("không phải url")).toBe(true)
    expect(isBridgeBlockedUrl("")).toBe(false)
    expect(isBridgeBlockedUrl(undefined)).toBe(false)
  })
})

describe("bridge tool — kiểm tra tham số (không chạm DB)", () => {
  it("action lạ bị từ chối", async () => {
    expect((await runReadMyBrowser({ action: "nope" as any }, "a")).error).toMatch(/action phải là/)
    expect((await runControlMyBrowser({ action: "nope" as any, tab_id: 1 }, "a")).error).toMatch(/action phải là/)
  })
  it("thiếu tab_id / ref / value / keys / url", async () => {
    expect((await runControlMyBrowser({ action: "click", ref: "e1" }, "a")).error).toMatch(/tab_id/)
    expect((await runControlMyBrowser({ action: "click", tab_id: 1 }, "a")).error).toMatch(/ref/)
    expect((await runControlMyBrowser({ action: "fill", tab_id: 1, ref: "e1" }, "a")).error).toMatch(/value/)
    expect((await runControlMyBrowser({ action: "key", tab_id: 1 }, "a")).error).toMatch(/keys/)
    expect((await runControlMyBrowser({ action: "navigate", tab_id: 1 }, "a")).error).toMatch(/url/)
    expect((await runReadMyBrowser({ action: "screenshot" }, "a")).error).toMatch(/tab_id/)
  })
  it("navigate/open_tab tới trang nhạy cảm bị chặn ngay ở server", async () => {
    expect((await runControlMyBrowser({ action: "navigate", tab_id: 1, url: "https://www.paypal.com/x" }, "a")).error).toMatch(/nhạy cảm/)
    expect((await runControlMyBrowser({ action: "open_tab", url: "https://accounts.google.com/" }, "a")).error).toMatch(/nhạy cảm/)
  })
})
