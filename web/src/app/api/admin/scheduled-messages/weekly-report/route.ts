import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import { buildWeeklyReportData } from "@/lib/weekly-report/data"
import { buildReportContent } from "@/lib/weekly-report/report-content"
import { buildWeeklyReportDocx } from "@/lib/weekly-report/docx-export"

// Nút "Create Weekly Report" (tab Scheduled Messages) — cùng quyền ghi với scheduled messages
// (admin/creator hoặc user được cấp writable_tabs["scheduled"]). Chỉ xuất .docx (Hiếu chốt bỏ PDF sau khi
// test — xem CLAUDE.md s170). Tính toán nặng (nhiều query gohub_dw + Gemini + render ảnh + docx) → nới
// maxDuration giống cron scheduled-messages (180s).
export const maxDuration = 180

const WRITABLE_TABS_KEY = "permissions.writable_tabs"

async function canWriteScheduled(username: string): Promise<boolean> {
  const dbRole = await getDbRole(username)
  if (["admin", "creator"].includes(dbRole)) return true
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", WRITABLE_TABS_KEY).maybeSingle()
  if (!data?.value) return false
  try {
    const cfg = JSON.parse(data.value) as Record<string, string[]>
    return (cfg[username] ?? []).includes("scheduled")
  } catch { return false }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWriteScheduled(session.user.username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // origin để gọi nội bộ quarterly-report / quarterly-b2b-customers (tiến độ quý + phân tích Tier) — đúng số Quarter Report.
    const data = await buildWeeklyReportData(req.nextUrl.origin)
    const content = await buildReportContent(data)

    // ?format=md → xem nhanh nội dung (markdown + ảnh base64) để kiểm trước khi tải .docx
    if (req.nextUrl.searchParams.get("format") === "md") {
      return NextResponse.json({ markdown: content.markdown, images: Object.fromEntries(Object.entries(content.images).map(([k, v]) => [k, v.buffer.toString("base64")])) })
    }

    const docxBuf = await buildWeeklyReportDocx(content)

    const tag = `${data.periods.lastWeekStart}_to_${data.periods.lastWeekEnd}`
    return NextResponse.json({
      docx: docxBuf.toString("base64"),
      docxFilename: `Company_Weekly_Performance_${tag}.docx`,
    })
  } catch (e: any) {
    console.error("[weekly-report]", e)
    return NextResponse.json({ error: e?.message || "Tạo Weekly Report thất bại" }, { status: 500 })
  }
}
