import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 20

function buildLikePattern(
  pt: string, ptype: string, country: string,
  vendor: string, dtype: string, data: string, days: string,
): string | null {
  if (!pt && !ptype && !country && !vendor && !dtype && !data && !days) return null
  return (
    (pt      || "_")   +
    (ptype   || "_")   +
    (country || "___") +
    (vendor  || "__")  +
    (dtype   || "_")   +
    (data    || "___") +
    (days    || "__")
  )
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const page    = Math.max(1, parseInt(sp.get("page") || "1"))
  const search  = sp.get("search")  || ""
  const tenant  = sp.get("tenant")  || ""
  const status  = sp.get("status")  || ""
  const pt      = sp.get("pt")      || ""
  const ptype   = sp.get("ptype")   || ""
  const country = sp.get("country") || ""
  const vendor  = sp.get("vendor")  || ""
  const dtype   = sp.get("dtype")   || ""
  const data    = sp.get("data")    || ""
  const days    = sp.get("days")    || ""

  // Chỉ fetch cột có trong PM system (bỏ: sku_ref, parents, product_type text, synced_at, dates)
  let q = supabaseAdmin.from("skus").select(
    "sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,call,expirations,frame,datapack,vendor_sku,vendor_sku_sim,latest_cogs,latest_cogs_currency",
    { count: "exact" }
  )

  if (search) q = (q as any).or(
    `sku_code.ilike.%${search}%,product_code.ilike.%${search}%,vendor_sku.ilike.%${search}%`
  )
  if (tenant) q = (q as any).eq("tenant", tenant)
  if (status) q = (q as any).eq("status", status)

  const pattern = buildLikePattern(pt, ptype, country, vendor, dtype, data, days)
  if (pattern) q = (q as any).like("sku_code", pattern)

  const from = (page - 1) * PAGE_SIZE
  const { data: rows, count, error } = await (q as any)
    .range(from, from + PAGE_SIZE - 1)
    .order("sku_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with product (cha) data: note/kyc/countries (cho list) + field chi tiết (cho modal Chi tiết)
  const productCodes = [...new Set((rows ?? []).map((r: any) => r.product_code).filter(Boolean))]
  let productMap: Record<string, any> = {}
  if (productCodes.length > 0) {
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("product_code, note, kyc_needed, supported_countries, product_type, vendor_code, operator_code, type_of_sim, purchase_type, network_type, apn, apn_original, local_phone_number, hotspot, activation_time")
      .in("product_code", productCodes as string[])
    productMap = Object.fromEntries(
      (products ?? []).map((p: any) => [p.product_code, p])
    )
  }

  // Build country name lookup from ref_countries
  const allCountryCodes = new Set<string>()
  for (const p of Object.values(productMap) as any[]) {
    if (p.supported_countries) {
      (p.supported_countries as string).split(/[,\s]+/).forEach((c: string) => { if (c) allCountryCodes.add(c.trim()) })
    }
  }
  let countryNameMap: Record<string, string> = {}
  if (allCountryCodes.size > 0) {
    const { data: cRows } = await supabaseAdmin
      .from("ref_countries")
      .select("code, name")
      .in("code", [...allCountryCodes])
    countryNameMap = Object.fromEntries((cRows ?? []).map((c: any) => [c.code, c.name]))
  }

  const enriched = (rows ?? []).map((r: any) => {
    const prod = productMap[r.product_code] ?? {}
    const codes = (prod.supported_countries ?? "")
    const names = codes
      ? codes.split(/[,\s]+/).filter(Boolean).map((c: string) => countryNameMap[c.trim()] || c.trim()).join(", ")
      : null
    return {
      ...r,
      note:                prod.note ?? null,
      kyc_needed:          prod.kyc_needed ?? null,
      supported_countries: codes || null,
      country_names:       names || null,
      // Field Product cha (tiền tố prod_*) — dùng cho modal Chi tiết tab gộp
      prod_product_type:       prod.product_type ?? null,
      prod_vendor_code:        prod.vendor_code ?? null,
      prod_operator_code:      prod.operator_code ?? null,
      prod_type_of_sim:        prod.type_of_sim ?? null,
      prod_purchase_type:      prod.purchase_type ?? null,
      prod_network_type:       prod.network_type ?? null,
      prod_apn:                prod.apn ?? null,
      prod_apn_original:       prod.apn_original ?? null,
      prod_local_phone_number: prod.local_phone_number ?? null,
      prod_hotspot:            prod.hotspot ?? null,
      prod_activation_time:    prod.activation_time ?? null,
    }
  })

  return NextResponse.json({ data: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE })
}
