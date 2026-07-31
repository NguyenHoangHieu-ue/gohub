import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  const params = req.nextUrl.searchParams
  // Support either date range (from/to) or preset days
  let since: string
  let until: string

  const from = params.get("from")
  const to   = params.get("to")

  if (from && to) {
    since = new Date(from).toISOString()
    // "to" date is inclusive — extend to end of day
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    until = toDate.toISOString()
  } else {
    const days = parseInt(params.get("days") || "30")
    since = new Date(Date.now() - days * 86_400_000).toISOString()
    until = new Date().toISOString()
  }

  const { data: events, error } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, event_type, page_path, tab_key, user_email, user_name, user_role, agent_id, user_message, created_at")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: events || [], since, until })
}
