import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard } from "@/lib/analytics-helpers"

export const dynamic = "force-dynamic"

// Tìm kiếm B2B customers theo tên hoặc mã — dùng cho autocomplete trong Settings loại KH.
// Trả về [{code, name}] để UI lưu theo CODE (ổn định khi đổi tên).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const q = req.nextUrl.searchParams.get("q") || ""
  if (q.length < 2) return NextResponse.json([])

  const safe = q.replace(/'/g, "''")
  try {
    const rows = await queryAnalytics<{ code: string; name: string }>(`
      SELECT DISTINCT
        TRIM(c.code::text) as code,
        COALESCE(c.name, TRIM(c.code::text)) as name
      FROM dim_customer c
      WHERE (
        TRIM(c.code::text) ILIKE '%${safe}%'
        OR COALESCE(c.name, '') ILIKE '%${safe}%'
      )
        AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')
        AND c.code IS NOT NULL
      ORDER BY name
      LIMIT 20
    `)
    return NextResponse.json(rows)
  } catch (e: any) {
    return NextResponse.json([], { status: 500 })
  }
}
