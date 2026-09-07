import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireExternalApiKey } from "@/lib/external-api-auth"
import { checkRateLimit } from "@/lib/rate-limit"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

// Field list RIÊNG cho contract bên ngoài — bao gồm COGS (latest_cogs/latest_cogs_currency), đúng yêu
// cầu Hiếu. KHÔNG import từ web/src/app/api/skus/route.ts (route UI nội bộ) — ổn định độc lập.
const SELECT_COLS = [
  "sku_code", "product_code", "tenant", "status", "sim_esim", "data_amount", "data_amount_unit",
  "day_amount", "day_amount_unit", "throttle_speed", "call", "expirations", "frame", "datapack",
  "vendor_sku", "vendor_sku_sim", "latest_cogs", "latest_cogs_currency",
].join(",")

function buildLikePattern(
  pt: string, ptype: string, country: string, vendor: string, dtype: string, data: string, days: string,
): string | null {
  if (!pt && !ptype && !country && !vendor && !dtype && !data && !days) return null
  return (pt || "_") + (ptype || "_") + (country || "___") + (vendor || "__") + (dtype || "_") + (data || "___") + (days || "__")
}

export async function GET(req: NextRequest) {
  const auth = await requireExternalApiKey(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const rl = await checkRateLimit(`external-api:${auth.label}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    )
  }

  const sp       = req.nextUrl.searchParams
  const page     = Math.max(1, parseInt(sp.get("page") || "1"))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get("page_size") || String(DEFAULT_PAGE_SIZE))))
  const search   = sp.get("search")  || ""
  const tenant   = sp.get("tenant")  || ""
  const status   = sp.get("status")  || ""
  const pt       = sp.get("pt")      || ""
  const ptype    = sp.get("ptype")   || ""
  const country  = sp.get("country") || ""
  const vendor   = sp.get("vendor")  || ""
  const dtype    = sp.get("dtype")   || ""
  const data     = sp.get("data")    || ""
  const days     = sp.get("days")    || ""

  let q = supabaseAdmin.from("skus").select(SELECT_COLS, { count: "exact" })

  if (search) q = (q as any).or(
    `sku_code.ilike.%${search}%,product_code.ilike.%${search}%,vendor_sku.ilike.%${search}%`
  )
  if (tenant) q = (q as any).eq("tenant", tenant)
  if (status) q = (q as any).eq("status", status)

  const pattern = buildLikePattern(pt, ptype, country, vendor, dtype, data, days)
  if (pattern) q = (q as any).like("sku_code", pattern)

  const from = (page - 1) * pageSize
  const { data: rows, count, error } = await (q as any)
    .range(from, from + pageSize - 1)
    .order("sku_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich nhẹ với product cha (note/kyc/countries) — khớp thông tin route UI nội bộ đang trả, hữu ích
  // cho bên ngoài tra cứu mà không cần gọi thêm /external/products cho từng product_code.
  const productCodes = [...new Set((rows ?? []).map((r: any) => r.product_code).filter(Boolean))]
  let productMap: Record<string, any> = {}
  if (productCodes.length > 0) {
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("product_code, note, kyc_needed, supported_countries")
      .in("product_code", productCodes as string[])
    productMap = Object.fromEntries((products ?? []).map((p: any) => [p.product_code, p]))
  }

  const enriched = (rows ?? []).map((r: any) => ({
    ...r,
    note:                productMap[r.product_code]?.note ?? null,
    kyc_needed:          productMap[r.product_code]?.kyc_needed ?? null,
    supported_countries: productMap[r.product_code]?.supported_countries ?? null,
  }))

  return NextResponse.json({ data: enriched, total: count ?? 0, page, page_size: pageSize })
}
