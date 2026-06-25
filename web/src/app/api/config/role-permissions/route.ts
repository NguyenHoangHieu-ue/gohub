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
  // Merge: DB value UNION defaults — đảm bảo report nào trong defaults luôn có
  // (tránh mất quyền khi DB drift hoặc lỡ save partial list)
  // Admin vẫn có thể bỏ report bằng cách uncheck trong matrix rồi save lại
  const perms: Record<string, string[]> = {}
  for (const [role, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const dbIds = saved[role]
    if (!dbIds || dbIds.length === 0) {
      perms[role] = defaults
    } else {
      // Union: DB + defaults (không để DB xóa mất permissions mặc định do DB drift)
      perms[role] = [...new Set([...defaults, ...dbIds])]
    }
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
