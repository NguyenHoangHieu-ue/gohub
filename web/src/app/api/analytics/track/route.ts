import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ok: false })

  try {
    const body = await req.json()
    const { event_type, page_path, tab_key, agent_id, user_message } = body

    if (!event_type) return NextResponse.json({ ok: false })

    await supabaseAdmin.from("app_usage_events").insert({
      event_type,
      page_path:    page_path    || null,
      tab_key:      tab_key      || null,
      user_email:   session.user.email  || null,
      user_role:    session.user.role   || null,
      agent_id:     agent_id     || null,
      user_message: user_message ? String(user_message).slice(0, 500) : null,
    })
  } catch { /* silent — tracking must never break the app */ }

  return NextResponse.json({ ok: true })
}
