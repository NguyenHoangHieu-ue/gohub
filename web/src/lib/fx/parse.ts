import * as XLSX from "xlsx"
import { emptyTable, FX_ROWS, parseMonthLabel, type Entity, type FxTable } from "./table"

/** "Gohub JSC - USD" → dòng JSC:VND/USD ; "Gohub Inc - HKD" → INC:HKD/USD ... (nhận diện theo cột A, KHÔNG theo cột B vì file có nhãn gõ nhầm) */
function rowIdOf(a: string): string | null {
  const m = /^Gohub\s+(JSC|Inc)\s*-\s*(.+)$/i.exec(a.trim())
  if (!m) return null
  const entity: Entity = m[1].toUpperCase() === "JSC" ? "JSC" : "INC"
  let ccy = m[2].trim().toUpperCase()
  if (/^VN[ĐD]$/.test(ccy)) ccy = "VND"
  const def = FX_ROWS.find(r => r.entity === entity && (entity === "JSC" ? (ccy === "USD" ? r.base === "USD" : r.base === ccy) : (ccy === "VND" ? r.quote === "VND" : r.quote === ccy)))
  return def?.id ?? null
}

/**
 * Đọc file "Tỷ giá nội bộ theo tháng.xlsx": hàng tiêu đề "T01/2026…", mỗi cặp = 1 dòng "Tỷ giá …" (bỏ dòng "Biến động MoM").
 * Ô trống / "-" / không phải số dương thì bỏ qua.
 */
export function parseFxWorkbook(buf: Buffer | ArrayBuffer): { table: FxTable; rows: number; cells: number } {
  const wb = XLSX.read(buf, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames.find(n => /fx/i.test(n)) ?? wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false })
  const headIdx = grid.findIndex(r => r.some(c => typeof c === "string" && parseMonthLabel(c)))
  if (headIdx < 0) throw new Error('Không thấy hàng tiêu đề tháng (dạng "T01/2026")')
  const months = grid[headIdx].map(c => (typeof c === "string" ? parseMonthLabel(c) : null))

  const table = emptyTable()
  let rows = 0, cells = 0
  for (const r of grid.slice(headIdx + 1)) {
    const label = String(r[1] ?? "")
    if (!/^t[ỷy]\s*gi[áa]/i.test(label.trim())) continue   // chỉ dòng "Tỷ giá …", bỏ "↳ Biến động MoM"
    const id = rowIdOf(String(r[0] ?? ""))
    if (!id) continue
    rows++
    months.forEach((m, i) => {
      const v = Number(r[i])
      if (m && Number.isFinite(v) && v > 0 && r[i] !== null) { (table.values[id] ??= {})[m] = v; cells++ }
    })
  }
  if (!rows) throw new Error('Không nhận diện được dòng tỷ giá nào (cột A cần dạng "Gohub JSC - USD" / "Gohub Inc - HKD")')
  return { table, rows, cells }
}
