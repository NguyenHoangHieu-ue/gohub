import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

// Same user + same tab within this window → not counted again (prevents refresh spam)
const DEDUP_WINDOW_MS = 30 * 60_000 // 30 minutes

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ok: false })

  try {
    const body = await req.json()
    const { event_type, page_path, tab_key, agent_id, user_message, user_name } = body

    if (!event_type) return NextResponse.json({ ok: false })

    const email = session.user.email ?? null
    const role  = session.user.role  ?? null
    const name  = (user_name ?? session.user.name ?? null) as string | null

    // ── Server-side dedup for page views ─────────────────────────────────────
    // Prevents counting the same user+tab multiple times within 30 min even
    // if the client fires multiple events (hard refresh, SPA re-mount, etc.)
    if (event_type === "page_view" && email && tab_key) {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
      const { data: recent } = await supabaseAdmin
        .from("app_usage_events")
        .select("id")
        .eq("user_email", email)
        .eq("tab_key", tab_key)
        .eq("event_type", "page_view")
        .gte("created_at", since)
        .limit(1)

      if (recent && recent.length > 0) {
        return NextResponse.json({ ok: true, skipped: true })
      }
    }

    // ── Insert event ──────────────────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      event_type,
      page_path:  page_path  || null,
      tab_key:    tab_key    || null,
      user_email: email,
      user_role:  role,
      agent_id:   agent_id   || null,
      user_message: user_message ? String(user_message).slice(0, 500) : null,
    }

    // user_name column may not exist yet (added in v30b migration)
    // Try with name first, fall back silently if column missing
    const { error } = await supabaseAdmin.from("app_usage_events").insert({ ...payload, user_name: name })
    if (error && (error.message.includes("user_name") || error.code === "42703")) {
      await supabaseAdmin.from("app_usage_events").insert(payload)
    }
  } catch { /* silent — tracking must never break the app */ }

  return NextResponse.json({ ok: true })
}
