import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const data = await cachedQuery("gohub-dw-schema", async () => {
      const rows = await queryAnalytics<{ table_name: string; column_name: string; data_type: string }>(
        `SELECT t.table_name, c.column_name, c.data_type
         FROM information_schema.tables t
         JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
         WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name, c.ordinal_position`
      )
      const map = new Map<string, { columnName: string; dataType: string }[]>()
      rows.forEach(r => {
        if (!map.has(r.table_name)) map.set(r.table_name, [])
        map.get(r.table_name)!.push({ columnName: r.column_name, dataType: r.data_type })
      })
      return Array.from(map.entries()).map(([tableName, columns]) => ({ tableName, columns }))
    })
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
