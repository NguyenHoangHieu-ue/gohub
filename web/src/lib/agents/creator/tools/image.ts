import { supabaseAdmin } from "@/lib/supabase"

import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODEL_PRO } from "@/lib/ai-models"

// U0 (plan be-gau-upgrade.md): tạo/sửa ảnh bằng Google Nano Banana (thay Pollinations/Stability). Đo 2026-10-08: banner 16:9 có chữ tiếng
// Việt — Nano Banana 2.1 ~29s, Pro ~18s; sửa ảnh theo ảnh gốc (đổi chữ/đổi mùa, giữ bố cục) ~21s. Ảnh lưu bucket công khai, tên ngẫu nhiên.
const STORAGE_BUCKET = "creator-images"
const ASPECTS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"])

// Gợi ý phong cách — nối vào prompt
const STYLE_SUFFIXES: Record<string, string> = {
  commercial_photo:   "photorealistic product photography, soft studio lighting, clean background, commercial quality",
  tiktok_thumb:       "vertical TikTok thumbnail, vibrant saturated colors, bold eye-catching composition",
  travel_cinematic:   "cinematic wide-angle travel photography, golden hour light, photorealistic",
  flat_illustration:  "flat vector illustration, minimal clean design, modern corporate style",
  three_d_product:    "3D render product mockup, clean white background, studio lighting",
  storyboard:         "storyboard panel, flat illustration, clean lines, muted colors",
}

export interface InputImage { mimeType: string; data: string }   // base64

export async function uploadPublic(buf: Buffer, ext: string, contentType: string): Promise<string> {
  const name = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const opts = { contentType, upsert: false }
  let { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(name, buf, opts)
  if (error?.message?.toLowerCase().includes("bucket")) {
    await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, { public: true, fileSizeLimit: 50 * 1024 * 1024 })
    ;({ error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(name, buf, opts))
  }
  if (error) throw new Error(error.message)
  return supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(name).data.publicUrl
}

export async function runGenerateImage(
  args: { prompt: string; aspect_ratio?: string; style_preset?: string; quality?: string; edit_attached?: boolean },
  images: InputImage[] = [],
): Promise<{ markdown: string; url?: string; error?: string }> {
  const base = String(args.prompt ?? "").trim()
  if (!base) return { markdown: "", error: "Thiếu mô tả ảnh." }
  const suffix = args.style_preset ? (STYLE_SUFFIXES[args.style_preset] ?? "") : ""
  const prompt = suffix ? `${base}. Style: ${suffix}` : base
  const edit = args.edit_attached === true
  if (edit && !images.length) return { markdown: "", error: "Người dùng chưa đính kèm ảnh để sửa — nhờ họ gửi kèm ảnh gốc." }
  const model = args.quality === "high" ? GEMINI_IMAGE_MODEL_PRO : GEMINI_IMAGE_MODEL
  const aspect = ASPECTS.has(String(args.aspect_ratio)) ? String(args.aspect_ratio) : undefined
  try {
    const r = await genai().models.generateContent({
      model,
      contents: [{ role: "user", parts: [...(edit ? images.slice(0, 3).map(i => ({ inlineData: i })) : []), { text: prompt }] }],
      config: { responseModalities: ["IMAGE", "TEXT"], ...(aspect && !edit ? { imageConfig: { aspectRatio: aspect } } : {}) },
    })
    const part = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
    if (!part?.data) {
      const why = r.candidates?.[0]?.finishReason || r.text || "không rõ"
      return { markdown: "", error: `Không tạo được ảnh (${String(why).slice(0, 200)}). Thử mô tả lại.` }
    }
    const mime = part.mimeType || "image/png"
    const url = await uploadPublic(Buffer.from(part.data, "base64"), mime.includes("png") ? "png" : "jpg", mime)
    return {
      url,
      markdown: `![Ảnh ${edit ? "đã sửa" : "tạo bởi AI"}](${url})

> 💾 Bấm chuột phải → "Lưu ảnh" để tải về · ${edit ? "Sửa theo ảnh gốc" : "Tạo mới"} · ${model}`,
    }
  } catch (e: any) {
    return { markdown: "", error: `Tạo ảnh lỗi: ${e?.message || e}` }
  }
}

export async function runGetTrendSnapshots(args: any): Promise<any> {
  const days = Math.min(Math.max(parseInt(args?.days) || 7, 1), 30)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)
  try {
    let q = supabaseAdmin.from("trend_snapshots")
      .select("date,platform,category,summary,raw_sources,created_at")
      .gte("date", sinceStr).order("date", { ascending: false }).limit(20)
    if (args?.category && args.category !== "all") q = q.eq("category", args.category)
    if (args?.platform && args.platform !== "all") q = q.eq("platform", args.platform)
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data?.length) return {
      message: `Chưa có trend snapshot trong ${days} ngày qua (cron chạy 8h ICT mỗi ngày).`,
      snapshots: [],
      auto_retry_suggested: true,
      retry_hint: `Snapshot chưa có — hãy gọi webSearch với query "travel SIM eSIM trends Southeast Asia ${new Date().toISOString().slice(0, 7)}" để lấy data live thay thế.`,
    }
    return { snapshots: data, count: data.length, period: `${sinceStr} → hôm nay` }
  } catch (e: any) {
    return { error: e.message, hint: "Table trend_snapshots chưa tồn tại — Hiếu cần chạy migration v18 trong Supabase SQL Editor." }
  }
}
