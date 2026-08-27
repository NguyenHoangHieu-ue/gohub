import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { isQuarterLocked } from "@/lib/okr-helpers"

const WRITE_ROLES = ["admin", "creator"]

// POST { action: "confirm"|"reject", request_time?, completion_time? } — cho Hiếu sửa lại giờ AI
// đoán trước khi xác nhận (AI có thể đoán sai completion message). Chỉ khi confirm mới tính vào TB.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    action: "confirm" | "reject"; request_time?: string; completion_time?: string
  }
  if (body.action !== "confirm" && body.action !== "reject") {
    return NextResponse.json({ error: "action phải là confirm | reject" }, { status: 400 })
  }

  const { data: rec, error: fetchErr } = await supabaseAdmin
    .from("okr_lark_events").select("*").eq("id", params.id).maybeSingle()
  if (fetchErr || !rec) return NextResponse.json({ error: "Không tìm thấy record" }, { status: 404 })
  if (isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể duyệt case nữa." }, { status: 403 })
  }

  const name = session.user.name ?? session.user.email ?? session.user.username

  if (body.action === "reject") {
    const { error } = await supabaseAdmin.from("okr_lark_events")
      .update({ status: "rejected", reviewed_by: name, reviewed_at: new Date().toISOString() })
      .eq("id", params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // confirm — cho phép sửa giờ trước khi chốt, tính lại duration
  const requestTime    = body.request_time    || rec.request_time
  const completionTime = body.completion_time || rec.completion_time
  let duration_value: number | null = rec.duration_value
  if (requestTime && completionTime) {
    const diffMs = new Date(completionTime).getTime() - new Date(requestTime).getTime()
    duration_value = +(diffMs / (rec.metric === "sla" ? 3600000 : 60000)).toFixed(2)
  }

  const { error } = await supabaseAdmin.from("okr_lark_events").update({
    status: "confirmed", reviewed_by: name, reviewed_at: new Date().toISOString(),
    request_time: requestTime, completion_time: completionTime, duration_value,
  }).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, duration_value })
}
