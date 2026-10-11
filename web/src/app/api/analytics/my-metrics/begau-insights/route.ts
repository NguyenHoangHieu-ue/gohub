import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { loadChatEvents, isCountedTask } from "@/lib/task-events"
import { canWriteTab } from "@/lib/writable-tabs"
import { quarterRange } from "@/lib/okr-helpers"
import { extractTopKeywords, scoreResponseQuality } from "@/lib/begau-insights"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3&year=2026 — ai dùng Bé Gấu nhiều nhất, chủ đề hay hỏi, chấm điểm heuristic câu trả lời.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = parseInt(req.nextUrl.searchParams.get("year") ?? "2026")
  const { start, end } = quarterRange(quarter, year)
  const { rows: allEvents, error } = await loadChatEvents(
    "id, user_email, user_name, user_role, created_at, user_message, ai_response, used_db_tool, tools_used",
    start, end,
  )

  if (error) return NextResponse.json({ error }, { status: 500 })

  // Cùng định nghĩa "task" với api/analytics/my-metrics (s195+18-B: phải dùng DB tool, không chỉ dựa
  // độ dài response) — Insights CHỈ phân tích trên đúng tập task được tính KPI, không lẫn trả lời chay.
  const tasks = allEvents.filter(isCountedTask)

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

  // ── 👍/👎 thật (chat_feedback, v59) — ghép theo người + câu hỏi (bảng không có khoá tới event) ──
  const { data: fb } = await supabaseAdmin.from("chat_feedback").select("user_email, question, rating, created_at")
    .gte("created_at", `${start}T00:00:00.000Z`).lte("created_at", `${end}T23:59:59.999Z`)
    .order("created_at", { ascending: true }).limit(5000)
  const ratingBy = new Map<string, 1 | -1>()
  for (const f of fb ?? []) ratingBy.set(`${f.user_email}|${f.question}`, f.rating as 1 | -1)
  const feedback = { up: (fb ?? []).filter(f => f.rating === 1).length, down: (fb ?? []).filter(f => f.rating === -1).length }

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
      tools_used: (t.tools_used as string[] | null) ?? [],
      rating: ratingBy.get(`${t.user_email}|${((t.user_message as string) ?? "").slice(0, 500)}`) ?? null,
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
    topUsers, topKeywords, feedback,
    quality: { avgScore, high, medium, low, items: scored },
  })
}
