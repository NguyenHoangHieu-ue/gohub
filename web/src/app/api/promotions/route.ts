import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const vendor   = req.nextUrl.searchParams.get("vendor")   || ""
  const sim_type = req.nextUrl.searchParams.get("sim_type") || ""

  let query = supabaseAdmin
    .from("products")
    .select("product_code, vendor_code, type_of_sim, product_type, supported_countries, telco_perks, telco_perks_start, telco_perks_end, tenant, status")
    .not("telco_perks", "is", null)
    .neq("telco_perks", "")
    .order("vendor_code")
    .order("product_code")

  if (vendor)   query = query.eq("vendor_code", vendor)
  if (sim_type) query = query.eq("type_of_sim", sim_type)

  const { data: products, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!products?.length) return NextResponse.json({ data: [] })

  // Fetch listing perks for these products
  const codes = products.map(p => p.product_code)
  // Item 4: telco_perks đã vào JSONB metadata.
  const { data: listings } = await supabaseAdmin
    .from("listings")
    .select("reference_product_code, listing_name_vn, metadata")
    .in("reference_product_code", codes)
    .or("metadata->>telco_perks_en.not.is.null,metadata->>telco_perks_vn.not.is.null")

  // Map: product_code → first listing with perks
  const listingMap: Record<string, { listing_name_vn: string | null; telco_perks_en: string | null; telco_perks_vn: string | null }> = {}
  for (const l of (listings ?? []) as any[]) {
    if (!listingMap[l.reference_product_code]) {
      listingMap[l.reference_product_code] = {
        listing_name_vn: l.listing_name_vn,
        telco_perks_en:  l.metadata?.telco_perks_en ?? null,
        telco_perks_vn:  l.metadata?.telco_perks_vn ?? null,
      }
    }
  }

  const data = products.map(p => ({
    ...p,
    listing_name_vn: listingMap[p.product_code]?.listing_name_vn ?? null,
    telco_perks_en:  listingMap[p.product_code]?.telco_perks_en  ?? null,
    telco_perks_vn:  listingMap[p.product_code]?.telco_perks_vn  ?? null,
  }))

  return NextResponse.json({ data })
}
