import { NextRequest, NextResponse }           from "next/server"
import { getServerSession }                    from "next-auth"
import { authOptions }                         from "@/lib/auth"
import { guardCheck, canViewCogs }             from "@/lib/agents/guardian"
import { getChannelFromRole }                  from "@/lib/agents/tools"
import { runBeGau }                            from "@/lib/agents/be-gau"
import type { Message, UserRole }              from "@/lib/agents/types"
import { supabaseAdmin }                       from "@/lib/supabase"
import { checkRateLimit }                      from "@/lib/rate-limit"
import { parseUploadedFile, type FileContext } from "@/lib/agents/file-parser"
import { isDataTask }                    from "@/lib/okr-helpers"
import { estimateCostUsd }                     from "@/lib/agents/gemini-pricing"
import { larkOpenIdOf }                        from "@/lib/agents/lark-workspace"
import type { PlanStep }                       from "@/lib/agents/creator-ai"
import { extractMemoriesFromTurn, summarizeConversation } from "@/lib/assistant-memory-auto"
import { loadFeatureMatrix, featureEnabled }   from "@/lib/assistant-features"
import { waitUntil }                           from "@vercel/functions"

type BeGauEvent =
  | { type: "agent"; id: string; name: string }
  | { type: "delta"; content: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "done" }

const memoryOn = async (role: string) => featureEnabled(await loadFeatureMatrix(), "memory", role)

// Hobby plan trần cứng 60s (Vercel Runtime Timeout Error thật, xem log s195+14) — nâng lên 300s (Hobby +
// Fluid Compute cho phép tới 5 phút, không cần nâng gói). Giữ nguyên dù s195+18 đã thêm stream token thật
// (onChunk) — câu hỏi nhiều tool-call/BI phức tạp vẫn cần tổng thời gian dài, chỉ là user giờ THẤY chữ
// chạy dần thay vì màn hình trắng trong lúc chờ.
export const maxDuration = 300

// Bé Gấu (s131): mô phỏng cơ chế Gấu Pro — 1 agent function-calling lặp, tự chọn công cụ —
// NHƯNG giữ guardian pre-flight (chặn code/hệ thống/nội bộ) + lọc dữ liệu theo role + KHÔNG lộ
// cách hoạt động/SQL cho user. Thay pipeline route→context→per-agent cũ.

