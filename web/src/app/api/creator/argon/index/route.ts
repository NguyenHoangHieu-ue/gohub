import { NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { supabaseAdmin } from "@/lib/supabase"
import { argonIndexConfigured, ensureIndexed, indexStats, staleSources } from "@/lib/argon/index-db"

export const dynamic = "force-dynamic"
export const maxDuration = 300

async function mySources(username: string) {
  const { data: projs } = await supabaseAdmin.from("argon_projects").select("id").eq("username", username)
  const pids = (projs ?? []).map(p => p.id as string)
  if (!pids.length) return []
  const { data } = await supabaseAdmin.from("argon_sources").select("id,updated_at").in("project_id", pids).eq("enabled", true)
  return (data ?? []) as { id: string; updated_at: string }[]
}

// GET → tình trạng chỉ mục tìm kiếm: bao nhiêu nguồn đã lập, còn bao nhiêu chờ.
export async function GET() {
  const user = await requireArgonMemberName()
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!argonIndexConfigured()) return NextResponse.json({ configured: false })
  const mine = await mySources(user)
  return NextResponse.json({ configured: true, total: mine.length, pending: (await staleSources(mine)).length, ...(await indexStats()) })
}

// POST → lập chỉ mục các nguồn còn thiếu/cũ (tối đa ~4 phút mỗi lần; gọi lại cho tới khi pending = 0).
export async function POST() {
  const user = await requireArgonUser()
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!argonIndexConfigured()) return NextResponse.json({ error: "Chưa cấu hình ARGON_TURSO_URL / ARGON_TURSO_AUTH_TOKEN" }, { status: 503 })
  const r = await ensureIndexed((await mySources(user)).map(s => s.id), { deadlineMs: 240_000, max: 400 })
  return NextResponse.json({ ...r, ...(await indexStats()) })
}
