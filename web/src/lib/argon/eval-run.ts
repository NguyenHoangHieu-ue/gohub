import { supabaseAdmin } from "@/lib/supabase"
import { EVAL_USER, buildFixtures } from "./eval-fixtures"
import { vnToday } from "./facts-pure"
import { addManualFact } from "./facts"
import { ensureKhoProject, khoSources } from "./kho"
import { ensureDailyMission } from "./daily-mission"
import { ensureIndexed } from "./index-db"
import { deleteProjectCascade } from "./project-delete"
import { ownProject } from "./server"
import { buildRunContext } from "./context"
import { runSegment } from "./run-engine"
import { MAX_OUT, SEGMENT_MS, loadRunMaterial } from "./bg-worker"
import { loadMissionContext } from "./missions-db"
import { routeRun } from "./run-route"
import { MEMBER_NOTE } from "./access-pure"
import { costOf, resolveModel } from "./models"
import { usesKhoScope } from "./context-instruction"
import { listNotices } from "./run-safety"
import { listProposals } from "@/lib/assistant/memory-proposals"
import type { ToolLogEntry } from "./tools"

// Lõi chạy eval Argon (dùng chung cho route /api/admin/eval/argon, script scripts/eval-argon.mjs và cổng eval của kỹ năng ứng viên — skill-gate.ts).
// Chạy trên người dùng giả EVAL_USER + dữ liệu hư cấu; không đụng dữ liệu thật. Mỗi lượt xoá tác dụng phụ của lượt trước.
const SETTINGS = [`memory_proposals:${EVAL_USER}`, `argon_alerts:${EVAL_USER}`, `argon_security_log:${EVAL_USER}`]

export async function wipeSideEffects() {
  await supabaseAdmin.from("gp_pending_actions").delete().eq("username", EVAL_USER)   // đề xuất hành động (deXuatThaoTac) của lượt trước — không bao giờ được chạy
  await supabaseAdmin.from("argon_facts").delete().eq("username", EVAL_USER).neq("evidence", "eval-seed")
  await supabaseAdmin.from("app_settings").delete().in("key", SETTINGS)
}

export async function evalReset() {
  const { data: projs } = await supabaseAdmin.from("argon_projects").select("id").eq("username", EVAL_USER)
  for (const p of projs ?? []) await deleteProjectCascade(p.id as string)
  await supabaseAdmin.from("argon_facts").delete().eq("username", EVAL_USER)
  await supabaseAdmin.from("argon_mail_threads").delete().eq("username", EVAL_USER)
  await supabaseAdmin.from("gp_pending_actions").delete().eq("username", EVAL_USER)
  await supabaseAdmin.from("app_settings").delete().in("key", SETTINGS)
}

export async function evalSeed() {
  await evalReset()
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

export interface EvalRunIn { prompt?: string; model?: string; route?: string; skill?: { name: string; instructions: string }; member?: boolean }   // member = chạy như người được cấp (bỏ công cụ chạm dữ liệu công ty)
export interface EvalRunOut {
  text: string; status: string; error: string | null; route: "fast" | "full"; routeReason: string; model: string; ms: number
  tokensIn: number; tokensOut: number; cachedIn: number; costUsd: number
  tools: { name: string; ok: boolean; chars: number; args: string; result: string }[]
  newFacts: { summary: string; vendor: string; subject: string; needs_review: boolean; change_note: string; origin: string; status: string }[]
  notices: number; proposals: string[]
}

/** Chạy MỘT lượt Argon (không lịch sử, không số liệu hệ thống). `skill` = kỹ năng ứng viên được đưa vào ngữ cảnh lượt này (để so sánh có/không có). */
export async function evalRun(b: EvalRunIn, origin: string): Promise<EvalRunOut> {
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
  const base = await loadMissionContext(project.id, prompt)
  const mctx = base && b.skill
    ? { ...base, block: `${base.block}\n<ky_nang_dang_thu ten="${b.skill.name.replace(/"/g, "'")}">\n${b.skill.instructions}\n</ky_nang_dang_thu>\n(Kỹ năng trên là chỉ dẫn cách làm việc đang được thử; áp dụng khi phù hợp với câu hỏi.)` }
    : base
  if (b.member && mctx) mctx.instruction += `\n${MEMBER_NOTE}`
  const ctx = await buildRunContext({ project: mat.project, sources: mat.sources, priorRuns: [], prompt, allowTools: false, toolLog: [], mission: mctx ?? undefined })
  const log: ToolLogEntry[] = []
  let answer = ""
  const t0 = Date.now()
  const seg = await runSegment({
    ctx, thinking, model, segmentMs: SEGMENT_MS, maxOut: MAX_OUT,
    tools: { origin, log, dataTools: !!b.member && !fast, fast, member: !!b.member, missionId: mctx?.mission.id, khoUser: usesKhoScope(mctx?.mission.name ?? "") ? EVAL_USER : undefined, khoMode: "full", onTool: async () => undefined },
    onDelta: t => { answer += t },
  })
  const ms = Date.now() - t0
  const { data: facts } = await supabaseAdmin.from("argon_facts").select("summary,vendor,subject,needs_review,change_note,origin,status").eq("username", EVAL_USER).neq("evidence", "eval-seed")
  return {
    text: answer, status: seg.status, error: seg.error, route: decision.route, routeReason: decision.reason, model: String(model), ms,
    tokensIn: seg.tokensIn, tokensOut: seg.tokensOut, cachedIn: seg.cachedIn, costUsd: costOf(model, seg.tokensIn, seg.tokensOut, seg.cachedIn),
    tools: log.map(t => ({ name: t.name, ok: t.ok, chars: t.chars, args: JSON.stringify(t.args).slice(0, 220), result: t.result.slice(0, 300) })),
    newFacts: (facts ?? []) as EvalRunOut["newFacts"], notices: (await listNotices(EVAL_USER)).length, proposals: (await listProposals(EVAL_USER)).map(p => p.content),
  }
}
