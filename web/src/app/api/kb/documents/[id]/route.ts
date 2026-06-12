import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

type Ctx = { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const role     = (session.user as any).role

  // Verify ownership (admin can delete any, others only own)
  const { data: doc } = await supabaseAdmin
    .from("kb_documents")
    .select("id, uploaded_by")
    .eq("id", params.id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 })
  if (role !== "admin" && doc.uploaded_by !== username)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  // chunks tự xóa theo CASCADE
  const { error } = await supabaseAdmin.from("kb_documents").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
