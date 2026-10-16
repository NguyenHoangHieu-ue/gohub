import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { isReportHtml, reportTitle } from "@/lib/argon/report"
import { loadReportIndex, saveReport } from "@/lib/argon/report-store"

export const dynamic = "force-dynamic"

// Kho báo cáo (HTML do Argon viết). GET → danh sách mới nhất trước (kèm tên dự án) · POST { html, title?, projectId? } → lưu tay 1 report.
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const list = await loadReportIndex(username)
  const pids = Array.from(new Set(list.map(r => r.projectId).filter((p): p is string => !!p)))
  const names = new Map<string, string>()
  if (pids.length) {
    const { data } = await supabaseAdmin.from("argon_projects").select("id,name").eq("username", username).in("id", pids)
    for (const p of data ?? []) names.set(p.id as string, p.name as string)
  }
  const reports = list.map(r => ({ ...r, projectName: r.projectId ? names.get(r.projectId) ?? "(dự án đã xoá)" : "" }))
  return NextResponse.json({ reports: [...reports.filter(r => r.template), ...reports.filter(r => !r.template)] })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { html?: string; title?: string; projectId?: string }
  const html = String(b.html ?? "")
  if (!isReportHtml(html)) return NextResponse.json({ error: "Không phải trang HTML hoàn chỉnh" }, { status: 400 })
  if (html.length > 2_000_000) return NextResponse.json({ error: "Report quá lớn (>2MB)" }, { status: 400 })
  try { return NextResponse.json({ report: await saveReport(username, { title: b.title?.trim() || reportTitle(html), html, projectId: b.projectId ?? null }) }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
