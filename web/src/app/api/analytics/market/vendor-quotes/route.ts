import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { normalizeExtracted } from "@/lib/vendor-quote-extract"
import { BUCKET, ensureBucket, flushQuoteCompare, loadQuoteGeo, requireQuoteWriter } from "@/lib/vendor-quotes-server"

// GET → danh sách báo giá (kèm items) · POST multipart { payload: JSON đã duyệt, files[] } → lưu báo giá + file gốc.
export async function GET() {
  if (!(await requireQuoteWriter())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const [{ data, error }, geo] = await Promise.all([
    supabaseAdmin.from("vendor_quotes").select("*").order("created_at", { ascending: false }),
    loadQuoteGeo(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ quotes: data ?? [], groups: geo.groups })
}

export async function POST(req: NextRequest) {
  const username = await requireQuoteWriter()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const form = await req.formData()
    const payload = JSON.parse(String(form.get("payload") ?? "{}"))
    const geo = await loadQuoteGeo()
    const q = normalizeExtracted(payload, geo.validIso, geo.groups)
    if (!q.vendor) return NextResponse.json({ error: "Thiếu tên vendor" }, { status: 400 })
    if (!q.items.length) return NextResponse.json({ error: "Không có gói nào hợp lệ để lưu" }, { status: 400 })

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
    const stored: { path: string; name: string; mime: string; size: number }[] = []
    if (files.length) {
      await ensureBucket()
      const stamp = new Date().toISOString().slice(0, 10)
      for (const f of files) {
        const path = `${stamp}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || undefined })
        if (error) throw new Error(`Lưu file "${f.name}" lỗi: ${error.message}`)
        stored.push({ path, name: f.name, mime: f.type, size: f.size })
      }
    }
    const { data, error } = await supabaseAdmin.from("vendor_quotes").insert({
      vendor: q.vendor, currency: q.currency, quote_date: q.quote_date, moq: q.moq || null, note: q.note || null,
      items: q.items, files: stored, created_by: username, status: "reviewing",
    }).select("*").single()
    if (error) throw new Error(error.message)
    await flushQuoteCompare()
    return NextResponse.json({ quote: data, warnings: q.warnings })
  } catch (err: any) {
    console.error("[vendor-quotes POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
