import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"

// GET /api/channel-group-costs?month=YYYY-MM&group=B2B
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const month = req.nextUrl.searchParams.get("month")
  const group = req.nextUrl.searchParams.get("group")
  if (!month) return NextResponse.json({ error: "Month is required" }, { status: 400 })

  try {
    let q = supabaseAdmin.from("analytics_channel_group_costs").select("*").eq("month", month)
    if (group) q = q.eq("group_name", group)
    const { data } = await q
    return NextResponse.json(data || [])
  } catch (err: any) {
    console.error("[channel-group-costs GET]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/channel-group-costs { id?, group_name, month, item_name, amount, note, updatedBy }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const COST_WRITE_ROLES = ["admin", "creator", "bod", "b2b", "b2c", "saleb2c", "staff"]
  if (!COST_WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, group_name, month, item_name, amount, note, updatedBy } = await req.json()
  if (!group_name || !month || !item_name) {
    return NextResponse.json({ error: "Group, month, and item name are required" }, { status: 400 })
  }

  try {
    const row: Record<string, unknown> = {
      group_name,
      month,
      item_name,
      amount:     amount || 0,
      note:       note || "",
      updated_by: updatedBy || session.user?.name || "system",
      updated_at: new Date().toISOString(),
    }
    if (id) row.id = id

    const { data, error } = await supabaseAdmin
      .from("analytics_channel_group_costs")
      .upsert(row, { onConflict: "id", ignoreDuplicates: false })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    await flushAnalyticsCache().catch(() => {})
    return NextResponse.json({ success: true, id: data?.id })
  } catch (err: any) {
    console.error("[channel-group-costs POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
