import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page   = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const search = searchParams.get("search") || ""
  const tenant = searchParams.get("tenant") || ""
  const status = searchParams.get("status") || ""

  let q = supabaseAdmin.from("skus").select("*", { count: "exact" })

  if (search) q = (q as any).or(
    `sku_code.ilike.%${search}%,product_code.ilike.%${search}%,vendor_sku.ilike.%${search}%`
  )
  if (tenant) q = (q as any).eq("tenant", tenant)
  if (status) q = (q as any).eq("status", status)

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await (q as any)
    .range(from, from + PAGE_SIZE - 1)
    .order("sku_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
