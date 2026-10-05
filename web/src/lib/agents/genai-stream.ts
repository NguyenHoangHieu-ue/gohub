import { GoogleGenAI, type Content, type FunctionCall, type GenerateContentConfig, type Part } from "@google/genai"

// G1b (docs/plans/gau-pro-assistant.md): Gấu Pro chạy trên SDK mới `@google/genai` — SDK cũ `@google/generative-ai`
// đã hết hỗ trợ (30/11/2025) và từng làm rớt `thoughtSignature` khi gộp chunk stream (xem gemini-stream.ts). Ở đây tự gom
// NGUYÊN các part từ từng chunk (giữ mọi field, kể cả thoughtSignature) nên không cần vá. Bé Gấu vẫn dùng gemini-stream.ts.

let _ai: GoogleGenAI | null = null
export function genai(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY! })
  return _ai
}

export interface TurnResult {
  content: Content               // nguyên lượt model (để đẩy lại vào contents vòng sau)
  functionCalls: FunctionCall[]
  text: string
  tokensIn: number
  tokensOut: number
}

// SDK cũ dùng SchemaType chữ thường ("object"/"string"); Schema của SDK mới dùng Type chữ hoa. Đổi đệ quy để dùng chung
// file declarations.ts cho cả 2 (Bé Gấu/test vẫn đọc bản gốc).
export function toGenaiSchema<T>(node: T): T {
  if (Array.isArray(node)) return node.map(toGenaiSchema) as T
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGenaiSchema(v)
    }
    return out as T
  }
  return node
}

const TRANSIENT = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|timeout|ECONNRESET|ETIMEDOUT|fetch failed|network/i

/** 1 lượt gọi model có stream. Retry lỗi tạm thời chỉ khi CHƯA đẩy chữ nào ra người dùng (tránh lặp chữ). */
export async function streamTurn(
  model: string,
  contents: Content[],
  config: GenerateContentConfig,
  onChunk?: (text: string) => void,
  attempts = 3,
): Promise<TurnResult> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    let emitted = false
    const parts: Part[] = []
    let tokensIn = 0, tokensOut = 0
    try {
      const stream = await genai().models.generateContentStream({ model, contents, config })
      for await (const chunk of stream) {
        const cParts = chunk.candidates?.[0]?.content?.parts ?? []
        for (const p of cParts) {
          parts.push({ ...p })
          if (typeof p.text === "string" && p.text && !p.thought) { emitted = true; onChunk?.(p.text) }
        }
        const u = chunk.usageMetadata
        if (u) { tokensIn = u.promptTokenCount ?? tokensIn; tokensOut = u.candidatesTokenCount ?? tokensOut }
      }
      const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall!) as FunctionCall[]
      const text = parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("")
      return { content: { role: "model", parts }, functionCalls, text, tokensIn, tokensOut }
    } catch (e: any) {
      lastErr = e
      if (emitted || !TRANSIENT.test(String(e?.message || "")) || i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw lastErr
}
