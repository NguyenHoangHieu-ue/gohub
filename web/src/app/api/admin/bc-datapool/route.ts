import { NextResponse } from "next/server"
import { loadAssumptions } from "@/lib/bc-datapool/server"
import { catalogSummary, loadFx, loadPlanCatalog, loadPriceList, loadSupportCountries, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"

/** Dữ liệu nền cho màn "Tạo sản phẩm": bảng báo giá đã lưu, tỷ giá nội bộ, danh sách nước/nhóm nước GoHub. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const [priceList, supportCountries, catalog] = await Promise.all([loadPriceList(), loadSupportCountries(), loadPlanCatalog()])
    let fx = null, fxError: string | null = null
    try { fx = await loadFx() } catch (e) { fxError = (e as Error).message }
    // Gửi kèm các gói Portal (bỏ tên, ~100KB) để form chỉ cho chọn đúng khu vực/dung lượng/ngày BC thực sự bán
    const portalPlans = catalog?.plans.map(p => ({ id: p.id, sim: p.sim, kind: p.kind, name: p.name, countries: p.countries, amount: p.amount, unit: p.unit, pool: p.pool, throttleKbps: p.throttleKbps, days: p.days })) ?? null
    return NextResponse.json({ priceList, planCatalog: catalogSummary(catalog), portalPlans, supportCountries, fx, fxError, assumptions: await loadAssumptions() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
