import { GoogleGenerativeAI } from "@google/generative-ai"

export function stripBase64Images(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(data:image\/[^)]{20,}\)/g, "[📸 Ảnh Gấu Pro đã tạo — xem ở trên]")
}

export async function compressHistory(
  history: { role: string; parts: { text: string }[] }[]
): Promise<{ history: typeof history; summarized: boolean }> {
  const totalChars = history.reduce((s, m) => s + (m.parts[0]?.text?.length || 0), 0)
  if (history.length <= 20 && totalChars <= 30000) return { history, summarized: false }

  const keepRecent  = 10
  const toSummarize = history.slice(0, history.length - keepRecent)
  const recent      = history.slice(history.length - keepRecent)
  if (toSummarize.length === 0) return { history, summarized: false }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    // thinkingLevel "minimal": tóm tắt hội thoại là tác vụ nén văn bản thẳng, không cần suy luận sâu —
    // né mặc định "medium" của gemini-3.8-flash (billable, thêm latency ẩn). "as any": SDK v0.21.0 pin
    // cứng chưa có type cho field này (ra đời sau SDK).
    const model = genAI.getGenerativeModel({
      model: "gemini-3.8-flash",
      generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } } as any,
    })
    const convText = toSummarize.map(m => `[${m.role}] ${m.parts[0]?.text || ""}`).join("\n").slice(0, 40000)
    const res = await model.generateContent(
      `Tóm tắt cuộc hội thoại sau trong < 500 từ tiếng Việt. GIỮ LẠI: facts, số liệu, mã SKU/sản phẩm, quyết định, và ngữ cảnh cần cho câu hỏi tiếp theo. Bỏ chi tiết vụn.\n\n${convText}`
    )
    const summary = res.response.text().trim()
    if (!summary) return { history, summarized: false }
    const summaryMsg = { role: "user", parts: [{ text: `[TÓM TẮT HỘI THOẠI TRƯỚC ĐÓ]\n${summary}` }] }
    return { history: [summaryMsg, ...recent], summarized: true }
  } catch {
    return { history, summarized: false }
  }
}
