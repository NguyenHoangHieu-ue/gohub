import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { CACHE_HEADERS } from "@/lib/analytics-helpers"

// GET /api/config/subchannels?channel=X → string[] sub-channel (sapo_name) của 1 kênh.
// Port generic từ gohub-intel (CostManagementModal gọi cho VN-Ecom/Traveloka/Shopeepay).
// Parameterized ($1) chống SQL injection.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const channel = req.nextUrl.searchParams.get("channel")
  if (!channel) return NextResponse.json({ error: "channel required" }, { status: 400 })

  try {
    const rows = await queryAnalytics<{ sub_channel: string }>(
      `SELECT DISTINCT TRIM(sapo_name) as sub_channel
       FROM dim_order_source
       WHERE TRIM(channel_name) = $1
       AND sapo_name IS NOT NULL
       AND sapo_name != ''
       ORDER BY 1 ASC`,
      [channel.trim()]
    )
    return NextResponse.json(rows.map(r => r.sub_channel), { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[config/subchannels]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
