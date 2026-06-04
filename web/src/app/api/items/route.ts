import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p          = req.nextUrl.searchParams
  const status     = p.get("status")     || "Active"
  const tenant     = p.get("tenant")     || ""
  const channel    = p.get("channel")    || ""
  const itemType   = p.get("itemType")   || ""
  const priceList  = p.get("priceList")  || ""
  const minPrice   = p.get("minPrice")   || ""
  const maxPrice   = p.get("maxPrice")   || ""
  const minDays    = p.get("minDays")    || ""
  const maxDays    = p.get("maxDays")    || ""
  const search     = p.get("search")     || ""
  const page       = Math.max(1, Number(p.get("page") || "1"))

  let q = supabaseAdmin.from("items").select("*", { count: "exact" })

  if (status)    q = q.eq("status", status)
  if (channel)   q = q.eq("channel", channel)
  if (itemType)  q = q.eq("item_type", itemType)
  if (priceList) q = q.eq("price_list", priceList)
  if (tenant)    q = q.ilike("item_type", `${tenant}%`)
  if (minPrice)  q = q.gte("unitprice", Number(minPrice))
  if (maxPrice)  q = q.lte("unitprice", Number(maxPrice))
  if (minDays)   q = q.gte("day_amount", Number(minDays))
  if (maxDays)   q = q.lte("day_amount", Number(maxDays))
  if (search)    q = q.or(`item_name_vn.ilike.%${search}%,item_code.ilike.%${search}%,sku_code.ilike.%${search}%`)

  const from = (page - 1) * PAGE_SIZE
  q = q.range(from, from + PAGE_SIZE - 1).order("item_code")

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data:     data ?? [],
    count:    count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    pages:    Math.ceil((count ?? 0) / PAGE_SIZE),
  })
}
