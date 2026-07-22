import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"

// POST /api/admin/init-b2b-cost-table
// Tạo bảng b2b_customer_cost_monthly trên Turso nếu chưa có.
// Chạy 1 lần sau khi deploy (admin only).

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    await ensureB2bCostTable()
    return NextResponse.json({ ok: true, message: "Bảng b2b_customer_cost_monthly đã sẵn sàng trên Turso" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
