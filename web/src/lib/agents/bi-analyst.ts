import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"

// ─── BI Analyst: Gemini function calling với gohub_dw ────────────────────────
// Dùng chung cho cả web chatbot (/api/chat) và Lark bot (/api/lark/events).

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

export async function runBIAnalyst(
  systemInstruction: string,
  geminiHistory: any[],
  lastMsg: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
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
        console.log(`[BI] SQL: ${sql.substring(0, 120)}`)
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
