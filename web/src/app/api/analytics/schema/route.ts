import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

let schemaCache: any[] | null = null
let cacheTime = 0
const CACHE_TTL = 3600_000 // 1 hour

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Use cache if fresh
  if (schemaCache && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ tables: schemaCache })
  }

  try {
    // Sync TẤT CẢ bảng trong schema 'public' của kho dữ liệu (gohub_dw) — không whitelist cứng nữa
    // (trước đây giới hạn 8 tên, target_planning không tồn tại nên chỉ ra 7 bảng).
    const rows = await queryAnalytics<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    )

    // Group by table
    const tableMap: Record<string, any[]> = {}
    for (const r of rows) {
      if (!tableMap[r.table_name]) tableMap[r.table_name] = []
      tableMap[r.table_name].push({ name: r.column_name, type: r.data_type, description: "" })
    }

    const tableDescriptions: Record<string, string> = {
      fact_fulfillment_revenue: "Doanh thu fulfillment — nguồn dữ liệu chính (fulfiled_date, fulfilled_revenue_amount_vnd, gross_profit_vnd, cogs_amount_vnd)",
      fact_sales_revenue:       "Doanh thu theo ngày tạo đơn (created_date, sales_revenue_amount_vnd)",
      dim_order_source:         "Nguồn đơn hàng — kênh bán (code, group_name: B2B/B2C, channel_name)",
      dim_sku:                  "Thông tin sản phẩm (sku, category_name, vendor)",
      dim_staff:                "Nhân viên sales (code, name)",
      dim_customer:             "Khách hàng (code, name)",
      dim_location:             "Vùng miền (location_id, location_name)",
      dim_date:                 "Chiều thời gian (date dimension)",
      fact_data_usage:          "Usage data 3HK theo bundle (iccid, sku, sku_type, total_data_gb, data_amount_gb)",
      data_usage_log:           "Log usage thô theo ngày (iccid, offer_name, data_gb, report_date) — nguồn fact_data_usage",
      exchange_rate:            "Tỷ giá ngoại tệ",
      company:                  "Thông tin công ty / đối tác",
    }

    const tables = Object.entries(tableMap).map(([name, fields]) => ({
      name,
      description: tableDescriptions[name] || name,
      fields,
    }))

    schemaCache = tables
    cacheTime = Date.now()

    return NextResponse.json({ tables })
  } catch (err: any) {
    console.error("[analytics/schema]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
