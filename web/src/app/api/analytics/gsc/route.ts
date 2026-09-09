import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runGSC } from "@/lib/ga4"

// Generic Search Console endpoint (port "y hệt" gohub-intel /api/analytics/gsc).
// Params: siteId, startDate, endDate (YYYY-MM-DD bắt buộc), dimensions (csv, mặc định date).
// Trả mảng rows GSC ({ keys, clicks, impressions, ctr, position }) — khớp cách intel component đọc.
const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !ANALYTICS_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const siteId     = sp.get("siteId") || undefined
  const startDate  = sp.get("startDate")
  const endDate    = sp.get("endDate")
  const dimensions = (sp.get("dimensions") || "date").split(",").map(s => s.trim()).filter(Boolean)
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const rows = await runGSC(siteId, startDate, endDate, dimensions)
    // Component đọc data?.rows?.map(...) — phải wrap như GA4Report format
    return NextResponse.json({ rows, rowCount: rows.length })
  } catch (err: any) {
    console.error("[analytics/gsc]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
