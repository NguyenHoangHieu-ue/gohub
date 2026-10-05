import { NextResponse } from "next/server"
import { GoogleGenAI, Modality } from "@google/genai"
import { liveUser } from "@/lib/agents/creator/live-auth"
import { buildLiveSession } from "@/lib/agents/creator-ai"
import { GEMINI_LIVE_MODEL } from "@/lib/ai-models"
import { checkRateLimit } from "@/lib/rate-limit"

// G5: cấp token TẠM cho trình duyệt kết nối thẳng Gemini Live (không lộ GEMINI_KEY). Token dùng 1 lần, phải mở phiên trong 60s,
// phiên sống tối đa 30 phút; model + cấu hình (prompt, bộ tool CHỈ ĐỌC) bị khoá trong token — client không đổi được.
export async function POST() {
  const u = await liveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền dùng phiên giọng nói Gấu Pro." }, { status: 403 })
  const rl = await checkRateLimit(`gp-live:${u.username}`, 6, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Mở phiên quá nhiều, đợi 1 phút." }, { status: 429 })

  const { systemInstruction, declarations, toolNames } = await buildLiveSession(u.isCreator, u.username)
  const config = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    systemInstruction,
    tools: [{ functionDeclarations: declarations as any }],
    contextWindowCompression: { slidingWindow: {} },   // phiên có hình mặc định chỉ ~2 phút; nén cửa sổ để kéo dài
  }
  const now = Date.now()
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY!, httpOptions: { apiVersion: "v1alpha" } })
    const token = await ai.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      liveConnectConstraints: { model: GEMINI_LIVE_MODEL, config },
      httpOptions: { apiVersion: "v1alpha" },
    } })
    // Client chỉ cần token + model; config gửi kèm để SDK mở phiên khớp (bị khoá phía server dù client gửi gì).
    return NextResponse.json({ token: token.name, model: GEMINI_LIVE_MODEL, tools: toolNames,
      config: { responseModalities: config.responseModalities, inputAudioTranscription: {}, outputAudioTranscription: {} } })
  } catch (e: any) {
    return NextResponse.json({ error: `Không tạo được phiên: ${e?.message || e}` }, { status: 500 })
  }
}
