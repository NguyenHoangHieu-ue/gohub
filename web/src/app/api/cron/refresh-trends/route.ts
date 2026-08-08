import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { runWebSearch } from "@/lib/agents/creator-ai"

// Cron chạy lúc 8h ICT (1h UTC) mỗi ngày.
// Thu thập trend data từ Google Search (Gemini grounding) → lưu trend_snapshots.
// Hiếu (role=creator) đọc qua getTrendSnapshots tool trong Gấu Pro.

const TREND_QUERIES = [
  {
    query: "xu hướng TikTok du lịch quốc tế 2026 người Việt nội dung viral travel SIM eSIM",
    category: "travel_sim",
    platform: "tiktok",
  },
  {
    query: "Airalo Simify Holafly eSIM TikTok content marketing viral video 2026 strategy",
    category: "competitor",
    platform: "tiktok",
  },
  {
    query: "top trending travel destinations Vietnam 2026 Japan Korea Europe summer peak",
    category: "travel",
    platform: "google",
  },
  {
    query: "trending TikTok video ideas travel lifestyle Vietnam creator August 2026",
    category: "general",
    platform: "tiktok",
  },
]

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const results: Array<{ query: string; ok: boolean; error?: string }> = []

  for (const q of TREND_QUERIES) {
    try {
      const { result, sources } = await runWebSearch(q.query)
      const { error } = await supabaseAdmin.from("trend_snapshots").insert({
        date:        today,
        platform:    q.platform,
        category:    q.category,
        summary:     result.slice(0, 4000),
        topics:      [],
        raw_sources: sources.slice(0, 10),
      })
      results.push({ query: q.query, ok: !error, error: error?.message })
    } catch (e: any) {
      results.push({ query: q.query, ok: false, error: e.message })
    }
  }

  const ok = results.filter(r => r.ok).length
  return NextResponse.json({ date: today, ok, total: results.length, results })
}
