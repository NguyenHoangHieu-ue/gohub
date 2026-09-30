import { NextResponse } from "next/server"
import { DEFAULT_ASSUMPTIONS } from "@/lib/bc-datapool/types"
import { loadFx, loadPriceList, loadSupportCountries, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"

/** Dữ liệu nền cho màn "Tạo sản phẩm": bảng báo giá đã lưu, tỷ giá nội bộ, danh sách nước/nhóm nước GoHub. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const [priceList, supportCountries] = await Promise.all([loadPriceList(), loadSupportCountries()])
    let fx = null, fxError: string | null = null
    try { fx = await loadFx() } catch (e) { fxError = (e as Error).message }
    return NextResponse.json({ priceList, supportCountries, fx, fxError, assumptions: DEFAULT_ASSUMPTIONS })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
