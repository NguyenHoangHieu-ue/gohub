import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// role_permissions = { [role]: analyticsPageId[] } — ma trận Role × trang Analytics (y hệt gohub-intel).
// Là quyền NỀN theo role (deny-by-default); per-user allowed_analytics cộng dồn thêm.
// admin luôn toàn quyền (không lưu ở đây). Defaults ở @/lib/analytics-roles.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
  let saved: Record<string, string[]> = {}
  try { if (data?.value) saved = JSON.parse(data.value) } catch {}
  // Union code defaults + DB: code defaults luôn có, DB có thể thêm tab extra.
  // Tránh tình trạng DB cũ (lưu trước khi thêm tab mới) block toàn bộ user.
  const perms: Record<string, string[]> = {}
  for (const [role, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const dbIds = saved[role] ?? []
    perms[role] = [...new Set([...defaults, ...dbIds])]
  }
  return NextResponse.json(perms)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "users", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "role_permissions",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
