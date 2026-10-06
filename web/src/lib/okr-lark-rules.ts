// Luật tính case SLA/Vendor Speed từ thread Lark — Hiếu chốt 2026-10-06 (s225, sửa lại cùng ngày), THAY cho việc để AI tự quyết:
//  1. Chỉ tính thread trong group được chọn (mặc định "Telecom Product (Private)").
//  2. Thread Hiếu tự đăng → không tính.
//  3. Thread người khác đăng → bắt đầu tính từ tin ĐẦU TIÊN tag Hiếu (tin gốc hoặc reply; bỏ qua tin của bot).
//  4. Hiếu thả emoji YES (bất kỳ tin nào) = thread ĐÃ THẢO LUẬN XONG.
//     - Có câu trả lời của Hiếu (sau mốc bắt đầu) được Hiếu thả "Typing" → XONG, tính giờ tới câu đó.
//     - Chưa có Typing → CẦN ĐÁNH DẤU: bot vào thread tag Hiếu nhắc; Hiếu thả Typing rồi tag bot "Note đi".
//  5. Chưa có YES = đang thảo luận → bỏ qua, quét lại hằng ngày; từ ngày 25 trong tháng thì DM cảnh báo Hiếu.
// AI chỉ còn dùng để phân loại SLA hay Vendor Speed.

export interface RuleReaction { emoji: string; operatorId: string }
export interface RuleMessage { message_id: string; sender_open_id: string; create_time: string; content: string; mentionIds: string[]; reactions: RuleReaction[]; fromApp?: boolean }
export interface RuleThread { chat_name: string; root: RuleMessage; replies: RuleMessage[] }

export type RuleOutcome =
  | { kind: "skip"; reason: string }                                     // không phải case (ngoài group, tự đăng, không tag)
  | { kind: "open"; reason: string; start: RuleMessage }                  // chưa YES — đang thảo luận
  | { kind: "needs_mark"; reason: string; start: RuleMessage }            // đã YES, chưa có câu trả lời nào được đánh dấu Typing
  | { kind: "done"; reason: string; start: RuleMessage; done: RuleMessage }

export const DEFAULT_CASE_GROUPS = ["Telecom Product (Private)"]
const isYes = (e: string) => /^yes$/i.test(e)
const isTyping = (e: string) => /^typing$/i.test(e)
const norm = (s: string) => s.trim().toLowerCase()

export function evaluateThread(t: RuleThread, hieuId: string, caseGroups: string[] = DEFAULT_CASE_GROUPS): RuleOutcome {
  if (!caseGroups.some(g => norm(g) === norm(t.chat_name))) return { kind: "skip", reason: `Ngoài group tính case (${t.chat_name || "?"})` }
  if (t.root.sender_open_id === hieuId) return { kind: "skip", reason: "Thread anh tự đăng — không tính" }
  const all = [t.root, ...t.replies].sort((a, b) => Number(a.create_time) - Number(b.create_time))
  const start = all.find(m => !m.fromApp && m.mentionIds.includes(hieuId))
  if (!start) return { kind: "skip", reason: "Thread chưa tag anh — không phải case" }
  const yes = all.some(m => m.reactions.some(r => isYes(r.emoji) && r.operatorId === hieuId))
  if (!yes) return { kind: "open", reason: "Chưa có YES — đang thảo luận, quét lại hằng ngày", start }
  const done = all.find(m => m.sender_open_id === hieuId && Number(m.create_time) >= Number(start.create_time)
    && m.reactions.some(r => isTyping(r.emoji) && r.operatorId === hieuId))
  if (done) return { kind: "done", reason: "Đã YES + câu trả lời của anh có Typing", start, done }
  return { kind: "needs_mark", reason: "Đã YES nhưng chưa có câu trả lời nào của anh được đánh dấu Typing", start }
}

/** Lệnh nhắc bot ghi nhận: Hiếu tag bot "Note đi" / "note" trong thread. */
export const isNoteCommand = (text: string) => /^\s*note(\s+đi)?\s*[.!]*\s*$/i.test(text)

/** Link mở thẳng thread trong Lark (AppLink thread/open; id thread = message_id tin gốc om_…). */
export const larkThreadLink = (chatId: string, rootMessageId: string) =>
  `https://applink.larksuite.com/client/thread/open?openthreadid=${encodeURIComponent(rootMessageId)}&openchatid=${encodeURIComponent(chatId)}&open_thread_id=${encodeURIComponent(rootMessageId)}&open_chat_id=${encodeURIComponent(chatId)}`
export const larkChatLink = (chatId: string) => `https://applink.larksuite.com/client/chat/open?openChatId=${encodeURIComponent(chatId)}`

/** Từ ngày 25 trong tháng (giờ VN) thì cảnh báo thread còn đang thảo luận. */
export function isMonthEndWarning(now = new Date()): boolean {
  return Number(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric" })) >= 25
}
