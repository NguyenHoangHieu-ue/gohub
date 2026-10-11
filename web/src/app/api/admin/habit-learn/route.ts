// H0 — học thói quen ngầm: CHẠY THỬ, CHỈ IN KẾT QUẢ, KHÔNG GHI GÌ vào trí nhớ/DB (plan personal-agent, đề xuất 2026-10-11).
// POST { usernames: string[], days?: number (mặc định 60), phrase?: boolean (mặc định true — nhờ model diễn đạt) }
// Chỉ gọi bằng CRON_SECRET. Chỉ những username được liệt kê tường minh — không có chế độ "tất cả mọi người".
import { NextRequest, NextResponse } from "next/server"
import { ThinkingLevel } from "@google/genai"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { loadChatEvents } from "@/lib/task-events"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_MODEL } from "@/lib/ai-models"
import { computeHabits, buildBaseline, isSensitiveHabit, MIN_COUNT, MIN_WEEKS, MIN_LIFT, type HabitCandidate, type HabitEvent } from "@/lib/habit-learner"

export const maxDuration = 120

async function phrase(candidates: HabitCandidate[], events: number): Promise<{ habits?: { habit: string; kind: string; confidence: number }[]; error?: string }> {
  if (!candidates.length) return { habits: [] }
  try {
    const r = await genai().models.generateContent({
      model: GEMINI_MODEL,
      contents: `Bạn tổng hợp "thói quen làm việc" của 1 người dùng trợ lý BI nội bộ (công ty SIM/eSIM du lịch) từ SỐ LIỆU đã tính sẵn dưới đây.
Quy tắc: chỉ diễn đạt lại đúng những gì số liệu nói, KHÔNG suy diễn thêm, KHÔNG đoán tính cách/đời tư/sức khoẻ/lương/tôn giáo/chính trị/quan hệ riêng.
Mỗi thói quen 1 câu tiếng Việt ≤ 140 ký tự, trung tính (không "em theo dõi anh"), viết dạng nhận xét về người dùng ("Hay hỏi…", "Thích câu trả lời…").
Gộp mục trùng ý. Bỏ mục không hữu ích cho việc điều chỉnh cách trợ lý trả lời (vd công cụ nội bộ mà người dùng không chủ động chọn). confidence 0-1 theo số lần/số tuần quan sát.
Tổng số tin đã phân tích: ${events}. Ngưỡng bằng chứng: ≥${MIN_COUNT} lần trong ≥${MIN_WEEKS} tuần.
Trả JSON: {"habits":[{"habit":"...","kind":"topic|weekday_topic|tool|time_of_day|channel|style|format|feedback","confidence":0.8}]}

SỐ LIỆU:
${candidates.map((c, i) => `${i + 1}. [${c.kind}] ${c.detail} — ${c.count} lần, ${c.weeks} tuần`).join("\n")}`,
      config: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    })
    const j = JSON.parse(r.text ?? "{}") as { habits?: { habit: string; kind: string; confidence: number }[] }
    return { habits: (j.habits ?? []).filter(h => h?.habit && !isSensitiveHabit(h.habit)).slice(0, 8) }
  } catch (e) { return { error: (e as Error).message } }
}

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { usernames, days = 60, phrase: wantPhrase = true, aliases = {}, listIdentities = false } = await req.json().catch(() => ({})) as { listIdentities?: boolean; usernames?: string[]; days?: number; phrase?: boolean; aliases?: Record<string, string[]> }   // aliases: danh tính khác của CHÍNH người đó trong app_usage_events (email, tên hiển thị)
  if (!Array.isArray(usernames) || !usernames.length) return NextResponse.json({ error: "usernames bắt buộc (liệt kê tường minh từng người)" }, { status: 400 })
  if (usernames.length > 10) return NextResponse.json({ error: "Tối đa 10 người mỗi lần chạy thử" }, { status: 400 })

  // Danh tính: username → các giá trị có thể nằm ở app_usage_events.user_email / user_name.
  type UserRow = { username: string; name?: string; email?: string; lark_open_id?: string }
  let { data: usersRaw, error } = await supabaseAdmin.from("users").select("username,name,email,lark_open_id").in("username", usernames)
  if (error) usersRaw = (await supabaseAdmin.from("users").select("username,name,lark_open_id").in("username", usernames)).data as typeof usersRaw
  const users = (usersRaw ?? []) as UserRow[]
  const idOf = new Map<string, string>()
  for (const u of users) {
    for (const k of [u.username, u.email, u.lark_open_id ? `lark:${u.lark_open_id}` : null]) if (k) idOf.set(k.toLowerCase(), u.username)
  }

  for (const [u, list] of Object.entries(aliases)) if (usernames.includes(u)) for (const a of list ?? []) if (a) idOf.set(String(a).toLowerCase(), u)

  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - Math.min(Math.max(days, 7), 180) * 86_400_000).toISOString().slice(0, 10)
  // 1 lần đọc cho cả nhóm (không lặp theo từng người), rồi chia theo danh tính trong bộ nhớ.
  const { rows, error: evErr } = await loadChatEvents("created_at, user_email, user_name, user_message, tools_used, agent_id", start, end)
  if (evErr) return NextResponse.json({ error: evErr }, { status: 500 })
  const { data: fb } = await supabaseAdmin.from("chat_feedback").select("user_email,rating,answer,created_at")
    .gte("created_at", `${start}T00:00:00.000Z`).limit(5000)

  // Chỉ để tìm danh tính (email/tên) của chính người chạy thử: đếm số tin theo (email|tên), KHÔNG kèm nội dung.
  let identities: { who: string; n: number }[] | undefined
  if (listIdentities) {
    const m = new Map<string, number>()
    for (const e of rows) { const k = `${e.user_email ?? ""} | ${e.user_name ?? ""}`; m.set(k, (m.get(k) ?? 0) + 1) }
    identities = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([who, n]) => ({ who, n }))
  }

  const baseline = buildBaseline(rows as unknown as HabitEvent[])   // toàn công ty trong cửa sổ, để so "đặc trưng cho người này"
  const out = []
  for (const username of usernames) {
    const mine = (e: { user_email?: string | null; user_name?: string | null }) =>
      idOf.get(String(e.user_email ?? "").toLowerCase()) === username || idOf.get(String(e.user_name ?? "").toLowerCase()) === username || String(e.user_name ?? "").toLowerCase() === username.toLowerCase()
    const events = rows.filter(mine)
    const feedback = (fb ?? []).filter(f => idOf.get(String(f.user_email ?? "").toLowerCase()) === username)
    const { stats, candidates } = computeHabits(events as unknown as HabitEvent[], feedback as { rating: number; answer?: string | null; created_at: string }[], baseline)
    const ph = wantPhrase ? await phrase(candidates, stats.events) : undefined
    out.push({ username, found: users.some(u => u.username === username), stats, candidates, phrased: ph, saved: false })
  }
  return NextResponse.json({ dryRun: true, saved: false, window: { start, end }, thresholds: { MIN_COUNT, MIN_WEEKS, MIN_LIFT }, baseline: { messages: baseline.n }, results: out, identities })
}
