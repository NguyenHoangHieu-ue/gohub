import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// GET /api/channel-cost-settings?month=YYYY-MM → { [channel]: mode }
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const month = req.nextUrl.searchParams.get("month")
  if (!month) return NextResponse.json({ error: "Month is required" }, { status: 400 })

  try {
    const { data } = await supabaseAdmin
      .from("analytics_cost_input_settings")
      .select("channel, mode")
      .eq("month", month)
    const settings: Record<string, string> = {}
    ;(data || []).forEach(r => { settings[r.channel] = r.mode })
    return NextResponse.json(settings)
  } catch (err: any) {
    console.error("[channel-cost-settings GET]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/channel-cost-settings { channel, month, mode, updatedBy }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { channel, month, mode, updatedBy } = await req.json()
  if (!channel || !month || !mode) {
    return NextResponse.json({ error: "Channel, month and mode are required" }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from("analytics_cost_input_settings")
      .upsert(
        {
          channel,
          month,
          mode,
          updated_by: updatedBy || session.user?.name || "system",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel,month", ignoreDuplicates: false }
      )
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[channel-cost-settings POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
