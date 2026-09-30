import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { build } from "@/lib/bc-datapool/builder"
import { dropExisting } from "@/lib/bc-datapool/dedupe"
import { buildWorkbook } from "@/lib/bc-datapool/export"
import { DEFAULT_ASSUMPTIONS, type Assumptions, type ProductInput } from "@/lib/bc-datapool/types"
import { resolvePlans } from "@/lib/bc-datapool/plan-catalog"
import { FRAME_SKU } from "@/lib/bc-datapool/codes"
import { findExisting, loadFx, loadPlanCatalog, loadPriceList, loadWhiteSimVnd, requireAdmin } from "@/lib/bc-datapool/server"

export const dynamic = "force-dynamic"

/**
 * POST { products, assumptions } → bản xem trước (JSON: 4 sheet + bảng tính giá + cảnh báo).
 * POST ?format=xlsx → cùng dữ liệu nhưng trả file .xlsx đúng 4 sheet của template. Server tự tính lại
 * bằng tỷ giá nội bộ mới nhất nên file xuất luôn khớp với logic, không tin số client gửi lên.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const body = await req.json()
    const products: ProductInput[] = Array.isArray(body.products) ? body.products : []
    const a: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(body.assumptions ?? {}) }
    if (!products.length) return NextResponse.json({ error: "Chưa có sản phẩm nào" }, { status: 400 })

    const [list, fx, catalog] = await Promise.all([loadPriceList(), loadFx(), loadPlanCatalog()])
    if (!list) return NextResponse.json({ error: "Chưa upload bảng báo giá BC Datapool" }, { status: 400 })
    // Portal là nguồn sự thật về gói BC thực sự bán — chưa có file Portal thì KHÔNG cho tạo (tránh tạo gói BC không bán)
    if (!catalog) return NextResponse.json({ error: "Chưa upload file Portal (Purchase information) — không thể tạo sản phẩm khi chưa biết BC đang bán gói nào" }, { status: 400 })

    const resolved = resolvePlans(products, catalog)
    const hasSim = resolved.products.some(p => p.simType === "SIM")
    const whiteSimVnd = hasSim ? await loadWhiteSimVnd() : null
    const built = build(resolved.products, list, fx, a, { whiteSimVnd: whiteSimVnd ?? undefined })
    const warnings = built.warnings
    if (hasSim) {
      const frames = await findExisting("skus", "sku_code", [FRAME_SKU.VN])
      if (!frames.has(FRAME_SKU.VN)) warnings.push(`Khung SIM chưa có trong hệ thống: ${FRAME_SKU.VN} — tạo trước khi import SKU SIM full`)
    }
    warnings.unshift(...resolved.warnings)

    const [existProducts, existSkus] = await Promise.all([
      findExisting("products", "product_code", [...built.sheets.productUS, ...built.sheets.productVN].map(r => String(r[35]))),
      findExisting("skus", "sku_code", [...built.sheets.skuUS, ...built.sheets.skuVN].map(r => String(r[18]))),
    ])
    // SKU/Product đã có trong hệ thống: báo (kèm mã) và BỎ khỏi kết quả, phần còn lại tạo bình thường
    const { result: deduped, skipped } = dropExisting(built, existSkus, existProducts)
    const result = { ...deduped, warnings }
    const nothingNew = !result.sheets.skuUS.length && !result.sheets.skuVN.length

    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      if (nothingNew) return NextResponse.json({ error: "Tất cả SKU đã có trong hệ thống — không còn gì để tạo mới", skipped }, { status: 422 })
      if (result.warnings.some(w => /chưa nhập ProductID|không mã hoá được|trùng|thiếu|phải đúng|chưa có gói|chưa chọn|Portal không bán|không tìm thấy gói|Plan ID cho gói|không có trong file Portal|không khớp cấu hình/.test(w)) && body.force !== true)
        return NextResponse.json({ error: "Còn lỗi cần sửa trước khi xuất", warnings: result.warnings }, { status: 422 })
      // Ô giá là công thức Excel (trỏ sheet "Tính giá") để người dùng soát lại cách tính
      const wb = buildWorkbook(result, { fx, a, list, whiteSimVnd })
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bc_datapool_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      })
    }

    return NextResponse.json({ ...result, fx, skipped, nothingNew, planInfo: resolved.info, whiteSimVnd })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
