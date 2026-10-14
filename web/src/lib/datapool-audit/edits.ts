import * as XLSX from "xlsx"
import { PRODUCT_HEADERS, SHEET_NAMES, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import type { BuiltSheets } from "@/lib/bc-datapool/types"

// Chỉnh tay từng ô của bản xem trước (tên, throttle, nhà mạng, ghi chú, giá vốn…) trước khi xuất. Server áp lên file Excel SAU khi dựng
// (nên công thức/ô khác giữ nguyên), ô giá vốn bị sửa thì thành số cố định (mất công thức) và mọi chỉnh sửa được ghi ở sheet "Chỉnh sửa tay".
export type EditSheet = "skuUS" | "skuVN" | "productUS" | "productVN"
export interface CellEdit { sheet: EditSheet; key: string; col: number; value: string | number }

export const EDIT_SHEET_NAME = "Chỉnh sửa tay"
const SHEETS: EditSheet[] = ["skuUS", "skuVN", "productUS", "productVN"]
const isSku = (s: EditSheet) => s === "skuUS" || s === "skuVN"
/** Cột khoá (không cho sửa): tenant + mã Product/SKU. */
export const lockedCols = (s: EditSheet) => (isSku(s) ? [0, 1, 20] : [0, 35])
export const rowKey = (s: EditSheet, row: (string | number)[]) => String(isSku(s) ? row[20] : row[35])
export const headersOf = (s: EditSheet) => (isSku(s) ? SKU_HEADERS : PRODUCT_HEADERS)

export function sanitizeEdits(raw: unknown): CellEdit[] {
  if (!Array.isArray(raw)) return []
  const out: CellEdit[] = []
  for (const e of raw.slice(0, 1000)) {
    const x = e as Partial<CellEdit>
    if (!x || !SHEETS.includes(x.sheet as EditSheet) || typeof x.key !== "string" || !Number.isInteger(x.col)) continue
    const sheet = x.sheet as EditSheet
    if (x.col! < 0 || x.col! >= headersOf(sheet).length || lockedCols(sheet).includes(x.col!)) continue
    if (typeof x.value !== "string" && typeof x.value !== "number") continue
    out.push({ sheet, key: x.key, col: x.col!, value: x.value })
  }
  return out
}

/** Áp chỉnh sửa vào workbook (dòng tìm theo mã). Trả số ô đã áp + danh sách bỏ qua (dòng không còn trong file). */
export function applyEdits(wb: XLSX.WorkBook, sheets: BuiltSheets, edits: CellEdit[]): { applied: number; skipped: CellEdit[] } {
  const log: (string | number)[][] = [["Sheet", "Mã dòng", "Cột", "Giá trị gốc (tool tính)", "Giá trị đã chỉnh tay"]]
  const skipped: CellEdit[] = []
  let applied = 0
  for (const e of edits) {
    const rows = sheets[e.sheet]
    const idx = rows.findIndex(r => rowKey(e.sheet, r) === e.key)
    const ws = wb.Sheets[SHEET_NAMES[e.sheet]]
    if (idx < 0 || !ws) { skipped.push(e); continue }
    const addr = XLSX.utils.encode_cell({ r: idx + 1, c: e.col })
    const orig = rows[idx][e.col]
    const num = typeof e.value === "number" ? e.value : e.value.trim() !== "" && Number.isFinite(Number(e.value)) && typeof orig === "number" ? Number(e.value) : null
    ws[addr] = num !== null ? { t: "n", v: num } : { t: "s", v: String(e.value) }
    log.push([SHEET_NAMES[e.sheet], e.key, headersOf(e.sheet)[e.col], String(orig ?? ""), String(e.value)])
    applied++
  }
  if (applied) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(log), EDIT_SHEET_NAME)
  return { applied, skipped }
}
