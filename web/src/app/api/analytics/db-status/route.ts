import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { invalidateDimCustomerCache } from "@/lib/dim-schema"

// Tình trạng toàn bộ gohub_dw — fact tables + dim tables + bảng khác.
// Dùng cho "Kiểm tra database" trong Settings. Admin/Creator only.

// Fact tables: có cột ngày dữ liệu + ETL timestamp
const FACTS: { table: string; dateCol: string; loadCol?: string }[] = [
  { table: "fact_fulfillment_revenue", dateCol: "fulfiled_date" },
  { table: "fact_sales_revenue",       dateCol: "created_date",    loadCol: "etl_updated_at" },
  { table: "fact_data_usage",          dateCol: "activation_date", loadCol: "loaded_at" },
  { table: "data_usage_log",           dateCol: "report_date" },
]

// Dim + reference tables: chỉ check row count + columns
const DIMS: string[] = [
  "dim_customer",
  "dim_sku",
  "dim_staff",
  "dim_order_source",
  "dim_location",
  "dim_date",
  "exchange_rate",
  "company",
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // --- FACT tables ---
  const warehouse: any[] = []
  for (const f of FACTS) {
    try {
      const loadSel = f.loadCol ? `, MAX(${f.loadCol})::text AS last_loaded` : ""
      const rows = await queryAnalytics<any>(
        `SELECT COUNT(*)::bigint AS n, MAX(${f.dateCol})::text AS latest${loadSel} FROM ${f.table}`
      )
      warehouse.push({
        table: f.table,
        rows: Number(rows[0]?.n ?? 0),
        latest: rows[0]?.latest ?? null,
        lastLoaded: rows[0]?.last_loaded ?? null,
      })
    } catch (e: any) {
      warehouse.push({ table: f.table, error: e?.message?.slice(0, 200) ?? "error" })
    }
  }

  // --- DIM + reference tables ---
  // Lấy tất cả columns từ information_schema một lần cho performance
  let schemaRows: { table_name: string; column_name: string; data_type: string; ordinal_position: number }[] = []
  try {
    schemaRows = await queryAnalytics<any>(
      `SELECT table_name, column_name, data_type, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1)
       ORDER BY table_name, ordinal_position`,
      [DIMS]
    )
  } catch {}

  const dimResults: any[] = []
  for (const tbl of DIMS) {
    const cols = schemaRows
      .filter(r => r.table_name === tbl)
      .map(r => ({ name: r.column_name, type: r.data_type }))

    try {
      const rows = await queryAnalytics<{ n: string }>(`SELECT COUNT(*)::bigint AS n FROM ${tbl}`)
      dimResults.push({
        table: tbl,
        rows: Number(rows[0]?.n ?? 0),
        columns: cols,
      })
    } catch (e: any) {
      dimResults.push({ table: tbl, error: e?.message?.slice(0, 200) ?? "error", columns: cols })
    }
  }

  // Invalidate dim_customer schema cache sau khi kiểm tra (để lần sau lấy schema mới nhất)
  invalidateDimCustomerCache()

  // --- Supabase products ---
  let products: any = null
  try {
    const { count } = await supabaseAdmin
      .from("sku_catalog").select("*", { count: "exact", head: true })
    const { data: latest } = await supabaseAdmin
      .from("sku_catalog").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle()
    products = { rows: count ?? 0, lastSynced: latest?.synced_at ?? null }
  } catch (e: any) {
    products = { error: e?.message?.slice(0, 120) ?? "error" }
  }

  // --- Query cache stats ---
  let cache: any = null
  try {
    const { count } = await supabaseAdmin
      .from("analytics_query_cache").select("*", { count: "exact", head: true })
    const { data: oldest } = await supabaseAdmin
      .from("analytics_query_cache").select("cached_at").order("cached_at", { ascending: true }).limit(1).maybeSingle()
    cache = { entries: count ?? 0, oldest: oldest?.cached_at ?? null }
  } catch {}

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    warehouse,
    dims: dimResults,
    products,
    cache,
  })
}
