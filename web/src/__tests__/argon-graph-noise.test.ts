import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
import { isAutomatedMailSource } from "@/lib/argon/kho-digest"

describe("lọc mail tự động khỏi graph", () => {
  it("mail từ noreply/notification… → bỏ; mail từ người thật, thread Lark, file → giữ", () => {
    expect(isAutomatedMailSource({ kind: "mail", meta: { mailFrom: "noreply@airhubapp.com" } })).toBe(true)
    expect(isAutomatedMailSource({ kind: "mail", meta: { mailFrom: "Billing <no-reply@vendor.com>" } })).toBe(true)
    expect(isAutomatedMailSource({ kind: "mail", meta: { mailFrom: "Romy Au <romy.au@hthk.com>" } })).toBe(false)
    expect(isAutomatedMailSource({ kind: "lark", meta: { mailFrom: "noreply@x.com" } })).toBe(false)
    expect(isAutomatedMailSource({ kind: "mail", meta: {} })).toBe(false)
    expect(isAutomatedMailSource({ kind: "file" })).toBe(false)
  })
})
