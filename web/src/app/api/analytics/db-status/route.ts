import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// Tình trạng dữ liệu — cho admin xem nhanh kho dữ liệu (gohub_dw) còn cập nhật không + lần sync sản phẩm cuối.
// Dùng cho nút "Kiểm tra database" trong Settings. Admin-only.

// Mỗi bảng fact: cột ngày dữ liệu mới nhất + cột thời điểm ETL nạp gần nhất (nếu có).
const FACTS: { table: string; dateCol: string; loadCol?: string }[] = [
  { table: "fact_sales_revenue",       dateCol: "created_date",    loadCol: "etl_updated_at" },
  { table: "fact_fulfillment_revenue", dateCol: "fulfiled_date" },
  { table: "fact_data_usage",          dateCol: "activation_date", loadCol: "loaded_at" },
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
      warehouse.push({ table: f.table, error: e?.message?.slice(0, 120) ?? "error" })
    }
  }

  // Sản phẩm (Supabase) — count + lần sync gần nhất (synced_at do sync.py ghi)
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

  // Query cache stats (L2 Supabase)
  let cache: any = null
  try {
    const { count } = await supabaseAdmin
      .from("analytics_query_cache").select("*", { count: "exact", head: true })
    const { data: oldest } = await supabaseAdmin
      .from("analytics_query_cache").select("cached_at").order("cached_at", { ascending: true }).limit(1).maybeSingle()
    cache = { entries: count ?? 0, oldest: oldest?.cached_at ?? null }
  } catch {}

  return NextResponse.json({ checkedAt: new Date().toISOString(), warehouse, products, cache })
}
