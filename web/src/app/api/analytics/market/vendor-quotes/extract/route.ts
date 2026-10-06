import { NextRequest, NextResponse } from "next/server"
import { parseUploadedFile } from "@/lib/agents/file-parser"
import { extractVendorQuote } from "@/lib/vendor-quote-extract"
import { loadQuoteGeo, requireQuoteWriter } from "@/lib/vendor-quotes-server"

export const maxDuration = 120

// POST multipart { files[], text, vendor } → kết quả AI đọc (CHƯA lưu) để người dùng duyệt/sửa.
export async function POST(req: NextRequest) {
  if (!(await requireQuoteWriter())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const form = await req.formData()
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
    const text = String(form.get("text") ?? "")
    if (!files.length && !text.trim()) return NextResponse.json({ error: "Chưa có file hoặc nội dung báo giá" }, { status: 400 })
    const [contexts, geo] = await Promise.all([Promise.all(files.map(parseUploadedFile)), loadQuoteGeo()])
    const out = await extractVendorQuote(contexts, text, String(form.get("vendor") ?? ""), geo.groups, geo.validIso)
    return NextResponse.json({ ...out, groups: geo.groups })
  } catch (err: any) {
    console.error("[vendor-quotes/extract]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
