import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { topB2BCustomers } from "@/lib/b2b-customers"
import { analyticsGuard } from "@/lib/analytics-helpers"

// GET /api/analytics/b2b-customers?search=<term>&tier=<tier>&currency=<VND|USD>&limit=50
// Đọc THẲNG từ gohub_dw (cache 60 phút) — không còn bảng b2b_customers_cache (s240).

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
    const customers = await topB2BCustomers({ search, tier, currency, limit, offset })
    return NextResponse.json({ customers, total: customers.length })
  } catch (err: any) {
    console.error("[b2b-customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
