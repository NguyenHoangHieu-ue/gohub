import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { build, withHeaders } from "@/lib/bc-datapool/builder"
import { DEFAULT_ASSUMPTIONS, type Assumptions, type ProductInput } from "@/lib/bc-datapool/types"
import { findExisting, loadFx, loadPriceList, requireAdmin } from "@/lib/bc-datapool/server"

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

    const [list, fx] = await Promise.all([loadPriceList(), loadFx()])
    if (!list) return NextResponse.json({ error: "Chưa upload bảng báo giá BC Datapool" }, { status: 400 })

    const result = build(products, list, fx, a)

    const [existProducts, existSkus] = await Promise.all([
      findExisting("products", "product_code", [...result.sheets.productUS, ...result.sheets.productVN].map(r => String(r[35]))),
      findExisting("skus", "sku_code", [...result.sheets.skuUS, ...result.sheets.skuVN].map(r => String(r[18]))),
    ])
    const existing = { products: Array.from(existProducts), skus: Array.from(existSkus) }
    if (existing.products.length) result.warnings.push(`Product Code đã có trong hệ thống: ${existing.products.join(", ")}`)
    if (existing.skus.length) result.warnings.push(`${existing.skus.length} SKU đã có trong hệ thống (ví dụ ${existing.skus.slice(0, 3).join(", ")}) — xuất lên sẽ bị trùng`)

    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      if (result.warnings.some(w => /chưa nhập ProductID|không mã hoá được|trùng|thiếu|phải đúng|chưa có gói|chưa chọn/.test(w)) && body.force !== true)
        return NextResponse.json({ error: "Còn lỗi cần sửa trước khi xuất", warnings: result.warnings }, { status: 422 })
      const wb = XLSX.utils.book_new()
      for (const [name, rows] of Object.entries(withHeaders(result.sheets)))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bc_datapool_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      })
    }

    return NextResponse.json({ ...result, fx, existing })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
