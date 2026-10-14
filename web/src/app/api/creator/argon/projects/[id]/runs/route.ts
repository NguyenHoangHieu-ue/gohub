import { NextRequest, NextResponse } from "next/server"
import { ThinkingLevel, type Part } from "@google/genai"
import { supabaseAdmin } from "@/lib/supabase"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import { estimateArgonCostUsd } from "@/lib/agents/gemini-pricing"
import { checkRateLimit } from "@/lib/rate-limit"
import { ownProject, requireArgonUser, type ArgonRun, type ArgonSource } from "@/lib/argon/server"
import { buildRunContext } from "@/lib/argon/context"
import { syncMany } from "@/lib/argon/lark-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const SEGMENT_MS = 265_000          // hết ngân sách đoạn → lưu dở (status partial), giao diện tự "Tiếp tục"
const MAX_OUT = 32_768              // trần output mỗi đoạn của key hiện tại; chạm trần cũng đi qua "Tiếp tục"
const LEVELS: Record<string, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }
const TRANSIENT = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|ECONNRESET|fetch failed/i

// POST { prompt, thinking?: low|medium|high, sourceIds?: string[], resumeRunId? } → SSE:
//   {type:"start",runId,warnings,sources} · {type:"delta",text} · {type:"done",run} · {type:"error",message}
// resumeRunId = viết tiếp câu trả lời dở của lượt đó (cùng run, cộng dồn).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const project = await ownProject(params.id, username)
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const rl = await checkRateLimit(`argon:${username}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: `Quá nhiều yêu cầu, chờ ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 })

  const b = (await req.json().catch(() => ({}))) as { prompt?: string; thinking?: string; sourceIds?: string[]; resumeRunId?: string }
  const thinking = b.thinking && LEVELS[b.thinking] ? b.thinking : "medium"

  const { data: allRuns } = await supabaseAdmin.from("argon_runs").select("*").eq("project_id", params.id).order("created_at")
  const runs = (allRuns ?? []) as ArgonRun[]
  const resume = b.resumeRunId ? runs.find(r => r.id === b.resumeRunId) : undefined
  if (b.resumeRunId && !resume) return NextResponse.json({ error: "Không tìm thấy lượt cần tiếp tục" }, { status: 404 })
  const prompt = resume ? resume.prompt : String(b.prompt ?? "").trim()
  if (!prompt) return NextResponse.json({ error: "Thiếu yêu cầu" }, { status: 400 })

  const { data: srcRows } = await supabaseAdmin.from("argon_sources").select("*").eq("project_id", params.id).eq("enabled", true)
  const pick = resume ? new Set(resume.source_ids) : b.sourceIds ? new Set(b.sourceIds) : null
  let sources = ((srcRows ?? []) as ArgonSource[]).filter(s => !pick || pick.has(s.id))
  // Nguồn Lark chế độ "live": đọc lại ngay trước khi chạy (nội dung mới nhất); lỗi thì dùng bản đã lưu.
  const live = sources.filter(s => s.kind === "lark" && s.sync_mode === "live")
  if (live.length) {
    await syncMany(live)
    const { data: fresh } = await supabaseAdmin.from("argon_sources").select("*").in("id", live.map(s => s.id))
    const byId = new Map(((fresh ?? []) as ArgonSource[]).map(s => [s.id, s]))
    sources = sources.map(s => byId.get(s.id) ?? s)
  }

  const ctx = await buildRunContext({ project, sources, priorRuns: runs, prompt, resumeRun: resume })
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
      const ac = new AbortController()
      const onAbort = () => ac.abort()
      req.signal.addEventListener("abort", onAbort)
      const timer = setTimeout(() => ac.abort(new Error("segment-timeout")), SEGMENT_MS)
      let tokensIn = 0, tokensOut = 0, cachedIn = 0, finish = "", lastSave = Date.now(), status = "done", errMsg: string | null = null
      send({ type: "start", runId, warnings: ctx.warnings, sources: ctx.usedSourceIds.length })
      const save = (extra: Record<string, unknown> = {}) => supabaseAdmin.from("argon_runs").update({ answer, ...extra }).eq("id", runId)
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          let emitted = false
          try {
            const res = await genai().models.generateContentStream({
              model: GEMINI_MODEL_ARGON, contents: ctx.contents,
              config: { systemInstruction: ctx.systemInstruction, thinkingConfig: { thinkingLevel: LEVELS[thinking] }, maxOutputTokens: MAX_OUT, abortSignal: ac.signal },
            })
            for await (const chunk of res) {
              const parts: Part[] = chunk.candidates?.[0]?.content?.parts ?? []
              for (const p of parts) {
                if (typeof p.text === "string" && p.text && !p.thought) { emitted = true; answer += p.text; send({ type: "delta", text: p.text }) }
              }
              const u = chunk.usageMetadata
              if (u) { tokensIn = u.promptTokenCount ?? tokensIn; tokensOut = u.candidatesTokenCount ?? tokensOut; cachedIn = u.cachedContentTokenCount ?? cachedIn }
              finish = chunk.candidates?.[0]?.finishReason ?? finish
              if (Date.now() - lastSave > 4000) { lastSave = Date.now(); void save() }
            }
            break
          } catch (e) {
            if (emitted || ac.signal.aborted || !TRANSIENT.test(String((e as Error)?.message)) || attempt === 2) throw e
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          }
        }
        if (/MAX_TOKENS/i.test(finish)) status = "partial"
        else if (finish && !/STOP/i.test(finish)) { status = "error"; errMsg = `Model dừng với lý do ${finish}` }
      } catch (e) {
        const timedOut = String(ac.signal.reason?.message ?? "").includes("segment-timeout")
        if (timedOut) status = "partial"
        else if (req.signal.aborted) status = "stopped"
        else { status = "error"; errMsg = (e as Error)?.message?.slice(0, 500) ?? "Lỗi không rõ" }
      } finally {
        clearTimeout(timer)
        req.signal.removeEventListener("abort", onAbort)
      }
      const prev = resume
      const inTotal = (prev?.tokens_in ?? 0) + tokensIn, outTotal = (prev?.tokens_out ?? 0) + tokensOut, cachedTotal = (prev?.cached_in ?? 0) + cachedIn
      const patch = {
        status, error: errMsg, tokens_in: inTotal, tokens_out: outTotal, cached_in: cachedTotal,
        cost_usd: Math.round(((prev?.cost_usd ?? 0) + estimateArgonCostUsd(tokensIn, tokensOut, cachedIn)) * 10_000) / 10_000,
        duration_ms: (prev?.duration_ms ?? 0) + (Date.now() - t0), segments: (prev?.segments ?? 0) + 1,
        finished_at: status === "partial" ? null : new Date().toISOString(),
      }
      await save(patch)
      await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
      send(status === "error" && !answer ? { type: "error", message: errMsg } : { type: "done", run: { id: runId, answer, ...patch } })
      try { controller.close() } catch { /* đã đóng */ }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}

// DELETE ?runId= → xoá 1 lượt khỏi lịch sử dự án.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const runId = req.nextUrl.searchParams.get("runId")
  if (!runId) return NextResponse.json({ error: "Thiếu runId" }, { status: 400 })
  await supabaseAdmin.from("argon_runs").delete().eq("id", runId).eq("project_id", params.id)
  return NextResponse.json({ ok: true })
}
