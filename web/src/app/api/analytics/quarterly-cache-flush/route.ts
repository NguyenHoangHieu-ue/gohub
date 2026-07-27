import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { flushAnalyticsCacheByPrefixes } from "@/lib/analytics-helpers"

// Xóa L2 Supabase cache cho quarterly report (accessible bởi mọi user đã login).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await flushAnalyticsCacheByPrefixes([
    "qreport_raw_v5:", "qreport_raw_v4:", "qreport_raw_v3:", "qreport_raw_v2:", "qreport_raw_v1:",
    "qb2b_raw_v4:", "qb2b_raw_v3:", "qb2b_raw_v2:",
  ]).catch(() => {})
  return NextResponse.json({ ok: true })
}
