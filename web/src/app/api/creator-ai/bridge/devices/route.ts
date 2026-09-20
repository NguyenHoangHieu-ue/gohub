import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

const DEVICE_COLS =
  "id,username,device_id,os,arch,user_agent,browser_version,ext_version,timezone,language,cpu_cores,memory_gb,chrome_email,first_ip,last_ip,first_seen,last_seen,revoked"

// Thông tin thiết bị/nhật ký lệnh CHỈ creator được xem/sửa (admin cũng không) — quyết định Hiếu 2026-09-20.
// Dùng role HIỆN TẠI trong DB (không tin JWT cũ): user vừa bị hạ role không còn xem được.
async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const username = session.user.username
  if ((await getDbRole(username, session.user.role)) !== "creator") {
    return { error: NextResponse.json({ error: "Chỉ creator được xem thông tin thiết bị" }, { status: 403 }) }
  }
  return { username }
}

// GET: thiết bị của chính creator; ?all=1 → mọi user + nhật ký lệnh gần nhất
// (oversight — truy vết ai/máy nào/IP nào đã chạy lệnh nào).
export async function GET(req: NextRequest) {
  const guard = await requireCreator()
  if (guard.error) return guard.error
  const wantAll = req.nextUrl.searchParams.get("all") === "1"

  let devQ = supabaseAdmin.from("browser_bridge_devices").select(DEVICE_COLS).order("last_seen", { ascending: false }).limit(200)
  if (!wantAll) devQ = devQ.eq("username", guard.username)
  const { data: devices, error } = await devQ
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!wantAll) return NextResponse.json({ devices: devices ?? [] })

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 1), 300)
  const { data: commands, error: cmdErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .select("id,owner_username,action,payload,status,error,device_id,claimed_ip,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (cmdErr) return NextResponse.json({ error: cmdErr.message }, { status: 500 })
  return NextResponse.json({ devices: devices ?? [], commands: commands ?? [] })
}

// PATCH { id, revoked }: thu hồi / khôi phục 1 thiết bị bất kỳ (creator).
export async function PATCH(req: NextRequest) {
  const guard = await requireCreator()
  if (guard.error) return guard.error
  const body = await req.json().catch(() => null)
  if (!body?.id || typeof body.revoked !== "boolean") return NextResponse.json({ error: "Thiếu id/revoked" }, { status: 400 })

  const { error } = await supabaseAdmin.from("browser_bridge_devices").update({ revoked: body.revoked }).eq("id", body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
