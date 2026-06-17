import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const channelGroup = req.nextUrl.searchParams.get("channelGroup") || ""
  const channel = req.nextUrl.searchParams.get("channel") || ""
  const dataSource = req.nextUrl.searchParams.get("dataSource") || "fulfilled"
  const companyCode = req.nextUrl.searchParams.get("companyCode") || "ALL"

  const mainTable = dataSource === "created" ? "fact_sales_revenue" : "fact_fulfillment_revenue"

  try {
    const params: unknown[] = []
    let where = `WHERE f.staff_code IS NOT NULL AND f.staff_code != ''
                   AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM'`

    if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
      params.push(companyCode)
      where += ` AND f.company_code = $${params.length}`
    }
    if (channel) {
      params.push(channel)
      where += ` AND TRIM(s.channel_name) = $${params.length}`
    } else if (channelGroup && channelGroup !== "All") {
      params.push(channelGroup)
      where += ` AND s.group_name = $${params.length}`
    }

    const sql = `SELECT DISTINCT TRIM(f.staff_code) as code,
                        COALESCE(st.name, TRIM(f.staff_code)) as name
                 FROM ${mainTable} f
                 LEFT JOIN dim_order_source s ON f.order_source_code = s.code
                 LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
                 ${where}
                 ORDER BY name`

    const rows = await queryAnalytics<{ code: string; name: string }>(sql, params)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
