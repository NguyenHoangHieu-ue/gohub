import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const search  = req.nextUrl.searchParams.get("search") || ""
  const page    = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"))
  const onlyHas = req.nextUrl.searchParams.get("only_has") === "1"

  let query = supabaseAdmin
    .from("products")
    .select("product_code, vendor_code, type_of_sim, supported_countries, telco_perks, telco_perks_start, telco_perks_end, status", { count: "exact" })
    .order("vendor_code")
    .order("product_code")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (search)  query = query.or(`product_code.ilike.%${search}%,vendor_code.ilike.%${search}%`)
  if (onlyHas) query = query.not("telco_perks", "is", null).neq("telco_perks", "")

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich với sku_codes per product
  let enriched = data ?? []
  if (enriched.length > 0) {
    const codes = enriched.map((d: any) => d.product_code)
    const { data: skuRows } = await supabaseAdmin
      .from("skus")
      .select("product_code, sku_code")
      .in("product_code", codes)
    const skuMap: Record<string, string[]> = {}
    for (const s of (skuRows ?? [])) {
      if (!skuMap[s.product_code]) skuMap[s.product_code] = []
      skuMap[s.product_code].push(s.sku_code)
    }
    enriched = enriched.map((p: any) => ({ ...p, sku_codes: skuMap[p.product_code] ?? [] }))
  }

  return NextResponse.json({ data: enriched, total: count ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { product_code, telco_perks, telco_perks_start, telco_perks_end } = await req.json()
  if (!product_code)
    return NextResponse.json({ error: "product_code required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("products")
    .update({
      telco_perks:       telco_perks?.trim()       || null,
      telco_perks_start: telco_perks_start         || null,
      telco_perks_end:   telco_perks_end           || null,
    })
    .eq("product_code", product_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
