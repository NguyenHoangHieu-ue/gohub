import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { canWriteTab } from "@/lib/writable-tabs"

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
  if (Array.isArray(body.excludedCustomers)) {
    await supabaseAdmin.from("app_settings").upsert(
      { key: "quarterly_excluded_customers", value: JSON.stringify(body.excludedCustomers), category: "quarterly" },
      { onConflict: "key" }
    )
    saved++
  }
  if (body.tierKeywords && typeof body.tierKeywords === "object") {
    await supabaseAdmin.from("app_settings").upsert(
      { key: "quarterly_tier_keywords", value: JSON.stringify(body.tierKeywords), category: "quarterly" },
      { onConflict: "key" }
    )
    saved++
  }

  if (saved === 0) return NextResponse.json({ error: "Không có dữ liệu để lưu" }, { status: 400 })
  return NextResponse.json({ ok: true })
}
