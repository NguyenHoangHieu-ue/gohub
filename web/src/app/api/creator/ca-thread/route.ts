import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkToken, getLarkUserToken } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"
import { fetchRecentThreads } from "@/lib/lark-thread-scan"

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

function normalizeConfig(raw: any): { groups: { chat_id: string; emoji_type?: string; days_back?: number; my_open_id?: string; name?: string }[] } {
  if (!raw || typeof raw !== "object") return { groups: [] }
  if (Array.isArray(raw.groups)) return { groups: raw.groups }
  // Backward-compat: shape cũ có chat_id ở root → wrap thành groups[0]
  if (raw.chat_id) return { groups: [{ chat_id: raw.chat_id, emoji_type: raw.emoji_type, days_back: raw.days_back, my_open_id: raw.my_open_id }] }
  return { groups: [] }
}

export async function GET() {
  try {
    await requireCreatorOrAdmin()
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const raw = data?.value ? JSON.parse(data.value) : null
    return NextResponse.json(normalizeConfig(raw))
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
  const username = (session!.user as any).username || session!.user?.email || "web"
  if (action === "scan") return handleScan(body)
  if (action === "send") return handleSend(body, username)
  if (action === "history") return handleHistory(body)
  return NextResponse.json({ error: "action phải là scan | send | history" }, { status: 400 })
}

interface ThreadScanResult {
  message_id: string
  thread_id: string
  create_time: string
  days_ago: number
  content: string
  participants: { open_id: string; name: string }[]
  replies: { open_id: string; name: string; content: string; create_time: string }[]
  already_sent?: boolean
  sent_at?: string
  sent_by?: string
}

async function handleScan({ chat_id, emoji_type = "THUMBSUP", days_back = 7, my_open_id, max_threads = 20 }: any) {
  if (!chat_id) return NextResponse.json({ error: "Thiếu chat_id" }, { status: 400 })

  const now = Date.now()
  let rawThreads
  try {
    rawThreads = await fetchRecentThreads(chat_id, days_back, max_threads)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const threads: ThreadScanResult[] = []

  for (const t of rawThreads) {
    // Lark reaction field path: emoji_type (không phải r.emoji)
    if (t.reaction_emojis.includes(emoji_type)) continue // bỏ qua thread đã có reaction YES
    if (t.replies.length === 0) continue // bỏ qua thread chưa có reply

    // Thu thập participants: người gửi (user thật, không phải bot) + người được mention trong toàn thread
    const participantSet = new Set<string>()
    if (t.sender_open_id && t.sender_type === "user") participantSet.add(t.sender_open_id)
    for (const mention of t.mentions) if (mention.id && mention.id_type === "open_id") participantSet.add(mention.id)
    for (const r of t.replies) {
      if (r.open_id && r.sender_type === "user") participantSet.add(r.open_id)
      for (const mention of r.mentions) if (mention.id && mention.id_type === "open_id") participantSet.add(mention.id)
    }
    if (my_open_id) participantSet.delete(my_open_id)
    participantSet.delete("")

    const nameOf = (id: string) =>
      t.sender_open_id === id ? t.sender_name : (t.replies.find(r => r.open_id === id)?.name
        ?? [...t.mentions, ...t.replies.flatMap(r => r.mentions)].find(m => m.id === id)?.name ?? id)

    const participants = Array.from(participantSet).map(id => ({ open_id: id, name: nameOf(id) }))
    if (participants.length === 0) continue

    threads.push({
      message_id: t.message_id,
      thread_id: t.thread_id,
      create_time: t.create_time,
      days_ago: Math.floor((now - parseInt(t.create_time)) / (86400 * 1000)),
      content: t.content,
      participants,
      replies: t.replies.map(r => ({ open_id: r.open_id, name: r.name, content: r.content, create_time: r.create_time })),
    })
  }

  // Đánh dấu thread đã cà (persistent) từ ca_thread_log
  if (threads.length > 0) {
    try {
      const ids = threads.map(t => t.message_id)
      const { data: logs } = await supabaseAdmin
        .from("ca_thread_log")
        .select("id, sent_at, sent_by")
        .in("id", ids)
      const logMap = new Map((logs ?? []).map((l: any) => [l.id, l]))
      for (const t of threads) {
        const log = logMap.get(t.message_id)
        if (log) { t.already_sent = true; t.sent_at = log.sent_at; t.sent_by = log.sent_by }
      }
    } catch {} // bảng chưa tạo → bỏ qua đánh dấu
  }

  threads.sort((a, b) => parseInt(b.create_time) - parseInt(a.create_time))
  return NextResponse.json({ ok: true, threads })
}

async function handleSend(
  { message_id, participants, message_text, chat_id, thread_id, content, participant_names }: any,
  username: string,
) {
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

  // Ghi log "đã cà" (không chặn response nếu lỗi)
  const sentAt = new Date().toISOString()
  try {
    await supabaseAdmin.from("ca_thread_log").upsert({
      id: message_id,
      chat_id: chat_id ?? "",
      thread_id: thread_id ?? null,
      content_snip: (content ?? "").slice(0, 150),
      participants: JSON.stringify(participant_names ?? []),
      message_sent: text,
      sent_by: username,
      sent_at: sentAt,
    }, { onConflict: "id" })
  } catch {} // bảng chưa tạo → bỏ qua

  return NextResponse.json({ ok: true, sent_at: sentAt, sent_by: username })
}

async function handleHistory({ chat_id, limit = 30 }: any) {
  try {
    let q = supabaseAdmin
      .from("ca_thread_log")
      .select("id, chat_id, content_snip, participants, message_sent, sent_by, sent_at")
      .order("sent_at", { ascending: false })
      .limit(Math.min(Number(limit) || 30, 100))
    if (chat_id) q = q.eq("chat_id", chat_id)
    const { data } = await q
    const history = (data ?? []).map((r: any) => ({
      ...r,
      participants: (() => { try { return JSON.parse(r.participants ?? "[]") } catch { return [] } })(),
    }))
    return NextResponse.json({ ok: true, history })
  } catch {
    return NextResponse.json({ ok: true, history: [] })
  }
}
