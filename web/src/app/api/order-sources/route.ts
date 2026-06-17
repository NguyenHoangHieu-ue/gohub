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
    const params: unknown[] = []
    let sql = "SELECT code, name FROM dim_order_source"
    const where: string[] = []

    if (channel) {
      params.push(channel)
      where.push(`TRIM(channel_name) = $${params.length}`)
    } else if (channelGroup && channelGroup !== "All") {
      params.push(channelGroup)
      where.push(`group_name = $${params.length}`)
    }

    if (where.length) sql += ` WHERE ${where.join(" AND ")}`
    sql += " ORDER BY name"

    const rows = await queryAnalytics<{ code: string; name: string }>(sql, params)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
