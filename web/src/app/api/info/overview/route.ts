import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

const BUCKET = "Information"

// Kiểm tra quyền xem-tất-cả note:
//  · admin / creator: luôn được
//  · Role khác: nếu có "info" trong role_permissions (ma trận Role × Report)
async function canViewAll(role: string): Promise<boolean> {
  if (role === "admin" || role === "creator") return true
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
  let matrix: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
  try { if (data?.value) matrix = JSON.parse(data.value) } catch {}
  const perms = matrix[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []
  return perms.includes("info")
}

// GET — xem tổng quan: mỗi user có bao nhiêu notes + files
// Cho phép: admin/creator HOẶC role có "info" trong role_permissions
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = session.user.role as string
  if (!(await canViewAll(role))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [{ data: users }, { data: notes }] = await Promise.all([
    supabaseAdmin.from("users").select("username, name, role, lark_open_id").order("name"),
    supabaseAdmin.from("user_notes").select("username, id, updated_at"),
  ])

  const { data: folders } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 200 })
  const fileCounts: Record<string, number> = {}
  await Promise.all((folders || []).map(async (f) => {
    const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(f.name, { limit: 200 })
    fileCounts[f.name] = files?.length || 0
  }))

  const noteCounts: Record<string, { count: number; lastUpdated: string | null }> = {}
  for (const note of notes || []) {
    if (!noteCounts[note.username]) noteCounts[note.username] = { count: 0, lastUpdated: null }
    noteCounts[note.username].count++
    if (!noteCounts[note.username].lastUpdated || note.updated_at > noteCounts[note.username].lastUpdated!) {
      noteCounts[note.username].lastUpdated = note.updated_at
    }
  }

  const result = (users || []).map(u => ({
    ...u,
    noteCount: noteCounts[u.username]?.count || 0,
    fileCount: fileCounts[u.username] || 0,
    lastUpdated: noteCounts[u.username]?.lastUpdated || null,
  }))

  return NextResponse.json(result)
}
