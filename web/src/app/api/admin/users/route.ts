import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import bcrypt from "bcryptjs"

// Dùng getDbRole() (DB tươi) thay session.user.role (JWT có thể cũ) để tránh block admin vừa được assign.
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const dbRole = await getDbRole(session.user.username)
  if (!["admin", "creator"].includes(dbRole)) throw new Error("Forbidden")
  return session
}

export async function GET() {
  try {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("username, name, email, role, department, allowed_analytics, allowed_tabs, created_at, lark_open_id")
      .order("username")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message === "Forbidden" ? "Forbidden" : "Unauthorized" }, { status: e.message === "Forbidden" ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message === "Forbidden" ? "Forbidden" : "Unauthorized" }, { status: e.message === "Forbidden" ? 403 : 401 })
  }

  try {
    const { username, name, email, role, password } = await req.json()
    if (!username?.trim() || !name?.trim())
      return NextResponse.json({ error: "Thiếu trường bắt buộc: username, name" }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from("users").select("username").eq("username", username.trim()).single()
    if (existing)
      return NextResponse.json({ error: `Username "${username}" đã tồn tại` }, { status: 409 })

    const hashedPassword = password ? await bcrypt.hash(password, 12) : null

    const { error } = await supabaseAdmin.from("users").insert({
      username: username.trim(),
      name:     name.trim(),
      email:    email?.trim() || null,
      role:     role  || "staff",
      password: hashedPassword,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Lỗi không xác định" }, { status: 500 })
  }
}
