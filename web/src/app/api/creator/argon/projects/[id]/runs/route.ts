import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { costOf, resolveModel } from "@/lib/argon/models"
import { checkRateLimit } from "@/lib/rate-limit"
import { ownProject, type ArgonRun, type ArgonSource } from "@/lib/argon/server"
import { registerUploads, type UploadItem } from "@/lib/argon/register-upload"
import { getDbRole } from "@/lib/db-role"
import { isDataTask } from "@/lib/okr-helpers"
import { buildRunContext } from "@/lib/argon/context"
import { LEVELS, runSegment } from "@/lib/argon/run-engine"
import { MAX_OUT, SEGMENT_MS, loadRunMaterial } from "@/lib/argon/bg-worker"
import { deleteBg, deleteToolLog, getToolLog, saveToolLog, setBg, triggerWorker } from "@/lib/argon/bg"
import { autoSaveReports, getReportHtml, templateSuffix } from "@/lib/argon/report-store"
import { linkedSourceIdsForProject, loadMissionContext, missionIdForProject } from "@/lib/argon/missions-db"
import { clearPendingAsk } from "@/lib/argon/ask-tool"
import { KHO_MISSION_NAME, ensureKhoProject } from "@/lib/argon/kho"
import { usesKhoScope } from "@/lib/argon/context-instruction"
import { routeRun } from "@/lib/argon/run-route"
import { MEMBER_NOTE } from "@/lib/argon/access-pure"
import { argonLevel, checkMemberLimit, requireArgonMemberName } from "@/lib/argon/access"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST { prompt, thinking?: low|medium|high, sourceIds?, resumeRunId?, allowTools?, background? }
//   mặc định → SSE: {type:"start",runId,warnings,sources} · {type:"delta",text} · {type:"tool",...} · {type:"done",run} · {type:"error",message}
//   background:true → tạo lượt (status queued) + giao worker chạy nền (không giới hạn đoạn), trả JSON {runId}; xong thì nhắn Lark.
//   resumeRunId = viết tiếp câu trả lời dở của lượt đó (cùng run, cộng dồn). allowTools = cho Argon tự lấy số liệu hệ thống (chỉ đọc).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const project = await ownProject(params.id, username)
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const rl = await checkRateLimit(`argon:${username}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: `Quá nhiều yêu cầu, chờ ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 })

  const b = (await req.json().catch(() => ({}))) as { prompt?: string; thinking?: string; sourceIds?: string[]; resumeRunId?: string; allowTools?: boolean; background?: boolean; templateReportId?: string; model?: string; route?: "auto" | "full"; attachments?: UploadItem[] }
  // P5: member (người được Creator cấp) chỉ hỏi được trên Kho của chính họ — không chạy nền, không lấy số liệu hệ thống, có hạn mức mỗi ngày.
  const level = (await argonLevel(username)) ?? "member"
  const member = level === "member"
  if (member) {
    if (b.background) return NextResponse.json({ error: "Chạy nền chỉ dành cho Creator" }, { status: 403 })
    b.allowTools = true   // số liệu công ty: member dùng công cụ dữ liệu như Gấu Pro (Kho chỉ cho tài liệu cá nhân)
    const lim = await checkMemberLimit(username, level)
    if (!lim.ok) return NextResponse.json({ error: lim.reason }, { status: 429 })
  }
  let thinking = b.thinking && LEVELS[b.thinking] ? b.thinking : "medium"

  const { data: allRuns } = await supabaseAdmin.from("argon_runs").select("*").eq("project_id", params.id).order("created_at")
  const runs = (allRuns ?? []) as ArgonRun[]
  const resume = b.resumeRunId ? runs.find(r => r.id === b.resumeRunId) : undefined
  if (b.resumeRunId && !resume) return NextResponse.json({ error: "Không tìm thấy lượt cần tiếp tục" }, { status: 404 })
  const prompt = resume ? resume.prompt : String(b.prompt ?? "").trim()
  if (!prompt) return NextResponse.json({ error: "Thiếu yêu cầu" }, { status: 400 })
  const allowTools = !!b.allowTools
  const tpl = b.templateReportId ? await getReportHtml(username, b.templateReportId) : null
  if (b.templateReportId && !tpl) return NextResponse.json({ error: "Không tìm thấy report mẫu" }, { status: 404 })
  const withTpl = (p: string) => (tpl ? p + templateSuffix(tpl.meta.title, tpl.html) : p)   // prompt lưu trong lịch sử vẫn là câu gốc; HTML mẫu chỉ đi vào ngữ cảnh lượt này

  if (project.kind === "mission" && !resume) { const mid = await missionIdForProject(project.id); if (mid) await clearPendingAsk(mid).catch(() => undefined) }   // lượt mới = Hiếu đã trả lời câu hỏi đang chờ
  // Mô hình: "tiếp tục viết" giữ model của lượt gốc; lượt mới theo yêu cầu, mặc định NHANH cho sứ mệnh (nhiều lượt công cụ, nhanh gấp ~4-7 lần Argon) và SÂU cho dự án thường.
  const model = resume?.model ?? resolveModel(b.model ?? (project.kind === "mission" ? "fast" : "deep"))
  const pick = resume ? new Set(resume.source_ids) : b.sourceIds ? new Set(b.sourceIds) : null
  // Router (ARGON-X P1): câu tra cứu ngắn đi ĐƯỜNG NHANH (suy luận thấp, chỉ công cụ đọc Kho, ≤5 lượt gọi); mọi câu khác chạy đầy đủ như trước. Việc nền không qua router.
  const decision = !b.background && b.route !== "full" ? routeRun(prompt, { deep: b.model === "deep", resume: !!resume, thinking: b.thinking, mission: project.kind === "mission" }) : { route: "full" as const, reason: "việc nền / chọn đầy đủ" }
  const fast = decision.route === "fast"
  if (fast) thinking = "low"

  // ── Việc nền: chỉ tạo lượt + giao worker (nguồn live được đọc lại ở đoạn đầu của worker) ──
  if (b.background) {
    let runId = resume?.id ?? ""
    if (resume) {
      await supabaseAdmin.from("argon_runs").update({ status: "queued", error: null, finished_at: null }).eq("id", runId)
    } else {
      const { data: enabled } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", params.id).eq("enabled", true)
      const own = (enabled ?? []).map(s => s.id as string)
      const linked = project.kind === "mission" ? await linkedSourceIdsForProject(params.id) : []   // nguồn gắn từ Kho nguồn
      const ids = [...own, ...linked].filter(id => !pick || pick.has(id))
      const { data, error } = await supabaseAdmin.from("argon_runs").insert({
        project_id: params.id, username, prompt, status: "queued", model, thinking, source_ids: ids,
      }).select("id").single()
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Không tạo được lượt chạy" }, { status: 500 })
      runId = data.id
    }
    const now = new Date().toISOString()
    await setBg(runId, { username, projectId: params.id, allowTools, templateReportId: tpl?.meta.id, thinking, startedAt: now, heartbeat: now })
    await triggerWorker(req.nextUrl.origin, runId)
    return NextResponse.json({ runId, background: true })
  }

  // File đính kèm theo câu hỏi: chỉ lưu vào "Tài liệu của tôi" khi người dùng bấm gửi; đăng ký song song với dựng ngữ cảnh, rồi đưa thẳng vào ngữ cảnh lượt này (Kho chỉ nạp sẵn nguồn ghim).
  const attachItems = !resume && Array.isArray(b.attachments) ? b.attachments.slice(0, 10).filter(a => a && typeof a.path === "string" && typeof a.name === "string") : []
  const [mat, att] = await Promise.all([loadRunMaterial(project, pick, req.nextUrl.origin), attachItems.length ? ensureKhoProject(username).then(khoPid => registerUploads(khoPid, username, attachItems)) : Promise.resolve({ sources: [] as ArgonSource[], errors: [] as string[] })])
  if (att.sources.length) mat.sources = [...mat.sources.filter(s => !att.sources.some(a => a.id === s.id)), ...att.sources]
  if (att.errors.length) mat.warnings.push(`Chưa đọc được tệp đính kèm: ${att.errors.join("; ")}`)
  const toolLog = resume ? await getToolLog(resume.id) : []
  const mctx = project.kind === "mission" ? await loadMissionContext(project.id, prompt) : null
  if (member && mctx) mctx.instruction += `\n${MEMBER_NOTE}`   // P5: nói rõ giới hạn của thành viên thay vì để model tự tìm đường vòng
  const ctx = await buildRunContext({ project: mat.project, sources: mat.sources, priorRuns: runs, prompt: withTpl(prompt), resumeRun: resume ? { ...resume, prompt: withTpl(resume.prompt) } : undefined, allowTools, toolLog, mission: mctx ?? undefined })
  ctx.warnings.push(...mat.warnings)
  const t0 = Date.now()
  let runId = resume?.id ?? ""
  let answer = resume?.answer ?? ""
  if (!resume) {
    const { data, error } = await supabaseAdmin.from("argon_runs").insert({
      project_id: params.id, username, prompt, status: "running", model, thinking, source_ids: ctx.usedSourceIds,
    }).select("id").single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Không tạo được lượt chạy" }, { status: 500 })
    runId = data.id
  } else {
    await supabaseAdmin.from("argon_runs").update({ status: "running", error: null }).eq("id", runId)
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)) } catch { /* client đã đóng */ } }
      send({ type: "start", runId, warnings: ctx.warnings, sources: ctx.usedSourceIds.length, attachedIds: att.sources.map(s => s.id), route: decision.route, routeReason: decision.reason })
      const save = (extra: Record<string, unknown> = {}) => supabaseAdmin.from("argon_runs").update({ answer, ...extra }).eq("id", runId)
      const log = [...toolLog]
      const seg = await runSegment({
        ctx, thinking, model, segmentMs: SEGMENT_MS, maxOut: MAX_OUT, signal: req.signal,
        tools: allowTools || mctx ? { origin: req.nextUrl.origin, log, dataTools: allowTools && !fast, fast, member, missionId: mctx?.mission.id, khoUser: usesKhoScope(mctx?.mission.name ?? "") ? username : undefined, khoMode: mctx?.mission.name === KHO_MISSION_NAME || !b.background ? "full" : "facts",onTool: async e => { send({ type: "tool", name: e.name, args: e.args, ok: e.ok, chars: e.chars }); await saveToolLog(runId, log) } } : undefined,
        onDelta: t => { answer += t; send({ type: "delta", text: t }) },
        onProgress: () => { void save() },
      })
      const prev = resume
      const patch = {
        status: seg.status, error: seg.error, tokens_in: (prev?.tokens_in ?? 0) + seg.tokensIn, tokens_out: (prev?.tokens_out ?? 0) + seg.tokensOut, cached_in: (prev?.cached_in ?? 0) + seg.cachedIn,
        cost_usd: Math.round(((prev?.cost_usd ?? 0) + costOf(model, seg.tokensIn, seg.tokensOut, seg.cachedIn)) * 10_000) / 10_000,
        duration_ms: (prev?.duration_ms ?? 0) + (Date.now() - t0), segments: (prev?.segments ?? 0) + 1,
        finished_at: seg.status === "partial" ? null : new Date().toISOString(),
      }
      await save(patch)
      if (seg.status !== "error") await autoSaveReports(username, params.id, runId, answer)
      // Metric (My Metrics "Tasks via Bé Gấu"): chỉ ghi lượt của thành viên — câu của Creator không tính (như Bé Gấu/Gấu Pro). Lượt dở (partial) chưa ghi; ghi khi lượt xong, kể cả sau "tiếp tục viết".
      if (member && seg.status === "done" && answer.trim()) {
        const names = Array.from(new Set(log.map(t => t.name)))
        try {
          const role = await getDbRole(username)
          await supabaseAdmin.from("app_usage_events").insert({
            event_type: "chat", agent_id: "gau_prime", user_email: username, user_name: username, user_role: role ?? null,
            user_message: prompt.slice(0, 500), ai_response: answer.slice(0, 3000), tools_used: names.length ? names : null,
            used_db_tool: isDataTask(names, role), tokens_in: (prev?.tokens_in ?? 0) + seg.tokensIn, tokens_out: (prev?.tokens_out ?? 0) + seg.tokensOut,
            est_cost_usd: patch.cost_usd,
          })
        } catch (e) { console.error("[Gấu Prime] track usage:", (e as Error).message) }
      }
      await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
      send(seg.status === "error" && !answer ? { type: "error", message: seg.error } : { type: "done", run: { id: runId, answer, ...patch } })
      try { controller.close() } catch { /* đã đóng */ }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}

