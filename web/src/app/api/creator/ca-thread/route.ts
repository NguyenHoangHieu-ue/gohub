import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkToken, getLarkUserToken } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"

const LARK = "https://open.larksuite.com/open-apis"
const CONFIG_KEY = "ca_thread_config"
const DEFAULT_MESSAGE = "Dạ thread này còn update thêm thông tin gì nữa không ạ a/c"

async function requireCreatorOrAdmin() {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) throw new Error("Unauthorized")
  return session
}

async function larkGet(path: string, token: string) {
  const res = await fetch(`${LARK}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

function parseLarkContent(msg: any): string {
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!["creator", "admin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Debug mode (giữ lại để troubleshoot)
  if (req.nextUrl.searchParams.get("debug") === "1") {
    try {
      const { chat_id } = await req.json()
      const appToken = await getLarkToken()
      const [chatInfo, msgList] = await Promise.all([
        larkGet(`/im/v1/chats/${encodeURIComponent(chat_id)}`, appToken),
        larkGet(`/im/v1/messages?container_id=${encodeURIComponent(chat_id)}&container_id_type=chat&page_size=1`, appToken),
      ])
      return NextResponse.json({ chat_id, chatInfo, msgList })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  const body = await req.json()
  const { action } = body
  if (action === "scan") return handleScan(body)
  if (action === "send") return handleSend(body)
  return NextResponse.json({ error: "action phải là scan hoặc send" }, { status: 400 })
}

interface ThreadScanResult {
  message_id: string
  thread_id: string
  create_time: string
  days_ago: number
  content: string
  participants: { open_id: string; name: string }[]
  replies: { open_id: string; name: string; content: string; create_time: string }[]
}

async function handleScan({ chat_id, emoji_type = "THUMBSUP", days_back = 7, my_open_id, max_threads = 20 }: any) {
  if (!chat_id) return NextResponse.json({ error: "Thiếu chat_id" }, { status: 400 })

  const appToken = await getLarkToken()
  const since = Math.floor(Date.now() / 1000) - days_back * 86400
  const now = Math.floor(Date.now() / 1000)

  // Lấy danh sách thành viên group để map open_id → tên
  const nameMap: Record<string, string> = {}
  try {
    const membersData = await larkGet(
      `/im/v1/chats/${encodeURIComponent(chat_id)}/members?member_id_type=open_id&page_size=100`,
      appToken
    )
    for (const m of (membersData.data?.items ?? [])) {
      if (m.member_id) nameMap[m.member_id] = m.name ?? m.member_id
    }
  } catch {} // fallback vào mentions nếu API members lỗi

  // Lấy messages gần nhất
  const data = await larkGet(
    `/im/v1/messages?container_id=${encodeURIComponent(chat_id)}&container_id_type=chat&page_size=50`,
    appToken
  )
  if (data.code !== 0) return NextResponse.json({ error: `Lark [${data.code}]: ${data.msg}` }, { status: 500 })

  const rootMessages = (data.data?.items ?? [])
    .filter((msg: any) => !msg.root_id && parseInt(msg.create_time) >= since && msg.thread_id)
    .slice(0, max_threads)

  const threads: ThreadScanResult[] = []

  await Promise.all(rootMessages.map(async (msg: any) => {
    const msgId: string = msg.message_id
    const threadId: string = msg.thread_id

    const [threadData, reactionData] = await Promise.all([
      larkGet(`/im/v1/messages?container_id=${encodeURIComponent(threadId)}&container_id_type=thread&page_size=50`, appToken),
      larkGet(`/im/v1/messages/${msgId}/reactions?page_size=50`, appToken),
    ])

    const reactions: any[] = reactionData.data?.items ?? []
    const hasYes = reactions.some((r: any) => r.emoji?.emoji_type === emoji_type)
    if (hasYes) return // bỏ qua thread đã có reaction YES

    const threadMsgs: any[] = threadData.data?.items ?? []
    const replies = threadMsgs.filter((m: any) => m.message_id !== msgId && !!m.root_id)
    if (replies.length === 0) return // bỏ qua thread chưa có reply

    // Bổ sung nameMap từ mentions trong các tin nhắn
    for (const m of [msg, ...replies]) {
      for (const mention of (m.mentions ?? [])) {
        if (mention.id && !nameMap[mention.id]) {
          nameMap[mention.id] = mention.name ?? mention.id
        }
      }
    }

    // Thu thập participants: người gửi + người được mention trong toàn thread
    const participantSet = new Set<string>()
    for (const m of [msg, ...replies]) {
      if (m.sender?.id && m.sender.sender_type === "user") participantSet.add(m.sender.id)
      for (const mention of (m.mentions ?? [])) {
        if (mention.id && mention.id_type === "open_id") participantSet.add(mention.id)
      }
    }
    if (my_open_id) participantSet.delete(my_open_id)
    participantSet.delete("")

    const participants = Array.from(participantSet).map(id => ({
      open_id: id,
      name: nameMap[id] ?? id,
    }))
    if (participants.length === 0) return

    threads.push({
      message_id: msgId,
      thread_id: threadId,
      create_time: msg.create_time,
      days_ago: Math.floor((now - parseInt(msg.create_time)) / 86400),
      content: parseLarkContent(msg),
      participants,
      replies: replies.map((r: any) => ({
        open_id: r.sender?.id ?? "",
        name: nameMap[r.sender?.id ?? ""] ?? (r.sender?.id ?? "?"),
        content: parseLarkContent(r),
        create_time: r.create_time,
      })),
    })
  }))

  threads.sort((a, b) => parseInt(b.create_time) - parseInt(a.create_time))
  return NextResponse.json({ ok: true, threads })
}

async function handleSend({ message_id, participants, message_text }: any) {
  if (!message_id) return NextResponse.json({ error: "Thiếu message_id" }, { status: 400 })

  const userToken = await getLarkUserToken()
  if (!userToken) {
    return NextResponse.json({
      error: "Chưa kết nối Lark cá nhân. Vào Creator → mục Cà Thread → bấm 'Kết nối Lark'.",
    }, { status: 401 })
  }

  const text = (message_text ?? DEFAULT_MESSAGE).trim()
  const atTags = (participants ?? []).map((uid: string) => ({ tag: "at", user_id: uid }))
  const postContent = {
    zh_cn: {
      title: "",
      content: [[...atTags, { tag: "text", text: atTags.length > 0 ? ` ${text}` : text }]],
    },
  }

  const sendRes = await fetch(`${LARK}/im/v1/messages/${message_id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ msg_type: "post", content: JSON.stringify(postContent) }),
  })
  const sendData = await sendRes.json()
  if (sendData.code !== 0) {
    return NextResponse.json({ error: `[${sendData.code}] ${sendData.msg}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
