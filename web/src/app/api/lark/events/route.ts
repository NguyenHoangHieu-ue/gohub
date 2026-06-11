import { NextRequest, NextResponse }  from "next/server"
import { waitUntil }                  from "@vercel/functions"
import { createDecipheriv, createHash } from "crypto"
import { supabaseAdmin }             from "@/lib/supabase"
import { getRefCache }               from "@/lib/agents/cache"
import { AGENTS }                    from "@/lib/agents/agents"
import { route }                     from "@/lib/agents/router"
import { GoogleGenerativeAI }        from "@google/generative-ai"
import { buildToolContext }          from "@/lib/agents/context"
import {
  sendLarkMessage, replyLarkMessage, replyLarkTable,
  parseMarkdownTable, splitTextAndTable,
  getLarkUserInfo, stripMarkdown,
} from "@/lib/lark"
import type { Message, UserRole }    from "@/lib/agents/types"

// Max history to pull per Lark user
const HISTORY_LIMIT = 10

// Get conversation history for a specific Lark thread
async function getLarkHistory(openId: string, threadId: string): Promise<Message[]> {
  const { data } = await supabaseAdmin
    .from("lark_chat_history")
    .select("role,content")
    .eq("lark_open_id", openId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)
  if (!data || data.length === 0) return []

  const msgs = data.reverse() as Message[]

  // Gemini requires history to start with 'user' and strictly alternate user/model.
  // Trim leading assistant messages (happens when HISTORY_LIMIT cuts mid-pair).
  let start = 0
  while (start < msgs.length && msgs[start].role !== "user") start++
  const trimmed = msgs.slice(start)

  // Ensure strict alternating: drop consecutive same-role messages
  const clean: Message[] = []
  for (const m of trimmed) {
    const last = clean[clean.length - 1]
    if (!last || last.role !== m.role) clean.push(m)
    // If same role consecutive, skip — prefer keeping the later one
  }

  return clean
}

// Save a message to lark_chat_history
function saveLarkMessage(openId: string, threadId: string, role: "user" | "assistant", content: string) {
  // Fire-and-forget — không throw để tránh trigger catch block của processAndReply
  (supabaseAdmin
    .from("lark_chat_history")
    .insert({ lark_open_id: openId, thread_id: threadId, role, content }) as any)
    .then(() => {})
    .catch((e: any) => console.error("[Lark] saveLarkMessage failed:", e?.message))
}

// Look up user role by lark_open_id
async function getUserRole(openId: string): Promise<{ role: UserRole; name: string }> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("role,name")
    .eq("lark_open_id", openId)
    .maybeSingle()
  return {
    role: (data?.role as UserRole) ?? "standard",
    name: data?.name ?? "",
  }
}

// Debug GET — Lark sometimes pings with GET first
export async function GET() {
  return NextResponse.json({ ok: true, service: "lark-bot" })
}