// Ghi 1 event chat cho Usage Analytics (cả câu hỏi + câu trả lời Bé Gấu).
// tokensIn/tokensOut (s196+13, đề xuất B roadmap audit Bé Gấu) — port đúng cơ chế cost dashboard
// đã làm cho Gấu Pro (s196+7): tận dụng cột tokens_in/tokens_out/est_cost_usd đã có sẵn trên
// app_usage_events (migration v58), không cần migration mới.
async function logChat(
  identity: string | null | undefined,
  name: string | null,
  role: string,
  msg: string,
  aiResponse?: string | null,
  toolsUsed?: string[],
  tokensIn = 0,
  tokensOut = 0,
) {
  try {
    await supabaseAdmin.from("app_usage_events").insert({
      event_type: "chat", user_email: identity || null, user_name: name || null, user_role: role,
      agent_id: "be-gau", user_message: msg.slice(0, 500),
      ai_response: aiResponse ? aiResponse.slice(0, 3000) : null,
      tools_used: toolsUsed && toolsUsed.length > 0 ? toolsUsed : null,
      used_db_tool: isDataTask(toolsUsed, role),
      tokens_in: tokensIn, tokens_out: tokensOut,
      est_cost_usd: estimateCostUsd(tokensIn, tokensOut),
    })
  } catch { /* tracking không được làm vỡ chat */ }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit: 20 req/min/user (ngăn spam Gemini API)
  const rlKey = `chat:${(session.user as any).username || session.user.email || "anon"}`
  const rl = await checkRateLimit(rlKey, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Bạn gửi quá nhiều tin nhắn. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s rồi thử lại.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }

  // Nhận JSON (như cũ) hoặc multipart/form-data (khi có ảnh/file đính kèm — s190+3).
  let messages: Message[] = []
  let userName: string | undefined
  let conversationId: string | null = null
  let fileContexts: FileContext[] = []

  try {
    const contentType = req.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const raw  = form.get("messages")
      messages   = JSON.parse(typeof raw === "string" ? raw : "[]")
      userName   = (form.get("userName") as string) || undefined
      conversationId = (form.get("conversation_id") as string) || null

      const fileEntries: File[] = []
      for (let i = 0; i < 5; i++) {
        const f = form.get(`file_${i}`) as File | null
        if (f && f.size > 0) fileEntries.push(f)
      }
      const parsed = await Promise.allSettled(fileEntries.map(parseUploadedFile))
      for (const r of parsed) if (r.status === "fulfilled") fileContexts.push(r.value)
      const errors = parsed.filter(r => r.status === "rejected").map(r => (r as PromiseRejectedResult).reason?.message)
      if (errors.length) fileContexts.push({ name: "_errors", type: "text", content: `Lỗi đọc file: ${errors.join("; ")}` })
    } else {
      const body = await req.json()
      messages = Array.isArray(body.messages) ? body.messages : []
      userName = body.userName
      conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invalid request" }, { status: 400 })
  }

  const role       = (session.user.role || "staff") as UserRole
  const department = session.user.department || "all"
  const name    = userName || session.user.name || "bạn"
  const username = (session.user as any).username as string | undefined
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  const encoder = new TextEncoder()

  try {
    const [guard, isCost] = await Promise.all([
      guardCheck(lastMsg, role, department),
      canViewCogs(role),
    ])

    // U3: luồng sự kiện SSE (giống Gấu Pro) — chữ (delta), kế hoạch (plan), kết thúc (done).
    const sse = (c: ReadableStreamDefaultController, e: BeGauEvent) => { try { c.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)) } catch {} }
    const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" }

    // ── Guardian: câu hỏi code/hệ thống/nội bộ hoặc vượt quyền → từ chối, KHÔNG gọi agent ──
    if (!guard.allowed) {
      const stream = new ReadableStream({
        start(controller) {
          sse(controller, { type: "agent", id: "guardian", name: "Hạn chế quyền" })
          sse(controller, { type: "delta", content: guard.reason })
          sse(controller, { type: "done" })
          controller.close()
        },
      })
      return new Response(stream, { headers: SSE_HEADERS })
    }

    const identity = session.user.email || (session.user as any).username || null

    // Giá bán theo kênh của vai trò (b2c/saleb2c → B2C; b2b → B2B; còn lại xem tất cả).
    const channel = getChannelFromRole(role)
    const priceDirective = channel
      ? `\n\n(Nội bộ) Người dùng thuộc kênh ${channel}. Khi hỏi GIÁ BÁN sản phẩm, chỉ hiển thị giá thuộc kênh ${channel} (không lộ giá kênh khác).`
      : ""

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const stream = new ReadableStream({
      async start(controller) {
        try {
          sse(controller, { type: "agent", id: "be-gau", name: "Bé Gấu" })
          const larkOpenId = await larkOpenIdOf((session.user as any).username) ?? await larkOpenIdOf(session.user.email)
          const { text, sources, toolsUsed, tokensIn, tokensOut } = await runBeGau({
            geminiHistory, lastMsg, role, name, larkOpenId,
            userId: identity || session.user.email || undefined,
            username,
            sessionId: (session as any)?.sessionId || undefined,
            isCost, extraDirective: priceDirective,
            fileContexts: fileContexts.length > 0 ? fileContexts : undefined,
            signal: req.signal,
            origin: req.nextUrl.origin,
            // s195+18: text đã được stream ra controller theo từng đoạn ngay trong lúc runBeGau() chạy —
            // KHÔNG gửi lại `text` đầy đủ bên dưới nữa (sẽ bị lặp đôi nội dung).
            onChunk: (delta) => sse(controller, { type: "delta", content: delta }),
            onPlan: (steps) => sse(controller, { type: "plan", steps }),
          })
          // Log cả câu hỏi + câu trả lời sau khi có đủ. PHẢI await (không fire-and-forget) — phát hiện
          // qua QA My Metrics s195+18-B: gọi KHÔNG await rồi controller.close() ngay sau khiến Vercel
          // đóng băng/kết thúc execution context TRƯỚC KHI insert Supabase kịp gửi đi — task KHÔNG BAO
          // GIỜ được ghi log dù trả lời đúng, verify được 2 lần liên tiếp qua gọi API trực tiếp + check
          // lại app_usage_events. logChat() tự có try/catch nội bộ nên await ở đây an toàn (không throw).
          await logChat(identity, name, role, lastMsg, text, toolsUsed, tokensIn, tokensOut)
          // Trích nguồn web (nếu có) — nối cuối, không lộ cơ chế.
          if (sources.length) {
            const uniq = Array.from(new Map(sources.map(s => [s.url, s])).values()).slice(0, 5)
            sse(controller, { type: "delta", content: "\n\n**Nguồn tham khảo:**\n" + uniq.map(s => `- [${s.title}](${s.url})`).join("\n") })
          }
          sse(controller, { type: "done" })
          controller.close()
          // Trí nhớ (U3, khi tính năng bật cho vai trò): rút điều đáng nhớ + tóm tắt hội thoại để tìm lại — chạy sau khi trả lời xong.
          if (username && toolsUsed.includes("assistantMemory") === false && await memoryOn(role)) {
            waitUntil(Promise.all([
              extractMemoriesFromTurn(username, lastMsg, text, "be-gau").catch(() => 0),
              conversationId ? summarizeConversation(username, conversationId).catch(() => {}) : undefined,
            ]))
          }
        } catch (err: any) {
          if (req.signal.aborted) { try { controller.close() } catch {} ; return }
          const msg = (role === "admin" || role === "creator") ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
          await logChat(identity, name, role, lastMsg, null)
          sse(controller, { type: "delta", content: msg })
          sse(controller, { type: "done" })
          controller.close()
        }
      },
    })
    return new Response(stream, { headers: SSE_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
