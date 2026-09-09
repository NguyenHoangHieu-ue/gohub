import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

// Lưu trữ quyền chỉnh sửa tab per-user trong app_config (key: "permissions.writable_tabs").
// Value: JSON object { [username]: string[] } — danh sách tab user đó có thể write.
// Tab keys: "scheduled" | "targets"
// Đọc: admin + creator. Ghi: chỉ creator (cao hơn admin).

const CONFIG_KEY = "permissions.writable_tabs"

async function readConfig(): Promise<Record<string, string[]>> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
  if (!data?.value) return {}
  try { return JSON.parse(data.value) } catch { return {} }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const dbRole = await getDbRole(session.user?.username)
  if (!["admin", "creator"].includes(dbRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const config = await readConfig()
  return NextResponse.json({ config })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const dbRole = await getDbRole(session.user?.username)
  // Chỉ creator mới set writable_tabs per-user
  if (dbRole !== "creator") return NextResponse.json({ error: "Forbidden — chỉ creator" }, { status: 403 })

  const { username, tabs } = await req.json()
  if (!username || !Array.isArray(tabs)) return NextResponse.json({ error: "username và tabs (array) là bắt buộc" }, { status: 400 })

  const config = await readConfig()
  if (tabs.length === 0) delete config[username]
  else config[username] = tabs

  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: CONFIG_KEY, value: JSON.stringify(config), category: "permissions", label: "Quyền chỉnh sửa tab per-user" },
    { onConflict: "key" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config })
}
