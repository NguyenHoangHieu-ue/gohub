import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"

// POST /api/admin/init-b2b-cost-table
// Tạo bảng b2b_customer_cost_monthly trên Turso nếu chưa có.
// Chạy 1 lần sau khi deploy (admin only).

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { searchParams } = req.nextUrl
    const body = await req.json().catch(() => ({}))
    const force = searchParams.get("force") === "1" || body?.force === true
    await ensureB2bCostTable(force)
    return NextResponse.json({ ok: true, message: force ? "Bảng b2b_customer_cost_monthly đã được tạo lại trên Turso (force=true)" : "Bảng b2b_customer_cost_monthly đã sẵn sàng trên Turso" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
