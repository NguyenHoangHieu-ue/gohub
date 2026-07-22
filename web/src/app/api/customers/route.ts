import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { searchCustomerNames } from "@/lib/customer-cache"

// Search customer names từ Supabase dim_customer_cache — không phụ thuộc JOIN gohub_dw.
// Cần sync trước bằng POST /api/admin/sync-dim-customer (nút trong Settings).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""

  try {
    const names = await searchCustomerNames(q)
    return NextResponse.json(names)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
