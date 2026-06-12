import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { GoogleGenerativeAI }       from "@google/generative-ai"
import { getRefCache }              from "@/lib/agents/cache"
import { AGENTS }                   from "@/lib/agents/agents"
import { route }                    from "@/lib/agents/router"
import { buildToolContext }         from "@/lib/agents/context"
import type { Message, UserRole }   from "@/lib/agents/types"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role    = (session.user.role || "standard") as UserRole
  const name    = userName || session.user.name || "bạn"
  const history = (messages as Message[]).slice(0, -1)
  const lastMsg = (messages as Message[]).at(-1)?.content ?? ""
  const isCost  = true

  try {
    // Run classifier + refCache in parallel → zero extra latency
    const [refCache, { agentId, agentName, params }] = await Promise.all([
      getRefCache(),
      route(lastMsg, history, role),
    ])
    const agent = AGENTS[agentId]

    // Pre-execute tools, build context
    const toolCtx = await buildToolContext(agentId, params, refCache, isCost, lastMsg)

    // Build system prompt with injected data
    const systemInstruction = [
      agent.systemPrompt,
      toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
      `\nNgười dùng: ${name} (vai trò: ${role})`,
    ].join("")

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const geminiHistory = history.map((m: Message) => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))

    const result = await model.startChat({ history: geminiHistory }).sendMessageStream(lastMsg)

    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
      async start(controller) {
        try {
          // Send agent metadata first
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
