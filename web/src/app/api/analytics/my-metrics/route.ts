import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canWriteTab } from "@/lib/writable-tabs"
import { loadAutoMetrics } from "@/lib/my-metrics-auto"

const READ_ROLES = ["admin", "creator", "bod"]

// GET ?quarter=Q3&year=2026 — logic ở lib/my-metrics-auto.ts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = parseInt(req.nextUrl.searchParams.get("year") ?? "2026")
  return NextResponse.json(await loadAutoMetrics(quarter, year))
}
