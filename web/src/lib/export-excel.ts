import * as XLSX from "xlsx"

// Helper xuất Excel (.xlsx) dùng chung cho các tab analytics.
// Thay các hàm export CSV cũ. Xuất TẤT CẢ rows truyền vào (không giới hạn dòng).
//
// Dùng:
//   exportToExcel(rows, [{label:"SKU",key:"sku"},{label:"Doanh thu",key:"revenue"}], "products_2026-07")
//   exportRawRows(rows, "orders")   // rows đã là object phẳng, tự lấy header từ keys

export function exportToExcel(
  rows: Record<string, unknown>[],
  columns: { label: string; key: string }[],
  filename: string,
  sheetName = "Data",
): void {
  const data = rows.map(row => {
    const obj: Record<string, unknown> = {}
    for (const c of columns) {
      const v = row[c.key]
      obj[c.label] = v == null ? "" : v
    }
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map(c => c.label) })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

// Xuất từ headers + array-of-arrays (mỗi row là mảng ô). Cho bảng dựng sẵn dạng row array.
export function exportAOA(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  sheetName = "Data",
): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

// Xuất mảng object phẳng (header = union tất cả keys, theo thứ tự xuất hiện).
export function exportRawRows(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Data",
): void {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}
