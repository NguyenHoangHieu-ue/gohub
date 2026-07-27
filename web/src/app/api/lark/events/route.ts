import { NextRequest, NextResponse }  from "next/server"
import { createDecipheriv, createHash } from "crypto"
import { supabaseAdmin }             from "@/lib/supabase"
import { getRefCache }               from "@/lib/agents/cache"
import { AGENTS }                    from "@/lib/agents/agents"
import { route }                     from "@/lib/agents/router"
import { GoogleGenerativeAI }        from "@google/generative-ai"
import { buildToolContext }          from "@/lib/agents/context"
import { runBIAnalyst }              from "@/lib/agents/bi-analyst"
import { runDataExplorer }           from "@/lib/agents/data-explorer"
import { guardCheck, canViewCogs }   from "@/lib/agents/guardian"
import { getChannelFromRole }        from "@/lib/agents/tools"
import { runMulti, NOTICE_MULTI, ensureAnswer } from "@/lib/agents/orchestrator"
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

// Dedup: Lark gửi lại CÙNG event (cùng event_id) khi không nhận 200 đủ nhanh. Vì giờ xử lý
// ĐỒNG BỘ (~vài giây) nên có thể chạm ngưỡng chờ của Lark → chống xử lý 2 lần ở đây.
// Dùng luôn bảng app_settings (key unique) để atomic, không cần migration.
async function alreadyHandled(eventId: string): Promise<boolean> {
  if (!eventId) return false
  const { error } = await (supabaseAdmin
    .from("app_settings")
    .insert({ key: `larkevt:${eventId}`, value: "1", category: "lark_dedup" }) as any)
  if (error) {
    if ((error as any).code === "23505") return true   // unique_violation → đã xử lý rồi
    console.error("[Lark] dedup insert error:", error.message)  // lỗi khác → cứ xử lý tiếp
  }
  return false
}

// Look up user role by lark_open_id
// isRegistered=false → user chưa login web (chưa có trong DB) → cần login để phân quyền
async function getUserRole(openId: string): Promise<{ role: UserRole; name: string; isRegistered: boolean }> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("role,name")
    .eq("lark_open_id", openId)
    .maybeSingle()
  return {
    role: (data?.role as UserRole) ?? "staff",
    name: data?.name ?? "",
    isRegistered: !!data,
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
    await sendLarkMessage(event.chat_id, "chat_id",
      `👋 Xin chào! Tôi là ${process.env.LARK_BOT_NAME ?? "Bot GoHub"}.\n@mention tôi trong group để đặt câu hỏi về sản phẩm SIM/eSIM.`
    ).catch((e: any) => console.error("[Lark] welcome msg failed:", e?.message))
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

  // Auto-capture group chat_id lần đầu (dùng cho Lark notifications sau này)
  if (chatType === "group" && chatId) {
    ;(supabaseAdmin
      .from("app_settings")
      .upsert({ key: "lark_notify_chat_id", value: chatId, category: "lark" },
               { onConflict: "key", ignoreDuplicates: true } as any) as any)
      .then(() => {}).catch(() => {})
  }

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

  // NOTE: p2p được mở lại (trước đây tạm block). Auth check (đã login web chưa) thực hiện
  // bên trong processAndReply — áp dụng cả p2p lẫn group.

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

  // Chống xử lý trùng (Lark retry khi chờ lâu)
  const eventId = (body.header?.event_id as string) || messageId
  if (await alreadyHandled(eventId)) {
    console.log("[Lark] duplicate event → skip:", eventId)
    return NextResponse.json({ ok: true })
  }

  // ⚠️ Netlify (Free) KHÔNG hỗ trợ waitUntil/background cho App Router route handler:
  // fire-and-forget sẽ bị đóng băng sau khi trả response → reply không bao giờ gửi (hoặc
  // gửi rất trễ khi container thaw). Vì vậy phải xử lý ĐỒNG BỘ rồi mới trả 200.
  await processAndReply(openId, chatId, messageId, threadId, userText)
  return NextResponse.json({ ok: true })
}

const WEB_URL = process.env.NEXTAUTH_URL || "https://gohub-intel.vercel.app"

