// Eval Argon (ARGON-X): chạy Argon trên dữ liệu mẫu HƯ CẤU của người dùng giả "eval-argon" (lib/argon/eval-fixtures.ts). Chỉ gọi bằng CRON_SECRET (scripts/eval-argon.mjs).
//   POST { action: "seed" }  → xoá rồi nạp lại dữ liệu mẫu (nguồn mail/thread/ghi chú, sổ sự việc, sổ mail), lập chỉ mục tìm kiếm; trả { dates } để thế {EFF}… trong câu hỏi
//   POST { action: "run", prompt, model?: "fast"|"deep", route?: "auto"|"full" } → chạy MỘT lượt (không lịch sử, không lấy số liệu hệ thống), trả câu trả lời + route + công cụ + thời gian + tác dụng phụ
//   POST { action: "reset" } → xoá sạch dữ liệu của người dùng giả
// Không đụng dữ liệu người dùng thật: mọi truy vấn/ghi đều theo username EVAL_USER; mỗi lượt chạy xoá tác dụng phụ của lượt trước.
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { isCronReq } from "@/lib/analytics-helpers"
import { EVAL_USER, buildFixtures } from "@/lib/argon/eval-fixtures"
import { vnToday } from "@/lib/argon/facts-pure"
import { addManualFact } from "@/lib/argon/facts"
import { ensureKhoProject, khoSources } from "@/lib/argon/kho"
import { ensureDailyMission } from "@/lib/argon/daily-mission"
import { ensureIndexed } from "@/lib/argon/index-db"
import { deleteProjectCascade } from "@/lib/argon/project-delete"
import { ownProject } from "@/lib/argon/server"
import { buildRunContext } from "@/lib/argon/context"
import { runSegment } from "@/lib/argon/run-engine"
import { MAX_OUT, SEGMENT_MS, loadRunMaterial } from "@/lib/argon/bg-worker"
import { loadMissionContext } from "@/lib/argon/missions-db"
import { routeRun } from "@/lib/argon/run-route"
import { costOf, resolveModel } from "@/lib/argon/models"
import { usesKhoScope } from "@/lib/argon/context-instruction"
import { listNotices } from "@/lib/argon/run-safety"
import { listProposals } from "@/lib/assistant/memory-proposals"
import type { ToolLogEntry } from "@/lib/argon/tools"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const SETTINGS = [`memory_proposals:${EVAL_USER}`, `argon_alerts:${EVAL_USER}`, `argon_security_log:${EVAL_USER}`]

async function wipeSideEffects() {
  await supabaseAdmin.from("argon_facts").delete().eq("username", EVAL_USER).neq("evidence", "eval-seed")
  await supabaseAdmin.from("app_settings").delete().in("key", SETTINGS)
}

async function reset() {
  const { data: projs } = await supabaseAdmin.from("argon_projects").select("id").eq("username", EVAL_USER)
  for (const p of projs ?? []) await deleteProjectCascade(p.id as string)
  await supabaseAdmin.from("argon_facts").delete().eq("username", EVAL_USER)
  await supabaseAdmin.from("argon_mail_threads").delete().eq("username", EVAL_USER)
  await supabaseAdmin.from("app_settings").delete().in("key", SETTINGS)
}

