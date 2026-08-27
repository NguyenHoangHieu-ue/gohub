// Quét thread gần đây trong 1 group Lark — logic dùng chung, tách ra từ Cà Thread
// (api/creator/ca-thread/route.ts) để My Metrics Lark auto-scan (cron) dùng lại thay vì chép logic.
import { getLarkToken } from "@/lib/lark"

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
      const c = body?.zh_cn?.content ?? body?.en_us?.content ?? []
      return c.flat().map((el: any) => {
        if (el.tag === "text") return el.text ?? ""
        if (el.tag === "at") return `@${el.user_name ?? el.user_id}`
        if (el.tag === "a") return el.text ?? el.href ?? ""
        return ""
      }).join("").trim()
    }
    return ""
  } catch { return "" }
}

export interface LarkMention { id: string; id_type?: string; name: string }
export interface LarkThreadReply {
  open_id: string; name: string; content: string; create_time: string
  sender_type: string       // "user" | "app" | ... — Lark's sender.sender_type
  mentions: LarkMention[]
}
export interface LarkThread {
  message_id:  string
  thread_id:   string
  create_time: string       // ms epoch string, gốc từ Lark
  content:     string
  sender_open_id: string
  sender_name: string
  sender_type: string
  mentions: LarkMention[]   // người được @ trong tin gốc
  reaction_emojis: string[] // emoji_type trên root message (vd ["THUMBSUP"])
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

async function hydrateThread(msg: any, appToken: string, nameMap: Record<string, string>): Promise<LarkThread> {
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
      create_time: msg.create_time,
      content:    parseLarkContent(msg),
      sender_open_id: msg.sender?.id ?? "",
      sender_name:    nameMap[msg.sender?.id ?? ""] ?? (msg.sender?.id ?? "?"),
      sender_type:    msg.sender?.sender_type ?? "",
      mentions:   mentionsOf(msg),
      reaction_emojis,
      replies: replies.map((r: any) => ({
        open_id: r.sender?.id ?? "",
        name:    nameMap[r.sender?.id ?? ""] ?? (r.sender?.id ?? "?"),
        content: parseLarkContent(r),
        create_time: r.create_time,
        sender_type: r.sender?.sender_type ?? "",
        mentions: mentionsOf(r),
      })),
    }
}
