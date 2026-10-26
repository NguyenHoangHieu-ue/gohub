import { NextResponse } from "next/server"
import { loadPlanCatalog, loadPriceList, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"

/** Toàn bộ dữ liệu nền BC Datapool đã import (bảng báo giá + danh mục gói Portal) cho tab quản lý BC Datapool. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const [priceList, catalog] = await Promise.all([loadPriceList(), loadPlanCatalog()])
    return NextResponse.json({ priceList, catalog })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
