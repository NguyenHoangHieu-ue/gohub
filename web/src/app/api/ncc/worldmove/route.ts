import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp        = req.nextUrl.searchParams
  const page      = Math.max(1, parseInt(sp.get("page") || "1"))
  const search    = sp.get("search")   || ""
  const simType   = sp.get("sim_type") || ""
  const region    = sp.get("region")   || ""
  const isLesim   = sp.get("is_lesim") || ""
  const isUnlim   = sp.get("is_unlimited") || ""
  // gap: "all" | "in_system" | "not_in_system"
  const gap       = sp.get("gap") || "all"

  const offset = (page - 1) * PAGE_SIZE

  if (gap !== "all") {
    // Use RPC for gap-filtered queries (server-side, joins with skus)
    const inSystem = gap === "in_system"
    const [{ data, error }, { data: countData, error: countError }] = await Promise.all([
      supabaseAdmin.rpc("get_ncc_gap", {
        p_vendor:    "WORLDMOVE",
        p_in_system: inSystem,
        p_offset:    offset,
        p_limit:     PAGE_SIZE,
      }),
      supabaseAdmin.rpc("count_ncc_gap", {
        p_vendor:    "WORLDMOVE",
        p_in_system: inSystem,
      }),
    ])
    if (error || countError)
      return NextResponse.json({ error: (error || countError)?.message }, { status: 500 })

    return NextResponse.json({
      data:     data ?? [],
      total:    countData ?? 0,
      page,
      pageSize: PAGE_SIZE,
    })
  }

  // Normal paginated query (gap=all)
  let q = (supabaseAdmin.from("ncc_products") as any)
    .select("*", { count: "exact" })
    .eq("vendor", "WORLDMOVE")

  if (search)
    q = q.or(`vendor_product_id.ilike.%${search}%,vendor_internal_id.ilike.%${search}%,product_name.ilike.%${search}%,region.ilike.%${search}%`)
  if (simType)   q = q.eq("sim_type", simType)
  if (region)    q = q.ilike("region", `%${region}%`)
  if (isLesim)   q = q.eq("is_lesim", isLesim === "true")
  if (isUnlim)   q = q.eq("is_unlimited", isUnlim === "true")

  const { data, count, error } = await q
    .range(offset, offset + PAGE_SIZE - 1)
    .order("vendor_product_id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data:     data ?? [],
    total:    count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  })
}
