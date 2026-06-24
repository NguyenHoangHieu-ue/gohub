import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { queryAnalytics }                 from "@/lib/analytics-db"
import { supabaseAdmin }                   from "@/lib/supabase"

// Role data filter: admin không giới hạn; role khác lấy directive từ app_settings.role_filters
export async function getRoleDataFilter(role?: string): Promise<string> {
  if (!role || role === "admin") return ""
  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "role_filters").maybeSingle()
    const filters = data?.value ? JSON.parse(data.value) : {}
    return (filters[role] as string) || ""
  } catch {
    return ""
  }
}

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
  lastMsg: string,
  role?: string
): Promise<string> {
  // Role data filter (non-admin): chèn directive giới hạn dữ liệu vào prompt
  const dataFilter = await getRoleDataFilter(role)
  const finalInstruction = dataFilter
    ? `${systemInstruction}\n\n━━━ GIỚI HẠN TRUY CẬP DỮ LIỆU (DATA ACCESS RESTRICTION) ━━━\nVai trò "${role}" CHỈ được xem dữ liệu thỏa điều kiện sau — BẮT BUỘC thêm điều kiện này vào MỌI câu SQL (WHERE), không được bỏ qua:\n${dataFilter}`
    : systemInstruction

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction: finalInstruction,
    tools: [{ functionDeclarations: [executeSQLDecl] }],
    // temperature 0 → SQL ổn định, bám số liệu, hạn chế bịa (quan trọng cho báo cáo tài chính)
    generationConfig: { temperature: 0 },
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
