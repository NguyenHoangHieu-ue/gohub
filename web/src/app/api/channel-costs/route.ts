import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// GET /api/channel-costs?month=YYYY-MM → { [channel]: { ads, platformFee, sponsorProducts, media } }
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const month = req.nextUrl.searchParams.get("month")
  if (!month) return NextResponse.json({ error: "Month is required" }, { status: 400 })

  const parse = (v: unknown) => {
    if (!v) return {}
    if (typeof v === "object") return v
    try { return JSON.parse(v as string) } catch { return {} }
  }

  try {
    const { data } = await supabaseAdmin
      .from("analytics_channel_costs")
      .select("channel, month, ads, platform_fee, sponsor_products, media")
      .eq("month", month)

    const costs: Record<string, unknown> = {}
    ;(data || []).forEach(row => {
      costs[row.channel] = {
        channel:         row.channel,
        month:           row.month,
        ads:             parse(row.ads),
        platformFee:     parse(row.platform_fee),
        sponsorProducts: parse(row.sponsor_products),
        media:           parse(row.media),
      }
    })
    return NextResponse.json(costs)
  } catch (err: any) {
    console.error("[channel-costs GET]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/channel-costs { channel, month, ads, platformFee, sponsorProducts, media, updatedBy }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { channel, month, ads, platformFee, sponsorProducts, media, updatedBy } = await req.json()
  if (!channel || !month) return NextResponse.json({ error: "Channel and month are required" }, { status: 400 })

  try {
    const { error } = await supabaseAdmin
      .from("analytics_channel_costs")
      .upsert(
        {
          channel,
          month,
          ads:              JSON.stringify(ads || {}),
          platform_fee:     JSON.stringify(platformFee || {}),
          sponsor_products: JSON.stringify(sponsorProducts || {}),
          media:            JSON.stringify(media || {}),
          updated_by:       updatedBy || session.user?.name || "system",
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "channel,month", ignoreDuplicates: false }
      )
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[channel-costs POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
