import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_VIDEO_MODEL, GEMINI_VIDEO_MODEL_HQ } from "@/lib/ai-models"
import { uploadPublic } from "./image"

// U0 (plan be-gau-upgrade.md): video bằng Google Veo 3.1 (thay Kling). Đo 2026-10-08: veo-3.1-fast 9:16 ~55s, mp4 ~3MB. Link file của
// Google cần API key mới tải → tải về rồi lưu bucket công khai. Chờ tối đa ~150s trong lượt; lâu hơn trả mã để checkVideoStatus.
type OnEvent = ((e: { type: "status"; text: string }) => void) | undefined
const WAIT_MS = 150_000

async function finish(op: any): Promise<{ markdown?: string; error?: string }> {
  if (op.error) return { error: `Veo lỗi: ${JSON.stringify(op.error).slice(0, 300)}` }
  const v = op.response?.generatedVideos?.[0]?.video
  if (!v?.uri && !v?.videoBytes) {
    const why = op.response?.raiMediaFilteredReasons?.join("; ")
    return { error: why ? `Video bị chặn bởi bộ lọc an toàn: ${why}` : "Veo không trả video." }
  }
  const buf = v.videoBytes
    ? Buffer.from(v.videoBytes, "base64")
    : Buffer.from(await (await fetch(v.uri, { headers: { "x-goog-api-key": process.env.GEMINI_KEY ?? "" } })).arrayBuffer())
  const url = await uploadPublic(buf, "mp4", v.mimeType || "video/mp4")
  return { markdown: `🎬 **Video đã tạo xong**\n\n[▶️ Xem / tải video](${url})` }
}

export async function runGenerateVideo(
  args: { prompt: string; negative_prompt?: string; aspect_ratio?: string; quality?: string },
  onEvent?: OnEvent,
): Promise<{ markdown?: string; task_id?: string; error?: string }> {
  const prompt = String(args.prompt ?? "").trim()
  if (!prompt) return { error: "Thiếu mô tả video." }
  const model = args.quality === "high" ? GEMINI_VIDEO_MODEL_HQ : GEMINI_VIDEO_MODEL
  try {
    let op: any = await genai().models.generateVideos({
      model,
      source: { prompt },
      config: { aspectRatio: args.aspect_ratio === "9:16" ? "9:16" : "16:9", numberOfVideos: 1, ...(args.negative_prompt ? { negativePrompt: args.negative_prompt } : {}) },
    } as any)
    onEvent?.({ type: "status", text: "🎬 Đã gửi yêu cầu Veo, đang dựng video (~1 phút)..." })
    const t0 = Date.now()
    while (!op.done && Date.now() - t0 < WAIT_MS) {
      await new Promise(r => setTimeout(r, 10_000))
      op = await genai().operations.getVideosOperation({ operation: op })
      onEvent?.({ type: "status", text: `🎬 Đang dựng video... ${Math.round((Date.now() - t0) / 1000)}s` })
    }
    if (!op.done) return { task_id: op.name, markdown: `⏳ Video dựng lâu hơn dự kiến (mã \`${op.name}\`). Gọi checkVideoStatus sau 1–2 phút.` }
    return await finish(op)
  } catch (e: any) {
    return { error: `Veo lỗi: ${e?.message || e}` }
  }
}

export async function runCheckVideoStatus(args: { task_id: string }): Promise<{ markdown?: string; error?: string }> {
  if (!args?.task_id) return { error: "Thiếu task_id." }
  try {
    const op: any = await genai().operations.getVideosOperation({ operation: { name: args.task_id } as any })
    if (!op.done) return { markdown: "⏳ Video vẫn đang dựng. Thử lại sau 1 phút." }
    return await finish(op)
  } catch (e: any) {
    return { error: `Không kiểm tra được: ${e?.message || e}` }
  }
}