async function seed() {
  await reset()
  const today = vnToday()
  const fx = buildFixtures(today)
  const projectId = await ensureKhoProject(EVAL_USER)
  const ids: string[] = []
  for (const s of fx.sources) {
    const { data, error } = await supabaseAdmin.from("argon_sources").insert({
      project_id: projectId, kind: s.kind, name: s.name, mime: "text/plain", extracted_text: s.text, size_bytes: Buffer.byteLength(s.text), tokens: Math.ceil(s.text.length / 3), meta: s.meta,
    }).select("id").single()
    if (error || !data) throw new Error(`seed nguồn ${s.key}: ${error?.message}`)
    ids.push(data.id as string)
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: data.id, version: 1, extracted_text: s.text, note: "eval seed", author: "user" })
  }
  for (const f of fx.facts) await addManualFact(EVAL_USER, { type: f.type, vendor: f.vendor, subject: f.subject, summary: f.summary, evidence: "eval-seed", effectiveFrom: f.effectiveFrom, expiresAt: f.expiresAt })
  const now = Date.now()
  for (const t of fx.threads) {
    const { error } = await supabaseAdmin.from("argon_mail_threads").upsert({
      username: EVAL_USER, thread_id: t.thread_id, subject: t.subject, counterparty: t.counterparty, last_message_id: `${t.thread_id}-last`, last_at: new Date(now - t.daysAgo * 86_400_000).toISOString(),
      last_from_me: t.last_from_me, message_count: 2, status: t.status, status_by: "auto", summary: t.summary, next_action: t.next_action, nudged_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: "username,thread_id" })
    if (error) throw new Error(`seed mail: ${error.message}`)
  }
  await ensureDailyMission(EVAL_USER)
  const ix = await ensureIndexed(ids, { deadlineMs: 90_000 })
  return { dates: fx.dates, today, sources: ids.length, facts: fx.facts.length, threads: fx.threads.length, indexed: ix }
}

async function run(b: { prompt?: string; model?: string; route?: string }, origin: string) {
  const prompt = String(b.prompt ?? "").trim()
  if (!prompt) throw new Error("Thiếu prompt")
  await wipeSideEffects()
  const mission = await ensureDailyMission(EVAL_USER)
  const project = await ownProject(mission.project_id, EVAL_USER)
  if (!project) throw new Error("Chưa seed (không có sứ mệnh của người dùng giả)")
  if (!(await khoSources(EVAL_USER)).length) throw new Error("Chưa seed (Kho trống) — gọi action seed trước")
  const decision = b.route === "full" ? { route: "full" as const, reason: "ép đầy đủ" } : routeRun(prompt, { deep: b.model === "deep", mission: true })
  const fast = decision.route === "fast"
  const thinking = fast ? "low" : "medium"
  const model = resolveModel(b.model ?? "fast")
  const mat = await loadRunMaterial(project, null, origin)
  const mctx = await loadMissionContext(project.id, prompt)
  const ctx = await buildRunContext({ project: mat.project, sources: mat.sources, priorRuns: [], prompt, allowTools: false, toolLog: [], mission: mctx ?? undefined })
  const log: ToolLogEntry[] = []
  let answer = ""
  const t0 = Date.now()
  const seg = await runSegment({
    ctx, thinking, model, segmentMs: SEGMENT_MS, maxOut: MAX_OUT,
    tools: { origin, log, dataTools: false, fast, missionId: mctx?.mission.id, khoUser: usesKhoScope(mctx?.mission.name ?? "") ? EVAL_USER : undefined, khoMode: "full", onTool: async () => undefined },
    onDelta: t => { answer += t },
  })
  const ms = Date.now() - t0
  const { data: facts } = await supabaseAdmin.from("argon_facts").select("summary,vendor,subject,needs_review,change_note,origin,status").eq("username", EVAL_USER).neq("evidence", "eval-seed")
  return {
    text: answer, status: seg.status, error: seg.error, route: decision.route, routeReason: decision.reason, model: String(model), ms,
    tokensIn: seg.tokensIn, tokensOut: seg.tokensOut, cachedIn: seg.cachedIn, costUsd: costOf(model, seg.tokensIn, seg.tokensOut, seg.cachedIn),
    tools: log.map(t => ({ name: t.name, ok: t.ok, chars: t.chars, args: JSON.stringify(t.args).slice(0, 220), result: t.result.slice(0, 300) })),
    newFacts: facts ?? [], notices: (await listNotices(EVAL_USER)).length, proposals: (await listProposals(EVAL_USER)).map(p => p.content),
  }
}

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; prompt?: string; model?: string; route?: string }
  try {
    if (b.action === "seed") return NextResponse.json(await seed())
    if (b.action === "reset") { await reset(); return NextResponse.json({ ok: true }) }
    if (b.action === "run") return NextResponse.json(await run(b, req.nextUrl.origin))
    return NextResponse.json({ error: "action phải là seed | run | reset" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
