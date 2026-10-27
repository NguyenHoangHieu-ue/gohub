import { describe, expect, it } from "vitest"
import { returnUrl, safeReturnPath } from "@/lib/lark-return"

describe("quay lại sau cấp quyền Lark", () => {
  it("chỉ nhận đường dẫn tương đối an toàn", () => {
    expect(safeReturnPath("/analytics/creator/argon/hoi-tim")).toBe("/analytics/creator/argon/hoi-tim")
    expect(safeReturnPath("/chatbot?c=abc")).toBe("/chatbot?c=abc")
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "/api/auth/signout", "/_next/x", "", null, undefined, "/a\r\nSet-Cookie: x=1", "/" + "a".repeat(250)]) expect(safeReturnPath(bad as string), String(bad)).toBeNull()
  })
  it("URL đích: mặc định Gấu Pro; giữ query sẵn có", () => {
    expect(returnUrl("https://x.com", null, "connected")).toBe("https://x.com/analytics/creator/ai?lark=connected")
    expect(returnUrl("https://x.com", "/analytics/creator/argon/hoi-tim", "error")).toBe("https://x.com/analytics/creator/argon/hoi-tim?lark=error")
    expect(returnUrl("https://x.com", "/chatbot?c=1", "connected")).toBe("https://x.com/chatbot?c=1&lark=connected")
  })
})
