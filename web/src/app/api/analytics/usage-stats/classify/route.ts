import { NextRequest, NextResponse }  from "next/server"
import { getServerSession }           from "next-auth"
import { authOptions }                from "@/lib/auth"
import { GoogleGenerativeAI }         from "@google/generative-ai"

// POST /api/analytics/usage-stats/classify
// Input: { questions: string[] }
// Dùng Gemini Flash để gom các câu hỏi tương tự thành nhóm chủ đề.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  const { questions } = await req.json() as { questions: string[] }
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "questions array required" }, { status: 400 })
  }

  const limited = questions.slice(0, 80)
  const numbered = limited.map((q, i) => `${i}: "${q.slice(0, 150)}"`).join("\n")

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  })

  const prompt = `Bạn là chuyên gia phân tích câu hỏi chatbot nội bộ GoHub (hệ thống phân tích kinh doanh SIM/eSIM).

Các câu hỏi người dùng đã hỏi Bé Gấu (chatbot):
${numbered}

Hãy gom các câu hỏi trên thành 5-8 nhóm chủ đề. Nhóm tương đồng về ý nghĩa dù từ ngữ khác nhau.

Trả về JSON (KHÔNG có markdown):
[
  {
    "name": "Tên nhóm ngắn gọn (≤30 ký tự)",
    "description": "Mô tả ngắn về nhóm này (≤60 ký tự)",
    "indices": [0, 2, 5],
    "icon": "📊"
  }
]

Gợi ý nhóm thường gặp trong hệ thống GoHub:
- Doanh thu / Báo cáo (BI/Analytics queries)
- Sản phẩm / SKU (tra cứu mã, tư vấn)
- Nhà cung cấp NCC (WorldMove, 3HK, JoyTel)
- Khách hàng B2B / B2C
- Tỷ giá / COGS / Chi phí
- Chatbot / Hệ thống (hỏi về hệ thống)
- Khác

Mỗi câu hỏi chỉ thuộc 1 nhóm (nhóm phù hợp nhất).`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().trim()
    const categories = JSON.parse(raw)

    // Enrich: thêm câu hỏi text vào mỗi category
    const enriched = categories.map((cat: any) => ({
      ...cat,
      count: cat.indices.length,
      questions: (cat.indices as number[]).map((i: number) => limited[i]).filter(Boolean),
    }))

    return NextResponse.json({ categories: enriched, total: limited.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
