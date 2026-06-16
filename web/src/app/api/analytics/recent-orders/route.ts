import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyCode   = req.nextUrl.searchParams.get("companyCode")
  const companyFilter = companyCode && companyCode !== "ALL" && companyCode !== "undefined"
    ? `WHERE company_code = '${companyCode}'` : ""

  try {
    const rows = await queryAnalytics(
      `WITH recent_f AS (
         SELECT * FROM fact_fulfillment_revenue
         ${companyFilter}
         ORDER BY fulfiled_date DESC
         LIMIT 200
       )
       SELECT
         f.order_code as id,
         'Customer' as customer_name,
         MAX(l.location_name) as region,
         SUM(f.fulfilled_revenue_amount_vnd) as amount,
         'Completed' as status,
         MAX(f.fulfiled_date) as created_at
       FROM recent_f f
       LEFT JOIN dim_location l ON f.location_id = l.location_id
       GROUP BY f.order_code
       ORDER BY created_at DESC
       LIMIT 10`
    )
    return NextResponse.json(rows)
  } catch (err: any) {
    console.error("[analytics/recent-orders]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
