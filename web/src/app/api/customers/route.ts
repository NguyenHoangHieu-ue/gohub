import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getDimCustomerCols } from "@/lib/dim-schema"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""

  try {
    // Dùng column name thực tế để chống lỗi khi dim_customer đổi cấu trúc
    const { nameCol } = await getDimCustomerCols()

    let sql: string
    const params: unknown[] = []

    if (!q) {
      sql = `SELECT ${nameCol} AS name FROM dim_customer WHERE ${nameCol} IS NOT NULL AND ${nameCol} != '' LIMIT 50`
    } else {
      params.push(`%${q}%`)
      sql = `SELECT ${nameCol} AS name FROM dim_customer WHERE ${nameCol} IS NOT NULL AND ${nameCol} != '' AND ${nameCol} ILIKE $1 LIMIT 100`
    }

    const rows = await queryAnalytics<{ name: string }>(sql, params)
    const names = Array.from(new Set(rows.map(r => String(r.name).trim()))).sort()
    return NextResponse.json(names)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
