import { describe, expect, it, vi } from "vitest"

// Builder giống supabase-js: chỉ có .then, KHÔNG có .catch.
const insert = vi.fn(() => ({ then: (res: (v: unknown) => void) => res({ error: null }) }))
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({ insert }) } }))
import { createNotification } from "@/lib/notifications"

describe("createNotification", () => {
  it("không ném lỗi dù builder không có .catch, và có ghi dòng thông báo", async () => {
    await expect(createNotification("price_change", "t", "b", { a: 1 }, "admin_manager")).resolves.toBeUndefined()
    expect(insert).toHaveBeenCalledWith({ type: "price_change", title: "t", body: "b", data: { a: 1 }, visibility: "admin_manager" })
  })
})
