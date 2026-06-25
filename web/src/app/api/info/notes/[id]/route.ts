import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return null
  return { username: session.user.username, role: session.user.role as string }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("title"     in body) update.title     = body.title
  if ("content"   in body) update.content   = body.content
  if ("is_pinned" in body) update.is_pinned = body.is_pinned

  // Chỉ sửa note của mình (admin có thể sửa của người khác)
  const isAdmin = user.role === "admin" || user.role === "creator"
  let q = supabaseAdmin.from("user_notes").update(update).eq("id", params.id)
  if (!isAdmin) q = q.eq("username", user.username)

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = user.role === "admin" || user.role === "creator"
  let q = supabaseAdmin.from("user_notes").delete().eq("id", params.id)
  if (!isAdmin) q = q.eq("username", user.username)

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