function decryptLark(encrypted: string): any {
  const encryptKey = process.env.LARK_ENCRYPT_KEY!
  const key = createHash("sha256").update(encryptKey).digest()
  const buf = Buffer.from(encrypted, "base64")
  const iv         = buf.subarray(0, 16)
  const ciphertext = buf.subarray(16)
  const decipher   = createDecipheriv("aes-256-cbc", key, iv)
  const plain      = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plain.toString("utf-8"))
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    const raw = await req.text()
    const parsed = raw ? JSON.parse(raw) : {}

    // Decrypt if encrypted
    if (parsed.encrypt) {
      console.log("[Lark] decrypting...")
      body = decryptLark(parsed.encrypt)
      console.log("[Lark] decrypted:", JSON.stringify(body).slice(0, 200))
    } else {
      console.log("[Lark] raw body:", raw.slice(0, 200))
      body = parsed
    }
  } catch (e: any) {
    console.error("[Lark] parse/decrypt error:", e.message)
    return NextResponse.json({ ok: true })
  }

  // ── URL verification — schema 1.0 & 2.0 ──────────────────────────────────
  const challenge: string | undefined =
    body.type === "url_verification"                          ? body.challenge :
    body.schema === "2.0" && body.header?.event_type === "challenge" ? body.event?.challenge :
    undefined

  if (challenge) {
    console.log("[Lark] responding challenge:", challenge)
    const resBody = JSON.stringify({ challenge })
    return new Response(resBody, {
      status:  200,
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": String(Buffer.byteLength(resBody)),
      },
    })
  }

  // ── Message event ──────────────────────────────────────────────────────────
  const event = body.event
  const eventType = body.header?.event_type ?? body.type

  // Bot được add vào group → gửi welcome để kích hoạt subscription
  if (eventType === "im.chat.member.bot.added_v1" && event?.chat_id) {
    console.log("[Lark] bot added to group:", event.chat_id)
    waitUntil(
      sendLarkMessage(event.chat_id, "chat_id",
        `👋 Xin chào! Tôi là ${process.env.LARK_BOT_NAME ?? "Bot GoHub"}.\n@mention tôi trong group để đặt câu hỏi về sản phẩm SIM/eSIM.`
      ).catch((e: any) => console.error("[Lark] welcome msg failed:", e?.message))
    )
    return NextResponse.json({ ok: true })
  }

  if (!event || eventType !== "im.message.receive_v1") {
    console.log("[Lark] skip non-message event:", eventType)
    return NextResponse.json({ ok: true })
  }

  // Only handle text messages sent directly to the bot (not group chats where bot is @mentioned)
  const msg        = event.message
  const sender     = event.sender
  const openId     = sender?.sender_id?.open_id as string | undefined
  const chatId     = msg?.chat_id as string | undefined
  const msgType    = msg?.message_type as string

  const messageId  = msg?.message_id as string | undefined
  const rootId     = msg?.root_id as string | undefined
  const threadId   = (rootId ?? messageId) as string | undefined
  const chatType   = msg?.chat_type as string  // "p2p" | "group" | "thread"
  const isInThread = !!rootId && rootId !== messageId  // message là reply trong thread

  console.log("[Lark] event | type:", eventType, "| chatType:", chatType,
    "| msgType:", msgType, "| openId:", openId ? "ok" : "MISSING",
    "| chatId:", chatId ? "ok" : "MISSING", "| messageId:", messageId ? "ok" : "MISSING")

  // Chỉ xử lý "text" và "post" (rich text khi @mention trong group)
  if (!openId || !chatId || !messageId || !threadId ||
      (msgType !== "text" && msgType !== "post")) {
    console.log("[Lark] skip: missing field or unsupported msgType:", msgType)
    return NextResponse.json({ ok: true })
  }

  // Parse content — xử lý cả "text" và "post" format
  let userText = ""
  let postMentions: any[] = []
  try {
    const rawContent = JSON.parse(msg.content)
    console.log("[Lark] content preview:", JSON.stringify(rawContent).slice(0, 200))

    if (msgType === "text") {
      // Format: { "text": "hello @_user_1" }
      userText = (rawContent.text ?? "").replace(/@\S+\s*/g, "").trim()

    } else {
      // Format post — 2 dạng:
      // 1. {"zh_cn":{"content":[[...]]}}  (cũ)
      // 2. {"title":"","content":[[...]]}  (thread/group mới)
      const body = rawContent.zh_cn ?? rawContent.en_us ?? rawContent
      const blocks: any[][] = body.content ?? []
      const textParts: string[] = []
      for (const block of blocks) {
        for (const el of block) {
          if (el.tag === "text") {
            textParts.push(el.text ?? "")
          } else if (el.tag === "at") {
            // Collect bot mention, skip @mention text in user query
            postMentions.push({ name: el.user_name, id: { open_id: el.user_id } })
          }
        }
      }
      userText = textParts.join("").trim()
    }
  } catch (e: any) {
    console.log("[Lark] content parse error:", e?.message, "| raw:", String(msg.content).slice(0, 100))
    return NextResponse.json({ ok: true })
  }

  console.log("[Lark] parsed | userText:", JSON.stringify(userText), "| postMentions:", postMentions.length, "| topMentions:", (msg?.mentions ?? []).length)

  // Nếu user chỉ gõ "@BotName" không kèm text → userText rỗng
  // Với p2p: bỏ qua (blank message)
  // Với group/post có at-mention: dùng fallback "xin chào" thay vì bỏ qua
  if (!userText) {
    // Xét cả postMentions (từ parse content) lẫn msg.mentions (từ Lark API)
    const hasMentions = postMentions.length > 0 || (msg?.mentions ?? []).length > 0
    if (!hasMentions) {
      console.log("[Lark] skip: empty text + no mentions")
      return NextResponse.json({ ok: true })
    }
    userText = "xin chào"
  }

  // Group chat + thread: chỉ reply khi được @mention tên bot
  if (chatType === "group") {
    const topMentions: any[] = msg?.mentions ?? []
    const allMentions = [...topMentions, ...postMentions]
    const botName = (process.env.LARK_BOT_NAME ?? "").trim().toLowerCase()

    console.log("[Lark] group msg | msgType:", msgType, "| chatId:", chatId,
      "| isInThread:", isInThread, "| botName:", botName,
      "| mentions:", JSON.stringify(allMentions), "| userText:", userText.slice(0, 80))

    const isMentioned = allMentions.length > 0 && allMentions.some((m: any) => {
      if (!botName) return true
      const mName = (m.name ?? "").trim().toLowerCase()
      const match = mName === botName || mName.includes(botName) || botName.includes(mName)
      if (!match) console.log("[Lark] mention mismatch | got:", m.name, "| expected:", botName)
      return match
    })

    // Fallback cho thread replies: msg.mentions có thể rỗng khi reply trong thread
    // → kiểm tra tên bot trong raw content string (chứa user_name của at-element)
    const threadFallback = !isMentioned && isInThread && botName
      && typeof msg.content === "string"
      && msg.content.toLowerCase().includes(botName)

    // Fallback cho root group message (msgType="post"): msg.mentions thường rỗng với post format
    // → cùng logic content check nhưng cho !isInThread (root của thread / group message thường)
    const rootMsgFallback = !isMentioned && !isInThread && botName
      && typeof msg.content === "string"
      && msg.content.toLowerCase().includes(botName)

    if (!isMentioned && !threadFallback && !rootMsgFallback) {
      console.log("[Lark] not mentioned → skip | mentions:", allMentions.length)
      return NextResponse.json({ ok: true })
    }
  }

  console.log("[Lark] processing | chatType:", chatType, "| isInThread:", isInThread,
    "| msgType:", msgType, "| text:", userText.slice(0, 60))

  // Respond 200 ngay, giữ function sống để processAndReply hoàn thành
  waitUntil(processAndReply(openId, chatId, messageId, threadId, userText))
  return NextResponse.json({ ok: true })
}

