import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireExternalApiKey } from "@/lib/external-api-auth"
import { checkRateLimit } from "@/lib/rate-limit"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

// Field list RIÊNG cho contract bên ngoài — KHÔNG import từ web/src/app/api/products/route.ts (route UI
// nội bộ), để sửa UI sau này không vô tình đổi field trả cho bên ngoài.
const SELECT_COLS = [
  "product_code", "tenant", "status", "product_type", "vendor_code", "type_of_sim",
  "kyc_code", "kyc_needed", "local_phone_number", "purchase_type",
  "operator_code", "network_type", "apn", "apn_original", "note", "supported_countries",
  "activation_time", "hotspot",
].join(",")

function buildProductPattern(pt: string, ptype: string, country: string, vendor: string, dtype: string): string | null {
  if (!pt && !ptype && !country && !vendor && !dtype) return null
  return (pt || "_") + (ptype || "_") + (country || "___") + (vendor || "__") + (dtype || "_")
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

  const sp        = req.nextUrl.searchParams
  const page      = Math.max(1, parseInt(sp.get("page") || "1"))
  const pageSize  = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get("page_size") || String(DEFAULT_PAGE_SIZE))))
  const search    = sp.get("search")   || ""
  const tenant    = sp.get("tenant")   || ""
  const status    = sp.get("status")   || ""
  const pt        = sp.get("pt")       || ""
  const ptype     = sp.get("ptype")    || ""
  const country   = sp.get("country")  || ""
  const vendor    = sp.get("vendor")   || ""
  const dtype     = sp.get("dtype")    || ""
  const vendorF   = sp.get("vendor_f") || ""
  const operator  = sp.get("operator") || ""

  let q = supabaseAdmin.from("products").select(SELECT_COLS, { count: "exact" })

  if (search) q = (q as any).or(
    `product_code.ilike.%${search}%,vendor_code.ilike.%${search}%,operator_code.ilike.%${search}%,supported_countries.ilike.%${search}%`
  )
  if (tenant)   q = (q as any).eq("tenant", tenant)
  if (status)   q = (q as any).eq("status", status)
  if (vendorF)  q = (q as any).ilike("vendor_code", `%${vendorF}%`)
  if (operator) q = (q as any).ilike("operator_code", `%${operator}%`)

  const pattern = buildProductPattern(pt, ptype, country, vendor, dtype)
  if (pattern) q = (q as any).like("product_code", pattern)

  const from = (page - 1) * pageSize
  const { data, count, error } = await (q as any)
    .range(from, from + pageSize - 1)
    .order("product_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, page_size: pageSize })
}
