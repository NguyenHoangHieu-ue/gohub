import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
import { canWriteTab } from "@/lib/writable-tabs"
import { fetchBefore, logRowEdits } from "@/lib/manual-history/wire"
import { recordEdit } from "@/lib/manual-history/store"

const READ_ROLES  = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]
const WRITE_ROLES = ["admin", "creator", "manager", "staff"]

async function requireRead() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role)) throw new Error("Unauthorized")
  return session
}

async function requireWrite() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error("Unauthorized")
  const ok = await canWriteTab(session.user.username, "fulfillment", WRITE_ROLES)
  if (!ok) throw new Error("Forbidden")
  return session
}

// GET — danh sách SKU đang theo dõi (watchlist), lọc theo company_code nếu truyền.
export async function GET(req: NextRequest) {
  try {
    await requireRead()
    const company = req.nextUrl.searchParams.get("company")
    let q = supabaseAdmin.from("inventory_plan_skus").select("*").order("company_code").order("sku_code")
    if (company) q = q.eq("company_code", company)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST — thêm SKU mới vào watchlist
export async function POST(req: NextRequest) {
  try {
    const session = await requireWrite()
    const body = await req.json() as {
      sku_code: string; company_code: string; vendor?: string
      target_weeks_coverage?: number; safety_weeks?: number; lead_time_weeks?: number; note?: string
    }
    if (!body.sku_code || !body.company_code)
      return NextResponse.json({ error: "sku_code, company_code required" }, { status: 400 })

    let vendor = body.vendor ?? ""
    if (!vendor) {
      try {
        const rows = await queryAnalytics<{ vendor: string }>(`
          SELECT vendor FROM dim_sku WHERE TRIM(sku) = '${body.sku_code.replace(/'/g, "''")}' LIMIT 1
        `)
        vendor = rows[0]?.vendor ?? ""
      } catch {}
    }

    const skuRow = {
      sku_code:              body.sku_code,
      company_code:          body.company_code,
      vendor,
      target_weeks_coverage: body.target_weeks_coverage ?? 8,
      safety_weeks:          body.safety_weeks ?? 3,
      lead_time_weeks:       body.lead_time_weeks ?? 4,
      note:                  body.note ?? null,
      created_by:            session.user.email ?? "",
    }
    const { error } = await supabaseAdmin.from("inventory_plan_skus").insert(skuRow)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recordEdit({ table: "inventory_plan_skus", key: body.sku_code, label: `SKU theo dõi tồn ${body.sku_code}`, before: null, after: skuRow, user: session.user.email ?? "web", source: "POST /analytics/inventory-plan/skus", ignore: ["created_by"] })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH — sửa cấu hình SKU (vendor, target_weeks_coverage, safety_weeks, lead_time_weeks, note, is_active)
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireWrite()
    const body = await req.json() as {
      sku_code: string; vendor?: string; target_weeks_coverage?: number
      safety_weeks?: number; lead_time_weeks?: number; note?: string | null; is_active?: boolean
    }
    if (!body.sku_code) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    const { sku_code, ...fields } = body
    const before = await fetchBefore("inventory_plan_skus", ["sku_code"], [{ sku_code }])   // số cũ để ghi lịch sử sửa tay
    const { error } = await supabaseAdmin
      .from("inventory_plan_skus")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("sku_code", sku_code)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logRowEdits({ table: "inventory_plan_skus", pk: ["sku_code"], rows: [{ sku_code, ...fields }], before, user: session.user.email ?? "web", source: "PATCH /analytics/inventory-plan/skus", label: () => `SKU theo dõi tồn ${sku_code}` })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// DELETE — bỏ SKU khỏi watchlist (cascade xoá luôn dữ liệu tuần)
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireWrite()
    const { sku_code } = await req.json()
    if (!sku_code) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    const old = (await fetchBefore("inventory_plan_skus", ["sku_code"], [{ sku_code }])).get(String(sku_code)) ?? null   // lưu lại cấu hình cũ trước khi xoá (dữ liệu tuần đi kèm bị xoá theo, không khôi phục được)
    const { error } = await supabaseAdmin.from("inventory_plan_skus").delete().eq("sku_code", sku_code)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recordEdit({ table: "inventory_plan_skus", key: String(sku_code), label: `SKU theo dõi tồn ${sku_code} (bỏ khỏi danh sách, kèm dữ liệu tuần)`, before: old, after: null, user: session.user.email ?? "web", source: "DELETE /analytics/inventory-plan/skus" })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