async function processAndReply(openId: string, chatId: string, messageId: string, threadId: string, userText: string) {
  let responseSent = false
  try {
    // Get user info
    const { role, name } = await getUserRole(openId)
    const isCost = true

    // Get history scoped to this thread
    const history = await getLarkHistory(openId, threadId)
    const messages: Message[] = [...history, { role: "user", content: userText }]

    // Route + refCache in parallel
    const [refCache, { agentId, params }] = await Promise.all([
      getRefCache(),
      route(userText, history, role),
    ])
    const agent    = AGENTS[agentId]
    const toolCtx  = await buildToolContext(agentId, params, refCache, isCost)

    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name || openId} (vai trò: ${role}, kênh: Lark)`,
    ].join("")

    // Call Gemini (non-streaming for Lark)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const geminiHistory = history.map(m => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const result   = await model.startChat({ history: geminiHistory }).sendMessage(userText)
    const response = result.response.text()

    // Nếu response có bảng → gửi card + xlsx, còn lại strip markdown
    const split = splitTextAndTable(response)
    const table = split ? parseMarkdownTable(split.tableText) : null

    if (table) {
      const preText = split!.preText ? stripMarkdown(split!.preText) : ""
      await replyLarkTable(messageId, chatId, preText, table.headers, table.rows)
      responseSent = true  // card đã gửi (xlsx là optional, không throw)
    } else {
      await replyLarkMessage(messageId, stripMarkdown(response))
      responseSent = true
    }

    // Lưu full response vào history để Gemini có context đầy đủ ở turn sau
    // (display gửi Lark đã strip/card rồi, history cần giữ nguyên nội dung)
    saveLarkMessage(openId, threadId, "user",      userText)
    saveLarkMessage(openId, threadId, "assistant", response)

  } catch (err: any) {
    console.error("[Lark bot] ERROR:", err?.message ?? err)
    // Chỉ gửi error message nếu response chưa gửi được
    if (!responseSent) {
      // Lấy role để quyết định hiển thị lỗi chi tiết hay không
      let errRole = "standard"
      try {
        const { role } = await getUserRole(openId)
        errRole = role
      } catch {}
      const errMsg = errRole === "admin"
        ? `⚠️ Lỗi hệ thống: ${err?.message ?? "unknown error"}`
        : "Hệ thống đang xử lý, vui lòng thử lại sau."
      try {
        await replyLarkMessage(messageId, errMsg)
      } catch {}
    }
  }
}
