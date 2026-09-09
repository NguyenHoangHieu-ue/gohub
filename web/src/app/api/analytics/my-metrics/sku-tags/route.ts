import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import { isQuarterLocked } from "@/lib/okr-helpers"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]
const SKU_RE = /^[A-Za-z0-9_.-]{2,60}$/

// Ghi chú TUỲ CHỌN gắn vào 1 dòng SKU trong bảng auto-scan (xem /sku-scan) — vd giải thích lý do
// margin đổi ("renegotiate rate WM", "SKU mới thay NCC rẻ hơn"...). KHÔNG còn quyết định số KPI
// (số đó nay tính tự động cho TOÀN BỘ SKU trong sku-scan) — chỉ còn là annotation cho dễ đọc.

// GET ?quarter=Q3-2026 — trả map sku_code -> note (đủ để FE gắn vào bảng scan)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const { data, error } = await supabaseAdmin
    .from("okr_sku_tags").select("*").eq("quarter", quarter).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ quarter, items: data ?? [], locked: isQuarterLocked(quarter) })
}

// POST — gắn/sửa ghi chú cho 1 SKU trong quý
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    quarter: string; sku_code: string; note?: string; evidence_image_url?: string
  }
  if (!body.quarter || !body.sku_code) {
    return NextResponse.json({ error: "quarter, sku_code required" }, { status: 400 })
  }
  const skuCode = body.sku_code.trim().toUpperCase()
  if (!SKU_RE.test(skuCode)) return NextResponse.json({ error: "Mã SKU không hợp lệ" }, { status: 400 })
  if (isQuarterLocked(body.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể sửa ghi chú." }, { status: 403 })
  }

  const name = session.user.name ?? session.user.email ?? session.user.username
  const { error } = await supabaseAdmin.from("okr_sku_tags").upsert({
    quarter: body.quarter, sku_code: skuCode, note: body.note || null,
    evidence_image_url: body.evidence_image_url || null,
    created_by: name, updated_by: name, updated_at: new Date().toISOString(),
  }, { onConflict: "quarter,sku_code" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id=uuid
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: rec } = await supabaseAdmin.from("okr_sku_tags").select("quarter").eq("id", id).maybeSingle()
  if (rec && isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể xoá." }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("okr_sku_tags").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
