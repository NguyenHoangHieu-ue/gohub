import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { GoogleGenerativeAI }        from "@google/generative-ai"

// POST /api/analytics/usage-stats/evaluate
// Input: { pairs: [{ id, user_message, ai_response, user_name }] }
// Dùng Gemini Flash để đánh giá chất lượng từng câu trả lời của Bé Gấu.
// Trả về điểm 1-5, nhận xét, và tổng hợp.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  const { pairs } = await req.json() as {
    pairs: Array<{ id: number; user_message: string; ai_response: string; user_name?: string }>
  }
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return NextResponse.json({ error: "pairs array required" }, { status: 400 })
  }

  const limited = pairs.slice(0, 30)   // max 30 pairs / call để tránh token limit

  const qaPairs = limited.map((p, i) =>
    `[${i}] Q: "${p.user_message?.slice(0, 200)}"\n    A: "${p.ai_response?.slice(0, 400)}"`
  ).join("\n\n")

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  })

  const prompt = `Bạn là chuyên gia đánh giá chất lượng Bé Gấu — chatbot AI nội bộ GoHub (hệ thống BI/phân tích kinh doanh SIM/eSIM).

Rubric đánh giá (1-5 điểm):
5 = Xuất sắc: đúng, đầy đủ, dùng data thực tế, dễ hiểu, có context cụ thể
4 = Tốt: đúng nhưng thiếu detail hoặc hơi dài, không có data thực
3 = Được: có ích nhưng chung chung, hoặc chỉ hướng dẫn mà không trả lời thẳng
2 = Yếu: sai 1 phần, lạc đề, hoặc không liên quan câu hỏi
1 = Tệ: từ chối không cần thiết, lỗi, hoặc sai hoàn toàn

Lưu ý: Bé Gấu có quyền từ chối câu hỏi về code/hệ thống/thông tin nhạy cảm → điểm 3 (không phải 1).

Các cặp Q&A cần đánh giá:
${qaPairs}

Trả về JSON (KHÔNG có markdown):
{
  "scores": [
    {
      "index": 0,
      "score": 4,
      "comment": "Nhận xét ngắn gọn 1 câu tiếng Việt",
      "category": "Tốt"
    }
  ],
  "summary": {
    "avg_score": 3.8,
    "strengths": ["Điểm mạnh 1", "Điểm mạnh 2"],
    "improvements": ["Cần cải thiện 1", "Cần cải thiện 2"],
    "overall": "Nhận xét tổng quan 2-3 câu tiếng Việt"
  }
}`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().trim()
    const parsed = JSON.parse(raw)

    // Gắn id từ input vào kết quả
    const enrichedScores = (parsed.scores || []).map((s: any) => ({
      ...s,
      id: limited[s.index]?.id,
      user_message: limited[s.index]?.user_message,
      ai_response: limited[s.index]?.ai_response,
      user_name: limited[s.index]?.user_name,
    }))

    // Phân bố điểm
    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
    for (const s of enrichedScores) {
      const key = String(Math.min(5, Math.max(1, Math.round(s.score || 3))))
      distribution[key] = (distribution[key] || 0) + 1
    }

    return NextResponse.json({
      scores: enrichedScores,
      summary: parsed.summary,
      distribution,
      evaluated: enrichedScores.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
