import { NextRequest, NextResponse }           from "next/server"
import { getServerSession }                    from "next-auth"
import { authOptions }                         from "@/lib/auth"
import { GoogleGenerativeAI }                  from "@google/generative-ai"
import { getRefCache }                         from "@/lib/agents/cache"
import { AGENTS }                              from "@/lib/agents/agents"
import { route }                               from "@/lib/agents/router"
import { buildToolContext }                    from "@/lib/agents/context"
import { runBIAnalyst }                        from "@/lib/agents/bi-analyst"
import { runDataExplorer }                     from "@/lib/agents/data-explorer"
import { guardCheck, canViewCogs }             from "@/lib/agents/guardian"
import { getChannelFromRole }                  from "@/lib/agents/tools"
import { runMulti, NOTICE_MULTI, ensureAnswer, isFailureText, guidanceFor } from "@/lib/agents/orchestrator"
import type { Message, UserRole }              from "@/lib/agents/types"
import { supabaseAdmin }                       from "@/lib/supabase"

// Ghi 1 event chat cho Usage Analytics. PHẢI await: serverless không có waitUntil → fire-and-forget
// (void) bị cắt khi handler trả stream xong → 0 chat event lưu được. Insert nhanh (~1 round-trip).
async function logChat(identity: string | null | undefined, name: string | null, role: string, agentId: string, msg: string) {
  try {
    await supabaseAdmin.from("app_usage_events").insert({
      event_type: "chat", user_email: identity || null, user_name: name || null, user_role: role,
      agent_id: agentId, user_message: msg.slice(0, 500),
    })
  } catch { /* tracking không được làm vỡ chat */ }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role       = (session.user.role || "staff") as UserRole
  const department = session.user.department || "all"
  const name    = userName || session.user.name || "bạn"
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  try {
    const [refCache, routed, guard, isCost] = await Promise.all([
      getRefCache(),
      route(lastMsg, history, role),
      guardCheck(lastMsg, role, department),
      canViewCogs(role),
    ])
    const { agentId, agentName, params, needsClarification, clarificationQuestion, agentIds, multi } = routed
    const agent = AGENTS[agentId]

    const encoderEarly = new TextEncoder()

    // ── Guardian (kiểm soát quyền hạn) ──────────────────────────────────────────
    // Câu hỏi vượt quyền / khác phòng ban → từ chối lịch sự, KHÔNG gọi agent.
    if (!guard.allowed) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoderEarly.encode(`__AGENT__:guardian:Hạn chế quyền\n`))
          controller.enqueue(encoderEarly.encode(guard.reason))
          controller.close()
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    // ── Bước HỎI LẠI (deterministic) ──────────────────────────────────────────
    // Câu hỏi quá mơ hồ (không có nước/khu vực/mã) → hỏi lại ngay, KHÔNG gọi Gemini.
    if (needsClarification && clarificationQuestion) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoderEarly.encode(`__AGENT__:clarify:Làm Rõ\n`))
          controller.enqueue(encoderEarly.encode(clarificationQuestion))
          controller.close()
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    // Log chat event — dùng username fallback (email thường rỗng) + await để insert kịp lưu trước khi stream.
    const identity = session.user.email || (session.user as any).username || null
    await logChat(identity, name, role, agentId, lastMsg)

    // Pre-execute tools, build context
    const channel = getChannelFromRole(role)

    // Quy tắc tạm thời 28/6–8/7/2026
    const _now = new Date()
    const _tempRule = (_now >= new Date("2026-06-28") && _now < new Date("2026-07-09"))
      ? `\n\n⚠️ QUY TẮC TẠM THỜI (chỉ áp dụng 28/6–8/7/2026): Nếu không biết câu trả lời hoặc không chắc chắn → PHẢI trả lời: "Hãy hỏi anh Bảo hoặc đợi Hiếu về trả lời nha 😊" — không được tự suy đoán.`
      : ""

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const encoder = new TextEncoder()

    // ── Đa-agent: câu chạm nhiều lĩnh vực → chạy N agent rồi tổng hợp ─────────────
    // Báo user "đợi xíu" ngay, rồi trả câu tổng hợp (non-stream vì cần chờ đủ N agent).
    if (multi) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
            controller.enqueue(encoder.encode(`${NOTICE_MULTI}\n\n`))
            const text = await runMulti({
              agentIds, params, refCache, isCost, role, name, lastMsg, geminiHistory, channel,
              tempRule: _tempRule,
            })
            controller.enqueue(encoder.encode(text))
            controller.close()
          } catch (err: any) {
            const isPriv = role === "admin" || role === "creator"
            const msg = isPriv ? `Lỗi tổng hợp: ${err.message}` : guidanceFor(agentId)
            controller.enqueue(encoder.encode(msg))
            controller.close()
          }
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    const toolCtx = await buildToolContext(agentId, params, refCache, isCost, lastMsg, channel)

    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name} (vai trò: ${role})`,
      _tempRule,
    ].join("")

    // ── bi-analyst / data-explorer: function calling (non-streaming) ──
    if (agentId === "bi-analyst" || agentId === "data-explorer") {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
            const raw = agentId === "data-explorer"
              ? await runDataExplorer(systemInstruction, geminiHistory, lastMsg, role, isCost)
              : await runBIAnalyst(systemInstruction, geminiHistory, lastMsg, role)
            controller.enqueue(encoder.encode(ensureAnswer(raw, agentId)))
            controller.close()
          } catch (err: any) {
            const isPriv = role === "admin" || role === "creator"
            const msg = isPriv ? `Lỗi ${agentId}: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
            controller.enqueue(encoder.encode(msg))
            controller.close()
          }
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    // ── other agents: streaming ──
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model  = genAI.getGenerativeModel({ model: "gemini-3.6-flash", systemInstruction })
    const result = await model.startChat({ history: geminiHistory }).sendMessageStream(lastMsg)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
          let acc = ""
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) { acc += text; controller.enqueue(encoder.encode(text)) }
          }
          // Đảm bảo có câu trả lời: nếu agent trả rỗng/thất bại → thêm hướng dẫn cách hỏi.
          if (isFailureText(acc)) controller.enqueue(encoder.encode(`\n\n${guidanceFor(agentId)}`))
          controller.close()
        } catch (err: any) {
          const msg = (role === "admin" || role === "creator") ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
          controller.enqueue(encoder.encode(msg))
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
