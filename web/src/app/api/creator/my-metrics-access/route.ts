import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"
import { getDbRole }                 from "@/lib/db-role"

const KEY = "my_metrics_users"

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const dbRole = await getDbRole(session.user.username)
  if (dbRole !== "creator") throw new Error("Creator only")
  return session
}

async function loadAllowed(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : [] } catch { return [] }
}

async function saveAllowed(list: string[]) {
  await supabaseAdmin.from("app_settings").upsert(
    { key: KEY, value: JSON.stringify([...new Set(list)]), category: "permission" },
    { onConflict: "key" }
  )
}

async function logAccess(action: string, targetUsername: string, performedBy: string) {
  try {
    await supabaseAdmin.from("access_audit_log").insert({
      action, target_type: "my_metrics_access", target_username: targetUsername, performed_by: performedBy,
    })
  } catch {} // bảng chưa tạo (v41 chưa chạy) → bỏ qua
}

export async function GET() {
  try {
    await requireCreator()
    const allowed = await loadAllowed()
    const { data: users } = await supabaseAdmin.from("users")
      .select("username, name, role")
      .in("username", allowed.length ? allowed : ["_none_"])
    return NextResponse.json({ users: users ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Creator only" ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireCreator()
    const by = (session.user as any)?.username ?? "unknown"
    const { action, username } = await req.json()
    if (!username?.trim()) return NextResponse.json({ error: "username required" }, { status: 400 })

    const allowed = await loadAllowed()

    if (action === "add") {
      const { data: user } = await supabaseAdmin.from("users").select("role").eq("username", username.trim()).maybeSingle()
      if (!user) return NextResponse.json({ error: `User "${username}" không tồn tại` }, { status: 404 })
      if (!allowed.includes(username.trim())) await saveAllowed([...allowed, username.trim()])
      await logAccess("add", username.trim(), by)
      return NextResponse.json({ ok: true })
    }
    if (action === "remove") {
      await saveAllowed(allowed.filter(u => u !== username.trim()))
      await logAccess("remove", username.trim(), by)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "action must be add or remove" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Creator only" ? 403 : 401 })
  }
}
