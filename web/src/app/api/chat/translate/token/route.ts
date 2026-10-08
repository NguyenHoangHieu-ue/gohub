import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createLiveToken } from "@/lib/agents/live-token"
import { GEMINI_TRANSLATE_MODEL } from "@/lib/ai-models"
import { checkRateLimit } from "@/lib/rate-limit"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"

const LANGS = new Set(["en", "zh", "ja", "ko", "th", "fr", "de", "es", "ru", "id", "ms", "km", "lo"])

// U3 dịch trực tiếp (tính năng "translate"): 2 token — chiều khách → tiếng Việt và chiều nhân viên → tiếng khách.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!featureEnabled(await loadFeatureMatrix(), "translate", session.user.role))
    return NextResponse.json({ error: "Vai trò của bạn chưa được mở Dịch trực tiếp." }, { status: 403 })
  const rl = await checkRateLimit(`bg-translate:${session.user.username || session.user.email}`, 6, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Mở phiên quá nhiều, đợi 1 phút." }, { status: 429 })
  const { lang } = await req.json().catch(() => ({}))
  if (typeof lang !== "string" || !LANGS.has(lang)) return NextResponse.json({ error: "Ngôn ngữ không hỗ trợ." }, { status: 400 })
  try {
    const [toVi, toGuest] = await Promise.all([
      createLiveToken("", [], { model: GEMINI_TRANSLATE_MODEL, translationConfig: { targetLanguageCode: "vi", echoTargetLanguage: false } }),
      createLiveToken("", [], { model: GEMINI_TRANSLATE_MODEL, translationConfig: { targetLanguageCode: lang, echoTargetLanguage: false } }),
    ])
    return NextResponse.json({ toVi, toGuest })
  } catch (e: any) {
    return NextResponse.json({ error: `Không tạo được phiên: ${e?.message || e}` }, { status: 500 })
  }
}
