import { supabaseAdmin } from "@/lib/supabase"

export async function runGenerateImage(args: { prompt: string; aspect_ratio?: string }): Promise<{ markdown: string; error?: string }> {
  const ar = args.aspect_ratio || "1:1"
  let width = 1024, height = 1024
  if (ar === "9:16") { width = 864;  height = 1536 }
  if (ar === "16:9") { width = 1536; height = 864  }
  if (ar === "4:3")  { width = 1024; height = 768  }
  if (ar === "3:4")  { width = 768;  height = 1024 }

  const seed    = Date.now() % 999983
  const encoded = encodeURIComponent(args.prompt.trim())
  const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`

  return {
    markdown: `![Ảnh Gấu Pro tạo](${url})\n\n> 💾 **Lưu ảnh**: chuột phải → "Lưu ảnh dưới dạng..." | *Prompt: ${args.prompt.slice(0, 120)}*\n> *(${width}×${height}px — FLUX + AI enhance)*`,
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
      snapshots: [], hint: "Gọi webSearch() với query xu hướng cụ thể để lấy data live thay thế.",
    }
    return { snapshots: data, count: data.length, period: `${sinceStr} → hôm nay` }
  } catch (e: any) {
    return { error: e.message, hint: "Table trend_snapshots chưa tồn tại — Hiếu cần chạy migration v18 trong Supabase SQL Editor." }
  }
}
