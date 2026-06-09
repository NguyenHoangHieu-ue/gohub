import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 20

const SELECT_COLS = [
  "product_code","tenant","status","product_type","vendor_code","type_of_sim",
  "kyc_code","kyc_needed","local_phone_number","purchase_type",
  "operator_code","network_type","apn","apn_original","note","supported_countries",
  "activation_time","hotspot","data_plan_type",
].join(",")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const page   = Math.max(1, parseInt(sp.get("page") || "1"))
  const search = sp.get("search") || ""
  const tenant = sp.get("tenant") || ""
  const status = sp.get("status") || ""

  let q = supabaseAdmin.from("products").select(SELECT_COLS, { count: "exact" })

  if (search) q = (q as any).or(
    `product_code.ilike.%${search}%,vendor_code.ilike.%${search}%,operator_code.ilike.%${search}%,country_group.ilike.%${search}%`
  )
  if (tenant) q = (q as any).eq("tenant", tenant)
  if (status) q = (q as any).eq("status", status)

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await (q as any)
    .range(from, from + PAGE_SIZE - 1)
    .order("product_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
