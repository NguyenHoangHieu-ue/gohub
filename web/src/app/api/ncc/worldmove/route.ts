import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50
const canSeeCost = (role?: string) => role === "admin" || role === "manager"

function stripCost(rows: any[], role?: string) {
  if (canSeeCost(role)) return rows
  return rows.map(r => ({ ...r, cogs: null, cogs_currency: null }))
}

/** Enrich in_system products with full sku rows from skus table */
async function enrichWithSku(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const ids = rows.map((r: any) => r.vendor_product_id).filter(Boolean)
  const { data: skuRows } = await (supabaseAdmin.from("skus") as any)
    .select("sku_code,vendor_sku,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,call,expirations,frame,datapack,latest_cogs,latest_cogs_currency")
    .in("vendor_sku", ids)
    .limit(ids.length * 3 + 10)

  // Also get product enrichment for those skus
  const productCodes = [...new Set((skuRows ?? []).map((s: any) => s.sku_code?.slice(0, 8)).filter(Boolean))]
  let productMap: Record<string, any> = {}
  if (productCodes.length) {
    const { data: prods } = await (supabaseAdmin.from("products") as any)
      .select("product_code,note,kyc_needed,supported_countries")
      .in("product_code", productCodes)
    for (const p of prods ?? [])
      productMap[p.product_code] = p
  }

  const skuMap: Record<string, any[]> = {}
  for (const s of skuRows ?? []) {
    const prod = productMap[s.sku_code?.slice(0, 8)] ?? {}
    const enriched = { ...s, note: prod.note ?? null, kyc_needed: prod.kyc_needed ?? null, supported_countries: prod.supported_countries ?? null }
    if (!skuMap[s.vendor_sku]) skuMap[s.vendor_sku] = []
    skuMap[s.vendor_sku].push(enriched)
  }
  return rows.map((r: any) => ({
    ...r,
    system_skus: skuMap[r.vendor_product_id] ?? [],
  }))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role    = (session.user as any).role as string | undefined
  const sp      = req.nextUrl.searchParams
  const page    = Math.max(1, parseInt(sp.get("page") || "1"))
  const search  = sp.get("search")       || ""
  const simType = sp.get("sim_type")     || ""
  const region  = sp.get("region")       || ""
  const isLesim = sp.get("is_lesim")     || ""
  const isUnlim = sp.get("is_unlimited") || ""
  const days    = sp.get("days")         || ""
  const dataMin = sp.get("data_min")     || ""
  const dataMax = sp.get("data_max")     || ""
  const gap     = sp.get("gap") || "all"
  const offset  = (page - 1) * PAGE_SIZE

  // ── Gap analysis ─────────────────────────────────────────────────────────
  if (gap !== "all") {
    const { data: sysRows } = await (supabaseAdmin.from("skus") as any)
      .select("vendor_sku")
      .ilike("vendor_sku", "WM-%")
      .limit(2000)
    const sysSkus = (sysRows ?? []).map((r: any) => r.vendor_sku as string).filter(Boolean)
    const sysSet  = new Set(sysSkus)

    if (gap === "in_system") {
      if (!sysSkus.length)
        return NextResponse.json({ data: [], total: 0, page, pageSize: PAGE_SIZE })

      const { data, count, error } = await (supabaseAdmin.from("ncc_products") as any)
        .select("*", { count: "exact" })
        .eq("vendor", "WORLDMOVE")
        .in("vendor_product_id", sysSkus)
        .range(offset, offset + PAGE_SIZE - 1)
        .order("vendor_product_id")

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const enriched = await enrichWithSku(data ?? [])
      return NextResponse.json({
        data: stripCost(enriched, role), total: count ?? 0, page, pageSize: PAGE_SIZE,
      })
    }

    // not_in_system: batch-fetch all IDs, filter, paginate
    const allIds: string[] = []
    for (let off = 0; ; off += 1000) {
      const { data } = await (supabaseAdmin.from("ncc_products") as any)
        .select("vendor_product_id").eq("vendor", "WORLDMOVE").range(off, off + 999)
      if (!data || !data.length) break
      allIds.push(...data.map((r: any) => r.vendor_product_id as string))
      if (data.length < 1000) break
    }
    const notInIds = allIds.filter(id => !sysSet.has(id))
    const total    = notInIds.length
    const pageIds  = notInIds.slice(offset, offset + PAGE_SIZE)
    if (!pageIds.length)
      return NextResponse.json({ data: [], total, page, pageSize: PAGE_SIZE })

    const { data, error } = await (supabaseAdmin.from("ncc_products") as any)
      .select("*").in("vendor_product_id", pageIds).order("vendor_product_id")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: stripCost(data ?? [], role), total, page, pageSize: PAGE_SIZE })
  }

  // ── Normal catalog (gap=all) ──────────────────────────────────────────────
  let q = (supabaseAdmin.from("ncc_products") as any)
    .select("*", { count: "exact" })
    .eq("vendor", "WORLDMOVE")

  if (search)   q = q.or(`vendor_product_id.ilike.%${search}%,product_name.ilike.%${search}%,region.ilike.%${search}%`)
  if (simType)  q = q.eq("sim_type", simType)
  if (region)   q = q.ilike("region", `%${region}%`)
  if (isLesim)  q = q.eq("is_lesim", isLesim === "true")
  if (isUnlim)  q = q.eq("is_unlimited", isUnlim === "true")
  if (days)     q = q.eq("days", parseInt(days))
  if (dataMin)  q = q.gte("data_gb", parseFloat(dataMin))
  if (dataMax)  q = q.lte("data_gb", parseFloat(dataMax))

  const { data, count, error } = await q
    .range(offset, offset + PAGE_SIZE - 1)
    .order("vendor_product_id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: stripCost(data ?? [], role), total: count ?? 0, page, pageSize: PAGE_SIZE })
}
