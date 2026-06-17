import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await cachedQuery("vendor-list", () =>
      queryAnalytics<{ vendor: string }>(
        "SELECT DISTINCT TRIM(vendor) as vendor FROM dim_sku WHERE vendor IS NOT NULL AND vendor != '' ORDER BY 1"
      )
    )
    return NextResponse.json(data.map(r => r.vendor), { headers: CACHE_HEADERS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
