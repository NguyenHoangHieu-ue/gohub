import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { dropExisting } from "@/lib/bc-datapool/dedupe"
import { findExisting, loadAssumptions, loadFx, loadRefCountries, loadSupportCountries, requireAdmin } from "@/lib/bc-datapool/server"
import type { Assumptions, SimType } from "@/lib/bc-datapool/types"
import { build, type ThkPlanInput } from "@/lib/threehk-datapool/builder"
import { buildWorkbook } from "@/lib/threehk-datapool/export"
import { priceOf, resolveSupport } from "@/lib/threehk-datapool/resolve"
import { loadFrames, loadNcc3hk, loadTemplates } from "@/lib/threehk-datapool/server"

export const dynamic = "force-dynamic"

interface Body {
  products?: { simType: SimType; countries: string[]; codeOverride?: string; usSimFull?: boolean; vnEsimData?: boolean; plans: ThkPlanInput[] }[]
  assumptions?: Partial<Assumptions>
  force?: boolean
}

/**
 * POST { products, assumptions } → bản xem trước (JSON: 4 sheet + bảng tính giá + cảnh báo).
 * POST ?format=xlsx → cùng dữ liệu nhưng trả file .xlsx (4 sheet template + sheet "Tính giá" công thức).
 * Server tự tính lại bằng tỷ giá/giá khung mới nhất — không tin số client gửi lên.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const body = (await req.json()) as Body
    const inputs = Array.isArray(body.products) ? body.products : []
    if (!inputs.length) return NextResponse.json({ error: "Chưa có sản phẩm nào" }, { status: 400 })
    const a: Assumptions = { ...(await loadAssumptions()), ...(body.assumptions ?? {}) }

    const [fx, ncc, groups, refs, frames] = await Promise.all([loadFx(), loadNcc3hk(), loadSupportCountries(), loadRefCountries(), loadFrames()])
    const resolved = inputs.map(p => {
      const s = resolveSupport(p.countries ?? [], groups, refs)
      return { s, code: p.codeOverride?.trim().toUpperCase() || s.code }
    })
    const tpls = await loadTemplates(resolved.map(r => r.code))
    const built = build(inputs.map((p, i) => ({
      input: { simType: p.simType, supportCountryCode: resolved[i].code, isoCodes: resolved[i].s.iso, countryNameEn: resolved[i].s.en, countryNameVn: resolved[i].s.vn, plans: p.plans ?? [], usSimFull: !!p.usSimFull, vnEsimData: !!p.vnEsimData },
      price: priceOf(ncc, p.countries ?? []),
      tpls: tpls[resolved[i].code] ?? [],
    })), { fx, a, frames })

    const [existProducts, existSkus] = await Promise.all([
      findExisting("products", "product_code", [...built.sheets.productUS, ...built.sheets.productVN].map(r => String(r[35]))),
      findExisting("skus", "sku_code", [...built.sheets.skuUS, ...built.sheets.skuVN].map(r => String(r[20]))),
    ])
    const { result: deduped, skipped } = dropExisting(built, existSkus, existProducts)
    const result = { ...deduped, warnings: built.warnings }
    const nothingNew = !result.sheets.skuUS.length && !result.sheets.skuVN.length

    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      if (nothingNew) return NextResponse.json({ error: "Tất cả SKU đã có trong hệ thống — không còn gì để tạo mới", skipped }, { status: 422 })
      if (result.warnings.some(w => /không mã hoá được|trùng|thiếu|phải đúng|chưa có gói|chưa chọn|chưa nhập|chưa có hệ số|chỉ có mức/.test(w)) && body.force !== true)
        return NextResponse.json({ error: "Còn lỗi cần sửa trước khi xuất", warnings: result.warnings }, { status: 422 })
      const buf = XLSX.write(buildWorkbook(result, { fx, a, frames }), { type: "buffer", bookType: "xlsx" }) as Buffer
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="3hk_datapool_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      })
    }
    return NextResponse.json({ ...result, fx, skipped, nothingNew, supports: resolved.map(r => ({ code: r.code, hint: r.s.hint })), frames })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
