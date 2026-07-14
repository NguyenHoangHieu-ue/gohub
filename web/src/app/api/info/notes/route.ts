import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return null
  return { username: session.user.username, role: session.user.role }
}

// canViewAll: admin/creator hoặc role có "info" trong role_permissions
async function canViewAll(role: string): Promise<boolean> {
  if (role === "admin" || role === "creator") return true
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
  let matrix: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
  try { if (data?.value) matrix = JSON.parse(data.value) } catch {}
  const perms = matrix[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []
  return perms.includes("info")
}

// GET — lấy notes của mình; nếu có quyền xem-tất-cả thì có thể lấy của user khác qua ?username=
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const targetUser = req.nextUrl.searchParams.get("username")
  const hasAllAccess = await canViewAll(user.role)

  const queryUsername = (targetUser && hasAllAccess) ? targetUser : user.username

  const { data, error } = await supabaseAdmin
    .from("user_notes")
    .select("*")
    .eq("username", queryUsername)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST — tạo note mới
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, content } = await req.json()
  const { data, error } = await supabaseAdmin
    .from("user_notes")
    .insert({ username: user.username, title: title || "Untitled", content: content || "" })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
