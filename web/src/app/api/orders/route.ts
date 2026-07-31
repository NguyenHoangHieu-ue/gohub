import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics, queryAnalyticsOne } from "@/lib/analytics-db"
import { getPartnerTiers } from "@/lib/analytics-helpers"
import { getDimCustomerCols } from "@/lib/dim-schema"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p           = req.nextUrl.searchParams
  const startDate   = p.get("startDate") || ""
  const endDate     = p.get("endDate") || ""
  const page        = parseInt(p.get("page") || "1")
  const pageSize    = parseInt(p.get("pageSize") || "20")
  const search      = p.get("search") || ""
  const channel     = p.get("channel") || ""
  const staff       = p.get("staff") || ""
  const orderSource = p.get("orderSource") || ""
  const channelGroup = p.get("channelGroup") || ""
  const customerTier = p.get("customerTier") || ""
  const dataSource  = p.get("dataSource") || "fulfilled"
  const companyCode = p.get("companyCode") || "ALL"

  const isSales     = dataSource === "created"
  const mainTable   = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol     = isSales ? "created_date" : "fulfiled_date"
  const revenueCol  = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  const quantityCol = isSales ? "quantity" : "fulfilled_quantity"
  const offset      = (page - 1) * pageSize

  try {
    // Probe dim_customer schema để dùng đúng tên cột (đề phòng đổi cấu trúc)
    const { codeCol: custCodeCol, nameCol: custNameCol } = await getDimCustomerCols()

    const params: unknown[] = []
    let where = "WHERE 1=1"

    if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
      params.push(companyCode); where += ` AND f.company_code = $${params.length}`
    }
    if (startDate && endDate) {
      params.push(startDate, endDate)
      where += ` AND f.${dateCol}::date BETWEEN $${params.length - 1} AND $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (f.order_code ILIKE $${params.length} OR f.sku ILIKE $${params.length})`
    }
    if (channel) {
      params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
    } else if (channelGroup && channelGroup !== "All") {
      params.push(channelGroup); where += ` AND s.group_name = $${params.length}`
    }
    if (staff) {
      if (staff.includes(",")) {
        const arr = staff.split(",").filter(Boolean)
        const pls = arr.map((_, i) => `$${params.length + i + 1}`).join(",")
        where += ` AND TRIM(f.staff_code) IN (${pls})`
        params.push(...arr)
      } else {
        params.push(staff, `%${staff}%`)
        where += ` AND (TRIM(f.staff_code) = $${params.length - 1} OR st.name ILIKE $${params.length} OR TRIM(f.staff_code) ILIKE $${params.length})`
      }
    }
    if (orderSource) {
      params.push(orderSource); where += ` AND s.code = $${params.length}`
    }
    if (channelGroup === "B2B" && customerTier && customerTier !== "All") {
      const tiers = await getPartnerTiers()
      const strategic: string[] = (tiers["Strategic"] || Object.values(tiers).flat()) as string[]
      if (strategic.length > 0) {
        const conditions = strategic.map(p2 => `TRIM(s.channel_name) ILIKE '%${p2.replace(/'/g, "''").trim()}%'`).join(" OR ")
        if (customerTier === "Strategic") where += ` AND (${conditions})`
        else where += ` AND NOT (${conditions})`
      }
    }

    where += ` AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM' AND f.sku != 'SHIPPINGFEE0'`

    const locationJoin = isSales ? "" : "LEFT JOIN dim_location l ON f.location_id = l.location_id"
    const locationCol  = isSales ? "NULL as location_name" : "l.location_name"

    const [summaryRow, dataRows] = await Promise.all([
      queryAnalyticsOne<{ count: string; total_revenue: string; total_quantity: string }>(
        `SELECT COUNT(*) as count,
                SUM(f.${revenueCol}) as total_revenue,
                SUM(f.${quantityCol}) as total_quantity
         FROM ${mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
         ${where}`,
        params
      ),
      queryAnalytics(
        `SELECT f.order_code, f.company_code,
                f.${dateCol} as fulfiled_date,
                v.type_of_sim as product_name,
                f.sku,
                f.${quantityCol} as fulfilled_quantity,
                f.${revenueCol} as fulfilled_revenue_amount_vnd,
                f.unit_price_after_discount_vnd,
                TRIM(s.channel_name) as channel_name,
                s.name as order_source,
                ${locationCol},
                COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unknown') as staff_name,
                COALESCE(c.${custNameCol}, NULLIF(TRIM(f.customer_code), ''), 'Unknown') as customer_name
         FROM ${mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         ${locationJoin}
         LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
         LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.${custCodeCol}::text)
         LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON f.sku = v.sku
         ${where}
         ORDER BY f.${dateCol}::date DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]
      )
    ])

    return NextResponse.json({
      orders: dataRows,
      total: parseInt(summaryRow?.count || "0"),
      summary: {
        totalRevenue: parseFloat(summaryRow?.total_revenue || "0"),
        totalQuantity: parseInt(summaryRow?.total_quantity || "0"),
      },
    })
  } catch (err: any) {
    console.error("[orders]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
