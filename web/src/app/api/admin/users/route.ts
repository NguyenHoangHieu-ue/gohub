import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "admin")
    throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireAdmin()
    const { data } = await supabaseAdmin
      .from("users")
      .select("username, name, email, role, department, allowed_analytics, allowed_tabs, created_at, lark_open_id")
      .order("username")
    return NextResponse.json({ users: data })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { username, name, email, role, password } = await req.json()
    if (!username || !name)
      return NextResponse.json({ error: "Thiếu trường bắt buộc" }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from("users").select("username").eq("username", username).single()
    if (existing)
      return NextResponse.json({ error: `Username "${username}" đã tồn tại` }, { status: 409 })

    const hashedPassword = password
      ? await bcrypt.hash(password, 12)
      : null

    await supabaseAdmin.from("users").insert({
      username,
      name,
      email:    email || null,
      role:     role  || "sale",
      password: hashedPassword,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
