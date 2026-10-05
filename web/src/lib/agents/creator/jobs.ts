import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkDM, getCreatorLarkOpenId } from "@/lib/lark"
import { runCreatorAI, type JobCheckpoint } from "@/lib/agents/creator-ai"

// Việc chạy nền Gấu Pro (G2, bảng gp_jobs migration v65). Gói Vercel Hobby → không dùng Workflow: mỗi chặng chạy trong 1 request
// `/api/creator-ai/jobs/run` (maxDuration 300s) với ngân sách CHUNK_BUDGET_MS; chưa xong thì lưu checkpoint + tự gọi chặng tiếp.
// Cron `scheduled-messages` (cron-job.org, mỗi giờ) quét việc bị kẹt (mất lượt gọi) để chạy lại.
export const CHUNK_BUDGET_MS = 200_000
const MAX_CHUNKS = 6                       // ≈ 20 phút chạy thật
const STALE_RUNNING_MS = 6 * 60_000        // chặng "running" quá lâu = request đã chết → cho chạy lại
const MIGRATION_HINT = "Chưa có bảng gp_jobs — Hiếu cần chạy migration web/db/migrations/v65_gp_runs_jobs.sql rồi Reload schema."
const missingTable = (msg?: string) => !!msg && /gp_jobs/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)

export interface JobRow {
  id: string; username: string; is_creator: boolean; title: string; prompt: string; status: string
  chunks: number; checkpoint: JobCheckpoint | null; result: string | null; error: string | null
  conversation_id: string | null; created_at: string; updated_at: string
}

export async function createJob(p: { username: string; isCreator: boolean; prompt: string }): Promise<{ job?: JobRow; error?: string }> {
  const title = p.prompt.replace(/\s+/g, " ").slice(0, 80)
  const { data, error } = await supabaseAdmin.from("gp_jobs")
    .insert({ username: p.username, is_creator: p.isCreator, title, prompt: p.prompt.slice(0, 8000) })
    .select("*").single()
  if (error) return { error: missingTable(error.message) ? MIGRATION_HINT : error.message }
  return { job: data as JobRow }
}

export async function listJobs(username: string, limit = 20): Promise<{ jobs: Omit<JobRow, "checkpoint" | "prompt">[]; error?: string }> {
  const { data, error } = await supabaseAdmin.from("gp_jobs")
    .select("id,username,is_creator,title,status,chunks,result,error,conversation_id,created_at,updated_at")
    .eq("username", username).order("created_at", { ascending: false }).limit(limit)
  if (error) return { jobs: [], error: missingTable(error.message) ? MIGRATION_HINT : error.message }
  return { jobs: (data ?? []) as any }
}

