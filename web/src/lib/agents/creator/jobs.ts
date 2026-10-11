import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkDM, getCreatorLarkOpenId } from "@/lib/lark"
import { runCreatorAI, type JobCheckpoint } from "@/lib/agents/creator-ai"
import { runBeGau } from "@/lib/agents/be-gau"
import { canViewCogs } from "@/lib/agents/guardian"
import { isDataTask } from "@/lib/okr-helpers"
import { estimateCostUsd } from "@/lib/agents/gemini-pricing"
import type { Content } from "@google/genai"
import { genai } from "@/lib/agents/genai-stream"

// U3: việc nền của Bé Gấu dùng chung bảng gp_jobs (không migration) — đánh dấu bằng checkpoint.agent = "be-gau"; chạy runBeGau theo vai trò
// thật của người giao (đọc lại users.role mỗi chặng), hội thoại kết quả lưu theo TÊN hiển thị (danh sách Bé Gấu lọc theo tên).
// tools = tool đã gọi qua các chặng (để ghi 1 task My Metrics khi xong); scheduled = việc tự chạy theo lịch → KHÔNG tính task (Hiếu chốt s230).
export interface BeGauJobState { agent: "be-gau"; ownerName: string; contents?: Content[]; tainted?: boolean; tools?: string[]; scheduled?: boolean }
const isBeGauJob = (c: unknown): c is BeGauJobState => (c as any)?.agent === "be-gau"

// U3 nghiên cứu sâu: phiên Deep Research chạy ngầm phía Google (Interactions API, ~2–20 phút); việc nền chỉ hỏi trạng thái theo chặng.
export interface DeepResearchState { agent: "deep-research"; ownerName: string; interactionId: string }
const isDeepResearch = (c: unknown): c is DeepResearchState => (c as any)?.agent === "deep-research"
const DR_MAX_CHUNKS = 12                   // ≈ 40 phút chờ

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

