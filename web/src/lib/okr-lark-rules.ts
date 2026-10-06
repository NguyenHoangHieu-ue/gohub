// Luật tính case SLA/Vendor Speed từ thread Lark — Hiếu chốt 2026-10-06 (s225), THAY cho việc để AI tự quyết "xong chưa":
//  1. Chỉ tính thread trong group được chọn (mặc định "Telecom Product (Private)").
//  2. Thread Hiếu tự đăng → không tính.
//  3. Thread người khác đăng → bắt đầu tính từ tin ĐẦU TIÊN tag Hiếu (tin gốc hoặc reply). Không tag Hiếu → không phải case.
//  4. Hiếu thả emoji YES vào bất kỳ tin nào trong thread → đóng thread, không tính.
//  5. Xong = tin trả lời CỦA HIẾU (sau mốc bắt đầu) được CHÍNH HIẾU thả emoji "Typing". Chưa có → case còn mở.
// AI chỉ còn dùng để phân loại SLA hay Vendor Speed.

export interface RuleReaction { emoji: string; operatorId: string }
export interface RuleMessage { message_id: string; sender_open_id: string; create_time: string; content: string; mentionIds: string[]; reactions: RuleReaction[] }
export interface RuleThread { chat_name: string; root: RuleMessage; replies: RuleMessage[] }

export type RuleOutcome =
  | { kind: "skip"; reason: string }                                     // không phải case (ngoài group, tự đăng, không tag)
  | { kind: "closed"; reason: string; start: RuleMessage }                // YES — đóng, không tính
  | { kind: "open"; reason: string; start: RuleMessage }                  // đã tag, chưa đánh dấu Typing
  | { kind: "done"; reason: string; start: RuleMessage; done: RuleMessage }

export const DEFAULT_CASE_GROUPS = ["Telecom Product (Private)"]
const isYes = (e: string) => /^yes$/i.test(e)
const isTyping = (e: string) => /^typing$/i.test(e)
const norm = (s: string) => s.trim().toLowerCase()

export function evaluateThread(t: RuleThread, hieuId: string, caseGroups: string[] = DEFAULT_CASE_GROUPS): RuleOutcome {
  if (!caseGroups.some(g => norm(g) === norm(t.chat_name))) return { kind: "skip", reason: `Ngoài group tính case (${t.chat_name || "?"})` }
  if (t.root.sender_open_id === hieuId) return { kind: "skip", reason: "Thread anh tự đăng — không tính" }
  const all = [t.root, ...t.replies].sort((a, b) => Number(a.create_time) - Number(b.create_time))
  const start = all.find(m => m.mentionIds.includes(hieuId))
  if (!start) return { kind: "skip", reason: "Thread chưa tag anh — không phải case" }
  const yes = all.find(m => m.reactions.some(r => isYes(r.emoji) && r.operatorId === hieuId))
  if (yes) return { kind: "closed", reason: "Anh thả YES — đóng thread, không tính", start }
  const done = all.find(m => m.sender_open_id === hieuId && Number(m.create_time) >= Number(start.create_time)
    && m.reactions.some(r => isTyping(r.emoji) && r.operatorId === hieuId))
  if (done) return { kind: "done", reason: "Câu trả lời của anh có emoji Typing", start, done }
  return { kind: "open", reason: "Đã tag anh, chưa có câu trả lời nào được anh đánh dấu Typing", start }
}

/** Lệnh nhắc bot ghi nhận: Hiếu tag bot "Note đi" / "note" trong thread. */
export const isNoteCommand = (text: string) => /^\s*note(\s+đi)?\s*[.!]*\s*$/i.test(text)
