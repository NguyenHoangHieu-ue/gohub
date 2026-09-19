import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { COGS_ROLES } from "@/lib/catalogue/server"
import type { CatalogueProductDetail, CatalogueSkuRow, CatalogueListingRow } from "@/lib/catalogue/types"

// Chi tiết 1 gói: đủ cột products + toàn bộ SKU + listing. 3 truy vấn cố định (không N+1).
// Giá vốn (latest_cogs) chỉ trả cho vai trò được cấp → header private, KHÔNG cho CDN cache dùng chung.
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions)
  // Không dùng analyticsGuard: nó đăng ký URL vào danh sách prewarm cron — ~1k URL chi tiết sẽ làm bẩn danh sách đó.
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const code = params.code
  if (!/^[A-Za-z0-9]{6,12}$/.test(code)) return NextResponse.json({ error: "Mã gói không hợp lệ" }, { status: 400 })
  const role = (session as { user?: { role?: string } } | null)?.user?.role ?? ""
  const canSeeCogs = COGS_ROLES.has(role)

  try {
    // Không qua cachedQuery: 3 truy vấn nhẹ theo khoá chính, luôn tươi, tránh phình bảng analytics_query_cache (~1k gói).
    const payload = await (async (): Promise<CatalogueProductDetail | null> => {
        const [prod, skus, listings] = await Promise.all([
          supabaseAdmin.from("products").select("*").eq("product_code", code).maybeSingle(),
          supabaseAdmin.from("skus")
            .select("sku_code,status,data_amount,data_amount_unit,day_amount,throttle_speed,call,call_sms_details,vendor_sku,latest_cogs,latest_cogs_currency")
            .eq("product_code", code).order("day_amount").order("data_amount").limit(1000),
          supabaseAdmin.from("listings")
            .select("listing_code,listing_name_en,listing_name_vn,listing_type,status")
            .eq("reference_product_code", code).order("listing_code").limit(300),
        ])
        if (prod.error) throw new Error(prod.error.message)
        if (skus.error) throw new Error(skus.error.message)
        if (listings.error) throw new Error(listings.error.message)
        if (!prod.data) return null

        const product: Record<string, unknown> = { ...(prod.data as Record<string, unknown>) }
        delete product.synced_at
        const skuRows: CatalogueSkuRow[] = (skus.data ?? []).map((s: any) => ({
          code: s.sku_code, status: s.status ?? "", dataAmount: s.data_amount, dataUnit: s.data_amount_unit,
          days: s.day_amount, throttle: s.throttle_speed, call: s.call, callDetails: s.call_sms_details,
          vendorSku: s.vendor_sku,
          ...(canSeeCogs ? { cogs: s.latest_cogs, cogsCurrency: s.latest_cogs_currency } : {}),
        }))
        const listingRows: CatalogueListingRow[] = (listings.data ?? []).map((l: any) => ({
          code: l.listing_code, nameEn: l.listing_name_en, nameVn: l.listing_name_vn, type: l.listing_type, status: l.status,
        }))
        return { product, skus: skuRows, listings: listingRows, canSeeCogs }
    })()
    if (!payload) return NextResponse.json({ error: "Không tìm thấy gói" }, { status: 404 })
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } })
  } catch (err: any) {
    console.error("[analytics/product-catalogue/detail]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
