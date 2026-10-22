import { NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { createLiveToken } from "@/lib/agents/live-token"
import { GEMINI_TRANSLATE_MODEL } from "@/lib/ai-models"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

// Token tạm cho trình duyệt nối thẳng Gemini Live: `partner` dịch tiếng Anh của đối tác → tiếng Việt; `me` (đích tiếng Anh) chỉ để chép chữ lời của anh qua mic.
export async function POST() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const rl = await checkRateLimit(`argon-call-token:${username}`, 12, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Mở phiên quá nhiều, đợi 1 phút." }, { status: 429 })
  try {
    const [partner, me] = await Promise.all([
      createLiveToken("", [], { model: GEMINI_TRANSLATE_MODEL, translationConfig: { targetLanguageCode: "vi", echoTargetLanguage: false } }),
      createLiveToken("", [], { model: GEMINI_TRANSLATE_MODEL, translationConfig: { targetLanguageCode: "en", echoTargetLanguage: true } }),
    ])
    return NextResponse.json({ partner, me })
  } catch (e) { return NextResponse.json({ error: `Không tạo được phiên: ${(e as Error).message}` }, { status: 500 }) }
}
