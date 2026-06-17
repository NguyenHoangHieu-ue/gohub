import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const channel = req.nextUrl.searchParams.get("channel") || ""
  const channelGroup = req.nextUrl.searchParams.get("channelGroup") || ""

  try {
    const params: string[] = []
    let sql: string

    if (channel) {
      sql = `SELECT DISTINCT st.code, st.name
             FROM dim_staff st
             JOIN fact_fulfillment_revenue f ON TRIM(f.staff_code) = TRIM(st.code)
             JOIN dim_order_source s ON f.order_source_code = s.code
             WHERE TRIM(s.channel_name) = $1
             ORDER BY st.name`
      params.push(channel)
    } else if (channelGroup && channelGroup !== "All") {
      sql = `SELECT DISTINCT st.code, st.name
             FROM dim_staff st
             JOIN fact_fulfillment_revenue f ON TRIM(f.staff_code) = TRIM(st.code)
             JOIN dim_order_source s ON f.order_source_code = s.code
             WHERE s.group_name = $1
             ORDER BY st.name`
      params.push(channelGroup)
    } else {
      sql = "SELECT code, name FROM dim_staff ORDER BY name"
    }

    const rows = await queryAnalytics<{ code: string; name: string }>(sql, params)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
