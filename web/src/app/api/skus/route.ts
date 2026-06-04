import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

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

  let q = supabaseAdmin.from("skus").select("*", { count: "exact" })

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

  // Enrich with note from products table
  const productCodes = [...new Set((rows ?? []).map((r: any) => r.product_code).filter(Boolean))]
  let noteMap: Record<string, string> = {}
  if (productCodes.length > 0) {
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("product_code, note")
      .in("product_code", productCodes as string[])
    noteMap = Object.fromEntries((products ?? []).map((p: any) => [p.product_code, p.note]))
  }

  const enriched = (rows ?? []).map((r: any) => ({ ...r, note: noteMap[r.product_code] || null }))

  return NextResponse.json({ data: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE })
}
