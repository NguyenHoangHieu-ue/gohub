import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { analyticsGuard } from "@/lib/analytics-helpers"

// GET /api/analytics/b2b-customers?search=<term>&tier=<tier>&currency=<VND|USD>&limit=50
// Đọc từ b2b_customers_cache (Supabase) — cần sync trước qua /api/analytics/sync-b2b-customers.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p   = req.nextUrl.searchParams
  const search   = (p.get("search") || "").trim()
  const tier     = p.get("tier") || ""       // Strategic | VIP | Gold | Silver
  const currency = p.get("currency") || ""   // VND | USD
  const limit    = Math.min(parseInt(p.get("limit") || "100"), 500)
  const offset   = parseInt(p.get("offset") || "0")

  try {
    let q: any = supabaseAdmin
      .from("b2b_customers_cache")
      .select("customer_code, customer_name, price_list_name, currency_code, status, sales_pic_code, total_revenue, total_gp, total_orders, total_units, last_order_date, synced_at")
      .order("total_revenue", { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      q = q.ilike("customer_name", `%${search}%`)
    }
    if (currency) {
      q = q.eq("currency_code", currency.toUpperCase())
    }
    if (tier) {
      // Map tier → price_list_name pattern
      const tierMap: Record<string, string> = {
        Strategic: "%STRATEGIC%",
        VIP:       "%VIP%",
        Gold:      "%GOLD%",
        Silver:    "%SILVER%",
      }
      const pattern = tierMap[tier]
      if (pattern) q = q.ilike("price_list_name", pattern)
    }

    const { data, error, count } = await q
    if (error) throw new Error(error.message)

    return NextResponse.json({ customers: data || [], total: count })
  } catch (err: any) {
    console.error("[b2b-customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
