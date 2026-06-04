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
      .select("username, name, email, role, created_at")
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
    if (!username || !name || !password)
      return NextResponse.json({ error: "Thiếu trường bắt buộc" }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from("users").select("username").eq("username", username).single()
    if (existing)
      return NextResponse.json({ error: `Username "${username}" đã tồn tại` }, { status: 409 })

    const hashed = await bcrypt.hash(password, 12)
    await supabaseAdmin.from("users").insert({ username, name, email, role, password: hashed })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
