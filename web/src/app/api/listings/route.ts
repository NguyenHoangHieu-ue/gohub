import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const PAGE_SIZE = 20

// Item 4: field mô tả listings đã vào JSONB `metadata`. Select core (cột) + metadata rồi flatten cho FE.
const SELECT_COLS = [
  "listing_code","reference_product_code","tenant","status","listing_type",
  "listing_name_vn","listing_name_en","type_of_sim","product_type","category_code",
  "metadata",
].join(",")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const page   = Math.max(1, parseInt(sp.get("page") || "1"))
  const search = sp.get("search") || ""
  const tenant = sp.get("tenant") || ""
  const status = sp.get("status") || ""
  const ltype  = sp.get("ltype")  || ""

  let q = supabaseAdmin.from("listings").select(SELECT_COLS, { count: "exact" })

  if (search) q = (q as any).or(
    `listing_code.ilike.%${search}%,reference_product_code.ilike.%${search}%,listing_name_vn.ilike.%${search}%,listing_name_en.ilike.%${search}%,metadata->>network_operator.ilike.%${search}%`
  )
  if (tenant) q = (q as any).eq("tenant", tenant)
  if (status) q = (q as any).eq("status", status)
  if (ltype)  q = (q as any).ilike("listing_type", `%${ltype}%`)

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await (q as any)
    .range(from, from + PAGE_SIZE - 1)
    .order("listing_code")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten metadata vào row → FE giữ nguyên (đọc field phẳng), nguồn là metadata.
  const rows = (data ?? []).map((r: any) => { const { metadata, ...core } = r; return { ...core, ...(metadata ?? {}) } })
  return NextResponse.json({ data: rows, total: count ?? 0, page, pageSize: PAGE_SIZE })
}
