import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { ownProject, type ArgonRun } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { toDocx } from "@/lib/argon/export"

export const dynamic = "force-dynamic"

// GET ?format=docx|md → xuất câu trả lời của 1 lượt chạy (chỉ chữ; bảng/tiêu đề/gạch đầu dòng markdown được dựng lại trong docx).
export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data } = await supabaseAdmin.from("argon_runs").select("*").eq("id", params.runId).maybeSingle()
  const run = data as ArgonRun | null
  if (!run || !(await ownProject(run.project_id, username))) return NextResponse.json({ error: "Không tìm thấy lượt chạy" }, { status: 404 })
  const format = req.nextUrl.searchParams.get("format") === "md" ? "md" : "docx"
  const title = run.prompt.replace(/\s+/g, " ").trim().slice(0, 80) || "Argon"
  const base = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "argon"
  const body = format === "md" ? Buffer.from(`# ${title}\n\n${run.answer}\n`, "utf8") : await toDocx(title, run.answer)
  const type = format === "md" ? "text/markdown; charset=utf-8" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="argon-${base}.${format}"; filename*=UTF-8''${encodeURIComponent(`argon-${base}.${format}`)}` } })
}
