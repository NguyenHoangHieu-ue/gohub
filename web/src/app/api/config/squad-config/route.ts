import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

const KEY = "squad_config"

async function requireEditor() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (!["admin", "creator"].includes(role)) throw new Error("Forbidden")
  return session
}

export async function GET() {
  try {
    const [cfgRow, usersRow] = await Promise.all([
      supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle(),
      supabaseAdmin.from("users").select("username, name, role").order("name"),
    ])
    const config = cfgRow.data?.value ? JSON.parse(cfgRow.data.value) : { squads: [] }
    return NextResponse.json({ ...config, users: usersRow.data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ squads: [], users: [], error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireEditor()
    const body = await req.json()
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      { key: KEY, value: JSON.stringify(body), category: "squad" },
      { onConflict: "key" }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = e.message === "Forbidden" ? 403 : e.message === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