export async function cancelJob(username: string, id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("gp_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("username", username).in("status", ["queued", "running"]).select("id")
  return !!data?.length
}

/** Gọi chặng tiếp qua HTTP (request mới = 300s mới). Không chờ kết quả. */
export function triggerJobRun(origin: string, id: string): Promise<void> {
  return fetch(`${origin}/api/creator-ai/jobs/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({ id }),
    cache: "no-store",
  }).then(() => {}, e => console.error("[gp_jobs] trigger:", (e as Error).message))
}

async function larkOpenIdFor(username: string, isCreator: boolean): Promise<string | null> {
  if (isCreator) return getCreatorLarkOpenId()
  const { data } = await supabaseAdmin.from("users").select("lark_open_id").eq("username", username).maybeSingle()
  return (data?.lark_open_id as string) || null
}

async function finish(job: JobRow, patch: Partial<JobRow>, notify: string) {
  await supabaseAdmin.from("gp_jobs").update({ ...patch, checkpoint: null, updated_at: new Date().toISOString() }).eq("id", job.id)
  const openId = await larkOpenIdFor(job.username, job.is_creator).catch(() => null)
  if (openId) await sendLarkDM(openId, notify)
}

/** Chạy 1 chặng. Trả "continue" nếu cần gọi chặng tiếp. Chặn chạy trùng bằng chuyển trạng thái nguyên tử. */
export async function runJobChunk(id: string): Promise<"continue" | "finished" | "skipped"> {
  const { data: job } = await supabaseAdmin.from("gp_jobs").select("*").eq("id", id).maybeSingle()
  if (!job) return "skipped"
  const j = job as JobRow
  const stale = j.status === "running" && Date.now() - new Date(j.updated_at).getTime() > STALE_RUNNING_MS
  if (j.status !== "queued" && !stale) return "skipped"

  const { data: claimed } = await supabaseAdmin.from("gp_jobs")
    .update({ status: "running", chunks: j.chunks + 1, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", j.updated_at).select("id")
  if (!claimed?.length) return "skipped"

  try {
    const r = await runCreatorAI([], j.prompt, undefined, undefined, j.is_creator, j.username, "job",
      { timeBudgetMs: CHUNK_BUDGET_MS, resume: j.checkpoint ?? undefined })

    if (r.checkpoint && j.chunks + 1 < MAX_CHUNKS) {
      // Người dùng có thể đã huỷ trong lúc chặng chạy → chỉ xếp hàng lại khi vẫn đang "running".
      const { data: still } = await supabaseAdmin.from("gp_jobs")
        .update({ status: "queued", checkpoint: r.checkpoint, updated_at: new Date().toISOString() })
        .eq("id", id).eq("status", "running").select("id")
      return still?.length ? "continue" : "finished"
    }

    let text = r.text || (r.checkpoint ? "⚠️ Việc quá dài, đã dừng sau nhiều chặng. Thu hẹp yêu cầu rồi giao lại." : "Không có nội dung.")
    // G4 việc canh chừng: điều kiện không xảy ra → model trả NO_ALERT → ghi nhận, KHÔNG lưu hội thoại, KHÔNG nhắn.
    if (text.trim().replace(/[.!*`]/g, "") === "NO_ALERT" && !r.pendingActions.length) {
      await supabaseAdmin.from("gp_jobs").update({ status: "done", result: "NO_ALERT", checkpoint: null, updated_at: new Date().toISOString() }).eq("id", id)
      return "finished"
    }
    if (r.pendingActions.length) text += "\n\n" + r.pendingActions.map(a =>
      `🔐 Chờ duyệt #${a.code}: ${a.summary} — duyệt ở mục "Việc & duyệt" trên web hoặc gõ "duyệt ${a.code}" trong Lark DM.`).join("\n")

    // Lưu kết quả thành 1 hội thoại để mở lại trên web.
    let convId: string | null = null
    try {
      const { data: conv } = await supabaseAdmin.from("conversations")
        .insert({ username: j.username, title: "[GP] ⏳ " + j.title.slice(0, 44) }).select("id").single()
      convId = (conv?.id as string) ?? null
      if (convId) await supabaseAdmin.from("chat_messages").insert([
        { conversation_id: convId, role: "user",      content: j.prompt, agent_id: "gau_pro", agent_name: "Gấu Pro" },
        { conversation_id: convId, role: "assistant", content: text,     agent_id: "gau_pro", agent_name: "Gấu Pro" },
      ])
    } catch (e) { console.error("[gp_jobs] save conversation:", e) }

    const { data: cur } = await supabaseAdmin.from("gp_jobs").select("status").eq("id", id).maybeSingle()
    if (cur?.status === "cancelled") return "finished"
    await finish(j, { status: "done", result: text.slice(0, 20_000), conversation_id: convId },
      `✅ Gấu Pro đã xong việc nền: "${j.title}"\n\n${text.slice(0, 1500)}${text.length > 1500 ? "\n…(xem đầy đủ trên web, mục Việc & duyệt)" : ""}`)
    return "finished"
  } catch (e: any) {
    await finish(j, { status: "failed", error: String(e?.message || e).slice(0, 1000) },
      `⚠️ Việc nền "${j.title}" lỗi: ${String(e?.message || e).slice(0, 300)}`)
    return "finished"
  }
}

/** Cron: chạy lại việc bị kẹt (mất lượt gọi chặng tiếp, request chết giữa chừng). */
export async function sweepStuckJobs(origin: string): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString()
  const staleRunning = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  const { data, error } = await supabaseAdmin.from("gp_jobs").select("id,status,updated_at")
    .or(`and(status.eq.queued,updated_at.lt.${cutoff}),and(status.eq.running,updated_at.lt.${staleRunning})`)
    .limit(5)
  if (error || !data?.length) return 0
  await Promise.all(data.map(r => triggerJobRun(origin, r.id as string)))
  return data.length
}
