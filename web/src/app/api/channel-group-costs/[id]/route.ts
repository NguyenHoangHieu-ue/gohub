import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"

// DELETE /api/channel-group-costs/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const COST_WRITE_ROLES = ["admin", "creator", "bod", "b2b", "b2c", "saleb2c", "staff"]
  if (!COST_WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { error } = await supabaseAdmin
      .from("analytics_channel_group_costs")
      .delete()
      .eq("id", params.id)
    if (error) throw new Error(error.message)
    await flushAnalyticsCache().catch(() => {})
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[channel-group-costs DELETE]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
