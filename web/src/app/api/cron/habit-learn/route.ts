// H1 — học thói quen ngầm: job ban đêm TỰ LƯU thói quen vào assistant_memory (plan personal-agent, đề xuất 2026-10-11).
// Gọi: GET/POST + `Authorization: Bearer $CRON_SECRET` (cron-job.org mỗi đêm). Chỉ xử lý người đang CÓ quyền trí nhớ (bảng tính năng theo vai trò hoặc
// "Người dùng thử") và chưa tắt trí nhớ. `?dryRun=1` (hoặc body {dryRun:true}) chỉ tính + trả kế hoạch, không ghi. `usernames` giới hạn danh sách.
// Kết quả chỉ trả SỐ LƯỢNG; nội dung chỉ trả cho usernames trong `show` (để kiểm tay).
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { loadChatEvents } from "@/lib/task-events"
import { loadFeatureMatrix, loadPilotUsers, featureEnabledFor } from "@/lib/assistant-features"
import { computeHabits, buildBaseline, MIN_COUNT, MIN_WEEKS, MIN_LIFT, type HabitEvent } from "@/lib/habit-learner"
import { selectSafeHabits, planHabitWrites, applyHabitPlans, loadHabitRows, habitLine, type HabitPlan } from "@/lib/habit-store"

export const maxDuration = 120
const MIN_EVENTS = 20          // ít hơn thì chưa đủ dữ liệu để nói gì về thói quen
const WINDOW_DAYS = 60

async function run(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = req.method === "POST" ? await req.json().catch(() => ({})) as { dryRun?: boolean; usernames?: string[]; show?: string[] } : {}
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || body.dryRun === true
  const only = body.usernames?.length ? new Set(body.usernames) : null
  const show = new Set(body.show ?? [])

  // Người đủ điều kiện: có quyền "memory" (vai trò hoặc người dùng thử) và chưa tắt trí nhớ (đọc 1 lần cho tất cả).
  const [matrix, pilot, usersRes, offRes] = await Promise.all([
    loadFeatureMatrix(), loadPilotUsers(),
    supabaseAdmin.from("users").select("username,name,role,email,lark_open_id").limit(2000),
    supabaseAdmin.from("app_settings").select("key,value").like("key", "assistant_memory_off:%").limit(2000),
  ])
  let usersData = usersRes.data as { username: string; role?: string; email?: string; lark_open_id?: string }[] | null
  if (usersRes.error) usersData = (await supabaseAdmin.from("users").select("username,role,lark_open_id").limit(2000)).data as typeof usersData
  const off = new Set((offRes.data ?? []).filter(r => String(r.value) === "1").map(r => String(r.key).slice("assistant_memory_off:".length)))
  const eligible = (usersData ?? []).filter(u => (!only || only.has(u.username)) && !off.has(u.username) && featureEnabledFor(matrix, pilot, "memory", u.role, u.username))

  const idOf = new Map<string, string>()
  for (const u of eligible) for (const k of [u.username, u.email, u.lark_open_id ? `lark:${u.lark_open_id}` : null]) if (k) idOf.set(k.toLowerCase(), u.username)

  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const { rows, error: evErr } = await loadChatEvents("created_at, user_email, user_message, tools_used, agent_id", start, end)   // 1 lần cho cả công ty
  if (evErr) return NextResponse.json({ error: evErr }, { status: 500 })
  const { data: fb } = await supabaseAdmin.from("chat_feedback").select("user_email,rating,answer,created_at").gte("created_at", `${start}T00:00:00.000Z`).limit(5000)

  const baseline = buildBaseline(rows as unknown as HabitEvent[])
  const byUser = new Map<string, HabitEvent[]>(), fbByUser = new Map<string, { rating: number; answer?: string | null; created_at: string }[]>()
  for (const e of rows) { const u = idOf.get(String(e.user_email ?? "").toLowerCase()); if (u) (byUser.get(u) ?? byUser.set(u, []).get(u)!).push(e as unknown as HabitEvent) }
  for (const f of fb ?? []) { const u = idOf.get(String(f.user_email ?? "").toLowerCase()); if (u) (fbByUser.get(u) ?? fbByUser.set(u, []).get(u)!).push(f as { rating: number; answer?: string | null; created_at: string }) }

  const existing = await loadHabitRows(eligible.map(u => u.username))      // 1 truy vấn cho tất cả
  const plans: HabitPlan[] = []
  const summary: { username: string; events: number; candidates: number; insert: number; update: number; touch: number; archive: number; lines?: string[] }[] = []
  for (const u of eligible) {
    const evs = byUser.get(u.username) ?? []
    const { stats, candidates } = computeHabits(evs, fbByUser.get(u.username) ?? [], baseline)
    if (stats.events < MIN_EVENTS) { summary.push({ username: u.username, events: stats.events, candidates: 0, insert: 0, update: 0, touch: 0, archive: 0 }); continue }
    const safe = selectSafeHabits(candidates)
    const plan = planHabitWrites(u.username, safe, existing.filter(r => r.username === u.username))
    plans.push(plan)
    summary.push({
      username: u.username, events: stats.events, candidates: safe.length,
      insert: plan.insert.length, update: plan.update.length, touch: plan.touch.length, archive: plan.archive.length,
      ...(show.has(u.username) ? { lines: safe.map(habitLine) } : {}),
    })
  }
  const applied = dryRun ? null : await applyHabitPlans(plans)
  return NextResponse.json({
    dryRun, window: { start, end }, thresholds: { MIN_COUNT, MIN_WEEKS, MIN_LIFT, MIN_EVENTS }, baselineMessages: baseline.n,
    eligibleUsers: eligible.length, processed: plans.length, applied, summary,
  })
}

export const GET = run
export const POST = run
