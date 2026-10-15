import { supabaseAdmin } from "@/lib/supabase"
import { estimateArgonCostUsd } from "@/lib/agents/gemini-pricing"
import { getCreatorLarkOpenId, sendLarkDM } from "@/lib/lark"
import { buildRunContext } from "./context"
import { syncMany } from "./lark-sync"
import { runSegment } from "./run-engine"
import { BG_STALE_MS, MAX_BG_COST_USD, MAX_BG_SEGMENTS, deleteBg, getBg, getToolLog, saveToolLog, touchBg, triggerWorker } from "./bg"
import type { ArgonProject, ArgonRun, ArgonSource } from "./server"

export const SEGMENT_MS = 265_000     // hết ngân sách đoạn → lưu dở, đoạn sau viết tiếp
export const MAX_OUT = 32_768         // trần output mỗi đoạn; chạm trần cũng đi qua đoạn sau

/** Nguồn đang bật của dự án (lọc theo pick nếu có). Nguồn Lark/gói dữ liệu chế độ "live" được đọc lại ngay trước khi chạy. */
export async function loadRunSources(projectId: string, pick: Set<string> | null, origin: string): Promise<ArgonSource[]> {
  const { data } = await supabaseAdmin.from("argon_sources").select("*").eq("project_id", projectId).eq("enabled", true)
  let sources = ((data ?? []) as ArgonSource[]).filter(s => !pick || pick.has(s.id))
  const live = sources.filter(s => (s.kind === "lark" || s.external_id?.startsWith("datapack:")) && s.sync_mode === "live")
  if (live.length) {
    await syncMany(live, origin)
    const { data: fresh } = await supabaseAdmin.from("argon_sources").select("*").in("id", live.map(s => s.id))
    const byId = new Map(((fresh ?? []) as ArgonSource[]).map(s => [s.id, s]))
    sources = sources.map(s => byId.get(s.id) ?? s)
  }
  return sources
}

async function notifyDone(run: ArgonRun, project: ArgonProject | null, status: string, cost: number, segments: number, error: string | null, origin: string) {
  try {
    const openId = await getCreatorLarkOpenId()
    if (!openId) return
    const head = status === "done" ? "✅ Argon xong việc nền" : status === "stopped" ? "⏹ Việc nền Argon đã dừng" : "⚠️ Việc nền Argon lỗi"
    const body = status === "error" ? `Lỗi: ${error ?? "không rõ"}\n` : `${run.answer.replace(/\s+/g, " ").slice(0, 700)}${run.answer.length > 700 ? "…" : ""}\n`
    await sendLarkDM(openId, `${head}: "${run.prompt.replace(/\s+/g, " ").slice(0, 70)}"${project ? ` (dự án ${project.name})` : ""}\n${segments} đoạn · ~$${cost.toFixed(2)}\n\n${body}\nXem đầy đủ: ${origin}/analytics/creator/argon`)
  } catch (e) { console.error("[argon worker] notify:", (e as Error).message) }
}

