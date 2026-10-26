import { describe, expect, it } from "vitest"
import { countByKind, sortInbox, urgencyFor, type InboxItem } from "@/lib/assistant/inbox-pure"

const NOW = Date.UTC(2026, 9, 26, 3, 0)
const H = 3_600_000
const I = (key: string, o: Partial<InboxItem> = {}): InboxItem => ({ key, kind: "mail", id: key, title: key, detail: "", at: new Date(NOW - H).toISOString(), urgency: 1, source: "Mail", actions: ["done"], ...o })

describe("urgencyFor", () => {
  it("hành động Gấu Pro luôn ≥2, ≥12 giờ → 3", () => {
    expect(urgencyFor("gp_action", new Date(NOW - H).toISOString(), NOW)).toBe(2)
    expect(urgencyFor("gp_action", new Date(NOW - 13 * H).toISOString(), NOW)).toBe(3)
  })
  it("câu hỏi Argon / phiếu: ≥24 giờ → 3; việc thường: >12h → 2, >48h → 3", () => {
    expect(urgencyFor("argon_ask", new Date(NOW - 25 * H).toISOString(), NOW)).toBe(3)
    expect(urgencyFor("dev_ticket", new Date(NOW - 2 * H).toISOString(), NOW)).toBe(2)
    expect(urgencyFor("mail", new Date(NOW - 2 * H).toISOString(), NOW)).toBe(1)
    expect(urgencyFor("mail", new Date(NOW - 13 * H).toISOString(), NOW)).toBe(2)
    expect(urgencyFor("fact_review", new Date(NOW - 49 * H).toISOString(), NOW)).toBe(3)
  })
  it("thời điểm tương lai (lệch đồng hồ) không âm", () => { expect(urgencyFor("mail", new Date(NOW + 5 * H).toISOString(), NOW)).toBe(1) })
})

describe("sortInbox / countByKind", () => {
  it("gấp trước; cùng mức thì chờ lâu nhất trước; không đổi mảng gốc", () => {
    const a = I("a", { urgency: 1, at: "2026-10-20T00:00:00Z" }), b = I("b", { urgency: 3, at: "2026-10-25T00:00:00Z" }), c = I("c", { urgency: 3, at: "2026-10-24T00:00:00Z" })
    const src = [a, b, c]
    expect(sortInbox(src).map(x => x.key)).toEqual(["c", "b", "a"])
    expect(src.map(x => x.key)).toEqual(["a", "b", "c"])
  })
  it("đếm theo loại, loại không có = 0", () => {
    const n = countByKind([I("1"), I("2", { kind: "gp_action" }), I("3", { kind: "gp_action" })])
    expect(n.mail).toBe(1); expect(n.gp_action).toBe(2); expect(n.argon_patch).toBe(0)
  })
})
