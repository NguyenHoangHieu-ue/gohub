import { supabaseAdmin } from "@/lib/supabase"
import { getCreatorLarkOpenId, sendLarkMessage } from "@/lib/lark"

// U5b (plan be-gau-upgrade.md): phiếu sửa code. Gấu Pro tạo phiếu qua tool devTicket (action create LUÔN qua cổng duyệt — tool-policy.ts),
// duyệt xong mới tạo dòng + gọi GitHub workflow_dispatch (.github/workflows/claude-ticket.yml). Luật cho Claude Code nằm trong file workflow
// (server không sửa được) — ở đây chỉ gửi nội dung phiếu. Workflow báo về /api/dev-tickets/callback (DEV_TICKET_SECRET).
const REPO = "NguyenHoangHieu-ue/gohub"
const WORKFLOW = "claude-ticket.yml"
const MIGRATION_HINT = "Chưa có bảng dev_tickets — Hiếu cần chạy migration web/db/migrations/v71_dev_tickets.sql rồi Reload schema."
const INPUT_CAP = 60_000   // GitHub giới hạn tổng input workflow_dispatch ~65k ký tự

export interface DevTicket {
  id: number; title: string; request: string; plan: string; prompt: string; status: string
  answers: { q: string; a: string; at: string }[]; question: string | null; summary: string | null
  branch: string | null; pr_url: string | null; run_url: string | null; error: string | null
  created_by: string; created_at: string; updated_at: string
}

const fail = (msg?: string) => ({ error: msg && /dev_tickets/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg) ? MIGRATION_HINT : msg || "Lỗi không rõ" })

export const branchOf = (id: number) => `auto/ticket-${id}`
export const previewUrlOf = (id: number) => `https://gohub-intel-git-auto-ticket-${id}-hius-projects-3d22de07.vercel.app`

function ticketInput(t: DevTicket): string {
  const qa = t.answers.length
    ? `\n\n## Hỏi đáp với Hiếu (đã trả lời)\n${t.answers.map((x, i) => `${i + 1}. Hỏi: ${x.q}\n   Đáp: ${x.a}`).join("\n")}`
    : ""
  return `# Phiếu #${t.id}: ${t.title}\n\n## Yêu cầu\n${t.prompt}\n\n## Kế hoạch đã duyệt\n${t.plan || "(không có)"}${qa}`.slice(0, INPUT_CAP)
}

async function dispatch(t: DevTicket): Promise<string | null> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) return "Thiếu env GITHUB_DISPATCH_TOKEN trên Vercel (token GitHub quyền Actions: write cho repo gohub)."
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "staging", inputs: { ticket_id: String(t.id), prompt: ticketInput(t) } }),
  })
  return r.ok ? null : `GitHub từ chối chạy workflow (${r.status}): ${(await r.text()).slice(0, 300)}`
}

async function setStatus(id: number, patch: Partial<DevTicket>) {
  await supabaseAdmin.from("dev_tickets").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
}

async function startRun(t: DevTicket): Promise<{ ok: true; id: number; status: string } | { error: string }> {
  const err = await dispatch(t)
  if (err) {
    await setStatus(t.id, { status: "failed", error: err })
    return { error: err }
  }
  await setStatus(t.id, { status: "running", branch: branchOf(t.id), question: null, error: null })
  return { ok: true, id: t.id, status: "running" }
}

export async function getTicket(id: number): Promise<DevTicket | null> {
  const { data } = await supabaseAdmin.from("dev_tickets").select("*").eq("id", id).maybeSingle()
  return (data as DevTicket | null) ?? null
}

export async function listTickets(limit = 30): Promise<{ tickets?: DevTicket[]; error?: string }> {
  const { data, error } = await supabaseAdmin.from("dev_tickets").select("*").order("created_at", { ascending: false }).limit(limit)
  return error ? fail(error.message) : { tickets: (data ?? []) as DevTicket[] }
}

