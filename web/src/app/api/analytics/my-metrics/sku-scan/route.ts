import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { CACHE_HEADERS } from "@/lib/analytics-helpers"
import { canWriteTab } from "@/lib/writable-tabs"
import { loadSkuScan } from "@/lib/my-metrics-sku-scan"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3-2026 — logic ở lib/my-metrics-sku-scan.ts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  try {
    return NextResponse.json(await loadSkuScan(quarter), { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/sku-scan]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
