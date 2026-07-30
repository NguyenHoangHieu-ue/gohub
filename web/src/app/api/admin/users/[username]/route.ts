import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import bcrypt from "bcryptjs"

// Dùng getDbRole() (DB tươi) để tránh JWT stale — admin vừa được assign role không bị 401.
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const dbRole = await getDbRole(session.user.username)
  if (!["admin", "creator"].includes(dbRole)) throw new Error("Unauthorized")
  return session
}

export async function PATCH(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    await requireAdmin()
    const body = await req.json()
    const update: Record<string, any> = { updated_at: new Date().toISOString() }

    // Dùng "key in body" để phân biệt "không truyền field" với "truyền null/empty"
    if ("role"       in body) update.role       = body.role       || "staff"
    if ("department" in body) update.department = body.department || null
    if ("password"   in body && body.password) update.password = await bcrypt.hash(body.password, 12)
    if ("allowed_analytics" in body) update.allowed_analytics = body.allowed_analytics ?? null
    if ("allowed_tabs"      in body) update.allowed_tabs      = body.allowed_tabs      ?? null

    if (Object.keys(update).length === 1) { // chỉ updated_at
      return NextResponse.json({ ok: true, message: "Nothing to update" })
    }

    const { error } = await supabaseAdmin.from("users").update(update).eq("username", params.username)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = (e as Error).message
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { username: string } }) {
  try {
    await requireAdmin()
    await supabaseAdmin.from("users").delete().eq("username", params.username)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