export async function answerTicket(id: number, answer: string) {
  const t = await getTicket(id)
  if (!t) return { error: `Không có phiếu #${id}.` }
  if (t.status !== "question" || !t.question) return { error: `Phiếu #${id} không chờ câu trả lời (trạng thái ${t.status}).` }
  const answers = [...t.answers, { q: t.question, a: answer.trim(), at: new Date().toISOString() }]
  await setStatus(id, { answers, question: null, status: "queued" })
  return startRun({ ...t, answers, question: null })
}

/** Tool devTicket của Gấu Pro — chỉ Creator. create/answer/cancel đi qua cổng duyệt (tool-policy.ts). */
export async function runDevTicket(args: any, username: string, isCreator: boolean): Promise<any> {
  if (!isCreator) return { error: "Phiếu sửa code chỉ dành cho Creator." }
  const action = String(args?.action ?? "list")
  const id = Number(args?.id)
  try {
    if (action === "list") {
      const r = await listTickets(10)
      if (r.error) return r
      return { tickets: r.tickets!.map(t => ({ id: t.id, title: t.title, status: t.status, question: t.question, pr_url: t.pr_url, updated_at: t.updated_at })) }
    }
    if (action === "status") {
      const t = await getTicket(id)
      return t ? { ...t, prompt: undefined, preview_url: t.pr_url ? previewUrlOf(t.id) : null } : { error: `Không có phiếu #${id}.` }
    }
    if (action === "answer") return answerTicket(id, String(args?.answer ?? ""))
    if (action === "cancel") {
      const t = await getTicket(id)
      if (!t) return { error: `Không có phiếu #${id}.` }
      await setStatus(id, { status: "cancelled", question: null })
      return { ok: true, id, status: "cancelled", note: t.status === "running" ? "Workflow đang chạy vẫn chạy nốt; kết quả sẽ không mở PR mới nếu anh đóng nhánh." : undefined }
    }
    if (action === "create") {
      const title = String(args?.title ?? "").trim().slice(0, 120)
      const prompt = String(args?.prompt ?? "").trim()
      if (!title || !prompt) return { error: "Thiếu title hoặc prompt." }
      const { data, error } = await supabaseAdmin.from("dev_tickets").insert({
        title, prompt, request: String(args?.request ?? prompt).slice(0, 8000), plan: String(args?.plan ?? "").slice(0, 20_000), created_by: username,
      }).select("*").single()
      if (error) return fail(error.message)
      return startRun(data as DevTicket)
    }
    return { error: `action "${action}" không hợp lệ (create | list | status | answer | cancel).` }
  } catch (e: any) {
    return fail(e?.message)
  }
}

/** Nhắn Hiếu qua Lark khi phiếu đổi trạng thái đáng báo. */
export async function notifyCreator(t: DevTicket) {
  const openId = await getCreatorLarkOpenId()
  if (!openId) return
  let text = ""
  if (t.status === "question") text = `❓ Phiếu #${t.id} "${t.title}" cần anh trả lời:\n\n${t.question}\n\nTrả lời: nhắn Gấu Pro "phiếu ${t.id}: <câu trả lời>"${t.run_url ? `\nNhật ký: ${t.run_url}` : ""}`
  else if (t.status === "pr_open") text = `✅ Phiếu #${t.id} "${t.title}" xong, đã mở PR vào staging:\n${t.pr_url}\nBản xem thử (khi Vercel build xong): ${previewUrlOf(t.id)}\n\n${(t.summary ?? "").slice(0, 2500)}\n\nAnh xem PR rồi merge vào staging khi ổn.`
  else if (t.status === "failed") text = `⚠️ Phiếu #${t.id} "${t.title}" lỗi: ${(t.error ?? "").slice(0, 800)}${t.run_url ? `\nNhật ký: ${t.run_url}` : ""}`
  if (text) await sendLarkMessage(openId, "open_id", text).catch(() => {})
}
