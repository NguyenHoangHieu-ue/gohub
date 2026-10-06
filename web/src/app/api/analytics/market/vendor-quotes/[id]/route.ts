import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { BUCKET, flushQuoteCompare, requireQuoteWriter } from "@/lib/vendor-quotes-server"

type Ctx = { params: { id: string } }

// GET ?file=<path> → chuyển tới link tạm (10 phút) mở file gốc trong bucket riêng tư.
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await requireQuoteWriter())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const path = req.nextUrl.searchParams.get("file") ?? ""
  const { data: q } = await supabaseAdmin.from("vendor_quotes").select("files").eq("id", params.id).maybeSingle()
  if (!q || !(q.files as { path: string }[]).some(f => f.path === path)) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 404 })
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600)
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Không tạo được link" }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}

// PATCH { status?, note? } — Đang xem xét / Đã chọn / Từ chối (Từ chối = không đưa vào so giá).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireQuoteWriter())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await req.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (["reviewing", "accepted", "rejected"].includes(body?.status)) patch.status = body.status
  if (typeof body?.note === "string") patch.note = body.note
  const { data, error } = await supabaseAdmin.from("vendor_quotes").update(patch).eq("id", params.id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await flushQuoteCompare()
  return NextResponse.json({ quote: data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireQuoteWriter())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: q } = await supabaseAdmin.from("vendor_quotes").select("files").eq("id", params.id).maybeSingle()
  const paths = ((q?.files ?? []) as { path: string }[]).map(f => f.path)
  if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths)
  const { error } = await supabaseAdmin.from("vendor_quotes").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await flushQuoteCompare()
  return NextResponse.json({ ok: true })
}
