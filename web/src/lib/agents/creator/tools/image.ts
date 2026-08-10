import { supabaseAdmin } from "@/lib/supabase"

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
