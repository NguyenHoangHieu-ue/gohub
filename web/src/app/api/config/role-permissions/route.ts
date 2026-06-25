import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

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
  // Merge: role có array rỗng [] → dùng DEFAULT (tránh mất quyền khi lỡ save không check gì)
  const perms: Record<string, string[]> = { ...DEFAULT_ROLE_PERMISSIONS }
  for (const [role, ids] of Object.entries(saved)) {
    if (Array.isArray(ids) && ids.length > 0) perms[role] = ids
  }
  return NextResponse.json(perms)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== "admin")) {
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
