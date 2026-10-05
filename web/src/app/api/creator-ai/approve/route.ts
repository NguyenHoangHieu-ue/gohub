import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { loadGpAllowed } from "@/lib/gp-access"
import { decidePendingAction, followupMessage } from "@/lib/agents/creator/approvals"
import { describeAction } from "@/lib/agents/creator/tool-policy"
import { supabaseAdmin } from "@/lib/supabase"

export const maxDuration = 120

// POST { id, approve } — người dùng duyệt/từ chối hành động Gấu Pro đang chờ (cổng duyệt G0). Chỉ chủ hành động.
// Trả `followup` để UI gửi tiếp cho Gấu Pro làm nốt việc dở.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = session.user.username
  const isCreator = session.user.role === "creator"
  if (!isCreator && !(await loadGpAllowed()).includes(username)) {
    return NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== "string" || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Cần id (string) và approve (boolean)." }, { status: 400 })
  }

  const r = await decidePendingAction({ username, isCreator, id: body.id, approve: body.approve })
  return NextResponse.json({ ...r, followup: r.decided ? followupMessage(r) : null }, { status: r.decided || r.status ? 200 : 400 })
}

// GET — hành động đang chờ duyệt của tôi (≤24h) — panel "Việc & duyệt" (duyệt được cả sau khi tải lại trang / việc nền).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await supabaseAdmin.from("gp_pending_actions")
    .select("id,code,tool,args,reason,channel,created_at")
    .eq("username", session.user.username).eq("status", "pending").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(30)
  if (error) return NextResponse.json({ rows: [], error: error.message })
  return NextResponse.json({ rows: (data ?? []).map(r => ({
    id: r.id, code: r.code, tool: r.tool, reason: r.reason, channel: r.channel, created_at: r.created_at,
    summary: describeAction({ name: r.tool as string, args: r.args }),
  })) })
}
