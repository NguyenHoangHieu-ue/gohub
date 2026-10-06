import { describe, test, expect } from "vitest"
import { evaluateThread, isNoteCommand, type RuleMessage } from "@/lib/okr-lark-rules"

const H = "ou_hieu", A = "ou_a", B = "ou_b"
const m = (id: string, sender: string, t: number, opts: Partial<RuleMessage> = {}): RuleMessage =>
  ({ message_id: id, sender_open_id: sender, create_time: String(t), content: "", mentionIds: [], reactions: [], ...opts })
const G = "Telecom Product (Private)"

describe("evaluateThread — luật Hiếu chốt s225", () => {
  test("ngoài group, tự đăng, chưa tag → không phải case", () => {
    expect(evaluateThread({ chat_name: "Group khác", root: m("r", A, 1, { mentionIds: [H] }), replies: [] }, H).kind).toBe("skip")
    expect(evaluateThread({ chat_name: G, root: m("r", H, 1), replies: [m("x", A, 2, { mentionIds: [H] })] }, H)).toMatchObject({ kind: "skip", reason: expect.stringContaining("tự đăng") })
    expect(evaluateThread({ chat_name: G, root: m("r", A, 1), replies: [m("x", B, 2)] }, H)).toMatchObject({ kind: "skip", reason: expect.stringContaining("chưa tag") })
  })
  test("bắt đầu từ tin đầu tiên tag anh (giữa thread), xong khi câu trả lời của anh có Typing do anh thả", () => {
    const out = evaluateThread({ chat_name: G, root: m("r", A, 100), replies: [
      m("x1", B, 200), m("x2", B, 300, { mentionIds: [H] }),
      m("h1", H, 400, { reactions: [{ emoji: "Typing", operatorId: A }] }),      // người khác thả → không tính
      m("h2", H, 500, { reactions: [{ emoji: "Typing", operatorId: H }] }),
    ] }, H)
    expect(out).toMatchObject({ kind: "done", start: { message_id: "x2" }, done: { message_id: "h2" } })
  })
  test("YES do anh thả → đóng; YES người khác thả không có hiệu lực", () => {
    const base = { chat_name: G, root: m("r", A, 1, { mentionIds: [H] }) }
    expect(evaluateThread({ ...base, replies: [m("h", H, 2, { reactions: [{ emoji: "YES", operatorId: H }] })] }, H).kind).toBe("closed")
    expect(evaluateThread({ ...base, root: m("r", A, 1, { mentionIds: [H], reactions: [{ emoji: "YES", operatorId: A }] }), replies: [] }, H).kind).toBe("open")
  })
  test("Typing trước lúc được tag hoặc trên tin người khác không tính", () => {
    const out = evaluateThread({ chat_name: G, root: m("r", A, 100), replies: [
      m("h0", H, 150, { reactions: [{ emoji: "Typing", operatorId: H }] }),
      m("t", A, 200, { mentionIds: [H], reactions: [{ emoji: "Typing", operatorId: H }] }),
    ] }, H)
    expect(out.kind).toBe("open")
  })
  test("lệnh Note đi", () => {
    expect(isNoteCommand("Note đi")).toBe(true)
    expect(isNoteCommand(" note ")).toBe(true)
    expect(isNoteCommand("note giúp em giá Nhật")).toBe(false)
  })
})