async function processAndReply(openId: string, chatId: string, messageId: string, threadId: string, userText: string) {
  let responseSent = false
  try {
    // Auth check: user đã login web chưa?
    const { role, name, isRegistered } = await getUserRole(openId)

    if (!isRegistered) {
      const loginMsg = `Bạn chưa đăng nhập vào hệ thống GoHub nên chưa được phân quyền trả lời 🔐\n\nVui lòng đăng nhập tại: ${WEB_URL}/login\n(Dùng tài khoản Lark để đăng nhập)`
      await replyLarkMessage(messageId, loginMsg)
      return
    }

    // Get history scoped to this thread
    const history = await getLarkHistory(openId, threadId)
    const messages: Message[] = [...history, { role: "user", content: userText }]

    // Route + refCache + guardian + isCost in parallel
    const [refCache, routed, guard, isCost] = await Promise.all([
      getRefCache(),
      route(userText, history, role),
      // Lark group: KHÔNG phân biệt được role → chặn nội bộ hệ thống + PII khách hàng cho mọi người.
      // (system_internal: code/prompt/schema; customer_pii: tên/SĐT/email khách cụ thể)
      guardCheck(userText, role, undefined, { onlyCategories: ["system_internal", "customer_pii"], ignoreRole: true }),
      canViewCogs(role),
    ])
    const { agentId, params, needsClarification, clarificationQuestion, agentIds, multi } = routed
    const agent    = AGENTS[agentId]

    // Guardian: câu hỏi về nội bộ hệ thống → từ chối lịch sự ("hỏi Hiếu"), không gọi agent
    if (!guard.allowed) {
      await replyLarkMessage(messageId, stripMarkdown(guard.reason))
      responseSent = true
      saveLarkMessage(openId, threadId, "user",      userText)
      saveLarkMessage(openId, threadId, "assistant", guard.reason)
      return
    }

    // Bước HỎI LẠI (additive): câu hỏi quá mơ hồ (thiếu nước/khu vực/mã) → hỏi lại ngay, không gọi Gemini
    if (needsClarification && clarificationQuestion) {
      await replyLarkMessage(messageId, stripMarkdown(clarificationQuestion))
      responseSent = true
      saveLarkMessage(openId, threadId, "user",      userText)
      saveLarkMessage(openId, threadId, "assistant", clarificationQuestion)
      return
    }

    const channel  = getChannelFromRole(role)

    // Quy tắc tạm thời 28/6–8/7/2026: Hiếu vắng
    const _now = new Date()
    const _tempRule = (_now >= new Date("2026-06-28") && _now < new Date("2026-07-09"))
      ? `\n\n⚠️ QUY TẮC TẠM THỜI (chỉ áp dụng 28/6–8/7/2026): Nếu không biết câu trả lời hoặc không chắc chắn → PHẢI trả lời: "Hãy hỏi anh Bảo hoặc đợi Hiếu về trả lời nha 😊" — không được tự suy đoán.`
      : ""

    const larkHistory = history.map(m => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    // ── Đa-agent: báo user "đợi xíu" rồi tổng hợp N agent về 1 câu ──────────────
    if (multi) {
      await replyLarkMessage(messageId, stripMarkdown(NOTICE_MULTI))
      const merged = await runMulti({
        agentIds, params, refCache, isCost, role, name: name || openId, lastMsg: userText,
        geminiHistory: larkHistory, channel, userSuffix: ", kênh: Lark", tempRule: _tempRule,
      })
      const split = splitTextAndTable(merged)
      const table = split ? parseMarkdownTable(split.tableText) : null
      if (table) {
        const preText = split!.preText ? stripMarkdown(split!.preText) : ""
        await replyLarkTable(messageId, chatId, preText, table.headers, table.rows)
      } else {
        await replyLarkMessage(messageId, stripMarkdown(merged))
      }
      responseSent = true
      saveLarkMessage(openId, threadId, "user",      userText)
      saveLarkMessage(openId, threadId, "assistant", merged)
      return
    }

    const toolCtx  = await buildToolContext(agentId, params, refCache, isCost, userText, channel)

    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name || openId} (vai trò: ${role}, kênh: Lark)`,
      _tempRule,
    ].join("")

    const geminiHistory = history.map(m => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    // bi-analyst / data-explorer: dùng function calling (executeSQL/querySupabase) — giống web chatbot
    let response: string
    if (agentId === "data-explorer") {
      response = await runDataExplorer(systemInstruction, geminiHistory, userText, role, isCost)
    } else if (agentId === "bi-analyst") {
      response = await runBIAnalyst(systemInstruction, geminiHistory, userText, role)
    } else {
      // Call Gemini (non-streaming for Lark)
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction })
      const result = await model.startChat({ history: geminiHistory }).sendMessage(userText)
      response = result.response.text()
    }

    // Đảm bảo có câu trả lời: rỗng/thất bại → gợi ý cách hỏi (từ capability graph)
    response = ensureAnswer(response, agentId)

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
      let errRole = "staff"
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
