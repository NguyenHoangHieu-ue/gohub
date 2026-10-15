import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import { estimateArgonCostUsd } from "@/lib/agents/gemini-pricing"
import { checkRateLimit } from "@/lib/rate-limit"
import { ownProject, requireArgonUser, type ArgonRun } from "@/lib/argon/server"
import { buildRunContext } from "@/lib/argon/context"
import { LEVELS, runSegment } from "@/lib/argon/run-engine"
import { MAX_OUT, SEGMENT_MS, loadRunMaterial } from "@/lib/argon/bg-worker"
import { deleteBg, deleteToolLog, getToolLog, saveToolLog, setBg, triggerWorker } from "@/lib/argon/bg"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST { prompt, thinking?: low|medium|high, sourceIds?, resumeRunId?, allowTools?, background? }
//   mặc định → SSE: {type:"start",runId,warnings,sources} · {type:"delta",text} · {type:"tool",...} · {type:"done",run} · {type:"error",message}
//   background:true → tạo lượt (status queued) + giao worker chạy nền (không giới hạn đoạn), trả JSON {runId}; xong thì nhắn Lark.
//   resumeRunId = viết tiếp câu trả lời dở của lượt đó (cùng run, cộng dồn). allowTools = cho Argon tự lấy số liệu hệ thống (chỉ đọc).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const project = await ownProject(params.id, username)
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const rl = await checkRateLimit(`argon:${username}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: `Quá nhiều yêu cầu, chờ ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 })

  const b = (await req.json().catch(() => ({}))) as { prompt?: string; thinking?: string; sourceIds?: string[]; resumeRunId?: string; allowTools?: boolean; background?: boolean }
  const thinking = b.thinking && LEVELS[b.thinking] ? b.thinking : "medium"

  const { data: allRuns } = await supabaseAdmin.from("argon_runs").select("*").eq("project_id", params.id).order("created_at")
  const runs = (allRuns ?? []) as ArgonRun[]
  const resume = b.resumeRunId ? runs.find(r => r.id === b.resumeRunId) : undefined
  if (b.resumeRunId && !resume) return NextResponse.json({ error: "Không tìm thấy lượt cần tiếp tục" }, { status: 404 })
  const prompt = resume ? resume.prompt : String(b.prompt ?? "").trim()
  if (!prompt) return NextResponse.json({ error: "Thiếu yêu cầu" }, { status: 400 })
  const allowTools = !!b.allowTools

  const pick = resume ? new Set(resume.source_ids) : b.sourceIds ? new Set(b.sourceIds) : null

  // ── Việc nền: chỉ tạo lượt + giao worker (nguồn live được đọc lại ở đoạn đầu của worker) ──
  if (b.background) {
    let runId = resume?.id ?? ""
    if (resume) {
      await supabaseAdmin.from("argon_runs").update({ status: "queued", error: null, finished_at: null }).eq("id", runId)
    } else {
      const { data: enabled } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", params.id).eq("enabled", true)
      const ids = (enabled ?? []).map(s => s.id as string).filter(id => !pick || pick.has(id))
      const { data, error } = await supabaseAdmin.from("argon_runs").insert({
        project_id: params.id, username, prompt, status: "queued", model: GEMINI_MODEL_ARGON, thinking, source_ids: ids,
      }).select("id").single()
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Không tạo được lượt chạy" }, { status: 500 })
      runId = data.id
    }
    const now = new Date().toISOString()
    await setBg(runId, { username, projectId: params.id, allowTools, thinking, startedAt: now, heartbeat: now })
    await triggerWorker(req.nextUrl.origin, runId)
    return NextResponse.json({ runId, background: true })
  }

  const mat = await loadRunMaterial(project, pick, req.nextUrl.origin)
  const toolLog = resume ? await getToolLog(resume.id) : []
  const ctx = await buildRunContext({ project: mat.project, sources: mat.sources, priorRuns: runs, prompt, resumeRun: resume, allowTools, toolLog })
  ctx.warnings.push(...mat.warnings)
  const t0 = Date.now()
  let runId = resume?.id ?? ""
  let answer = resume?.answer ?? ""
  if (!resume) {
    const { data, error } = await supabaseAdmin.from("argon_runs").insert({
      project_id: params.id, username, prompt, status: "running", model: GEMINI_MODEL_ARGON, thinking, source_ids: ctx.usedSourceIds,
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
      send({ type: "start", runId, warnings: ctx.warnings, sources: ctx.usedSourceIds.length })
      const save = (extra: Record<string, unknown> = {}) => supabaseAdmin.from("argon_runs").update({ answer, ...extra }).eq("id", runId)
      const log = [...toolLog]
      const seg = await runSegment({
        ctx, thinking, segmentMs: SEGMENT_MS, maxOut: MAX_OUT, signal: req.signal,
        tools: allowTools ? { origin: req.nextUrl.origin, log, onTool: async e => { send({ type: "tool", name: e.name, args: e.args, ok: e.ok, chars: e.chars }); await saveToolLog(runId, log) } } : undefined,
        onDelta: t => { answer += t; send({ type: "delta", text: t }) },
        onProgress: () => { void save() },
      })
      const prev = resume
      const patch = {
        status: seg.status, error: seg.error, tokens_in: (prev?.tokens_in ?? 0) + seg.tokensIn, tokens_out: (prev?.tokens_out ?? 0) + seg.tokensOut, cached_in: (prev?.cached_in ?? 0) + seg.cachedIn,
        cost_usd: Math.round(((prev?.cost_usd ?? 0) + estimateArgonCostUsd(seg.tokensIn, seg.tokensOut, seg.cachedIn)) * 10_000) / 10_000,
        duration_ms: (prev?.duration_ms ?? 0) + (Date.now() - t0), segments: (prev?.segments ?? 0) + 1,
        finished_at: seg.status === "partial" ? null : new Date().toISOString(),
      }
      await save(patch)
      await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
      send(seg.status === "error" && !answer ? { type: "error", message: seg.error } : { type: "done", run: { id: runId, answer, ...patch } })
      try { controller.close() } catch { /* đã đóng */ }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}

// GET ?runId=…&tools=1 → nhật ký công cụ của lượt (tên, tham số, thành công?, kích thước; kèm kết quả nếu &full=1).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
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
  const username = await requireArgonUser()
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
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const runId = req.nextUrl.searchParams.get("runId")
  if (!runId) return NextResponse.json({ error: "Thiếu runId" }, { status: 400 })
  await supabaseAdmin.from("argon_runs").delete().eq("id", runId).eq("project_id", params.id)
  await Promise.all([deleteBg(runId), deleteToolLog(runId)])
  return NextResponse.json({ ok: true })
}
