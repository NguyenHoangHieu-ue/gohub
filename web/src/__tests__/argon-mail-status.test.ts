import { describe, expect, it } from "vitest"
import type { MailMessage } from "@/lib/argon/mail"
import { baseStatus, bucketThreads, buildSnapshots, dueNudges, isAutomatedSender, isNewThread, needsClassify, normalizeClassification, nudgeMessage, waitingDays, type MailThreadRow } from "@/lib/argon/mail-status-pure"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 26, 3, 0)
const M = (id: string, threadId: string, from: string, ageDays: number, o: Partial<MailMessage> = {}): MailMessage => ({ id, threadId, subject: "Báo giá Thái Lan", from, to: "hieu@gohub.vn", cc: "", dateMs: NOW - ageDays * DAY, text: "x", attachments: [], ...o })
const R = (o: Partial<MailThreadRow> = {}): MailThreadRow => ({ id: "r", username: "u", thread_id: "t", subject: "S", counterparty: "A <a@x.com>", last_message_id: "m", last_at: new Date(NOW - 3 * DAY).toISOString(), last_from_me: false, message_count: 1, status: "waiting_me", status_by: "auto", summary: "", next_action: "", nudged_at: null, created_at: new Date(NOW - 5 * DAY).toISOString(), updated_at: "", ...o })

describe("buildSnapshots", () => {
  it("thư cuối ở SENT → của mình, đối tác là người nhận; thư cuối ở INBOX → của họ", () => {
    const inbox = [M("a1", "t1", "vendor@x.com", 5), M("a2", "t2", "other@y.com", 1)]
    const sent = [M("s1", "t1", "hieu@gohub.vn", 2, { to: "vendor@x.com" })]
    const [t2, t1] = buildSnapshots(inbox, sent)   // mới nhất trước
    expect(t2).toMatchObject({ threadId: "t2", lastFromMe: false, counterparty: "other@y.com", count: 1 })
    expect(t1).toMatchObject({ threadId: "t1", lastFromMe: true, counterparty: "vendor@x.com", count: 2, lastMessageId: "s1" })
  })
  it("không đếm trùng thư xuất hiện ở cả hai thư mục", () => {
    const m = M("same", "t", "v@x.com", 1)
    expect(buildSnapshots([m], [m])[0].count).toBe(1)
  })
  it("luồng toàn thư tự động → allAutomated; có thư của mình thì không", () => {
    expect(buildSnapshots([M("a", "t", "noreply@shopee.com", 1)], [])[0].allAutomated).toBe(true)
    expect(buildSnapshots([M("a", "t", "noreply@shopee.com", 2)], [M("s", "t", "hieu@gohub.vn", 1)])[0].allAutomated).toBe(false)
    expect(isAutomatedSender("Billing <no-reply@vendor.com>")).toBe(true); expect(isAutomatedSender("An <an@vendor.com>")).toBe(false)
  })
})

describe("phân loại", () => {
  it("baseStatus theo người gửi thư cuối", () => { expect(baseStatus(true)).toBe("waiting_partner"); expect(baseStatus(false)).toBe("waiting_me") })
  it("normalizeClassification: chịu rào ```json, bỏ việc khi done, sai thì null", () => {
    expect(normalizeClassification('```json\n{"state":"waiting_me","summary":"Hỏi giá","nextAction":"Trả lời giá"}\n```')).toEqual({ state: "waiting_me", summary: "Hỏi giá", nextAction: "Trả lời giá" })
    expect(normalizeClassification('{"state":"done","summary":"Đã chốt","nextAction":"gì đó"}')?.nextAction).toBe("")
    expect(normalizeClassification('{"state":"bậy"}')).toBeNull(); expect(normalizeClassification("không phải JSON")).toBeNull()
  })
  it("needsClassify khi chưa có dòng hoặc có thư mới", () => {
    expect(needsClassify(null, { lastMessageId: "m" })).toBe(true)
    expect(needsClassify({ last_message_id: "m" }, { lastMessageId: "m" })).toBe(false)
    expect(needsClassify({ last_message_id: "m" }, { lastMessageId: "n" })).toBe(true)
  })
})

describe("hiển thị và nhắc", () => {
  it("bucketThreads: chờ lâu nhất trước, xong mới nhất trước, đếm bỏ qua", () => {
    const b = bucketThreads([R({ id: "1", last_at: new Date(NOW - 1 * DAY).toISOString() }), R({ id: "2", last_at: new Date(NOW - 4 * DAY).toISOString() }), R({ id: "3", status: "ignored" }), R({ id: "4", status: "done" })])
    expect(b.waitingMe.map(r => r.id)).toEqual(["2", "1"]); expect(b.done).toHaveLength(1); expect(b.ignored).toBe(1)
  })
  it("isNewThread: mới ≤48h và đang chờ mình", () => {
    expect(isNewThread(R({ created_at: new Date(NOW - DAY).toISOString() }), NOW)).toBe(true)
    expect(isNewThread(R({ created_at: new Date(NOW - 5 * DAY).toISOString() }), NOW)).toBe(false)
    expect(isNewThread(R({ status: "waiting_partner", created_at: new Date(NOW - DAY).toISOString() }), NOW)).toBe(false)
  })
  it("dueNudges: chờ mình ≥2 ngày, chờ đối tác ≥5 ngày, không nhắc lại trong 3 ngày", () => {
    const rows = [
      R({ id: "me3", status: "waiting_me", last_at: new Date(NOW - 3 * DAY).toISOString() }),
      R({ id: "me1", status: "waiting_me", last_at: new Date(NOW - 1 * DAY).toISOString() }),
      R({ id: "p6", status: "waiting_partner", last_at: new Date(NOW - 6 * DAY).toISOString() }),
      R({ id: "p3", status: "waiting_partner", last_at: new Date(NOW - 3 * DAY).toISOString() }),
      R({ id: "nudged", status: "waiting_me", last_at: new Date(NOW - 9 * DAY).toISOString(), nudged_at: new Date(NOW - 1 * DAY).toISOString() }),
      R({ id: "oldnudge", status: "waiting_me", last_at: new Date(NOW - 9 * DAY).toISOString(), nudged_at: new Date(NOW - 4 * DAY).toISOString() }),
      R({ id: "done", status: "done", last_at: new Date(NOW - 20 * DAY).toISOString() }),
    ]
    expect(dueNudges(rows, NOW).map(r => r.id)).toEqual(["oldnudge", "p6", "me3"])
    expect(waitingDays(R({ last_at: new Date(NOW - 3 * DAY).toISOString() }), NOW)).toBe(3)
  })
  it("nudgeMessage có hai nhóm; rỗng nếu không có luồng", () => {
    const t = nudgeMessage([R({ status: "waiting_me", next_action: "Trả lời giá" }), R({ id: "x", status: "waiting_partner" })], "L", NOW)
    expect(t).toContain("Chờ anh trả lời (1)"); expect(t).toContain("đối tác chưa trả lời (1)"); expect(t).toContain("Việc: ".slice(0, 0) + "việc: Trả lời giá")
    expect(nudgeMessage([], "L", NOW)).toBe("")
  })
})
