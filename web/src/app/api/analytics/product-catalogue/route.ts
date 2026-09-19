import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cachedQuery, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { buildCatalogueIndex } from "@/lib/catalogue/server"

// Product Catalogue (bản dựng lại s201, 2026-09-19): chỉ đọc Supabase products/skus/ref_* — KHÔNG gohub_dw,
// KHÔNG doanh thu, KHÔNG AI. Trả bản gọn của mọi gói + tổng hợp SKU; chi tiết từng gói ở [code]/route.ts.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  try {
    const payload = await cachedQuery("catalogue:index:v1", buildCatalogueIndex, 30, noCache(req), ["catalogue"])
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
    })
  } catch (err: any) {
    console.error("[analytics/product-catalogue]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
