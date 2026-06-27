import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import bcrypt from "bcryptjs"

// creator is a super-admin role (higher than admin) — allow both.
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role as string)) throw new Error("Unauthorized")
}

export async function PATCH(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    await requireAdmin()
    const body = await req.json()
    const update: Record<string, string> = { updated_at: new Date().toISOString() }

    if (body.role)       update.role       = body.role
    if (body.department) update.department = body.department
    if (body.password)   update.password   = await bcrypt.hash(body.password, 12)
    if ("allowed_analytics" in body) update.allowed_analytics = body.allowed_analytics ?? null
    if ("allowed_tabs" in body)      update.allowed_tabs      = body.allowed_tabs ?? null

    await supabaseAdmin.from("users").update(update).eq("username", params.username)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
