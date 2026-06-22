import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runGA4Report } from "@/lib/ga4"

// Generic GA4 report endpoint (port "y hệt" gohub-intel /api/analytics/ga4).
// Params: siteId, startDate, endDate, dimensions (csv, mặc định date), metrics (csv, bắt buộc), limit.
// Trả raw GA4 report ({ rows: [{ dimensionValues, metricValues }], rowCount }) — khớp cách intel component đọc.
const ANALYTICS_ROLES = new Set(["admin", "bod", "staff"])

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !ANALYTICS_ROLES.has(session.user?.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const siteId     = sp.get("siteId") || undefined
  const startDate  = sp.get("startDate") || undefined
  const endDate    = sp.get("endDate") || undefined
  const dimensions = (sp.get("dimensions") || "date").split(",").map(s => s.trim()).filter(Boolean)
  const metricsRaw = sp.get("metrics")
  if (!metricsRaw) return NextResponse.json({ error: "metrics required" }, { status: 400 })
  const metrics    = metricsRaw.split(",").map(s => s.trim()).filter(Boolean)
  const limitRaw   = sp.get("limit")
  const limit      = limitRaw ? parseInt(limitRaw) : undefined

  try {
    const report = await runGA4Report({ siteId, startDate, endDate, dimensions, metrics, limit })
    return NextResponse.json(report)
  } catch (err: any) {
    console.error("[analytics/ga4]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
