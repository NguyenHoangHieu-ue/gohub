import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getPartnerTiers } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const channelGroup = req.nextUrl.searchParams.get("channelGroup") || ""
  const tier = req.nextUrl.searchParams.get("tier") || ""

  try {
    const params: string[] = []
    let sql = "SELECT DISTINCT TRIM(channel_name) as name FROM dim_order_source WHERE channel_name IS NOT NULL"

    if (channelGroup && channelGroup !== "All") {
      const targetGroup = ["WS", "WHOLESALES", "OD", "ON-DEMAND", "B2B"].includes(channelGroup.toUpperCase())
        ? "B2B" : "B2C"
      sql += ` AND UPPER(group_name) = $${params.length + 1}`
      params.push(targetGroup)
    }

    sql += " ORDER BY name"
    const rows = await queryAnalytics<{ name: string }>(sql, params)
    let channels = rows.map(r => r.name).filter(Boolean)

    // Merge strategic partners (from Supabase app_settings)
    if (!channelGroup || channelGroup === "B2B" || channelGroup === "All") {
      const tiers = await getPartnerTiers()
      const strategic: string[] = (tiers["Strategic"] || Object.values(tiers).flat()) as string[]
      const combined = new Set([...channels, ...strategic])
      channels = Array.from(combined).filter(c => typeof c === "string" && c.trim()).sort()

      if (tier && tier !== "All") {
        const patterns = strategic.map(p => p.toLowerCase())
        channels = channels.filter(name => {
          const isStrategic = patterns.some(p => name.toLowerCase().includes(p))
          return tier === "Strategic" ? isStrategic : !isStrategic
        })
      }
    }

    return NextResponse.json(channels)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
