import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import { generateApiKey, hashApiKey } from "@/lib/external-api-auth"

// Dùng getDbRole() (DB tươi) thay session.user.role (JWT có thể cũ) — mirror web/src/app/api/admin/users/route.ts
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const dbRole = await getDbRole(session.user.username)
  if (!["admin", "creator"].includes(dbRole)) throw new Error("Forbidden")
  return session
}

// GET: liệt kê key (KHÔNG trả key thật — chỉ hash đã lưu, không hiện lại được sau khi tạo).
export async function GET() {
  try {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from("external_api_keys")
      .select("id,label,created_by,created_at,last_used_at,revoked_at")
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ keys: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 })
  }
}

// POST: tạo key mới — trả plaintext key ĐÚNG 1 LẦN, chỉ lưu hash.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()
    const body = await req.json().catch(() => ({}))
    const label = String(body?.label || "").trim()
    if (!label) return NextResponse.json({ error: "Thiếu label" }, { status: 400 })

    const key = generateApiKey()
    const { error } = await supabaseAdmin.from("external_api_keys").insert({
      label, key_hash: hashApiKey(key), created_by: session.user.username,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ key })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 })
  }
}

// DELETE: thu hồi key (giữ row làm audit trail, không xoá cứng).
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin()
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 })

    const { error } = await supabaseAdmin
      .from("external_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 })
  }
}
