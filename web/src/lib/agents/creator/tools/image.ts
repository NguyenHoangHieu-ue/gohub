import { supabaseAdmin } from "@/lib/supabase"

const STABILITY_API = "https://api.stability.ai/v2beta/stable-image/generate/core"
const STORAGE_BUCKET = "creator-images"

// Style preset suffixes — Gấu tự inject vào cuối prompt
const STYLE_SUFFIXES: Record<string, string> = {
  commercial_photo:   "photorealistic, soft studio lighting, commercial quality, clean background, 8K, professional product photography, no text, no watermark",
  tiktok_thumb:       "vertical 9:16 TikTok thumbnail, vibrant saturated colors, bold composition with text space at top, eye-catching, professional social media quality, 8K ultra-detailed, no text, no watermark",
  travel_cinematic:   "cinematic wide-angle photography, golden hour warm light, travel aesthetic, photorealistic, stunning landscape, 8K, professional travel photography, no text",
  flat_illustration:  "flat vector illustration, minimal clean design, geometric shapes, Dribbble quality, modern corporate style, pastel colors, no text",
  three_d_product:    "3D render, product mockup, clean white background, professional studio lighting, crisp sharp details, commercial quality, 4K, no shadows, no text",
  storyboard:         "storyboard panel, flat illustration style, clean lines, muted neutral colors, professional animation storyboard, clear scene composition",
}

export async function runGenerateImage(args: { prompt: string; aspect_ratio?: string; style_preset?: string }): Promise<{ markdown: string; error?: string }> {
  const ar = args.aspect_ratio || "1:1"
  let width = 1024, height = 1024
  if (ar === "9:16") { width = 864;  height = 1536 }
  if (ar === "16:9") { width = 1536; height = 864  }
  if (ar === "4:3")  { width = 1024; height = 768  }
  if (ar === "3:4")  { width = 768;  height = 1024 }

  // Inject style suffix nếu có preset
  const base    = args.prompt.trim()
  const suffix  = args.style_preset ? (STYLE_SUFFIXES[args.style_preset] ?? "") : ""
  const prompt  = suffix ? `${base}, ${suffix}` : base

  const seed    = Date.now() % 999983
  const encoded = encodeURIComponent(prompt)
  const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`

  const presetLabel = args.style_preset ? ` | Style: \`${args.style_preset}\`` : ""
  return {
    markdown: `![Ảnh Gấu Pro tạo](${url})\n\n> 💾 **Lưu ảnh**: chuột phải → "Lưu ảnh dưới dạng..."${presetLabel}\n> *Prompt: ${base.slice(0, 100)}*\n> *(${width}×${height}px — FLUX + AI enhance)*`,
  }
}

export async function runGenerateImageStability(args: {
  prompt: string; aspect_ratio?: string; style_preset?: string
}): Promise<{ markdown: string; error?: string }> {
  const apiKey = process.env.STABILITY_API_KEY
  if (!apiKey) {
    return { markdown: "", error: "STABILITY_API_KEY chưa được cấu hình. Hiếu cần set key trên Vercel." }
  }

  const suffix = args.style_preset ? (STYLE_SUFFIXES[args.style_preset] ?? "") : ""
  const prompt = suffix ? `${args.prompt.trim()}, ${suffix}` : args.prompt.trim()

  const arMap: Record<string, string> = { "1:1": "1:1", "16:9": "16:9", "9:16": "9:16", "4:3": "4:3", "3:4": "3:4" }
  const ar = arMap[args.aspect_ratio ?? "1:1"] ?? "1:1"

  const form = new FormData()
  form.append("prompt", prompt)
  form.append("aspect_ratio", ar)
  form.append("output_format", "webp")

  const response = await fetch(STABILITY_API, {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    body:    form,
  })

  if (!response.ok) {
    const txt = await response.text().catch(() => `HTTP ${response.status}`)
    return { markdown: "", error: `Stability AI error ${response.status}: ${txt.slice(0, 200)}` }
  }

  const json = await response.json()
  const base64 = json.image as string
  if (!base64) return { markdown: "", error: "Stability AI trả về ảnh rỗng" }

  // Upload lên Supabase storage → trả public URL
  try {
    const filename = `stability_${Date.now()}.webp`
    const buf      = Buffer.from(base64, "base64")
    const opts     = { contentType: "image/webp" as const, upsert: false }

    let { error: upErr } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(filename, buf, opts)
    if (upErr?.message?.toLowerCase().includes("bucket")) {
      await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 })
      ;({ error: upErr } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(filename, buf, opts))
    }
    if (upErr) throw new Error(upErr.message)

    const { data: urlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filename)
    const presetLabel = args.style_preset ? ` | Style: \`${args.style_preset}\`` : ""
    return {
      markdown: `![Ảnh Gấu Pro (Stability AI)](${urlData.publicUrl})\n\n> 💾 **Lưu ảnh**: chuột phải → "Lưu ảnh dưới dạng..."${presetLabel}\n> *Prompt: ${args.prompt.trim().slice(0, 100)}*\n> *(Stability AI Core — ${ar} · SDXL)*`,
    }
  } catch (e: any) {
    return { markdown: "", error: `Ảnh đã render nhưng không thể lưu lên storage: ${e.message}. Hiếu cần tạo bucket '${STORAGE_BUCKET}' (public) trong Supabase Storage.` }
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
