import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const KEY = "squad_config"

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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!["admin", "creator"].includes(session.user.role ?? ""))
      return NextResponse.json({ error: "Chỉ admin/creator mới có thể lưu cấu hình squad" }, { status: 403 })

    const body = await req.json()
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      { key: KEY, value: JSON.stringify(body), category: "squad" },
      { onConflict: "key" }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Lỗi không xác định" }, { status: 500 })
  }
}
