import { describe, test, expect } from "vitest"
import { evaluateThread, isNoteCommand, isMonthEndWarning, larkThreadLink, type RuleMessage } from "@/lib/okr-lark-rules"

const H = "ou_hieu", A = "ou_a", B = "ou_b"
const m = (id: string, sender: string, t: number, opts: Partial<RuleMessage> = {}): RuleMessage =>
  ({ message_id: id, sender_open_id: sender, create_time: String(t), content: "", mentionIds: [], reactions: [], ...opts })
const G = "Telecom Product (Private)"
const YES = { emoji: "YES", operatorId: H }, TYPING = { emoji: "Typing", operatorId: H }

describe("evaluateThread — luật Hiếu chốt s225", () => {
  test("ngoài group, tự đăng, chưa tag → không phải case", () => {
    expect(evaluateThread({ chat_name: "Group khác", root: m("r", A, 1, { mentionIds: [H] }), replies: [] }, H).kind).toBe("skip")
    expect(evaluateThread({ chat_name: G, root: m("r", H, 1), replies: [m("x", A, 2, { mentionIds: [H] })] }, H)).toMatchObject({ kind: "skip", reason: expect.stringContaining("tự đăng") })
    expect(evaluateThread({ chat_name: G, root: m("r", A, 1), replies: [m("x", B, 2)] }, H)).toMatchObject({ kind: "skip", reason: expect.stringContaining("chưa tag") })
  })
  test("tên group so lỏng: Telecom Product(s) (Private)", () => {
    const th = (name: string) => ({ chat_name: name, root: m("r", A, 1, { mentionIds: [H] }), replies: [] })
    expect(evaluateThread(th("Telecom Products (Private)"), H, ["Telecom Product (Private)"]).kind).toBe("open")
    expect(evaluateThread(th("telecom product private"), H).kind).toBe("open")
    expect(evaluateThread(th("Telecom Products"), H).kind).toBe("skip")
  })
  test("chưa YES = đang thảo luận, kể cả đã có Typing", () => {
    expect(evaluateThread({ chat_name: G, root: m("r", A, 1, { mentionIds: [H] }), replies: [m("h", H, 2, { reactions: [TYPING] })] }, H).kind).toBe("open")
  })
  test("YES + Typing trên câu trả lời của anh → xong; tính từ tin đầu tiên tag anh (giữa thread)", () => {
    const out = evaluateThread({ chat_name: G, root: m("r", A, 100, { reactions: [YES] }), replies: [
      m("x1", B, 200), m("x2", B, 300, { mentionIds: [H] }),
      m("h1", H, 400, { reactions: [{ emoji: "Typing", operatorId: A }] }),      // người khác thả → không tính
      m("h2", H, 500, { reactions: [TYPING] }),
    ] }, H)
    expect(out).toMatchObject({ kind: "done", start: { message_id: "x2" }, done: { message_id: "h2" } })
  })
  test("YES mà chưa có Typing → cần đánh dấu; YES người khác thả không tính là xong thảo luận", () => {
    const base = { chat_name: G, root: m("r", A, 1, { mentionIds: [H] }) }
    expect(evaluateThread({ ...base, replies: [m("h", H, 2, { reactions: [YES] })] }, H).kind).toBe("needs_mark")
    expect(evaluateThread({ ...base, root: m("r", A, 1, { mentionIds: [H], reactions: [{ emoji: "YES", operatorId: A }] }), replies: [] }, H).kind).toBe("open")
  })
  test("tin nhắc của bot tag anh không phải mốc bắt đầu; Typing trước lúc được tag không tính", () => {
    expect(evaluateThread({ chat_name: G, root: m("r", A, 1, { reactions: [YES] }), replies: [m("bot", "ou_bot", 2, { mentionIds: [H], fromApp: true })] }, H).kind).toBe("skip")
    expect(evaluateThread({ chat_name: G, root: m("r", A, 100, { reactions: [YES] }), replies: [
      m("h0", H, 150, { reactions: [TYPING] }), m("t", A, 200, { mentionIds: [H] }),
    ] }, H).kind).toBe("needs_mark")
  })
  test("lệnh Note đi, cảnh báo cuối tháng, link thread", () => {
    expect(isNoteCommand("Note đi")).toBe(true)
    expect(isNoteCommand(" note ")).toBe(true)
    expect(isNoteCommand("note giúp em giá Nhật")).toBe(false)
    expect(isMonthEndWarning(new Date("2026-10-24T10:00:00+07:00"))).toBe(false)
    expect(isMonthEndWarning(new Date("2026-10-25T08:30:00+07:00"))).toBe(true)
    expect(larkThreadLink("oc_1", "om_2")).toContain("thread/open?openthreadid=om_2&openchatid=oc_1")
  })
})
