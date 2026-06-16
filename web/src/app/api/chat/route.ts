import { NextRequest, NextResponse }           from "next/server"
import { getServerSession }                    from "next-auth"
import { authOptions }                         from "@/lib/auth"
import { GoogleGenerativeAI, SchemaType }      from "@google/generative-ai"
import { getRefCache }                         from "@/lib/agents/cache"
import { AGENTS }                              from "@/lib/agents/agents"
import { route }                               from "@/lib/agents/router"
import { buildToolContext }                    from "@/lib/agents/context"
import type { Message, UserRole }              from "@/lib/agents/types"
import { queryAnalytics }                      from "@/lib/analytics-db"

// ─── BI Analyst: Gemini function calling với gohub_dw ────────────────────────

const executeSQLDecl = {
  name: "executeSQL",
  description: "Execute a SELECT SQL query on gohub_dw PostgreSQL database and return results. Use this to answer business analytics questions.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      sql: {
        type: SchemaType.STRING,
        description: "The SQL SELECT query to execute. Only SELECT and WITH queries are allowed.",
      },
    },
    required: ["sql"],
  },
}

async function runBIAnalyst(
  systemInstruction: string,
  geminiHistory: any[],
  lastMsg: string,
  role: UserRole
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
    tools: [{ functionDeclarations: [executeSQLDecl] }],
  })

  const chat = model.startChat({ history: geminiHistory })
  let result = await chat.sendMessage(lastMsg)

  // Function calling loop — max 8 iterations
  for (let i = 0; i < 8; i++) {
    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) break

    const parts: any[] = []

    for (const call of calls) {
      if (call.name !== "executeSQL") {
        parts.push({ functionResponse: { name: call.name, response: { error: "Unknown tool" } } })
        continue
      }

      const sql = (call.args as any)?.sql as string || ""
      const normalizedSql = sql.trim().toLowerCase()

      // Security: only SELECT / WITH
      if (!normalizedSql.startsWith("select") && !normalizedSql.startsWith("with")) {
        parts.push({ functionResponse: { name: "executeSQL", response: { error: "Only SELECT and WITH queries are allowed." } } })
        continue
      }
      if (sql.includes(";") && sql.split(";").filter((s: string) => s.trim()).length > 1) {
        parts.push({ functionResponse: { name: "executeSQL", response: { error: "Multiple statements are not allowed." } } })
        continue
      }

      try {
        console.log(`[BI] SQL: ${sql.substring(0, 100)}`)
        const rows = await queryAnalytics(sql)
        // Limit to 100 rows to avoid token overflow
        const limited = rows.slice(0, 100)
        parts.push({ functionResponse: { name: "executeSQL", response: { result: limited, rowCount: rows.length } } })
      } catch (err: any) {
        console.error("[BI] SQL error:", err.message)
        parts.push({ functionResponse: { name: "executeSQL", response: { error: err.message } } })
      }
    }

    result = await chat.sendMessage(parts)
  }

  return result.response.text()
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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
    const [refCache, { agentId, agentName, params }] = await Promise.all([
      getRefCache(),
      route(lastMsg, history, role),
    ])
    const agent = AGENTS[agentId]

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
