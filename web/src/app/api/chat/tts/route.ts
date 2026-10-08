import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_TTS_MODEL } from "@/lib/ai-models"
import { checkRateLimit } from "@/lib/rate-limit"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"
import { toSpeechText } from "@/lib/speech-text"

export const maxDuration = 60

// PCM 16-bit mono → WAV (phòng khi model trả audio/L16 thay vì wav).
function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

// U3: Bé Gấu đọc to câu trả lời (tính năng "tts" theo vai trò). Trả audio/wav.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!featureEnabled(await loadFeatureMatrix(), "tts", session.user.role))
    return NextResponse.json({ error: "Vai trò của bạn chưa được mở Đọc câu trả lời." }, { status: 403 })
  const rl = await checkRateLimit(`tts:${session.user.username || session.user.email}`, 10, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Đọc quá nhiều, đợi 1 phút." }, { status: 429 })
  const { text } = await req.json().catch(() => ({}))
  const speech = typeof text === "string" ? toSpeechText(text) : ""
  if (!speech) return NextResponse.json({ error: "Không có nội dung để đọc." }, { status: 400 })
  try {
    const r = await genai().models.generateContent({
      model: GEMINI_TTS_MODEL, contents: speech,
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    })
    const part = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
    if (!part?.data) return NextResponse.json({ error: "Model không trả âm thanh." }, { status: 502 })
    const buf = Buffer.from(part.data, "base64")
    const mime = String(part.mimeType || "")
    const rate = Number(mime.match(/rate=(\d+)/)?.[1] || 24000)
    const wav = mime.includes("wav") ? buf : pcmToWav(buf, rate)
    return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } })
  } catch (e: any) {
    return NextResponse.json({ error: `Không đọc được: ${e?.message || e}` }, { status: 500 })
  }
}
