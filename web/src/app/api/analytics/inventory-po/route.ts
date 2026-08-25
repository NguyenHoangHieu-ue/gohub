import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"

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

// GET ?company=VN|US — danh sách PO, mới nhất trước.
export async function GET(req: NextRequest) {
  try {
    await requireRead()
    const company = req.nextUrl.searchParams.get("company")
    let q = supabaseAdmin.from("inventory_po").select("*").order("created_at", { ascending: false })
    if (company) q = q.eq("company_code", company)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST — tạo PO mới
export async function POST(req: NextRequest) {
  try {
    const session = await requireWrite()
    const body = await req.json() as Record<string, unknown> & { vendor: string; sku_code: string; qty: number }
    if (!body.vendor || !body.sku_code || !body.qty)
      return NextResponse.json({ error: "vendor, sku_code, qty required" }, { status: 400 })

    const email = session.user.name ?? session.user.email ?? ""
    const { error } = await supabaseAdmin.from("inventory_po").insert({
      vendor: body.vendor,
      sku_code: body.sku_code,
      qty: body.qty,
      company_code: body.company_code ?? null,
      expected_stockout_date: body.expected_stockout_date ?? null,
      need_by_date: body.need_by_date ?? null,
      payment_deadline: body.payment_deadline ?? null,
      expected_arrival_date: body.expected_arrival_date ?? null,
      payment_status: body.payment_status ?? "Chưa thanh toán",
      payment_date: body.payment_date ?? null,
      delivery_status: body.delivery_status ?? "Chờ thanh toán",
      expected_arrival_week: body.expected_arrival_week ?? null,
      note: body.note ?? null,
      created_by: email,
      updated_by: email,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH — batch upsert nhiều dòng PO cùng lúc (edit-mode Save hàng loạt), mỗi item cần id.
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireWrite()
    const { updates } = await req.json() as { updates: Array<Record<string, unknown> & { id: number }> }
    if (!Array.isArray(updates) || !updates.length)
      return NextResponse.json({ error: "updates required" }, { status: 400 })

    const now = new Date().toISOString()
    const email = session.user.name ?? session.user.email ?? ""
    const rows = updates.map(u => ({ ...u, updated_by: email, updated_at: now }))

    const { error } = await supabaseAdmin.from("inventory_po").upsert(rows, { onConflict: "id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// DELETE — xoá 1 PO theo id
export async function DELETE(req: NextRequest) {
  try {
    await requireWrite()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const { error } = await supabaseAdmin.from("inventory_po").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
