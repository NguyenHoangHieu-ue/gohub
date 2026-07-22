import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getPartnerTiers } from "@/lib/analytics-helpers"
import { getDimCustomerCols } from "@/lib/dim-schema"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p           = req.nextUrl.searchParams
  const startDate   = p.get("startDate") || ""
  const endDate     = p.get("endDate") || ""
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

  try {
    const { codeCol: custCodeCol, nameCol: custNameCol } = await getDimCustomerCols()
    const params: unknown[] = [startDate, endDate]
    let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2`

    if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
      params.push(companyCode); where += ` AND f.company_code = $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (f.order_code ILIKE $${params.length} OR f.sku ILIKE $${params.length})`
    }
    // "all"/"All"/rỗng = KHÔNG lọc (FE gửi default "all" lowercase → trước đây thêm nhầm `= 'all'` → xuất RỖNG).
    const isAll = (v: string) => !v || v.toLowerCase() === "all"
    if (!isAll(channel)) {
      params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
    } else if (!isAll(channelGroup)) {
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
        where += ` AND (TRIM(f.staff_code) = $${params.length - 1} OR st.name ILIKE $${params.length})`
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

    // Product Performance filters (skus/category/vendor/destination) — chỉ áp khi có param
    const skus = p.get("skus") || ""
    const category = p.get("category") || ""
    const vendor = p.get("vendor") || ""
    const destination = p.get("destination") || ""
    if (skus && skus !== "all" && skus !== "All") {
      const list = skus.split(",").filter(Boolean)
      if (list.length) {
        const pls = list.map((_, i) => `$${params.length + i + 1}`).join(",")
        where += ` AND f.sku IN (${pls})`; params.push(...list)
      }
    }
    if (category && category !== "all" && category !== "All") {
      params.push(category); where += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE category_name = $${params.length})`
    }
    if (vendor && vendor !== "all" && vendor !== "All") {
      const list = vendor.split(",").filter(Boolean)
      if (list.length) {
        const pls = list.map((_, i) => `$${params.length + i + 1}`).join(",")
        where += ` AND f.sku IN (SELECT sku FROM dim_sku WHERE vendor IN (${pls}))`; params.push(...list)
      }
    }
    if (destination && destination !== "all" && destination !== "All") {
      const sw = String(p.get("startsWith") || "E")
      const cl = parseInt(p.get("codeLength") || "3")
      const gv = p.get("useGohubVietnamRule") === "true"
      const gi = p.get("useGohubIncRule") === "true"
      const regionExpr = `CASE
        ${gv ? "WHEN LEFT(f.sku, 1) BETWEEN '1' AND '6' THEN SUBSTRING(f.sku FROM 3 FOR 3)" : ""}
        ${gi ? "WHEN LEFT(f.sku, 1) BETWEEN 'A' AND 'E' THEN SUBSTRING(f.sku FROM 3 FOR 3)" : ""}
        WHEN f.sku LIKE '${sw.replace(/'/g, "''")}%' THEN SUBSTRING(f.sku FROM ${sw.length + 1} FOR ${cl})
        ELSE SUBSTRING(f.sku FROM 1 FOR ${cl})
      END`
      where += ` AND ${regionExpr} = $${params.length + 1}`; params.push(destination)
    }

    where += ` AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM' AND f.sku != 'SHIPPINGFEE0'`

    const locationJoin = isSales ? "" : "LEFT JOIN dim_location l ON f.location_id = l.location_id"
    const locationCol  = isSales ? "NULL as location" : "l.location_name as location"

    const rows = await queryAnalytics(
      `SELECT f.order_code as order_id, f.company_code,
              f.${dateCol} as date,
              v.type_of_sim as product_name,
              f.sku,
              f.${quantityCol} as fulfilled_quantity,
              f.${revenueCol} as revenue,
              f.unit_price_after_discount_vnd,
              TRIM(s.channel_name) as channel,
              s.name as order_source,
              ${locationCol},
              COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unknown') as staff,
              COALESCE(c.${custNameCol}, NULLIF(TRIM(f.customer_code), ''), 'Unknown') as customer
       FROM ${mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       ${locationJoin}
       LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
       LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.${custCodeCol}::text)
       LEFT JOIN dim_sku v ON f.sku = v.sku
       ${where}
       ORDER BY f.${dateCol}::date DESC`,
      params
    )

    return NextResponse.json(rows)
  } catch (err: any) {
    console.error("[orders/export]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
