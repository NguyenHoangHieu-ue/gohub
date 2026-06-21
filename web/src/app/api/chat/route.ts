import { NextRequest, NextResponse }           from "next/server"
import { getServerSession }                    from "next-auth"
import { authOptions }                         from "@/lib/auth"
import { GoogleGenerativeAI }                  from "@google/generative-ai"
import { getRefCache }                         from "@/lib/agents/cache"
import { AGENTS }                              from "@/lib/agents/agents"
import { route }                               from "@/lib/agents/router"
import { buildToolContext }                    from "@/lib/agents/context"
import { runBIAnalyst }                        from "@/lib/agents/bi-analyst"
import { guardCheck }                          from "@/lib/agents/guardian"
import type { Message, UserRole }              from "@/lib/agents/types"

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role       = (session.user.role || "standard") as UserRole
  const department = (session.user as any).department || "all"
  const name    = userName || session.user.name || "bạn"
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  const isCost  = true

  try {
    const [refCache, routed, guard] = await Promise.all([
      getRefCache(),
      route(lastMsg, history, role),
      guardCheck(lastMsg, role, department),
    ])
    const { agentId, agentName, params, needsClarification, clarificationQuestion } = routed
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

    // Pre-execute tools, build context
    const toolCtx = await buildToolContext(agentId, params, refCache, isCost, lastMsg)

    // Quy tắc tạm thời 28/6–8/7/2026
    const _now = new Date()
    const _tempRule = (_now >= new Date("2026-06-28") && _now < new Date("2026-07-09"))
      ? `\n\n⚠️ QUY TẮC TẠM THỜI (chỉ áp dụng 28/6–8/7/2026): Nếu không biết câu trả lời hoặc không chắc chắn → PHẢI trả lời: "Hãy hỏi anh Bảo hoặc đợi Hiếu về trả lời nha 😊" — không được tự suy đoán.`
      : ""

    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name} (vai trò: ${role})`,
      _tempRule,
    ].join("")

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const encoder = new TextEncoder()

    // ── bi-analyst: function calling (non-streaming) ──
    if (agentId === "bi-analyst") {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
            const text = await runBIAnalyst(systemInstruction, geminiHistory, lastMsg, role)
            controller.enqueue(encoder.encode(text))
            controller.close()
          } catch (err: any) {
            const msg = role === "admin" ? `Lỗi BI: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
            controller.enqueue(encoder.encode(msg))
            controller.close()
          }
        },
      })
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
    }

    // ── other agents: streaming ──
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model  = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })
    const result = await model.startChat({ history: geminiHistory }).sendMessageStream(lastMsg)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`__AGENT__:${agentId}:${agentName}\n`))
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()
        } catch (err: any) {
          const msg = role === "admin" ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
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
