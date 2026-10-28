import { NextRequest, NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { deleteReport, getReportHtml, updateReport } from "@/lib/argon/report-store"

export const dynamic = "force-dynamic"

// GET → { meta, html } (chỉ trả JSON để giao diện nhét vào iframe cô lập; không phục vụ HTML trực tiếp) · PATCH { title?, template? } · DELETE.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const r = await getReportHtml(username, params.id)
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Không tìm thấy report" }, { status: 404 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { title?: string; template?: boolean }
  const m = await updateReport(username, params.id, b)
  return m ? NextResponse.json({ report: m }) : NextResponse.json({ error: "Không tìm thấy report" }, { status: 404 })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ ok: await deleteReport(username, params.id) })
}
