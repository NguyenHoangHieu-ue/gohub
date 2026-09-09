import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { isQuarterLocked } from "@/lib/okr-helpers"

const WRITE_ROLES = ["admin", "creator"]

// DELETE — xoá hẳn 1 case Lark (kể cả đã confirmed) — Hiếu lỡ tay xác nhận muốn xoá khỏi TB KPI.
// Xoá thay vì chỉ đổi status về pending: message_id hết bị coi "đã thấy" ở lần scan sau (dedupe theo
// message_id trong lark-scan-runner.ts), nên nếu vẫn còn là thread thật sẽ tự vào lại hàng chờ duyệt.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: rec } = await supabaseAdmin
    .from("okr_lark_events").select("quarter").eq("id", params.id).maybeSingle()
  if (rec && isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể xoá case nữa." }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("okr_lark_events").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
