import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getRefCache } from "@/lib/agents/cache"
import { AGENTS } from "@/lib/agents/agents"
import { route } from "@/lib/agents/router"
import { executeTool } from "@/lib/agents/tools"
import type { Message, UserRole } from "@/lib/agents/types"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role     = (session.user.role || "standard") as UserRole
  const name     = userName || session.user.name || "bạn"
  const history  = (messages as Message[]).slice(0, -1)
  const lastMsg  = (messages as Message[]).at(-1)?.content ?? ""

  try {
    const refCache = await getRefCache()

    // Route to appropriate agent
    const { agentId, agentName } = await route(lastMsg, history, role)
    const agent = AGENTS[agentId]

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: `${agent.systemPrompt}\n\nNgười dùng: ${name} (vai trò: ${role})`,
      tools: agent.tools,
    })

    const geminiHistory = history.map(m => ({
      role:  m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.content }],
    }))
    const chat = model.startChat({ history: geminiHistory })

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (text: string) => controller.enqueue(encoder.encode(text))

        try {
          // Send agent metadata as first line (client parses and strips)
          enqueue(`__AGENT__:${agentId}:${agentName}\n`)

          // First call: detect tool use (non-streaming)
          const firstResult = await chat.sendMessage(lastMsg)
          const fCalls = firstResult.response.functionCalls()

          if (fCalls?.length) {
            // Execute all tool calls in parallel
            const toolResponses = await Promise.all(
              fCalls.map(async fc => ({
                functionResponse: {
                  name:     fc.name,
                  response: { result: await executeTool(fc.name, fc.args as Record<string, any>, refCache) },
                },
              }))
            )

            // Stream final response with tool results
            const finalStream = await chat.sendMessageStream(toolResponses)
            for await (const chunk of finalStream.stream) {
              const text = chunk.text()
              if (text) enqueue(text)
            }
          } else {
            // No tool calls — return text directly
            const text = firstResult.response.text()
            if (text) enqueue(text)
          }

          controller.close()
        } catch (err: any) {
          const isAdmin = role === "admin"
          enqueue(isAdmin ? `Lỗi: ${err.message}` : "Hiếu đang fix, vui lòng đợi 🔧")
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