export async function createJob(p: { username: string; isCreator: boolean; prompt: string; beGauOwnerName?: string; scheduled?: boolean; state?: DeepResearchState }): Promise<{ job?: JobRow; error?: string }> {
  const title = p.prompt.replace(/\s+/g, " ").slice(0, 80)
  const checkpoint: BeGauJobState | DeepResearchState | null = p.state ?? (p.beGauOwnerName ? { agent: "be-gau", ownerName: p.beGauOwnerName, ...(p.scheduled ? { scheduled: true } : {}) } : null)
  const { data, error } = await supabaseAdmin.from("gp_jobs")
    .insert({ username: p.username, is_creator: p.isCreator, title, prompt: p.prompt.slice(0, 8000), checkpoint })
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

  if (isBeGauJob(j.checkpoint)) return runBeGauJobChunk(j, j.checkpoint)
  if (isDeepResearch(j.checkpoint)) return runDeepResearchChunk(j, j.checkpoint)
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
      if (convId) await supabaseAdmin.from("conversation_messages").insert([
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

async function runBeGauJobChunk(j: JobRow, st: BeGauJobState): Promise<"continue" | "finished"> {
  try {
    const { data: user } = await supabaseAdmin.from("users").select("role,lark_open_id").eq("username", j.username).maybeSingle()
    const role = (user?.role as string) || "staff"
    const r = await runBeGau({
      geminiHistory: [], lastMsg: j.prompt, role, name: st.ownerName, userId: j.username, username: j.username,
      isCost: canViewCogs(role), larkOpenId: (user?.lark_open_id as string) || null,
      job: { timeBudgetMs: CHUNK_BUDGET_MS, resume: st.contents, tainted: st.tainted },
    })
    const tools = Array.from(new Set([...(st.tools ?? []), ...r.toolsUsed]))
    if (r.checkpoint && j.chunks + 1 < MAX_CHUNKS) {
      const next: BeGauJobState = { ...st, contents: r.checkpoint.contents, tainted: r.checkpoint.tainted, tools }
      const { data: still } = await supabaseAdmin.from("gp_jobs")
        .update({ status: "queued", checkpoint: next, updated_at: new Date().toISOString() })
        .eq("id", j.id).eq("status", "running").select("id")
      return still?.length ? "continue" : "finished"
    }
    const text = r.text || "⚠️ Việc quá dài, đã dừng sau nhiều chặng. Thu hẹp yêu cầu rồi giao lại."
    // Việc canh chừng (đặt theo lịch): điều kiện không xảy ra → NO_ALERT → không lưu, không nhắn.
    if (text.trim().replace(/[.!*`]/g, "") === "NO_ALERT") {
      await supabaseAdmin.from("gp_jobs").update({ status: "done", result: "NO_ALERT", checkpoint: null, updated_at: new Date().toISOString() }).eq("id", j.id)
      return "finished"
    }
    let convId: string | null = null
    try {
      const { data: conv } = await supabaseAdmin.from("conversations")
        .insert({ username: st.ownerName, title: "⏳ " + j.title.slice(0, 48) }).select("id").single()
      convId = (conv?.id as string) ?? null
      if (convId) await supabaseAdmin.from("conversation_messages").insert([
        { conversation_id: convId, role: "user",      content: j.prompt, agent_id: "be-gau", agent_name: "Bé Gấu" },
        { conversation_id: convId, role: "assistant", content: text,     agent_id: "be-gau", agent_name: "Bé Gấu" },
      ])
    } catch (e) { console.error("[bg_jobs] save conversation:", e) }
    const { data: cur } = await supabaseAdmin.from("gp_jobs").select("status").eq("id", j.id).maybeSingle()
    if (cur?.status === "cancelled") return "finished"
    // My Metrics "Tasks via Bé Gấu": 1 việc nền xong = 1 task (nếu có đọc dữ liệu); việc theo lịch không tính.
    if (!st.scheduled) {
      try {
        await supabaseAdmin.from("app_usage_events").insert({
          event_type: "chat", agent_id: "be-gau-job", user_email: j.username, user_name: st.ownerName, user_role: role,
          user_message: j.prompt.slice(0, 500), ai_response: text.slice(0, 3000),
          tools_used: tools.length ? tools : null, used_db_tool: isDataTask(tools, role),
          tokens_in: r.tokensIn, tokens_out: r.tokensOut, est_cost_usd: estimateCostUsd(r.tokensIn, r.tokensOut),
        })
      } catch (e) { console.error("[bg_jobs] log task:", e) }
    }
    await finish(j, { status: "done", result: text.slice(0, 20_000), conversation_id: convId },
      `✅ Bé Gấu đã xong việc nền: "${j.title}"\n\n${text.slice(0, 1500)}${text.length > 1500 ? "\n…(xem đầy đủ trong Bé Gấu, mục Lịch sử)" : ""}`)
    return "finished"
  } catch (e: any) {
    await finish(j, { status: "failed", error: String(e?.message || e).slice(0, 1000) },
      `⚠️ Việc nền Bé Gấu "${j.title}" lỗi: ${String(e?.message || e).slice(0, 300)}`)
    return "finished"
  }
}

async function runDeepResearchChunk(j: JobRow, st: DeepResearchState): Promise<"continue" | "finished"> {
  const save = async (text: string) => {
    let convId: string | null = null
    try {
      const { data: conv } = await supabaseAdmin.from("conversations")
        .insert({ username: st.ownerName, title: "🔎 " + j.title.slice(0, 48) }).select("id").single()
      convId = (conv?.id as string) ?? null
      if (convId) await supabaseAdmin.from("conversation_messages").insert([
        { conversation_id: convId, role: "user",      content: j.prompt, agent_id: "be-gau", agent_name: "Bé Gấu" },
        { conversation_id: convId, role: "assistant", content: text,     agent_id: "be-gau", agent_name: "Bé Gấu (nghiên cứu sâu)" },
      ])
    } catch (e) { console.error("[deep_research] save conversation:", e) }
    return convId
  }
  try {
    const ai = genai()
    const t0 = Date.now()
    for (;;) {
      const g: any = await ai.interactions.get(st.interactionId)
      if (g.status === "completed") {
        const text = String(g.output_text ?? "").trim() || "Không có nội dung."
        const convId = await save(text)
        await finish(j, { status: "done", result: text.slice(0, 20_000), conversation_id: convId },
          `🔎 Bé Gấu đã xong nghiên cứu: "${j.title}"\n\n${text.slice(0, 1200)}${text.length > 1200 ? "\n…(xem đầy đủ trong Bé Gấu, mục Lịch sử)" : ""}`)
        return "finished"
      }
      if (!["in_progress", "queued", "running"].includes(g.status)) throw new Error(`Phiên nghiên cứu kết thúc với trạng thái ${g.status}`)
      if (Date.now() - t0 > CHUNK_BUDGET_MS) break
      await new Promise(r => setTimeout(r, 15_000))
    }
    if (j.chunks + 1 >= DR_MAX_CHUNKS) {
      await ai.interactions.cancel(st.interactionId).catch(() => {})
      throw new Error("Nghiên cứu quá lâu (>40 phút), đã huỷ.")
    }
    const { data: still } = await supabaseAdmin.from("gp_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", j.id).eq("status", "running").select("id")
    return still?.length ? "continue" : "finished"
  } catch (e: any) {
    await finish(j, { status: "failed", error: String(e?.message || e).slice(0, 1000) },
      `⚠️ Nghiên cứu "${j.title}" lỗi: ${String(e?.message || e).slice(0, 300)}`)
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
