import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// GET /api/bc/data — trả về catalog, prices, balance_log, countries từ Supabase
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [
    { data: products },
    { data: prices },
    { data: balance },
    { data: countries },
    { data: syncLog },
  ] = await Promise.all([
    supabaseAdmin.from("bc_products").select("sku_id,name,type,days,capacity_kb,high_flow_size_kb,hotspot_support,plan_type,description,countries,synced_at").order("name"),
    supabaseAdmin.from("bc_prices").select("sku_id,copies,retail_price,settlement_price").order("sku_id"),
    supabaseAdmin.from("bc_balance_log").select("balance,synced_at").order("synced_at", { ascending: false }).limit(30),
    supabaseAdmin.from("bc_countries").select("mcc,continent,name,url").order("continent,name"),
    supabaseAdmin.from("bc_sync_log").select("changes,error,synced_at").order("synced_at", { ascending: false }).limit(10),
  ])

  return NextResponse.json({ products: products ?? [], prices: prices ?? [], balance: balance ?? [], countries: countries ?? [], syncLog: syncLog ?? [] })
}
