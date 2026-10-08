import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { ThinkingLevel } from "@google/genai"
import { authOptions } from "@/lib/auth"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_MODEL, GEMINI_TRANSCRIBE_MODEL } from "@/lib/ai-models"
import { checkRateLimit } from "@/lib/rate-limit"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"

export const maxDuration = 300
const MAX_BYTES = 4_400_000   // trần body request Vercel ~4,5MB (ghi âm 16kbps ≈ 35 phút)

const MINUTES_PROMPT = `Bạn là thư ký cuộc họp của GoHub (bán SIM/eSIM du lịch). Từ bản chép lời dưới đây, viết BIÊN BẢN tiếng Việt, ngắn gọn, đúng sự thật
(không bịa tên, số, hạn chót không có trong lời nói; chỗ nghe không rõ ghi "(không rõ)").
Bản chép tự động hay nghe nhầm thuật ngữ GoHub — sửa theo ngữ cảnh: Datapool, BC Datapool (CMHK/Singtel), 3HK, WorldMove (WM), Gighub (KHÔNG phải
GitHub), SimStore, KDDI, Truemove, Joytel, CM1, GP, COGS, SKU, eSIM, B2B, B2C, Q1–Q4, "Hiếu" (hay bị chép thành "Hiểu"). Cấu trúc markdown:
## Biên bản cuộc họp
**Tóm tắt** (2–4 câu)
### Nội dung chính (gạch đầu dòng theo chủ đề)
### Quyết định đã chốt
### Việc cần làm (bảng: Việc | Người phụ trách | Hạn) — không có thì ghi "Chưa có việc cụ thể"
### Câu hỏi còn mở`

// U3: Bé Gấu ghi âm cuộc họp → biên bản (tính năng "transcribe" theo vai trò). Nhận multipart "audio".
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!featureEnabled(await loadFeatureMatrix(), "transcribe", session.user.role))
    return NextResponse.json({ error: "Vai trò của bạn chưa được mở Ghi âm → biên bản." }, { status: 403 })
  const rl = await checkRateLimit(`transcribe:${session.user.username || session.user.email}`, 5, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Gửi quá nhiều, đợi 1 phút." }, { status: 429 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("audio")
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Thiếu file ghi âm." }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File quá lớn (tối đa ~4MB ≈ 35 phút ghi âm)." }, { status: 413 })

  try {
    const audio = { mimeType: (file.type || "audio/webm").split(";")[0], data: Buffer.from(await file.arrayBuffer()).toString("base64") }
    const tr = await genai().models.generateContent({ model: GEMINI_TRANSCRIBE_MODEL, contents: [{ role: "user", parts: [{ inlineData: audio }] }] })
    const transcript = (tr.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.audioTranscription?.text ?? p.text ?? "").join(" ").trim()
    if (!transcript) return NextResponse.json({ error: "Không nghe được lời nói trong file." }, { status: 422 })
    const mm = await genai().models.generateContent({
      model: GEMINI_MODEL, contents: `${MINUTES_PROMPT}\n\nBẢN CHÉP LỜI:\n${transcript.slice(0, 120_000)}`,
      config: { temperature: 0, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    })
    return NextResponse.json({ minutes: (mm.text ?? "").trim(), transcript })
  } catch (e: any) {
    return NextResponse.json({ error: `Không xử lý được ghi âm: ${e?.message || e}` }, { status: 500 })
  }
}
