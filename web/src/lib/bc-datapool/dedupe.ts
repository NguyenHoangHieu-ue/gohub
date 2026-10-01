import type { BuildResult } from "./builder"

export interface SkippedSku { sku: string; tenant: "US" | "VN"; status: string; label: string }
export interface SkippedProduct { code: string; tenant: "US" | "VN"; status: string }
export interface Skipped { skus: SkippedSku[]; products: SkippedProduct[] }

/**
 * Bỏ những SKU / Product ĐÃ CÓ trong hệ thống khỏi kết quả (cả bản xem trước lẫn file xuất) và trả danh sách đã bỏ
 * để báo cho người dùng. Phần còn lại được tạo bình thường (VD chọn 10,11,12 ngày mà 10 ngày đã có → chỉ tạo 11 và 12).
 * `existingSkus`/`existingProducts`: mã → trạng thái trong hệ thống (Active/Inactive/Deleted...).
 */
export function dropExisting(r: BuildResult, existingSkus: Map<string, string>, existingProducts: Map<string, string>): { result: BuildResult; skipped: Skipped } {
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
      if (status !== undefined) skipped.skus.push({ sku: code, tenant, status, label: labelOf(cost[i]) })
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
