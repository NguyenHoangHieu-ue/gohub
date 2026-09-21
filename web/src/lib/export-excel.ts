// Helper xuất Excel (.xlsx) dùng chung cho các tab analytics.
// Thay các hàm export CSV cũ. Xuất TẤT CẢ rows truyền vào (không giới hạn dòng).
//
// `xlsx` (~1MB) được nạp ĐỘNG bên trong từng hàm (chỉ khi user thật sự bấm export)
// → không nằm trong bundle JS ban đầu của trang, cải thiện LCP/TBT.
//
// Dùng:
//   exportToExcel(rows, [{label:"SKU",key:"sku"},{label:"Doanh thu",key:"revenue"}], "products_2026-07")
//   exportRawRows(rows, "orders")   // rows đã là object phẳng, tự lấy header từ keys

export async function exportToExcel(
  rows: Record<string, unknown>[],
  columns: { label: string; key: string }[],
  filename: string,
  sheetName = "Data",
): Promise<void> {
  const XLSX = await import("xlsx")
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
export async function exportAOA(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  sheetName = "Data",
): Promise<void> {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

// Xuất 1 file .xlsx NHIỀU sheet (mỗi sheet = headers + array-of-arrays). Cho export tổng hợp nhiều bảng.
export async function exportSheets(
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[],
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  for (const sh of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sh.headers, ...sh.rows]), sh.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

// Xuất mảng object phẳng (header = union tất cả keys, theo thứ tự xuất hiện).
export async function exportRawRows(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Data",
): Promise<void> {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

// Như exportToExcel, nhưng tự gắn hậu tố "_<startDate>_to_<endDate>" vào filename — trước b2b/page.tsx
// và products/page.tsx mỗi trang tự viết 1 wrapper y hệt tên "exportToCSV" (đề xuất H, P2, roadmap UI/UX
// audit s196+20 — chuẩn hoá Export). Tên hàm cũ gây hiểu lầm là xuất CSV — thật ra vẫn ra .xlsx.
export async function exportWithDateRange(
  rows: Record<string, unknown>[],
  filename: string,
  columns: { label: string; key: string }[],
  startDate: string,
  endDate: string,
): Promise<void> {
  await exportToExcel(rows, columns, `${filename}_${startDate}_to_${endDate}`)
}
