import { describe, it, expect, vi, beforeEach } from "vitest"

let sessionUser: { username: string; role: string } | null = null
let dbRole = "creator"
const dbCalls: string[] = []

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (sessionUser ? { user: sessionUser } : null)) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db-role", () => ({ getDbRole: vi.fn(async () => dbRole) }))
vi.mock("@/lib/supabase", () => {
  const chain: any = { select: () => chain, order: () => chain, limit: () => chain, eq: () => chain, update: () => chain, then: (r: any) => r({ data: [], error: null }) }
  return { supabaseAdmin: { from: (t: string) => { dbCalls.push(t); return chain } } }
})

import { GET, PATCH } from "@/app/api/creator-ai/bridge/devices/route"

const getReq = (qs = "") => ({ nextUrl: new URL(`http://x/api/creator-ai/bridge/devices${qs}`) }) as any
const patchReq = () => ({ json: async () => ({ id: 1, revoked: true }) }) as any

// Thông tin thiết bị Bridge CHỈ creator xem/sửa — admin cũng không (quyết định Hiếu 2026-09-20).
describe("bridge/devices — chỉ creator", () => {
  beforeEach(() => { sessionUser = null; dbRole = "creator"; dbCalls.length = 0 })

  it("chưa đăng nhập → 401", async () => {
    expect((await GET(getReq())).status).toBe(401)
  })

  for (const role of ["admin", "manager", "bod", "staff"]) {
    it(`${role} → 403, không chạm DB thiết bị (GET/PATCH)`, async () => {
      sessionUser = { username: "u", role }
      dbRole = role
      expect((await GET(getReq("?all=1"))).status).toBe(403)
      expect((await PATCH(patchReq())).status).toBe(403)
      expect(dbCalls).toEqual([])
    })
  }

  it("JWT cũ ghi creator nhưng DB đã hạ role → 403 (dùng role DB)", async () => {
    sessionUser = { username: "u", role: "creator" }
    dbRole = "admin"
    expect((await GET(getReq())).status).toBe(403)
  })

  it("creator → 200", async () => {
    sessionUser = { username: "hieu", role: "creator" }
    expect((await GET(getReq("?all=1"))).status).toBe(200)
  })
})
