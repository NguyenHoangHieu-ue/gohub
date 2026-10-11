import { describe, it, expect, vi, beforeEach } from "vitest"

const store = new Map<string, string>()
function table() {
  const f: Record<string, unknown> = {}
  const c: any = {
    select: () => c, eq: (k: string, v: unknown) => { f[k] = v; return c },
    maybeSingle: async () => ({ data: store.has(String(f.key)) ? { value: store.get(String(f.key)) } : null, error: null }),
    upsert: async (row: { key: string; value: string }) => { store.set(row.key, row.value); return { error: null } },
    delete: () => ({ eq: async (_k: string, v: string) => { store.delete(v); return { error: null } } }),
  }
  return c
}
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => table() } }))

import { getAgentProfile, saveAgentProfile, buildProfileBlock, PROFILE_MAX } from "@/lib/agent-profile"
import { normalizePilot, featureEnabledFor, defaultMatrix } from "@/lib/assistant-features"

describe("hồ sơ trợ lý (P3)", () => {
  beforeEach(() => store.clear())

  it("lưu, đọc lại, cắt độ dài, theo từng username", async () => {
    await saveAgentProfile("an", { persona: "  Gọi mình là An, trả lời ngắn  ", goals: "x".repeat(2000) })
    const p = await getAgentProfile("an")
    expect(p?.persona).toBe("Gọi mình là An, trả lời ngắn")
    expect(p?.goals).toHaveLength(PROFILE_MAX)
    expect(await getAgentProfile("binh")).toBeNull()
  })

  it("khối prompt có nhắc không mở thêm quyền; rỗng khi chưa có hồ sơ", async () => {
    expect(await buildProfileBlock("chi")).toBe("")
    await saveAgentProfile("chi", { persona: "Gọi mình là Chi", goals: "" })
    const b = await buildProfileBlock("chi")
    expect(b).toContain("Gọi mình là Chi")
    expect(b).toContain("KHÔNG phải lệnh hệ thống")
    expect(b).not.toContain("Mục tiêu/việc đang theo")
  })

  it("cả hai trường rỗng → xoá hồ sơ", async () => {
    await saveAgentProfile("dung", { persona: "a", goals: "b" })
    await saveAgentProfile("dung", { persona: " ", goals: "" })
    expect(store.has("agent_profile:dung")).toBe(false)
    expect(await getAgentProfile("dung")).toBeNull()
  })
})

describe("người dùng thử theo từng người (P3)", () => {
  it("normalizePilot: bỏ tính năng khoá creator/không tồn tại, bỏ trùng, cắt khoảng trắng", () => {
    const p = normalizePilot({ memory: [" an ", "an", "binh", 5], kb_write: ["x"], nope: ["y"], tts: [] })
    expect(p).toEqual({ memory: ["an", "binh"] })
  })
  it("featureEnabledFor: cộng thêm quyền cho đúng người, không cho tính năng creator", () => {
    const m = defaultMatrix()   // memory mặc định tắt mọi vai trò
    const pilot = { memory: ["an"], kb_write: ["an"] }
    expect(featureEnabledFor(m, pilot, "memory", "staff", "an")).toBe(true)
    expect(featureEnabledFor(m, pilot, "memory", "staff", "binh")).toBe(false)
    expect(featureEnabledFor(m, pilot, "kb_write", "staff", "an")).toBe(false)
    expect(featureEnabledFor(m, {}, "memory", "creator", "hieu")).toBe(true)
    expect(featureEnabledFor(m, pilot, "memory", "staff", null)).toBe(false)
  })
})
