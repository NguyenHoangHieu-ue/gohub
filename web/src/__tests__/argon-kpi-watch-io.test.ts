import { beforeEach, describe, expect, it, vi } from "vitest"

// runKpiWatch không được XOÁ cảnh báo cũ (và trạng thái "bỏ qua") khi đọc target/cảnh báo lỗi tạm thời hay quarterly-report hỏng.
const state = { settings: {} as Record<string, { value?: unknown; error?: string }>, upserts: [] as { key: string; value: string }[] }
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => { const s = state.settings[k]; return s?.error ? { data: null, error: { message: s.error } } : { data: s?.value === undefined ? null : { value: s.value }, error: null } } }) }),
      upsert: async (row: { key: string; value: string }) => { state.upserts.push(row); return { error: null } },
    }),
  },
}))
import { runKpiWatch, vnQuarter } from "@/lib/argon/kpi-watch"

const NOW = new Date("2026-10-20T03:00:00Z")
const { q, year } = vnQuarter(NOW)
const TARGET_KEY = "company_monthly_targets"
const targets = JSON.stringify({ [`Q${q}_${year}`]: { ALL: { rev: [1e9, 1e9, 1e9] } } })

beforeEach(() => { state.settings = {}; state.upserts = []; process.env.CRON_SECRET = "x"; vi.unstubAllGlobals() })

describe("runKpiWatch giữ cảnh báo cũ khi có lỗi", () => {
  it("đọc target lỗi → không ghi gì", async () => {
    state.settings[TARGET_KEY] = { error: "timeout" }
    const r = await runKpiWatch("u", "https://x", NOW)
    expect(r.note).toMatch(/lỗi đọc target.*giữ nguyên/)
    expect(state.upserts).toEqual([])
  })
  it("chưa nhập target (đọc OK, rỗng) → xoá cảnh báo như cũ", async () => {
    state.settings[TARGET_KEY] = { value: "{}" }
    const r = await runKpiWatch("u", "https://x", NOW)
    expect(r.note).toMatch(/chưa nhập target/)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0].value).toBe("[]")
  })
  it("quarterly-report lỗi HTTP / ném lỗi / không có summary → không ghi gì", async () => {
    state.settings[TARGET_KEY] = { value: targets }
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, json: async () => ({}) }))
    expect((await runKpiWatch("u", "https://x", NOW)).note).toMatch(/HTTP 500.*giữ nguyên/)
    vi.stubGlobal("fetch", async () => { throw new Error("timeout") })
    expect((await runKpiWatch("u", "https://x", NOW)).note).toMatch(/lỗi: timeout.*giữ nguyên/)
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ({ error: "x" }) }))
    expect((await runKpiWatch("u", "https://x", NOW)).note).toMatch(/không trả summary/)
    expect(state.upserts).toEqual([])
  })
  it("đọc cảnh báo cũ lỗi → không ghi đè", async () => {
    state.settings[TARGET_KEY] = { value: targets }
    state.settings["argon_alerts:u"] = { error: "boom" }
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ({ summary: [] }) }))
    const r = await runKpiWatch("u", "https://x", NOW)
    expect(r.note).toMatch(/không ghi đè/)
    expect(state.upserts).toEqual([])
  })
  it("mọi thứ đọc được → ghi danh sách mới", async () => {
    state.settings[TARGET_KEY] = { value: targets }
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ({ summary: [] }) }))
    const r = await runKpiWatch("u", "https://x", NOW)
    expect(r).toMatchObject({ alerts: 0 })
    expect(state.upserts).toHaveLength(1)
  })
})
