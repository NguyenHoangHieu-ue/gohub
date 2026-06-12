import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const search  = req.nextUrl.searchParams.get("search") || ""
  const page    = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"))
  const onlyHas = req.nextUrl.searchParams.get("only_has") === "1"

  let query = supabaseAdmin
    .from("products")
    .select("product_code, vendor_code, type_of_sim, supported_countries, telco_perks, status", { count: "exact" })
    .order("vendor_code")
    .order("product_code")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (search)  query = query.or(`product_code.ilike.%${search}%,vendor_code.ilike.%${search}%`)
  if (onlyHas) query = query.not("telco_perks", "is", null).neq("telco_perks", "")

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { product_code, telco_perks } = await req.json()
  if (!product_code)
    return NextResponse.json({ error: "product_code required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("products")
    .update({ telco_perks: telco_perks?.trim() || null })
    .eq("product_code", product_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
