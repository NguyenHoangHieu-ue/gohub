import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 20

const SELECT_COLS = [
  "item_code","alias","sku_code","listing_code","tenant",
  "status","item_type","sales_channel","category_code",
  "item_name_vn","item_name_en",
  "day_amount","day_amount_unit","data_amount","data_amount_unit",
  "throttle_speed_en","call_en",
  "unitprice","currency",
].join(",")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp       = req.nextUrl.searchParams
  const page     = Math.max(1, parseInt(sp.get("page") || "1"))
  const search   = sp.get("search")    || ""
  const tenant   = sp.get("tenant")    || ""
  const status   = sp.get("status")    || "Active"
  const itemType = sp.get("item_type") || ""   // exact match từ dropdown

  let q = supabaseAdmin.from("items").select(SELECT_COLS, { count: "exact" })

  if (search) q = (q as any).or(
    `item_code.ilike.%${search}%,alias.ilike.%${search}%,sku_code.ilike.%${search}%,listing_code.ilike.%${search}%,item_name_vn.ilike.%${search}%`
  )
  if (tenant)   q = (q as any).eq("tenant", tenant)
  if (status)   q = (q as any).eq("status", status)
  if (itemType) q = (q as any).eq("item_type", itemType)   // eq (dropdown chọn chính xác)

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await (q as any)
    .range(from, from + PAGE_SIZE - 1)
    .order("item_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
