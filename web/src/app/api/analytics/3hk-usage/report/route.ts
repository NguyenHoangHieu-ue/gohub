import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, safeDate } from "@/lib/analytics-helpers"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    startDate, endDate,
    search     = "",
    activeTab  = "all",        // "all" | "Daily" | "Fixed" | "Unlimited"
    sortKey    = "first_report_date",
    sortDir    = "desc",
    page       = 1,
    pageSize   = 50,
  } = body

  const sDate = safeDate(startDate) || "2025-01-01"
  const eDate = safeDate(endDate)   || new Date().toISOString().split("T")[0]

  const tabValue = activeTab === "Daily" ? "Daily Data"
                 : activeTab === "Fixed" ? "Fixed Data"
                 : activeTab === "Unlimited" ? "Unlimited Data"
                 : "all"

  const searchFilter = search
    ? `AND (f.order_code ILIKE '%${search.replace(/'/g, "''")}%' OR f.iccid ILIKE '%${search.replace(/'/g, "''")}%' OR f.sku ILIKE '%${search.replace(/'/g, "''")}%')`
    : ""

  const tabFilter = tabValue !== "all" ? `AND sku_type = '${tabValue}'` : ""

  const bundleCTE = `
    WITH bundle_starts AS (
      SELECT iccid, order_code,
             MIN(first_report_date) as bundle_start_date,
             MAX(sku)               as sku,
             MAX(sku_type)          as sku_type,
             MAX(activation_date)   as activation_date
      FROM fact_data_usage
      WHERE sku IN (SELECT sku FROM dim_sku WHERE vendor = '3HKDATAPOOL')
      GROUP BY iccid, order_code
    ),
    filtered_bundles AS (
      SELECT iccid, order_code, sku, sku_type, bundle_start_date, activation_date
      FROM bundle_starts
      WHERE bundle_start_date >= '${sDate}'
        AND bundle_start_date <= '${eDate}'
        ${tabFilter}
    )`

  const safeSortKey = ["first_report_date","total_data_gb","data_amount_gb","usage_pct","order_code","iccid","sku"].includes(sortKey)
    ? sortKey : "first_report_date"
  const safeSortDir = sortDir === "asc" ? "ASC" : "DESC"
  const offset = (page - 1) * pageSize

  try {
    const [totalsRows, typeRows, skuRows, recordRows] = await Promise.all([
      // Totals
      queryAnalytics<{ total_usage: string; total_capacity: string; avg_usage: string; total_count: string }>(
        `${bundleCTE},
         per_bundle AS (
           SELECT f.iccid, f.order_code,
                  SUM(f.total_data_gb) as total_usage,
                  MAX(f.data_amount_gb) as capacity
           FROM fact_data_usage f
           JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
           WHERE 1=1 ${searchFilter}
           GROUP BY 1, 2
         )
         SELECT SUM(total_usage) as total_usage, SUM(capacity) as total_capacity,
                CASE WHEN SUM(capacity) > 0 THEN (SUM(total_usage)/SUM(capacity))*100 ELSE 0 END as avg_usage,
                COUNT(*) as total_count
         FROM per_bundle`
      ),
      // By SKU type
      queryAnalytics<{ sku_type: string; active_sims: string; total_plan_gb: string; total_usage_gb: string; avg_usage_pct: string }>(
        `${bundleCTE},
         per_bundle AS (
           SELECT fb.sku_type, f.iccid, f.order_code,
                  SUM(f.total_data_gb) as total_usage_gb,
                  MAX(f.data_amount_gb) as total_plan_gb
           FROM fact_data_usage f
           JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
           WHERE 1=1 ${searchFilter}
           GROUP BY 1, 2, 3
         )
         SELECT COALESCE(sku_type,'Unknown') as sku_type, COUNT(*) as active_sims,
                SUM(total_plan_gb) as total_plan_gb, SUM(total_usage_gb) as total_usage_gb,
                CASE WHEN SUM(total_plan_gb)>0 THEN (SUM(total_usage_gb)/SUM(total_plan_gb))*100 ELSE 0 END as avg_usage_pct
         FROM per_bundle GROUP BY 1 ORDER BY total_usage_gb DESC`
      ),
      // By SKU
      queryAnalytics<{ sku: string; active_sims: string; total_plan_gb: string; total_usage_gb: string; avg_usage_pct: string }>(
        `${bundleCTE},
         per_bundle AS (
           SELECT fb.sku, f.iccid, f.order_code,
                  SUM(f.total_data_gb) as total_usage_gb,
                  MAX(f.data_amount_gb) as total_plan_gb
           FROM fact_data_usage f
           JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
           WHERE 1=1 ${searchFilter}
           GROUP BY 1, 2, 3
         )
         SELECT sku, COUNT(*) as active_sims,
                SUM(total_plan_gb) as total_plan_gb, SUM(total_usage_gb) as total_usage_gb,
                CASE WHEN SUM(total_plan_gb)>0 THEN (SUM(total_usage_gb)/SUM(total_plan_gb))*100 ELSE 0 END as avg_usage_pct
         FROM per_bundle GROUP BY 1 ORDER BY total_usage_gb DESC`
      ),
      // Records (paginated)
      queryAnalytics<{
        order_code: string; iccid: string; sku: string; sku_type: string
        data_amount_gb: string; total_data_gb: string; usage_pct: string
        first_report_date: string; activation_date: string; record_count: string
      }>(
        `${bundleCTE},
         per_bundle AS (
           SELECT fb.sku, f.iccid, f.order_code, fb.sku_type,
                  fb.bundle_start_date as first_report_date,
                  fb.activation_date,
                  SUM(f.total_data_gb) as total_data_gb,
                  MAX(f.data_amount_gb) as data_amount_gb,
                  COUNT(*) as record_count
           FROM fact_data_usage f
           JOIN filtered_bundles fb ON f.iccid = fb.iccid AND f.order_code = fb.order_code
           WHERE 1=1 ${searchFilter}
           GROUP BY 1, 2, 3, 4, 5, 6
         )
         SELECT order_code, iccid, sku, sku_type,
                COALESCE(data_amount_gb,0) as data_amount_gb,
                COALESCE(total_data_gb,0)  as total_data_gb,
                CASE WHEN data_amount_gb>0 THEN (total_data_gb/data_amount_gb)*100 ELSE 0 END as usage_pct,
                first_report_date, activation_date, record_count
         FROM per_bundle
         ORDER BY ${safeSortKey} ${safeSortDir}
         LIMIT ${pageSize} OFFSET ${offset}`
      ),
    ])

    const tot = totalsRows[0] || {}

    return NextResponse.json({
      totals: {
        totalUsage:    parseFloat(tot.total_usage    || "0"),
        totalCapacity: parseFloat(tot.total_capacity || "0"),
        avgUsage:      parseFloat(tot.avg_usage      || "0"),
        count:         parseInt(tot.total_count      || "0"),
      },
      skuTypeMetrics: typeRows.map(r => ({
        sku_type:       r.sku_type,
        active_sims:    parseInt(r.active_sims    || "0"),
        total_plan_gb:  parseFloat(r.total_plan_gb  || "0"),
        total_usage_gb: parseFloat(r.total_usage_gb || "0"),
        avg_usage_pct:  parseFloat(r.avg_usage_pct  || "0"),
      })),
      skuMetrics: skuRows.map(r => ({
        sku:            r.sku,
        active_sims:    parseInt(r.active_sims    || "0"),
        total_plan_gb:  parseFloat(r.total_plan_gb  || "0"),
        total_usage_gb: parseFloat(r.total_usage_gb || "0"),
        avg_usage_pct:  parseFloat(r.avg_usage_pct  || "0"),
      })),
      records: recordRows.map(r => ({
        order_code:        r.order_code,
        iccid:             r.iccid,
        sku:               r.sku,
        sku_type:          r.sku_type,
        data_amount_gb:    parseFloat(r.data_amount_gb || "0"),
        total_data_gb:     parseFloat(r.total_data_gb  || "0"),
        usage_pct:         parseFloat(r.usage_pct      || "0"),
        first_report_date: r.first_report_date,
        activation_date:   r.activation_date,
        record_count:      parseInt(r.record_count     || "0"),
      })),
      hasMore: recordRows.length === pageSize,
    })
  } catch (err: any) {
    console.error("[3hk-usage/report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
