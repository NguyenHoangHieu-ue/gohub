import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { canWriteTab } from "@/lib/writable-tabs"
import { quarterRange } from "@/lib/okr-helpers"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3&year=2026 — nâng cấp AI cho "chủ đề hay hỏi" (bên cạnh heuristic tần suất từ khoá
// có sẵn ở /begau-insights) — cùng pattern usage-stats/classify (Gemini gom câu hỏi thành nhóm chủ đề)
// nhưng SCOPE đúng tập task được tính KPI (used_db_tool=true) của quý My Metrics đang xem. ON-DEMAND
// theo yêu cầu Hiếu (chỉ chạy khi bấm nút, KHÔNG tự chạy mỗi lần tải trang) — cache 12h qua cachedQuery.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = parseInt(req.nextUrl.searchParams.get("year") ?? "2026")
  const { start, end } = quarterRange(quarter, year)

  if (!process.env.GEMINI_KEY) return NextResponse.json({ error: "GEMINI_KEY chưa cấu hình" }, { status: 500 })

  const cacheKey = `okr_begau_topics_ai:${quarter}-${year}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const { data: events } = await supabaseAdmin
        .from("app_usage_events")
        .select("user_message")
        .eq("event_type", "chat").eq("used_db_tool", true)
        .gte("created_at", `${start}T00:00:00.000Z`).lte("created_at", `${end}T23:59:59.999Z`)
        .order("created_at", { ascending: false })
        .limit(80)

      const questions = (events ?? []).map(e => (e.user_message as string) ?? "").filter(Boolean)
      if (questions.length === 0) return { categories: [], total: 0 }

      const numbered = questions.map((q, i) => `${i}: "${q.slice(0, 150)}"`).join("\n")
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
      const model = genAI.getGenerativeModel({
        model: "gemini-3.8-flash",
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } } as any,
      })
      const prompt = `Bạn là chuyên gia phân tích câu hỏi chatbot BI nội bộ GoHub (SIM/eSIM du lịch). Đây là các câu hỏi ĐÃ được Bé Gấu trả lời bằng cách truy vấn dữ liệu thật (không phải chào hỏi):
${numbered}

Gom thành 5-8 nhóm chủ đề (tương đồng ý nghĩa dù từ ngữ khác nhau). Trả JSON THUẦN:
[{"name":"Tên nhóm ngắn (≤30 ký tự)","description":"Mô tả ngắn (≤60 ký tự)","indices":[0,2,5],"icon":"📊"}]
Mỗi câu chỉ thuộc 1 nhóm phù hợp nhất.`

      const result = await model.generateContent(prompt)
      const raw = result.response.text().trim()
      const categories = JSON.parse(raw) as { name: string; description: string; indices: number[]; icon: string }[]
      const enriched = categories.map(cat => ({ ...cat, count: cat.indices.length }))
      return { categories: enriched, total: questions.length, generated_at: new Date().toISOString() }
    }, 720)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/begau-insights/topics-ai]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
