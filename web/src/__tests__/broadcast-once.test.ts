import { beforeEach, describe, expect, test, vi } from "vitest"

// Tin hẹn giờ gửi MỘT LẦN: không sớm, không trễ quá dung sai, không gửi trùng dù bị gọi nhiều lần cùng lúc.
const db: Record<string, string> = {}
const sent: { to: string; text: string }[] = []
let failFor = new Set<string>()
const users = [
  { username: "a", name: "A", lark_open_id: "ou_a" },
  { username: "b", name: "B", lark_open_id: "ou_b" },
  { username: "c", name: "C", lark_open_id: "ou_c" },
  { username: "d", name: "D", lark_open_id: null },
]

vi.mock("@/lib/lark", () => ({
  getCreatorLarkOpenId: async () => "ou_creator",
  sendLarkMessage: async (to: string, _t: string, text: string) => {
    await new Promise(r => setTimeout(r, 2))
    if (failFor.has(to)) return undefined
    sent.push({ to, text }); return { code: 0 }
  },
}))
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "users") {
        let only: string[] | null = null
        const q: any = {
          select: () => q, not: () => q, in: (_c: string, v: string[]) => { only = v; return q },
          then: (res: (x: unknown) => void) => res({ data: users.filter(u => (!only || only.includes(u.username))), error: null }),
        }
        return q
      }
      // app_settings
      const state: { key?: string; val?: string; upd?: string } = {}
      const q: any = {
        select: () => q,
        eq: (c: string, v: string) => { if (c === "key") state.key = v; else state.val = v; return q },
        maybeSingle: async () => ({ data: db[state.key!] !== undefined ? { value: db[state.key!] } : null }),
        update: (o: { value: string }) => { state.upd = o.value; return q },
        then: (res: (x: unknown) => void) => {
          if (state.upd !== undefined) {
            const ok = state.key! in db && (state.val === undefined || db[state.key!] === state.val)
            if (ok) db[state.key!] = state.upd
            res({ data: ok ? [{ key: state.key }] : [], error: null })
          } else res({ data: null, error: null })
        },
      }
      return q
    },
  },
}))

import { jobKey, parseIctMs, runBroadcastOnce, type BroadcastJob } from "@/lib/broadcast-once"

const SEND_AT = "2026-10-20T09:30:00"
const T = parseIctMs(SEND_AT)
const put = (j: Partial<BroadcastJob> = {}) => { db[jobKey("t")] = JSON.stringify({ id: "t", text: "chúc", sendAtIct: SEND_AT, status: "pending", ...j }) }

describe("broadcast-once", () => {
  beforeEach(() => { for (const k of Object.keys(db)) delete db[k]; sent.length = 0; failFor = new Set(); put() })

  test("giờ ICT 09:30 = 02:30 UTC", () => { expect(new Date(T).toISOString()).toBe("2026-10-20T02:30:00.000Z") })

  test("gọi SỚM 1 mili-giây: từ chối, không gửi, không đổi trạng thái", async () => {
    const r = await runBroadcastOnce("t", { now: T - 1 })
    expect(r).toEqual({ state: "early", waitMs: 1 })
    expect(sent.length).toBe(0)
    expect(JSON.parse(db[jobKey("t")]).status).toBe("pending")
  })

  test("đúng giờ: gửi cho mọi người có lark_open_id (bỏ người không có), ghi trạng thái done", async () => {
    const r = await runBroadcastOnce("t", { now: T })
    expect(r).toMatchObject({ state: "sent", total: 3, ok: 3, failed: 0 })
    expect(sent.filter(s => s.text === "chúc").map(s => s.to).sort()).toEqual(["ou_a", "ou_b", "ou_c"])
    expect(JSON.parse(db[jobKey("t")]).status).toBe("done")
  })

  test("gọi TRỄ quá dung sai: không gửi, đánh dấu missed, báo Creator", async () => {
    const r = await runBroadcastOnce("t", { now: T + 91_000 })
    expect(r.state).toBe("late")
    expect(sent.filter(s => s.text === "chúc").length).toBe(0)
    expect(sent.some(s => s.to === "ou_creator" && /KHÔNG được gửi/.test(s.text))).toBe(true)
    expect(JSON.parse(db[jobKey("t")]).status).toBe("missed")
  })

  test("trễ trong dung sai (30 giây) vẫn gửi", async () => {
    expect((await runBroadcastOnce("t", { now: T + 30_000 })).state).toBe("sent")
  })

  test("gọi nhiều lần cùng lúc (trigger dự phòng): đúng 1 lần gửi, không ai nhận trùng", async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => runBroadcastOnce("t", { now: T + 1000 })))
    expect(rs.filter(r => r.state === "sent").length).toBe(1)
    expect(rs.filter(r => r.state === "skipped").length).toBe(4)
    const perUser = sent.filter(s => s.text === "chúc").reduce<Record<string, number>>((m, s) => ((m[s.to] = (m[s.to] ?? 0) + 1), m), {})
    expect(Object.values(perUser)).toEqual([1, 1, 1])
  })

  test("gọi lại sau khi đã gửi xong: bỏ qua", async () => {
    await runBroadcastOnce("t", { now: T })
    sent.length = 0
    expect(await runBroadcastOnce("t", { now: T + 5000 })).toEqual({ state: "skipped", status: "done" })
    expect(sent.length).toBe(0)
  })

  test("một người lỗi không chặn người khác; báo Creator kèm tên người lỗi", async () => {
    failFor = new Set(["ou_b"])
    const r = await runBroadcastOnce("t", { now: T })
    expect(r).toMatchObject({ state: "sent", total: 3, ok: 2, failed: 1 })
    expect(sent.some(s => s.to === "ou_creator" && /lỗi 1: b/.test(s.text))).toBe(true)
  })

  test("onlyUsernames giới hạn người nhận (gửi thử); dryRun chỉ liệt kê, không gửi", async () => {
    put({ onlyUsernames: ["a"] })
    const dry = await runBroadcastOnce("t", { now: T - 99999, dryRun: true })
    expect(dry).toEqual({ state: "dry", recipients: [{ username: "a", name: "A" }] })
    expect(sent.length).toBe(0)
    await runBroadcastOnce("t", { now: T })
    expect(sent.filter(s => s.text === "chúc").map(s => s.to)).toEqual(["ou_a"])
  })

  test("job không tồn tại", async () => { expect(await runBroadcastOnce("khong-co", { now: T })).toEqual({ state: "notfound" }) })
})
