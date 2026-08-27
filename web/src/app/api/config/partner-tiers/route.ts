import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { getPartnerTiers, cachedQuery, flushAnalyticsCache } from "@/lib/analytics-helpers"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tiers = await cachedQuery("partner-tiers", getPartnerTiers)
  return NextResponse.json(tiers)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "settings", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "partner_tiers",
    value: JSON.stringify(body),
    category: "analytics",
  }, { onConflict: "key" })
  // Strategic partners ảnh hưởng nhiều report (B2B strategic/performance/other, all-time, bod, channels...) — chúng
  // cache theo ngày và đọc getPartnerTiers() bên trong. Xóa cache để report tính lại theo danh sách strategic mới.
  await flushAnalyticsCache().catch(() => {})
  return NextResponse.json({ ok: true })
}
