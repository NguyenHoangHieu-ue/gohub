import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { runWebSearch } from "@/lib/web-search"
import { alertCronFailure } from "@/lib/cron-alert"

// Cron 8h ICT (1h UTC) mỗi ngày — thu thập trend data nhiều lĩnh vực lưu vào trend_snapshots.
// Import từ web-search.ts (lightweight) thay vì creator-ai.ts để tránh kéo theo module nặng.

const TREND_QUERIES = [
  // ── Travel SIM / eSIM ──────────────────────────────────────────────────────
  {
    query: "xu hướng TikTok du lịch quốc tế 2026 người Việt SIM eSIM data nước ngoài viral",
    category: "travel_sim",
    platform: "tiktok",
  },
  {
    query: "eSIM international travel trends 2026 popular content TikTok Reels",
    category: "travel_sim",
    platform: "tiktok",
  },

  // ── Điểm đến & du lịch ─────────────────────────────────────────────────────
  {
    query: "top trending travel destinations Vietnam 2026 Japan Korea Europe summer visa",
    category: "travel",
    platform: "google",
  },
  {
    query: "xu hướng du lịch người Việt 2026 nước nào hot nhất mùa hè thu",
    category: "travel",
    platform: "google",
  },
  {
    query: "travel tips viral TikTok 2026 Vietnam budget travel hacks packing hacks",
    category: "travel",
    platform: "tiktok",
  },

  // ── Competitor ─────────────────────────────────────────────────────────────
  {
    query: "Airalo Simify Holafly eSIM TikTok content marketing viral video strategy 2026",
    category: "competitor",
    platform: "tiktok",
  },
  {
    query: "eSIM provider comparison Airalo vs Simify vs local SIM 2026 review trending",
    category: "competitor",
    platform: "google",
  },

  // ── Content format & TikTok creator ───────────────────────────────────────
  {
    query: "TikTok trending video format hook 2026 Vietnam creator travel lifestyle viral style",
    category: "content_format",
    platform: "tiktok",
  },
  {
    query: "best time to post TikTok Vietnam 2026 travel niche engagement tips",
    category: "content_format",
    platform: "tiktok",
  },

  // ── Công nghệ & telecom ────────────────────────────────────────────────────
  {
    query: "eSIM adoption 2026 5G global roaming policy international data trends",
    category: "technology",
    platform: "google",
  },

  // ── Seasonal / events ─────────────────────────────────────────────────────
  {
    query: "peak travel season Vietnam 2026 holidays popular travel months Japan Korea Europe",
    category: "seasonal",
    platform: "google",
  },
]

export async function GET(req: NextRequest) {
  // Xác thực qua Authorization header (KHÔNG dùng query param vì secret sẽ lộ trong server logs)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const results: Array<{ query: string; category: string; ok: boolean; error?: string }> = []

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
      results.push({ query: q.query, category: q.category, ok: !error, error: error?.message })
    } catch (e: any) {
      results.push({ query: q.query, category: q.category, ok: false, error: e.message })
    }
  }

  const ok = results.filter(r => r.ok).length
  if (ok === 0) {
    await alertCronFailure("refresh-trends", new Error(`All ${results.length} trend queries failed`))
  }
  return NextResponse.json({ date: today, ok, total: results.length, results })
}
