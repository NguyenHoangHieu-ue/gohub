// U5b: workflow .github/workflows/claude-ticket.yml báo trạng thái phiếu. Chỉ nhận Bearer DEV_TICKET_SECRET (secret riêng, chỉ dùng ở đây).
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { supabaseAdmin } from "@/lib/supabase"
import { getTicket, notifyCreator } from "@/lib/dev-tickets"

const STATUSES = new Set(["running", "question", "pr_open", "failed"])

function authorized(req: NextRequest): boolean {
  const secret = process.env.DEV_TICKET_SECRET
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || got.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret))
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    ticket_id?: string | number; status?: string; run_url?: string; pr_url?: string; question?: string; summary?: string; error?: string
  } | null
  const id = Number(b?.ticket_id)
  if (!b || !Number.isInteger(id) || !STATUSES.has(String(b.status))) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const t = await getTicket(id)
  if (!t) return NextResponse.json({ error: "Không có phiếu" }, { status: 404 })
  if (t.status === "cancelled") return NextResponse.json({ ok: true, ignored: "cancelled" })

  const cut = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : undefined)
  const patch: Record<string, unknown> = { status: b.status, updated_at: new Date().toISOString() }
  if (cut(b.run_url, 500)) patch.run_url = cut(b.run_url, 500)
  if (b.status === "question") patch.question = cut(b.question, 4000) ?? "(Claude Code dừng để hỏi nhưng không ghi câu hỏi — xem nhật ký)"
  if (b.status === "pr_open") { patch.pr_url = cut(b.pr_url, 500); patch.summary = cut(b.summary, 20_000) ?? null; patch.error = null }
  if (b.status === "failed") { patch.error = cut(b.error, 4000) ?? "Workflow lỗi — xem nhật ký"; if (cut(b.summary, 20_000)) patch.summary = cut(b.summary, 20_000) }

  const { error } = await supabaseAdmin.from("dev_tickets").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (b.status !== "running") await notifyCreator({ ...t, ...patch } as typeof t)
  return NextResponse.json({ ok: true })
}
