import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { quarterRange } from "@/lib/okr-helpers"
import { extractTopKeywords, scoreResponseQuality } from "@/lib/begau-insights"

const READ_ROLES = ["admin", "creator", "bod"]
const MIN_TASK_RESPONSE_LEN = 15   // khớp đúng ngưỡng đếm "task" ở api/analytics/my-metrics

// GET ?quarter=Q3&year=2026 — ai dùng Bé Gấu nhiều nhất, chủ đề hay hỏi, chấm điểm heuristic câu trả lời.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = parseInt(req.nextUrl.searchParams.get("year") ?? "2026")
  const { start, end } = quarterRange(quarter, year)
  const startISO = `${start}T00:00:00.000Z`
  const endISO   = `${end}T23:59:59.999Z`

  const { data: allEvents, error } = await supabaseAdmin
    .from("app_usage_events")
    .select("id, user_email, user_name, user_role, created_at, user_message, ai_response")
    .eq("event_type", "chat")
    .not("ai_response", "is", null)
    .gte("created_at", startISO)
    .lte("created_at", endISO)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cùng định nghĩa "task" với api/analytics/my-metrics (response đủ dài, không phải chào hỏi/lỗi cụt).
  const tasks = (allEvents ?? []).filter(t => ((t.ai_response as string) ?? "").trim().length >= MIN_TASK_RESPONSE_LEN)

  // ── Top người dùng ──
  const userCount = new Map<string, number>()
  for (const t of tasks) {
    const label = (t.user_name as string) || (t.user_email as string) || "Không rõ"
    userCount.set(label, (userCount.get(label) ?? 0) + 1)
  }
  const topUsers = Array.from(userCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user, count]) => ({ user, count }))

  // ── Chủ đề hay được hỏi (heuristic tần suất từ khoá, không AI) ──
  const topKeywords = extractTopKeywords(tasks.map(t => (t.user_message as string) ?? ""), 20)

  // ── Chấm điểm heuristic câu trả lời ──
  const scored = tasks.map(t => {
    const q = scoreResponseQuality((t.ai_response as string) ?? "")
    return {
      id: t.id as number,
      user: (t.user_name as string) || (t.user_email as string) || "Không rõ",
      created_at: t.created_at as string,
      user_message: ((t.user_message as string) ?? "").slice(0, 200),
      ai_response_preview: ((t.ai_response as string) ?? "").slice(0, 200),
      score: q.score, bucket: q.bucket, flags: q.flags,
    }
  })
  const high = scored.filter(s => s.bucket === "high").length
  const medium = scored.filter(s => s.bucket === "medium").length
  const low = scored.filter(s => s.bucket === "low").length
  const avgScore = scored.length ? +(scored.reduce((s, r) => s + r.score, 0) / scored.length).toFixed(1) : 0

  // Điểm thấp lên đầu — đây là danh sách Hiếu cần soát trước (câu trả lời có thể chưa tốt).
  scored.sort((a, b) => a.score - b.score)

  return NextResponse.json({
    quarter, year, start, end, total_tasks: tasks.length,
    topUsers, topKeywords,
    quality: { avgScore, high, medium, low, items: scored },
  })
}
