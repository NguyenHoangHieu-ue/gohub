// Quét thread gần đây trong 1 group Lark — logic dùng chung, tách ra từ Cà Thread
// (api/creator/ca-thread/route.ts) để My Metrics Lark auto-scan (cron) dùng lại thay vì chép logic.
import { getLarkToken, getLarkUserInfo } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"

const LARK = "https://open.larksuite.com/open-apis"

async function larkGet(path: string, token: string) {
  const res = await fetch(`${LARK}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

export function parseLarkContent(msg: any): string {
  try {
    const body = JSON.parse(msg.body?.content ?? '"[trống]"')
    if (msg.msg_type === "text") return String(body?.text ?? "")
    if (msg.msg_type === "post") {
      // API trả rich-text dạng {"title","content"} KHÔNG bọc zh_cn/en_us (webhook cũng ghi chú dạng này) — trước chỉ đọc bản có bọc
      // nên tin gốc của mọi thread ra RỖNG, bot Lark My Metrics phải đoán từ reply (QA s225).
      const post = body?.zh_cn ?? body?.en_us ?? body
      const c = post?.content ?? []
      const text = c.flat().map((el: any) => {
        if (el.tag === "text") return el.text ?? ""
        if (el.tag === "at") return `@${el.user_name ?? el.user_id}`
        if (el.tag === "a") return el.text ?? el.href ?? ""
        if (el.tag === "img") return "[ảnh]"
        if (el.tag === "media") return "[video]"
        if (el.tag === "emotion") return `:${el.emoji_type ?? ""}:`
        return ""
      }).join("").trim()
      return [post?.title, text].filter(Boolean).join(" — ")
    }
    if (msg.msg_type === "image") return "[ảnh]"
    if (msg.msg_type === "file") return `[file ${body?.file_name ?? ""}]`.trim()
    if (msg.msg_type === "media") return "[video]"
    if (msg.msg_type === "sticker") return "[sticker]"
    if (msg.msg_type === "interactive") return "[thẻ]"
    return ""
  } catch { return "" }
}

export interface LarkMention { id: string; id_type?: string; name: string }
export interface LarkReaction { emoji: string; operatorId: string }
export interface LarkThreadReply {
  message_id: string
  open_id: string; name: string; content: string; create_time: string
  reactions?: LarkReaction[]   // chỉ có khi hydrate với allReactions (bot My Metrics)
  sender_type: string       // "user" | "app" | ... — Lark's sender.sender_type
  mentions: LarkMention[]
}
export interface LarkThread {
  message_id:  string
  thread_id:   string
  chat_id:     string
  create_time: string       // ms epoch string, gốc từ Lark
  content:     string
  sender_open_id: string
  sender_name: string
  sender_type: string
  mentions: LarkMention[]   // người được @ trong tin gốc
  reaction_emojis: string[] // emoji_type trên root message (vd ["THUMBSUP"])
  reactions: LarkReaction[] // emoji trên root kèm người thả (open_id)
  replies: LarkThreadReply[]
}

// Lấy các thread ROOT (không phải reply) trong `daysBack` ngày gần nhất của 1 group, kèm
// replies + reactions của từng thread. Không lọc gì thêm — caller (ca-thread / lark-scan cron)
// tự áp bộ lọc riêng của mình (reaction YES, participant, v.v.)
export async function fetchRecentThreads(
  chatId: string,
  daysBack = 7,
  maxThreads = 20,
): Promise<LarkThread[]> {
  const appToken = await getLarkToken()
  const since = Date.now() - daysBack * 86400 * 1000

  const nameMap: Record<string, string> = {}
  try {
    const membersData = await larkGet(
      `/im/v1/chats/${encodeURIComponent(chatId)}/members?member_id_type=open_id&page_size=100`,
      appToken
    )
    for (const m of (membersData.data?.items ?? [])) {
      if (m.member_id) nameMap[m.member_id] = m.name ?? m.member_id
    }
  } catch { /* fallback vào mentions bên dưới */ }

  // Trần trang là VALVE AN TOÀN, không phải điều kiện dừng chính (điều kiện dừng thật là "đã ra
  // ngoài cửa sổ daysBack" hoặc "hết trang" — xem check inWindow bên dưới). Trước hardcode 5 trang
  // (250 tin) — với group nhiều tin/ngày, 250 tin đầu có thể chỉ phủ vài ngày thay vì đủ daysBack
  // yêu cầu, phần còn lại cửa sổ KHÔNG BAO GIỜ được fetch tới dù message vẫn còn trong Lark. Scale
  // theo daysBack để nhóm chat bận vẫn quét đủ (2026-08-27, Hiếu báo set 30 ngày mà quét được 0 case).
  const maxPages = Math.min(80, Math.max(10, daysBack * 3))
  const allItems: any[] = []
  let pageToken: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const url = `/im/v1/messages?container_id=${encodeURIComponent(chatId)}&container_id_type=chat&page_size=50&sort_type=ByCreateTimeDesc${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`
    const pageData = await larkGet(url, appToken)
    if (pageData.code !== 0) {
      if (page === 0) throw new Error(`Lark [${pageData.code}]: ${pageData.msg}`)
      break
    }
    const items: any[] = pageData.data?.items ?? []
    if (items.length === 0) break

    const inWindow = items.filter((m: any) => parseInt(m.create_time) >= since)
    allItems.push(...inWindow)

    if (inWindow.length < items.length || !pageData.data?.has_more || !pageData.data?.page_token) break
    pageToken = pageData.data.page_token
  }

  const rootMessages = allItems.filter((msg: any) => !msg.root_id).slice(0, maxThreads)

  // Hydrate chi tiết từng thread (2 call Lark/thread) theo BATCH nhỏ, không bắn hết cùng lúc — với
  // maxThreads lớn (group bận, daysBack dài) bắn hàng trăm request song song dễ bị Lark rate-limit.
  const BATCH = 15
  const threads: LarkThread[] = []
  for (let i = 0; i < rootMessages.length; i += BATCH) {
    const batch = rootMessages.slice(i, i + BATCH)
    const hydrated = await Promise.all(batch.map((msg: any) => hydrateThread(msg, appToken, nameMap)))
    threads.push(...hydrated)
  }

  threads.sort((a, b) => parseInt(b.create_time) - parseInt(a.create_time))
  return threads
}

const reactionsOf = (items: any[]): LarkReaction[] =>
  items.map((r: any) => ({ emoji: String(r.reaction_type?.emoji_type ?? ""), operatorId: String(r.operator?.operator_id ?? "") })).filter(r => r.emoji)

// allReactions: lấy emoji của TỪNG reply (bot My Metrics cần YES/Typing ở mọi tin) — tốn thêm 1 call/reply nên mặc định tắt (Cà Thread).
async function hydrateThread(msg: any, appToken: string, nameMap: Record<string, string>, allReactions = false): Promise<LarkThread> {
    const msgId: string = msg.message_id
    const containerId: string = msg.thread_id || msgId

    const [threadData, reactionData] = await Promise.all([
      larkGet(`/im/v1/messages?container_id=${encodeURIComponent(containerId)}&container_id_type=thread&page_size=50`, appToken),
      larkGet(`/im/v1/messages/${msgId}/reactions?page_size=50`, appToken),
    ])

    const reactions: any[] = reactionData.data?.items ?? []
    const reaction_emojis = reactions.map((r: any) => r.reaction_type?.emoji_type).filter(Boolean)

    const threadMsgs: any[] = threadData.data?.items ?? []
    const replies = threadMsgs.filter((m: any) => m.message_id !== msgId)
    const replyReactions = new Map<string, LarkReaction[]>()
    if (allReactions) {
      for (let i = 0; i < replies.length; i += 10) {
        const part = replies.slice(i, i + 10)
        const got = await Promise.all(part.map((r: any) => larkGet(`/im/v1/messages/${r.message_id}/reactions?page_size=50`, appToken)))
        part.forEach((r: any, k: number) => replyReactions.set(r.message_id, reactionsOf(got[k].data?.items ?? [])))
      }
      // Tên người gửi không bị @ ở đâu thì nameMap không có → tra danh bạ (trước hiện mã ou_…)
      const unknown = Array.from(new Set([msg, ...replies].map((m: any) => m.sender?.id).filter((id: string) => id && !nameMap[id])))
      await Promise.all(unknown.map(async (id: string) => { const u = await getLarkUserInfo(id); if (u?.name) nameMap[id] = u.name }))
    }

    for (const m of [msg, ...replies]) {
      for (const mention of (m.mentions ?? [])) {
        if (mention.id && !nameMap[mention.id]) nameMap[mention.id] = mention.name ?? mention.id
      }
    }

    const mentionsOf = (m: any): LarkMention[] =>
      (m.mentions ?? []).map((mn: any) => ({ id: mn.id, id_type: mn.id_type, name: nameMap[mn.id] ?? mn.name ?? mn.id }))

    return {
      message_id: msgId,
      thread_id:  containerId,
      chat_id:    msg.chat_id ?? "",
      create_time: msg.create_time,
      content:    parseLarkContent(msg),
      sender_open_id: msg.sender?.id ?? "",
      sender_name:    nameMap[msg.sender?.id ?? ""] ?? (msg.sender?.id ?? "?"),
      sender_type:    msg.sender?.sender_type ?? "",
      mentions:   mentionsOf(msg),
      reaction_emojis,
      reactions: reactionsOf(reactions),
      replies: replies.map((r: any) => ({
        message_id: r.message_id,
        reactions: allReactions ? replyReactions.get(r.message_id) ?? [] : undefined,
        open_id: r.sender?.id ?? "",
        name:    nameMap[r.sender?.id ?? ""] ?? (r.sender?.id ?? "?"),
        content: parseLarkContent(r),
        create_time: r.create_time,
        sender_type: r.sender?.sender_type ?? "",
        mentions: mentionsOf(r),
      })),
    }
}

// Lấy 1 message theo message_id (dùng để hydrate root message của thread phát hiện qua capture log —
// khác fetchRecentThreads vốn lấy root từ list toàn group). Lark trả `items` mảng 1 phần tử.
async function fetchMessageById(messageId: string, appToken: string): Promise<any | null> {
  const data = await larkGet(`/im/v1/messages/${encodeURIComponent(messageId)}`, appToken)
  if (data.code !== 0) return null
  return data.data?.items?.[0] ?? null
}

// Hydrate lại đúng 1 thread theo message_id gốc — dùng cho nút "Vẫn tính case này" (override case tự
// đăng bị loại tự động): cần phân loại lại 1 thread cụ thể ngoài luồng quét hàng loạt.
export async function fetchThreadByMessageId(messageId: string, allReactions = false): Promise<LarkThread | null> {
  const appToken = await getLarkToken()
  const rootMsg = await fetchMessageById(messageId, appToken)
  if (!rootMsg) return null
  return hydrateThread(rootMsg, appToken, {}, allReactions)
}

// Tên hiển thị 1 group Lark theo chat_id — dùng để hiện "đã quét group nào" cho Hiếu đối chiếu, KHÔNG
// dùng để lọc/quyết định gì (source of truth phát hiện thread vẫn là capture log, xem hàm trên).
export async function getChatName(chatId: string, appToken: string): Promise<string> {
  try {
    const data = await larkGet(`/im/v1/chats/${encodeURIComponent(chatId)}`, appToken)
    return data.code === 0 ? (data.data?.name ?? chatId) : chatId
  } catch { return chatId }
}

// Danh sách group bot đang là thành viên — cho Hiếu CHỌN group thay vì phải tự tra chat_id tay khi
// dùng "Quét lịch sử 1 lần" (my-metrics/lark-config/scan-history).
export async function listBotChats(appToken: string): Promise<{ chat_id: string; name: string }[]> {
  const out: { chat_id: string; name: string }[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 10; page++) {
    const data = await larkGet(`/im/v1/chats?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`, appToken)
    if (data.code !== 0) break
    for (const c of (data.data?.items ?? [])) out.push({ chat_id: c.chat_id, name: c.name || c.chat_id })
    if (!data.data?.has_more || !data.data?.page_token) break
    pageToken = data.data.page_token
  }
  return out
}

/**
 * Lấy thread liên quan tới Hiếu từ real-time capture log (okr_lark_message_log, ghi bởi
 * api/lark/events qua lib/okr-lark-capture.ts) thay vì quét REST toàn bộ 1 group — KHÔNG giới hạn
 * group (miễn bot có mặt), KHÔNG bỏ sót do lịch quét (mỗi tin ghi ngay khi Lark bắn event).
 * "thread_id" trong log = message_id gốc của thread → hydrate lại ĐẦY ĐỦ (root + mọi reply + reaction)
 * qua REST giống fetchRecentThreads, chỉ khác NGUỒN phát hiện "thread nào đáng xem".
 */
export async function fetchThreadsFromCapturedLog(daysBack = 7, maxThreads = 40, allReactions = false, extraThreadIds: string[] = []): Promise<LarkThread[]> {
  const since = Date.now() - daysBack * 86400 * 1000
  const { data, error } = await supabaseAdmin
    .from("okr_lark_message_log")
    .select("thread_id")
    .gte("create_time_ms", since)
    .order("create_time_ms", { ascending: false })
    .limit(2000)   // valve an toàn — dedupe theo thread_id bên dưới thường rút gọn nhiều so với số dòng thô
  if (error) throw new Error(`okr_lark_message_log query failed: ${error.message}`)

  const threadIds: string[] = []
  const seen = new Set<string>()
  // Thread đang mở (chưa có Typing/YES) phải đọc lại dù đã cũ hơn daysBack — trước đây phân loại 1 lần rồi bỏ.
  for (const id of extraThreadIds) if (!seen.has(id)) { seen.add(id); threadIds.push(id) }
  for (const row of (data ?? []) as { thread_id: string }[]) {
    if (seen.has(row.thread_id)) continue
    seen.add(row.thread_id)
    threadIds.push(row.thread_id)
    if (threadIds.length >= maxThreads) break
  }
  if (threadIds.length === 0) return []

  const appToken = await getLarkToken()
  const nameMap: Record<string, string> = {}
  const BATCH = 15
  const threads: LarkThread[] = []
  for (let i = 0; i < threadIds.length; i += BATCH) {
    const batch = threadIds.slice(i, i + BATCH)
    const hydrated = await Promise.all(batch.map(async id => {
      const rootMsg = await fetchMessageById(id, appToken)
      if (!rootMsg) return null
      return hydrateThread(rootMsg, appToken, nameMap, allReactions)
    }))
    threads.push(...hydrated.filter((t): t is LarkThread => t !== null))
  }

  threads.sort((a, b) => parseInt(b.create_time) - parseInt(a.create_time))
  return threads
}
