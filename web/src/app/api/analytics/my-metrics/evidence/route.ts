import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { isQuarterLocked } from "@/lib/okr-helpers"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]

// GET ?quarter=Q3-2026&metric=sla
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const metric  = req.nextUrl.searchParams.get("metric")  ?? "sla"

  const { data, error } = await supabaseAdmin
    .from("okr_evidence_records")
    .select("*")
    .eq("quarter", quarter)
    .eq("metric", metric)
    .order("request_time", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const records = data ?? []
  // "Verified" = có đủ CẢ 2 ảnh (request + completion) — chỉ case này mới tính vào TB KPI.
  // Case thiếu ảnh vẫn hiển thị (minh bạch là có ghi nhận) nhưng loại khỏi số trung bình báo cáo.
  const verified = records.filter(r => r.duration_value != null && r.request_image_url && r.completion_image_url)
  const avg = verified.length > 0
    ? verified.reduce((a, r) => a + Number(r.duration_value), 0) / verified.length
    : null

  return NextResponse.json({
    records,
    avg,
    count: records.length,
    completed: records.filter(r => r.duration_value != null).length,
    verified: verified.length,
    locked: isQuarterLocked(quarter),
  })
}

// POST — tạo hoặc cập nhật 1 record
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    id?: string
    quarter: string; metric: string; title?: string
    request_time: string; request_note?: string; request_image_url?: string
    completion_time?: string; completion_note?: string; completion_image_url?: string
  }

  if (isQuarterLocked(body.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể thêm/sửa evidence nữa (khoá để đảm bảo số liệu không bị đổi ngược sau khi báo cáo)." }, { status: 403 })
  }

  const name = session.user.name ?? session.user.email ?? session.user.username

  // Tính duration nếu có cả 2 thời điểm
  let duration_value: number | null = null
  if (body.completion_time && body.request_time) {
    const diff = new Date(body.completion_time).getTime() - new Date(body.request_time).getTime()
    duration_value = body.metric === "sla"
      ? +(diff / 3600000).toFixed(2)   // giờ
      : +(diff / 60000).toFixed(2)     // phút
  }

  const row = {
    quarter:              body.quarter,
    metric:               body.metric,
    title:                body.title || null,
    request_time:         body.request_time,
    request_note:         body.request_note || null,
    request_image_url:    body.request_image_url || null,
    completion_time:      body.completion_time || null,
    completion_note:      body.completion_note || null,
    completion_image_url: body.completion_image_url || null,
    duration_value,
  }

  if (body.id) {
    const { error } = await supabaseAdmin
      .from("okr_evidence_records")
      .update({ ...row, updated_by: name, updated_at: new Date().toISOString() })
      .eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: body.id })
  }

  const { data, error } = await supabaseAdmin
    .from("okr_evidence_records").insert({ ...row, created_by: name }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE ?id=uuid
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: rec } = await supabaseAdmin
    .from("okr_evidence_records").select("quarter").eq("id", id).maybeSingle()
  if (rec && isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể xoá evidence nữa." }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from("okr_evidence_records").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
