import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { PREVIEW_CELL_CHARS, PREVIEW_MAX_COLS, PREVIEW_MAX_ROWS, PREVIEW_MAX_SHEETS, isXlsxPath, previewWorkbook } from "@/lib/argon/xlsx-preview"

const toBuf = (sheets: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

describe("xem trước xlsx", () => {
  it("đọc nhiều sheet, giữ tiếng Việt và số đã định dạng thành chữ", () => {
    const p = previewWorkbook(toBuf({ "Dữ liệu": [["nhóm", "doanh thu"], ["B2B", 1301964366.35], ["B2C", 422245517.34]], "Tổng hợp": [["tổng"], [1724209883.69]] }))
    expect(p.sheets.map(s => s.name)).toEqual(["Dữ liệu", "Tổng hợp"])
    expect(p.sheets[0].rows[0]).toEqual(["nhóm", "doanh thu"])
    expect(p.sheets[0].rows[1][0]).toBe("B2B")
    expect(p.sheets[0]).toMatchObject({ totalRows: 3, totalCols: 2, truncated: false })
    expect(p.moreSheets).toBe(0)
  })
  it("cắt dòng/cột/độ dài ô và báo truncated", () => {
    const rows = Array.from({ length: PREVIEW_MAX_ROWS + 50 }, (_, i) => Array.from({ length: PREVIEW_MAX_COLS + 5 }, (_, c) => (i === 1 && c === 0 ? "x".repeat(500) : `r${i}c${c}`)))
    const s = previewWorkbook(toBuf({ Lon: rows })).sheets[0]
    expect(s.rows).toHaveLength(PREVIEW_MAX_ROWS)
    expect(s.rows[0]).toHaveLength(PREVIEW_MAX_COLS)
    expect(s.rows[1][0].length).toBe(PREVIEW_CELL_CHARS + 1)
    expect(s).toMatchObject({ totalRows: PREVIEW_MAX_ROWS + 50, totalCols: PREVIEW_MAX_COLS + 5, truncated: true })
  })
  it("nhiều sheet quá số cho phép: chỉ lấy đầu, báo còn bao nhiêu", () => {
    const sheets: Record<string, unknown[][]> = {}
    for (let i = 0; i < PREVIEW_MAX_SHEETS + 3; i++) sheets[`S${i}`] = [["a"]]
    const p = previewWorkbook(toBuf(sheets))
    expect(p.sheets).toHaveLength(PREVIEW_MAX_SHEETS)
    expect(p.moreSheets).toBe(3)
  })
  it("sheet trống không lỗi; chỉ nhận đuôi .xlsx", () => {
    const p = previewWorkbook(toBuf({ Trong: [] }))
    expect(p.sheets[0]).toMatchObject({ rows: [], totalRows: 0 })
    expect(isXlsxPath("reports/a.XLSX")).toBe(true)
    expect(isXlsxPath("reports/a.csv")).toBe(false)
  })
})
