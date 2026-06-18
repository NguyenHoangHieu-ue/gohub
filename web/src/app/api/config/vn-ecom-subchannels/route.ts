import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { CACHE_HEADERS } from "@/lib/analytics-helpers"

// GET /api/config/vn-ecom-subchannels → string[] of VN-Ecom sub-channel (sapo_name)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const rows = await queryAnalytics<{ sub_channel: string }>(
      `SELECT DISTINCT TRIM(sapo_name) as sub_channel
       FROM dim_order_source
       WHERE TRIM(channel_name) = 'VN-Ecom'
       AND sapo_name IS NOT NULL
       AND sapo_name != ''
       ORDER BY 1 ASC`
    )
    return NextResponse.json(rows.map(r => r.sub_channel), { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[config/vn-ecom-subchannels]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
