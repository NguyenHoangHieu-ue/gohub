import { compareCogs, type CogsVerdict } from "@/lib/datapool-audit/compare"
import type { BuiltSheets } from "./types"

/** Phần tối thiểu của kết quả build mà dedupe cần (dùng chung BC Datapool + 3HK Datapool). */
export interface Dedupable<C extends { type: string; kind: string; dataAmount: number; unit: string; days: number }> {
  sheets: BuiltSheets
  costRows: C[]
  usCost: number[]
  vnCost: number[]
}

/** `current` = giá vốn đang có trong hệ thống; `computed` = giá tính lại bây giờ (tỷ giá/công thức/bảng giá hiện tại); null nếu hệ thống chưa có giá. */
export interface SkippedSku { sku: string; tenant: "US" | "VN"; status: string; label: string; currency?: string; current?: number | null; computed?: number; diffPct?: number; verdict?: CogsVerdict }
export interface SkippedProduct { code: string; tenant: "US" | "VN"; status: string }
export interface Skipped { skus: SkippedSku[]; products: SkippedProduct[] }

/**
 * Bỏ những SKU / Product ĐÃ CÓ trong hệ thống khỏi kết quả (cả bản xem trước lẫn file xuất) và trả danh sách đã bỏ
 * để báo cho người dùng. Phần còn lại được tạo bình thường (VD chọn 10,11,12 ngày mà 10 ngày đã có → chỉ tạo 11 và 12).
 * `existingSkus`/`existingProducts`: mã → trạng thái trong hệ thống (Active/Inactive/Deleted...). `existingCogs`: mã SKU → giá vốn đang có để so với giá tính lại.
 */
export function dropExisting<C extends { type: string; kind: string; dataAmount: number; unit: string; days: number }, R extends Dedupable<C>>(r: R, existingSkus: Map<string, string>, existingProducts: Map<string, string>, existingCogs?: Map<string, { cogs: number | null }>): { result: R; skipped: Skipped } {
  const skipped: Skipped = { skus: [], products: [] }
  const labelOf = (ci: number) => {
    const c = r.costRows[ci]
    return `${c.type} · ${c.kind} ${c.dataAmount}${c.unit} × ${c.days} ngày`
  }

  const keepRows = (rows: (string | number)[][], cost: number[], tenant: "US" | "VN") => {
    const kept: (string | number)[][] = [], keptCost: number[] = []
    rows.forEach((row, i) => {
      const code = String(row[20])
      const status = existingSkus.get(code)
      if (status !== undefined) {
        const cur = existingCogs?.get(code)
        const computed = Number(row[10]), currency = String(row[11] ?? "")
        const cmp = cur && cur.cogs != null && Number.isFinite(computed) ? compareCogs(cur.cogs, computed, currency) : null
        skipped.skus.push({ sku: code, tenant, status, label: labelOf(cost[i]), currency, current: cur ? cur.cogs : undefined, computed, diffPct: cmp?.diffPct, verdict: cmp?.verdict })
      }
      else { kept.push(row); keptCost.push(cost[i]) }
    })
    return { kept, keptCost }
  }
  const us = keepRows(r.sheets.skuUS, r.usCost, "US")
  const vn = keepRows(r.sheets.skuVN, r.vnCost, "VN")

  // Dòng tính giá còn dùng bởi ít nhất 1 SKU còn lại → giữ, đánh lại chỉ số
  const alive = new Set([...us.keptCost, ...vn.keptCost])
  const remap = new Map<number, number>()
  const costRows = r.costRows.filter((c, i) => (alive.has(i) ? (remap.set(i, remap.size), true) : false))

  const keepProducts = (rows: (string | number)[][], tenant: "US" | "VN") => rows.filter(row => {
    const code = String(row[35])
    const status = existingProducts.get(code)
    if (status !== undefined) { skipped.products.push({ code, tenant, status }); return false }
    return true
  })

  return {
    skipped,
    result: {
      ...r,
      costRows,
      usCost: us.keptCost.map(i => remap.get(i)!),
      vnCost: vn.keptCost.map(i => remap.get(i)!),
      sheets: { skuUS: us.kept, skuVN: vn.kept, productUS: keepProducts(r.sheets.productUS, "US"), productVN: keepProducts(r.sheets.productVN, "VN") },
    },
  }
}
