import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { createNotification }       from "@/lib/notifications"

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
  if (role !== "admin" && role !== "creator" && doc.uploaded_by !== username)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  // chunks tự xóa theo CASCADE
  const { error } = await supabaseAdmin.from("kb_documents").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  createNotification(
    "kb_doc",
    `Xóa tài liệu: ${doc.uploaded_by ? `(bởi ${username})` : ""}`,
    `ID ${params.id} đã bị xóa`,
    { action: "delete", deleted_by: username },
  )

  return NextResponse.json({ ok: true })
}
