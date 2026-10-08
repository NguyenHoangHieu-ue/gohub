import { GoogleGenAI, Modality } from "@google/genai"
import { GEMINI_LIVE_MODEL } from "@/lib/ai-models"

// Token TẠM cho trình duyệt kết nối thẳng Gemini Live (không lộ GEMINI_KEY) — dùng chung Gấu Pro (G5) + Bé Gấu (U3).
// Token dùng 1 lần, phải mở phiên trong 60s, phiên sống tối đa 30 phút; model + prompt + bộ tool bị khoá trong token.
export async function createLiveToken(systemInstruction: string, declarations: unknown[]) {
  const config = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    systemInstruction,
    tools: [{ functionDeclarations: declarations as any }],
    contextWindowCompression: { slidingWindow: {} },   // phiên có hình mặc định chỉ ~2 phút; nén cửa sổ để kéo dài
  }
  const now = Date.now()
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY!, httpOptions: { apiVersion: "v1alpha" } })
  const token = await ai.authTokens.create({ config: {
    uses: 1,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 60_000).toISOString(),
    liveConnectConstraints: { model: GEMINI_LIVE_MODEL, config },
    httpOptions: { apiVersion: "v1alpha" },
  } })
  // Client chỉ cần token + model; config gửi kèm để SDK mở phiên khớp (bị khoá phía server dù client gửi gì).
  return { token: token.name, model: GEMINI_LIVE_MODEL,
    config: { responseModalities: config.responseModalities, inputAudioTranscription: {}, outputAudioTranscription: {} } }
}
