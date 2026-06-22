import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"

// AI suggest mô tả bảng/cột (port intel generateAIDescriptions) — chạy server-side với GEMINI_KEY.
// Body: { tableName, fields: [{ name, type }] } → { tableDescription, fields: { [name]: description } }.

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const { tableName, fields } = await req.json()
    if (!tableName || !Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: "tableName and fields required" }, { status: 400 })
    }
    if (!process.env.GEMINI_KEY) return NextResponse.json({ error: "GEMINI_KEY chưa cấu hình" }, { status: 500 })

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY)
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } as any,
    })
    const prompt = `Dựa trên tên bảng SQL "${tableName}" và các trường: ${fields.map((f: any) => `${f.name} (${f.type})`).join(", ")}, hãy tạo mô tả ngắn gọn hữu ích cho bảng và từng trường bằng tiếng Việt. Trả về JSON dạng {"tableDescription": string, "fields": { "<tên trường>": string }}.`

    const res = await model.generateContent(prompt)
    let text = res.response.text().trim()
    text = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim()
    const parsed = JSON.parse(text)
    return NextResponse.json({ tableDescription: parsed.tableDescription || "", fields: parsed.fields || {} })
  } catch (err: any) {
    console.error("[config/schema/ai-suggest]", err.message)
    return NextResponse.json({ error: "Không thể tạo mô tả bằng AI" }, { status: 500 })
  }
}
