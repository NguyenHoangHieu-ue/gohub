import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { canWriteTab } from "@/lib/writable-tabs"
import { memoInvalidate } from "@/lib/memo"
import { logSettingChanges, readSettings, userOfSession } from "@/lib/manual-history/wire"

const WRITE_ROLES = ["admin", "creator"]

export async function GET() {
  const settings = await fetchQuarterlySettings()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "quarterly", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  let saved = 0
  const oldSettings = await readSettings(["quarterly_excluded_customers", "quarterly_tier_keywords"])   // giá trị cũ để ghi lịch sử sửa tay
  const logs: { key: string; label?: string; before: string | null | undefined; after: string | null }[] = []
  if (Array.isArray(body.excludedCustomers)) {
    await supabaseAdmin.from("app_settings").upsert(
      { key: "quarterly_excluded_customers", value: JSON.stringify(body.excludedCustomers), category: "quarterly" },
      { onConflict: "key" }
    )
    logs.push({ key: "quarterly_excluded_customers", label: "Quarter Report: khách bị loại", before: oldSettings.get("quarterly_excluded_customers"), after: JSON.stringify(body.excludedCustomers) })
    saved++
  }
  if (body.tierKeywords && typeof body.tierKeywords === "object") {
    await supabaseAdmin.from("app_settings").upsert(
      { key: "quarterly_tier_keywords", value: JSON.stringify(body.tierKeywords), category: "quarterly" },
      { onConflict: "key" }
    )
    logs.push({ key: "quarterly_tier_keywords", label: "Quarter Report: từ khoá phân loại Tier", before: oldSettings.get("quarterly_tier_keywords"), after: JSON.stringify(body.tierKeywords) })
    saved++
  }

  if (saved === 0) return NextResponse.json({ error: "Không có dữ liệu để lưu" }, { status: 400 })
  memoInvalidate("qsettings")
  await logSettingChanges(logs, userOfSession(session), "POST /analytics/quarterly-settings")
  return NextResponse.json({ ok: true })
}