// GET ?runId=…&tools=1 → nhật ký công cụ của lượt (tên, tham số, thành công?, kích thước; kèm kết quả nếu &full=1).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const runId = req.nextUrl.searchParams.get("runId")
  if (!runId) return NextResponse.json({ error: "Thiếu runId" }, { status: 400 })
  const { data: run } = await supabaseAdmin.from("argon_runs").select("id").eq("id", runId).eq("project_id", params.id).maybeSingle()
  if (!run) return NextResponse.json({ error: "Không tìm thấy lượt" }, { status: 404 })
  const full = req.nextUrl.searchParams.get("full") === "1"
  const log = await getToolLog(runId)
  return NextResponse.json({ tools: log.map(t => ({ name: t.name, args: t.args, ok: t.ok, chars: t.chars, at: t.at, ...(full ? { result: t.result } : {}) })) })
}

// PATCH { runId, action:"cancel" } → dừng lượt đang chạy nền (worker thấy "stopped" ở nhịp lưu kế tiếp, tối đa vài giây).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { runId?: string; action?: string }
  if (!b.runId || b.action !== "cancel") return NextResponse.json({ error: "Cần runId và action:\"cancel\"" }, { status: 400 })
  const { data } = await supabaseAdmin.from("argon_runs").update({ status: "stopped", finished_at: new Date().toISOString() }).eq("id", b.runId).eq("project_id", params.id).in("status", ["queued", "running"]).select("id")
  if (data?.length) await deleteBg(b.runId)
  return NextResponse.json({ ok: !!data?.length })
}

// DELETE ?runId= → xoá 1 lượt khỏi lịch sử dự án.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const runId = req.nextUrl.searchParams.get("runId")
  if (!runId) return NextResponse.json({ error: "Thiếu runId" }, { status: 400 })
  await supabaseAdmin.from("argon_runs").delete().eq("id", runId).eq("project_id", params.id)
  await Promise.all([deleteBg(runId), deleteToolLog(runId)])
  return NextResponse.json({ ok: true })
}
