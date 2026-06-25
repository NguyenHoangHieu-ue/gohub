import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const result = await flushAnalyticsCache()
  return NextResponse.json({ ok: true, ...result })
}
