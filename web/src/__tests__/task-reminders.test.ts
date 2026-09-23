import { describe, it, expect, vi, beforeEach } from "vitest"

const settings = new Map<string, string>()
const sendLarkDM = vi.fn()

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: (_c: string, key: string) => ({ maybeSingle: async () => ({ data: settings.has(key) ? { value: settings.get(key) } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { settings.set(row.key, row.value); return {} },
    }),
  },
}))
vi.mock("@/lib/lark", () => ({
  getLarkUserToken: async () => "user-token",
  getCreatorLarkOpenId: async () => "ou_creator",
  sendLarkDM: (...a: unknown[]) => sendLarkDM(...a),
}))
vi.mock("@/lib/agents/creator/tools/lark", () => ({ runLarkTask: vi.fn() }))

import { runTaskReminders } from "@/lib/task-assistant"

const NOW = Date.UTC(2026, 8, 23, 3, 0)   // 10:00 giờ VN
const task = (guid: string, dueOffsetMin: number | null) => ({
  guid, summary: `Task ${guid}`, completed_at: "0",
  due: dueOffsetMin === null ? undefined : { timestamp: String(NOW + dueOffsetMin * 60_000) },
})

function mockTasks(items: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ code: 0, data: { items, has_more: false } }) })))
}

describe("runTaskReminders", () => {
  beforeEach(() => { settings.clear(); sendLarkDM.mockReset() })

  it("nhắc task sắp tới hạn (≤60') và quá hạn, bỏ qua task còn xa/không hạn", async () => {
    mockTasks([task("soon", 30), task("late", -120), task("far", 300), task("nodue", null)])
    const r = await runTaskReminders(NOW)
    expect(r.sent).toBe(2)
    const text = sendLarkDM.mock.calls[0][1] as string
    expect(text).toContain("Task soon")
    expect(text).toContain("Task late")
    expect(text).not.toContain("Task far")
    expect(text).not.toContain("Task nodue")
  })

  it("không chạy lại trong vòng 10 phút", async () => {
    mockTasks([task("soon", 30)])
    await runTaskReminders(NOW)
    const r = await runTaskReminders(NOW + 5 * 60_000)
    expect(r.skipped).toBeTruthy()
    expect(sendLarkDM).toHaveBeenCalledTimes(1)
  })

  it("không nhắc lặp: 'sắp tới hạn' 1 lần, 'quá hạn' 1 lần/ngày", async () => {
    mockTasks([task("soon", 30), task("late", -120)])
    await runTaskReminders(NOW)
    const again = await runTaskReminders(NOW + 11 * 60_000)
    expect(again.sent).toBe(0)
    const nextDay = await runTaskReminders(NOW + 24 * 3600_000)
    expect(nextDay.sent).toBe(2)   // cả 2 đã quá hạn → nhắc quá hạn ngày mới
  })
})
