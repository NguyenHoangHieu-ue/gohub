import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"
import { buildWeeklyReportData } from "@/lib/weekly-report/data"
import { generateChannelNarratives } from "@/lib/weekly-report/narrative"
import { buildReportContent } from "@/lib/weekly-report/report-content"
import { buildWeeklyReportDocx } from "@/lib/weekly-report/docx-export"
import { buildWeeklyReportPdf } from "@/lib/weekly-report/pdf-export"

// Nút "Create Weekly Report" (tab Scheduled Messages) — cùng quyền ghi với scheduled messages
// (admin/creator hoặc user được cấp writable_tabs["scheduled"]). Tính toán nặng (nhiều query gohub_dw +
// Gemini + render ảnh + docx/pdf) → nới maxDuration giống cron scheduled-messages (180s).
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

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWriteScheduled(session.user.username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const data = await buildWeeklyReportData()
    const allChannels = [...data.b2bChannels, ...data.b2cChannels]
    const narratives = await generateChannelNarratives(allChannels)
    const content = await buildReportContent(data, narratives)

    const [docxBuf, pdfBuf] = await Promise.all([
      buildWeeklyReportDocx(content),
      buildWeeklyReportPdf(content),
    ])

    const tag = `${data.periods.lastWeekStart}_to_${data.periods.lastWeekEnd}`
    return NextResponse.json({
      docx: docxBuf.toString("base64"),
      docxFilename: `Company_Weekly_Performance_${tag}.docx`,
      pdf: pdfBuf.toString("base64"),
      pdfFilename: `Company_Weekly_Performance_${tag}.pdf`,
    })
  } catch (e: any) {
    console.error("[weekly-report]", e)
    return NextResponse.json({ error: e?.message || "Tạo Weekly Report thất bại" }, { status: 500 })
  }
}
