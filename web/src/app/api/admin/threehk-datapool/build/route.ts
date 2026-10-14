import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { dropExisting } from "@/lib/bc-datapool/dedupe"
import { findExisting, findSkuCogs, loadAssumptions, loadFx, loadRefCountries, loadSupportCountries, requireAdmin } from "@/lib/bc-datapool/server"
import type { Assumptions, SimType } from "@/lib/bc-datapool/types"
import { build, type ThkPlanInput } from "@/lib/threehk-datapool/builder"
import { buildWorkbook } from "@/lib/threehk-datapool/export"
import { sameSetGroups, sameSetWarning } from "@/lib/bc-datapool/iso"
import { applyEdits, sanitizeEdits } from "@/lib/datapool-audit/edits"
import { coveredGroups, priceOf, resolveSupport } from "@/lib/threehk-datapool/resolve"
import { loadFrames, loadNcc3hk, loadTemplates } from "@/lib/threehk-datapool/server"

export const dynamic = "force-dynamic"

interface Body {
  products?: { simType: SimType; countries: string[]; codeOverride?: string; usSimFull?: boolean; vnEsimData?: boolean; plans: ThkPlanInput[] }[]
  assumptions?: Partial<Assumptions>
  force?: boolean
  edits?: unknown
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
    // Cảnh báo (không tự đoán): nhiều nhóm nước hỗ trợ cùng tập nước · nước đơn chưa có Product 3HK nhưng đang bán trong 1 nhóm (vd Australia/New Zealand → ANZ)
    const extra: string[] = []
    const covered = coveredGroups(ncc, groups, refs)
    const groupTpls = await loadTemplates(inputs.flatMap((p, i) => ((tpls[resolved[i].code] ?? []).length || (p.countries ?? []).length !== 1 ? [] : covered.filter(g => g.countries.includes(p.countries[0])).map(g => g.code))))
    inputs.forEach((p, i) => {
      const lbl = `Sản phẩm #${i + 1} (${(p.countries ?? []).join(", ").slice(0, 60) || "?"})`
      const sw = sameSetWarning(lbl, sameSetGroups(groups, resolved[i].s.iso), resolved[i].code)
      if (sw) extra.push(sw)
      if ((p.countries ?? []).length === 1 && !(tpls[resolved[i].code] ?? []).length) {
        const hit = covered.filter(g => g.countries.includes(p.countries[0]) && (groupTpls[g.code] ?? []).length)
        if (hit.length) extra.push(`${lbl}: 3HK chưa có Product mã ${resolved[i].code || "(chưa có mã)"} nhưng đang bán nước này trong nhóm ${hit.map(g => `${g.code} (${g.countries.length <= 3 ? g.countries.join(" + ") : `${g.countries.length} nước`})`).join(", ")} — nếu gói bán gộp, hãy chọn đủ các nước của nhóm đó để ra đúng mã và copy được thông tin nước`)
      }
    })
    const built = build(inputs.map((p, i) => ({
      input: { simType: p.simType, supportCountryCode: resolved[i].code, isoCodes: resolved[i].s.iso, countryNameEn: resolved[i].s.en, countryNameVn: resolved[i].s.vn, plans: p.plans ?? [], usSimFull: !!p.usSimFull, vnEsimData: !!p.vnEsimData },
      price: priceOf(ncc, p.countries ?? []),
      tpls: tpls[resolved[i].code] ?? [],
    })), { fx, a, frames })

    const [existProducts, existSkus] = await Promise.all([
      findExisting("products", "product_code", [...built.sheets.productUS, ...built.sheets.productVN].map(r => String(r[35]))),
      findExisting("skus", "sku_code", [...built.sheets.skuUS, ...built.sheets.skuVN].map(r => String(r[20]))),
    ])
    const existCogs = await findSkuCogs(Array.from(existSkus.keys()))
    const { result: deduped, skipped } = dropExisting(built, existSkus, existProducts, existCogs)
    const drift = skipped.skus.filter(s => s.verdict === "diff").length
    if (drift) extra.push(`Có ${drift} SKU ĐÃ CÓ trong hệ thống nhưng giá vốn lệch giá tính lại bây giờ (tỷ giá / công thức / bảng giá đã đổi?) — xem hộp xanh bên dưới; dùng "Soát giá vốn" để cập nhật`)
    const result = { ...deduped, warnings: [...extra, ...built.warnings] }
    const nothingNew = !result.sheets.skuUS.length && !result.sheets.skuVN.length

    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      if (nothingNew) return NextResponse.json({ error: "Tất cả SKU đã có trong hệ thống — không còn gì để tạo mới", skipped }, { status: 422 })
      if (result.warnings.some(w => /không mã hoá được|trùng|thiếu|phải đúng|chưa có gói|chưa chọn|chưa nhập|chưa có hệ số|chỉ có mức/.test(w)) && body.force !== true)
        return NextResponse.json({ error: "Còn lỗi cần sửa trước khi xuất", warnings: result.warnings }, { status: 422 })
      const wb = buildWorkbook(result, { fx, a, frames })
      const edits = sanitizeEdits(body.edits)
      if (edits.length) applyEdits(wb, result.sheets, edits)
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
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
