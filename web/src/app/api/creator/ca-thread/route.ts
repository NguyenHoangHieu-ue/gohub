import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkUserToken } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"

const LARK = "https://open.larksuite.com/open-apis"
const CONFIG_KEY = "ca_thread_config"

async function requireCreatorOrAdmin() {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireCreatorOrAdmin()
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    return NextResponse.json(data?.value ? JSON.parse(data.value) : {})
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireCreatorOrAdmin()
    const config = await req.json()
    await supabaseAdmin.from("app_settings").upsert(
      { key: CONFIG_KEY, value: JSON.stringify(config), category: "lark_tool" },
      { onConflict: "key" }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

async function larkGet(path: string, token: string) {
  const res = await fetch(`${LARK}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

interface ThreadResult {
  message_id: string
  create_time: string
  has_yes: boolean
  reply_count: number
  reminded_users: string[]
  sent: boolean
  error?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const {
    chat_id,
    emoji_type = "THUMBSUP",
    days_back = 7,
    my_open_id,
    dry_run = false,
    max_threads = 20,
  } = await req.json()

  if (!chat_id) return NextResponse.json({ error: "Thiếu chat_id" }, { status: 400 })

  try {
    const token = await getLarkUserToken()
    if (!token) return NextResponse.json({ error: "Chưa kết nối Lark cá nhân. Vào Gấu Pro → bấm 'Kết nối Lark' rồi thử lại." }, { status: 401 })
    const since = Math.floor(Date.now() / 1000) - days_back * 86400

    // 1. List root messages in the group chat (paginated, filter by start_time)
    const rootMessages: any[] = []
    let pageToken: string | undefined

    do {
      const qs = new URLSearchParams({
        container_id: chat_id,
        container_type: "chat",
        page_size: "50",
        start_time: String(since),    // unix seconds — Lark sẽ chỉ trả messages sau thời điểm này
        user_id_type: "open_id",
      })
      if (pageToken) qs.set("page_token", pageToken)

      const data = await larkGet(`/im/v1/messages?${qs}`, token)
      if (data.code !== 0) throw new Error(`Lark list-messages [${data.code}]: ${data.msg}`)

      const items: any[] = data.data?.items ?? []
      // Root messages have no root_id; skip thread replies that appear in the list
      for (const msg of items) {
        if (!msg.root_id) rootMessages.push(msg)
      }

      pageToken = data.data?.has_more ? data.data.page_token : undefined
    } while (pageToken)

    // 2. Process each root message that has a thread
    const results: ThreadResult[] = []
    let remindedCount = 0

    for (const msg of rootMessages) {
      if (results.filter(r => r.sent || r.reminded_users.length > 0).length >= max_threads) break

      const msgId: string = msg.message_id
      // thread_id exists when at least one reply was made in the thread
      const threadId: string = msg.thread_id || msgId
      if (!msg.thread_id) continue // no thread started yet → skip

      // Get thread messages (includes root + all replies)
      const threadData = await larkGet(
        `/im/v1/messages?container_id=${encodeURIComponent(threadId)}&container_type=thread&page_size=50`,
        token
      )
      if (threadData.code !== 0 && threadData.code !== undefined) continue // thread không đọc được → bỏ qua
      const threadMsgs: any[] = threadData.data?.items ?? []
      const replies = threadMsgs.filter(m => m.message_id !== msgId && !!m.root_id)

      if (replies.length === 0) continue // no actual replies

      // Check if YES reaction exists on root message
      const reactionData = await larkGet(
        `/im/v1/messages/${msgId}/reactions?page_size=50`,
        token
      )
      const reactions: any[] = reactionData.data?.items ?? []
      const hasYes = reactions.some(r => r.emoji?.emoji_type === emoji_type)

      if (hasYes) {
        results.push({ message_id: msgId, create_time: msg.create_time, has_yes: true, reply_count: replies.length, reminded_users: [], sent: false })
        continue
      }

      // Collect unique participants (sender + @mentioned in all thread messages)
      const userIds = new Set<string>()
      for (const m of [msg, ...replies]) {
        if (m.sender?.id && m.sender.sender_type === "user") userIds.add(m.sender.id)
        for (const mention of (m.mentions ?? [])) {
          if (mention.id && mention.id_type === "open_id") userIds.add(mention.id)
        }
      }
      if (my_open_id) userIds.delete(my_open_id)
      userIds.delete("")

      const participantIds = Array.from(userIds)
      if (participantIds.length === 0) continue

      const entry: ThreadResult = {
        message_id: msgId,
        create_time: msg.create_time,
        has_yes: false,
        reply_count: replies.length,
        reminded_users: participantIds,
        sent: false,
      }

      if (!dry_run) {
        try {
          const atTags = participantIds.map(uid => ({ tag: "at", user_id: uid }))
          const postContent = {
            zh_cn: {
              title: "",
              content: [[...atTags, { tag: "text", text: " Dạ thread này còn update thêm thông tin gì nữa không ạ a/c" }]],
            },
          }
          const sendRes = await fetch(`${LARK}/im/v1/messages/${msgId}/reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ msg_type: "post", content: JSON.stringify(postContent) }),
          })
          const sendData = await sendRes.json()
          if (sendData.code === 0) { entry.sent = true; remindedCount++ }
          else entry.error = `[${sendData.code}] ${sendData.msg}`
        } catch (e: any) {
          entry.error = e.message
        }
      }

      results.push(entry)
    }

    return NextResponse.json({
      ok: true,
      dry_run,
      scanned_root: rootMessages.length,
      threads_found: results.length,
      reminded: remindedCount,
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
