import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { hasGpAccess } from "@/lib/gp-access"

const DEVICE_COLS =
  "id,username,device_id,os,arch,user_agent,browser_version,ext_version,timezone,language,cpu_cores,memory_gb,chrome_email,first_ip,last_ip,first_seen,last_seen,revoked"

async function requireUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const username = session.user.username
  const isCreator = session.user.role === "creator"
  if (!isCreator && !(await hasGpAccess(session.user.role, username))) {
    return { error: NextResponse.json({ error: "Không có quyền truy cập Gấu Pro" }, { status: 403 }) }
  }
  return { username, isCreator }
}

// GET: thiết bị đã kết nối của CHÍNH mình. Creator thêm ?all=1 → mọi user + nhật ký lệnh gần nhất
// (oversight — truy vết ai/máy nào/IP nào đã chạy lệnh nào).
export async function GET(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error
  const wantAll = guard.isCreator && req.nextUrl.searchParams.get("all") === "1"

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

// PATCH { id, revoked }: thu hồi / khôi phục 1 thiết bị. Creator: bất kỳ thiết bị; user thường: chỉ của mình.
export async function PATCH(req: NextRequest) {
  const guard = await requireUser()
  if (guard.error) return guard.error
  const body = await req.json().catch(() => null)
  if (!body?.id || typeof body.revoked !== "boolean") return NextResponse.json({ error: "Thiếu id/revoked" }, { status: 400 })

  let q = supabaseAdmin.from("browser_bridge_devices").update({ revoked: body.revoked }).eq("id", body.id)
  if (!guard.isCreator) q = q.eq("username", guard.username)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
