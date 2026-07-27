import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// GET: Tìm tất cả channel hiện tại trong gohub_dw có chứa shopee/tiktok/lazada
//      + trạng thái source_code trong analytics_channel_costs
// POST: Cập nhật source_code cho 3 kênh dựa trên mapping Hiếu cung cấp
//       Body: { mappings: [{ old_channel: "VN-Ecom - Shopee", source_code: "S0200" }] }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // 1. Tìm tất cả channels trong gohub_dw có liên quan
  const dwChannels = await queryAnalytics<{ code: string; channel_name: string; sapo_name: string; group_name: string; sub_group_name: string }>(
    `SELECT DISTINCT TRIM(code) as code, TRIM(channel_name) as channel_name,
            TRIM(COALESCE(sapo_name,'')) as sapo_name,
            TRIM(COALESCE(group_name,'')) as group_name,
            TRIM(COALESCE(sub_group_name,'')) as sub_group_name
     FROM dim_order_source
     WHERE channel_name IS NOT NULL AND TRIM(channel_name) != ''
       AND (LOWER(channel_name) LIKE '%shopee%'
         OR LOWER(channel_name) LIKE '%tiktok%'
         OR LOWER(channel_name) LIKE '%lazada%'
         OR LOWER(channel_name) LIKE '%ecom%'
         OR LOWER(sapo_name) LIKE '%shopee%'
         OR LOWER(sapo_name) LIKE '%tiktok%'
         OR LOWER(sapo_name) LIKE '%lazada%')
     ORDER BY channel_name, code`
  )

  // 2. Tìm records trong analytics_channel_costs có liên quan
  const { data: costRows } = await supabaseAdmin
    .from("analytics_channel_costs")
    .select("channel, source_code, month")
    .or("channel.ilike.%shopee%,channel.ilike.%tiktok%,channel.ilike.%lazada%,channel.ilike.%ecom%")
    .order("channel")

  // Group cost records by channel
  const costByChannel: Record<string, { source_code: string | null; months: string[] }> = {}
  for (const r of costRows || []) {
    if (!costByChannel[r.channel]) costByChannel[r.channel] = { source_code: r.source_code, months: [] }
    costByChannel[r.channel].months.push(r.month)
  }

  return NextResponse.json({
    gohub_dw_channels: dwChannels,
    cost_records: costByChannel,
    hint: "Dùng POST với body { mappings: [{ old_channel: 'VN-Ecom - Shopee', source_code: 'S0XXX' }] } để fix source_code",
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { mappings } = await req.json() as {
    mappings: Array<{ old_channel: string; source_code: string }>
  }

  if (!Array.isArray(mappings) || mappings.length === 0)
    return NextResponse.json({ error: "mappings required" }, { status: 400 })

  const results: Array<{ channel: string; source_code: string; updated: number }> = []
  for (const m of mappings) {
    const { error, count } = await supabaseAdmin
      .from("analytics_channel_costs")
      .update({ source_code: m.source_code })
      .eq("channel", m.old_channel)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    results.push({ channel: m.old_channel, source_code: m.source_code, updated: count || 0 })
  }

  return NextResponse.json({ fixed: results })
}
