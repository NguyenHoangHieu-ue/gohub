// Lightweight Gemini Google Search grounding — không phụ thuộc vào các module nặng.
// Import từ đây thay vì creator-ai.ts để tránh kéo theo analytics-db / Lark / portal / etc.

import { GoogleGenerativeAI } from "@google/generative-ai"

export interface WebSource { title: string; url: string }

export async function runWebSearch(query: string): Promise<{ result: string; sources: WebSource[] }> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const searchModel = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      tools: [{ googleSearch: {} } as any],
    })
    const result = await searchModel.generateContent({
      contents: [{ role: "user", parts: [{ text: `${query}\n\nProvide a comprehensive, factual answer with citations.` }] }],
    })
    const text = result.response.text()
    const meta = (result.response.candidates?.[0] as any)?.groundingMetadata
    const sources: WebSource[] = (meta?.groundingChunks || [])
      .map((c: any) => ({ title: c.web?.title || "Web source", url: c.web?.uri || "" }))
      .filter((s: WebSource) => s.url)
    return { result: text, sources }
  } catch (e: any) {
    return {
      result: `Web search failed: ${e.message}. Please answer from training knowledge.`,
      sources: [],
    }
  }
}
