import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "admin")
    throw new Error("Unauthorized")
  return session
}

export async function GET() {
  try {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value, label, category, updated_at")
      .order("category")
      .order("key")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data ?? [] })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const updates: { key: string; value: string }[] = body.updates ?? []

    if (!Array.isArray(updates) || updates.length === 0)
      return NextResponse.json({ error: "Không có thay đổi nào" }, { status: 400 })

    const rows = updates.map(u => ({
      key:        u.key,
      value:      String(u.value),
      // perm_* keys cần category để INSERT không fail nếu row chưa tồn tại
      ...(u.key.startsWith("perm_") && { category: "permission" }),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(rows, { onConflict: "key" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: rows.length })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
