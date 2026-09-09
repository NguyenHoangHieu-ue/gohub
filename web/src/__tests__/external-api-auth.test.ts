import { describe, it, expect, vi, beforeEach } from "vitest"

let row: { id: string; label: string; revoked_at: string | null } | null = null
let updateCalls: any[] = []

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: row ? null : null }),
        }),
      }),
      update: (payload: any) => {
        updateCalls.push(payload)
        return { eq: async () => ({ data: null, error: null }) }
      },
    })),
  },
}))

import { requireExternalApiKey, hashApiKey, generateApiKey } from "@/lib/external-api-auth"

function makeReq(authHeader?: string): any {
  return { headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? authHeader ?? null : null) } }
}

describe("generateApiKey / hashApiKey", () => {
  it("sinh key có prefix gh_ext_ và hash ổn định (cùng input → cùng hash)", () => {
    const key = generateApiKey()
    expect(key.startsWith("gh_ext_")).toBe(true)
    expect(hashApiKey(key)).toBe(hashApiKey(key))
  })

  it("2 key khác nhau → hash khác nhau", () => {
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()))
  })
})

describe("requireExternalApiKey", () => {
  beforeEach(() => { row = null; updateCalls = [] })

  it("thiếu header Authorization → lỗi rõ ràng, không query DB", async () => {
    const res = await requireExternalApiKey(makeReq())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Bearer/)
  })

  it("key không tồn tại trong DB → 'không hợp lệ'", async () => {
    row = null
    const res = await requireExternalApiKey(makeReq("Bearer gh_ext_doesnotexist"))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/không hợp lệ/)
  })

  it("key đã revoke → báo đã thu hồi, không cho qua", async () => {
    row = { id: "k1", label: "Manager", revoked_at: "2026-01-01T00:00:00Z" }
    const res = await requireExternalApiKey(makeReq("Bearer gh_ext_revoked"))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/thu hồi/)
  })

  it("key hợp lệ, chưa revoke → ok + trả đúng label, cập nhật last_used_at", async () => {
    row = { id: "k1", label: "Manager - CRM tool", revoked_at: null }
    const res = await requireExternalApiKey(makeReq("Bearer gh_ext_valid"))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.label).toBe("Manager - CRM tool")
    await new Promise(r => setTimeout(r, 0)) // để fire-and-forget update chạy
    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0]).toHaveProperty("last_used_at")
  })
})
