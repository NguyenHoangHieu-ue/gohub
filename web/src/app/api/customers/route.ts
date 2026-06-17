import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""

  try {
    let sql: string
    const params: unknown[] = []

    if (!q) {
      sql = "SELECT name FROM dim_customer WHERE name IS NOT NULL AND name != '' LIMIT 50"
    } else {
      params.push(`%${q}%`)
      sql = "SELECT name FROM dim_customer WHERE name IS NOT NULL AND name != '' AND name ILIKE $1 LIMIT 100"
    }

    const rows = await queryAnalytics<{ name: string }>(sql, params)
    const names = Array.from(new Set(rows.map(r => String(r.name).trim()))).sort()
    return NextResponse.json(names)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
