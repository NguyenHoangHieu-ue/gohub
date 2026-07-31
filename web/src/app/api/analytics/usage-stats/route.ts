import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") || "30")
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data: events, error } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, event_type, page_path, tab_key, user_email, user_role, agent_id, user_message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: events || [], days })
}
