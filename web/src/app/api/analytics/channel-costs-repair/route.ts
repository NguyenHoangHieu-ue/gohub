import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// POST /api/analytics/channel-costs-repair
// Tự động reconcile analytics_channel_costs.source_code bằng cách:
// 1. Lấy toàn bộ kênh hiện tại từ dim_order_source (gohub_dw)
// 2. Lấy toàn bộ cost records chưa có source_code từ Supabase
// 3. Match tên kênh (exact → case-insensitive → fuzzy) → cập nhật source_code
// Chỉ admin/creator mới được gọi endpoint này.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "channels", WRITE_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const dryRun = req.nextUrl.searchParams.get("dry") === "1"

  try {
    // 1. Lấy toàn bộ kênh B2B từ gohub_dw (code + channel_name hiện tại)
    const dwChannels = await queryAnalytics<{ code: string; channel_name: string }>(
      `SELECT DISTINCT TRIM(code) as code, TRIM(channel_name) as channel_name
       FROM dim_order_source
       WHERE channel_name IS NOT NULL AND TRIM(channel_name) != ''
       ORDER BY channel_name`
    )

    // Build lookup maps
    const byExact = new Map<string, string>()   // channel_name → code
    const byLower = new Map<string, string>()   // lower(channel_name) → code
    for (const ch of dwChannels) {
      byExact.set(ch.channel_name, ch.code)
      byLower.set(ch.channel_name.toLowerCase(), ch.code)
    }

    // 2. Lấy cost records chưa có source_code
    const { data: costRows, error: costErr } = await supabaseAdmin
      .from("analytics_channel_costs")
      .select("channel, month, source_code")
    if (costErr) throw new Error(costErr.message)

    const needsRepair = (costRows || []).filter(r => !r.source_code)
    const alreadyMapped = (costRows || []).filter(r => r.source_code).length

    const results: Array<{ channel: string; months: string[]; matched_code: string; method: string }> = []
    const notFound: string[] = []

    // Group by channel to report cleanly
    const byChannel = new Map<string, string[]>()
    for (const r of needsRepair) {
      if (!byChannel.has(r.channel)) byChannel.set(r.channel, [])
      byChannel.get(r.channel)!.push(r.month)
    }

    for (const [channel, months] of byChannel.entries()) {
      let code: string | undefined
      let method = ""

      // Exact match
      if (byExact.has(channel)) {
        code = byExact.get(channel); method = "exact"
      }
      // Case-insensitive match
      else if (byLower.has(channel.toLowerCase())) {
        code = byLower.get(channel.toLowerCase()); method = "case-insensitive"
      }
      // Fuzzy: channel name contains current name OR current name contains channel name
      else {
        const chLow = channel.toLowerCase().replace(/\s+/g, "")
        for (const dw of dwChannels) {
          const dwLow = dw.channel_name.toLowerCase().replace(/\s+/g, "")
          if (chLow.includes(dwLow) || dwLow.includes(chLow)) {
            code = dw.code; method = `fuzzy(${dw.channel_name})`; break
          }
        }
      }

      if (code) {
        results.push({ channel, months, matched_code: code, method })
        if (!dryRun) {
          await supabaseAdmin
            .from("analytics_channel_costs")
            .update({ source_code: code })
            .eq("channel", channel)
        }
      } else {
        notFound.push(channel)
      }
    }

    return NextResponse.json({
      dry_run: dryRun,
      total_cost_records: (costRows || []).length,
      already_mapped: alreadyMapped,
      repaired: results.length,
      not_found: notFound,
      detail: results.map(r => ({ channel: r.channel, code: r.matched_code, method: r.method, months: r.months.length })),
    })
  } catch (err: any) {
    console.error("[channel-costs-repair]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: dry run (xem kết quả mà không update)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  url.searchParams.set("dry", "1")
  return POST(new NextRequest(url.toString(), { method: "POST", headers: req.headers }))
}