/** Chạy 1 đoạn của việc nền. Chặn chạy trùng bằng chuyển trạng thái có điều kiện; đoạn trước chết (không nhịp tim) thì chạy lại từ câu trả lời đã lưu. */
export async function runBackgroundSegment(runId: string, origin: string): Promise<"continue" | "finished" | "skipped"> {
  const bg = await getBg(runId)
  if (!bg) return "skipped"
  const { data: row } = await supabaseAdmin.from("argon_runs").select("*").eq("id", runId).maybeSingle()
  if (!row) return "skipped"
  const run = row as ArgonRun
  const stale = run.status === "running" && Date.now() - Date.parse(bg.heartbeat) > BG_STALE_MS
  if (run.status !== "queued" && !stale) return "skipped"
  const { data: claimed } = await supabaseAdmin.from("argon_runs").update({ status: "running" }).eq("id", runId).eq("status", run.status).select("id")
  if (!claimed?.length) return "skipped"
  await touchBg(runId, bg)

  const t0 = Date.now()
  const { data: proj } = await supabaseAdmin.from("argon_projects").select("*").eq("id", run.project_id).maybeSingle()
  const project = proj as ArgonProject | null
  if (!project) { await supabaseAdmin.from("argon_runs").update({ status: "error", error: "Dự án đã bị xoá" }).eq("id", runId); await deleteBg(runId); return "finished" }

  const toolLog = await getToolLog(runId)
  const stopAc = new AbortController()
  let answer = run.answer
  const save = (extra: Record<string, unknown> = {}) => supabaseAdmin.from("argon_runs").update({ answer, ...extra }).eq("id", runId)
  try {
    const { data: allRuns } = await supabaseAdmin.from("argon_runs").select("*").eq("project_id", run.project_id).order("created_at")
    const pick = new Set(run.source_ids)
    const sources = await loadRunSources(run.project_id, pick.size ? pick : null, origin)
    const ctx = await buildRunContext({
      project, sources, priorRuns: ((allRuns ?? []) as ArgonRun[]).filter(r => r.id !== runId), prompt: run.prompt,
      resumeRun: answer.trim() ? { ...run, answer } : undefined, allowTools: bg.allowTools, toolLog,
    })
    const seg = await runSegment({
      ctx, thinking: bg.thinking, segmentMs: SEGMENT_MS, maxOut: MAX_OUT, signal: stopAc.signal,
      tools: bg.allowTools ? { origin, log: toolLog, onTool: () => saveToolLog(runId, toolLog) } : undefined,
      onDelta: t => { answer += t },
      onProgress: () => {
        void save(); void touchBg(runId, bg)
        void supabaseAdmin.from("argon_runs").select("status").eq("id", runId).maybeSingle().then(({ data }) => { if (data?.status === "stopped") stopAc.abort() })
      },
    })
    const cost = Math.round(((Number(run.cost_usd) || 0) + estimateArgonCostUsd(seg.tokensIn, seg.tokensOut, seg.cachedIn)) * 10_000) / 10_000
    const segments = (answer.trim() && run.answer.trim() ? run.segments ?? 0 : 0) + 1   // cột segments mặc định 1 → lượt mới chưa có chữ tính từ 0
    const { data: cur } = await supabaseAdmin.from("argon_runs").select("status").eq("id", runId).maybeSingle()
    const cancelled = cur?.status === "stopped" || seg.status === "stopped"
    const base = {
      tokens_in: (run.tokens_in ?? 0) + seg.tokensIn, tokens_out: (run.tokens_out ?? 0) + seg.tokensOut, cached_in: (run.cached_in ?? 0) + seg.cachedIn,
      cost_usd: cost, duration_ms: (run.duration_ms ?? 0) + (Date.now() - t0), segments,
    }
    const overLimit = segments >= MAX_BG_SEGMENTS || cost >= MAX_BG_COST_USD
    if (!cancelled && seg.status === "partial" && !overLimit) {
      await save({ ...base, status: "queued", error: null })
      await touchBg(runId, bg)
      return "continue"
    }
    const finalStatus = cancelled ? "stopped" : seg.status === "partial" ? "error" : seg.status
    const err = seg.status === "partial" && !cancelled ? `Dừng sau ${segments} đoạn (giới hạn ${MAX_BG_SEGMENTS} đoạn hoặc $${MAX_BG_COST_USD}) — bấm "Tiếp tục viết" nếu muốn chạy thêm` : seg.error
    await save({ ...base, status: seg.status === "partial" && !cancelled ? "partial" : finalStatus, error: err, finished_at: new Date().toISOString() })
    await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", run.project_id)
    await deleteBg(runId)
    await notifyDone({ ...run, answer }, project, finalStatus === "error" && seg.status === "partial" ? "error" : finalStatus, cost, segments, err, origin)
    return "finished"
  } catch (e) {
    await save({ status: "error", error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() })
    await deleteBg(runId)
    await notifyDone({ ...run, answer }, project, "error", Number(run.cost_usd) || 0, run.segments ?? 0, (e as Error).message, origin)
    return "finished"
  }
}

/** Quét việc nền bị kẹt (đoạn chết giữa chừng / chưa ai nhận) và gọi worker chạy lại. Gọi từ cron argon-sync. */
export async function resumeStuckBackground(origin: string, listIds: () => Promise<string[]>): Promise<number> {
  let n = 0
  for (const id of await listIds()) {
    const bg = await getBg(id)
    if (!bg) continue
    const { data: r } = await supabaseAdmin.from("argon_runs").select("status").eq("id", id).maybeSingle()
    if (!r) { await deleteBg(id); continue }
    if (r.status === "queued" || (r.status === "running" && Date.now() - Date.parse(bg.heartbeat) > BG_STALE_MS)) { await triggerWorker(origin, id); n++ }
    else if (!["queued", "running"].includes(r.status)) await deleteBg(id)
  }
  return n
}
