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
  let since: string, until: string

  const from = params.get("from")
  const to   = params.get("to")

  if (from && to) {
    since = new Date(from).toISOString()
    const toDate = new Date(to); toDate.setHours(23, 59, 59, 999)
    until = toDate.toISOString()
  } else {
    const days = parseInt(params.get("days") || "30")
    since = new Date(Date.now() - days * 86_400_000).toISOString()
    until = new Date().toISOString()
  }

  // Fetch tất cả events trong kỳ (max 5000)
  const { data: events, error } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, event_type, page_path, tab_key, user_email, user_name, user_role, agent_id, user_message, ai_response, created_at")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = events || []

  // Daily breakdown — cho trend chart
  const dailyMap: Record<string, { views: number; chats: number }> = {}
  for (const e of all) {
    const day = e.created_at.slice(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { views: 0, chats: 0 }
    if (e.event_type === "page_view") dailyMap[day].views++
    else if (e.event_type === "chat")  dailyMap[day].chats++
  }
  const dailyStats = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { views, chats }]) => ({ date, views, chats, total: views + chats }))

  // Weekly tasks — đếm chat của tuần hiện tại (Mon-Sun ICT)
  const nowICT   = new Date(Date.now() + 7 * 3600_000)
  const dayOfWeek = nowICT.getUTCDay() === 0 ? 6 : nowICT.getUTCDay() - 1  // 0=Mon
  const weekStart = new Date(Date.now() + 7 * 3600_000 - dayOfWeek * 86_400_000)
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekStartISO = new Date(weekStart.getTime() - 7 * 3600_000).toISOString()  // back to UTC
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000 - 7 * 3600_000).toISOString()
  const prevWeekEnd   = weekStartISO

  const { count: currentWeekTasks } = await supabaseAdmin
    .from("app_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "chat")
    .eq("agent_id", "be-gau")
    .gte("created_at", weekStartISO)

  const { count: prevWeekTasks } = await supabaseAdmin
    .from("app_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "chat")
    .eq("agent_id", "be-gau")
    .gte("created_at", prevWeekStart)
    .lt("created_at", prevWeekEnd)

  // Q&A pairs (có ai_response) — cho tab Chất lượng AI
  const qaPairs = all
    .filter(e => e.event_type === "chat" && e.user_message && e.ai_response)
    .map(e => ({
      id: e.id,
      user_message: e.user_message,
      ai_response: e.ai_response,
      user_name: e.user_name,
      user_role: e.user_role,
      agent_id: e.agent_id,
      created_at: e.created_at,
    }))

  // Successful tasks: có ai_response dài > 80 ký tự và không phải lỗi/từ chối
  const ERROR_PATTERNS = /hieu dang fix|vui long doi|khong the truy cap|loi:|error:|khong kha dung|hoi hieu nhe/i
  const successfulCount = qaPairs.filter(p =>
    p.ai_response && p.ai_response.length > 80 && !ERROR_PATTERNS.test(p.ai_response)
  ).length

  // Weekly successful tasks
  const { count: currentWeekSuccess } = await supabaseAdmin
    .from("app_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "chat")
    .eq("agent_id", "be-gau")
    .gte("created_at", weekStartISO)
    .not("ai_response", "is", null)

  return NextResponse.json({
    events: all,
    dailyStats,
    weeklyTasks: {
      current: currentWeekTasks || 0,
      currentSuccess: currentWeekSuccess || 0,
      previous: prevWeekTasks || 0,
      target: 50,
    },
    qaPairsCount: qaPairs.length,
    successfulCount,
    qaPairs: qaPairs.slice(0, 100),
    since,
    until,
  })
}
