import * as XLSX from "xlsx"

// Xem trước file Excel trong workspace (do Argon/code tạo): đọc phía server, trả bảng đã cắt gọn để trình duyệt vẽ. Chỉ đọc, không chạy macro/công thức; cắt số sheet/dòng/cột/độ dài ô.
export const PREVIEW_MAX_SHEETS = 8
export const PREVIEW_MAX_ROWS = 200
export const PREVIEW_MAX_COLS = 30
export const PREVIEW_CELL_CHARS = 120

export interface SheetPreview { name: string; rows: string[][]; totalRows: number; totalCols: number; truncated: boolean }
export interface WorkbookPreview { sheets: SheetPreview[]; moreSheets: number }

const clip = (v: unknown) => { const s = String(v ?? ""); return s.length > PREVIEW_CELL_CHARS ? `${s.slice(0, PREVIEW_CELL_CHARS)}…` : s }

export function previewWorkbook(buf: Buffer): WorkbookPreview {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false })
  const names = wb.SheetNames
  const sheets = names.slice(0, PREVIEW_MAX_SHEETS).map(name => {
    const ws = wb.Sheets[name]
    const ref = ws?.["!ref"]
    const range = ref ? XLSX.utils.decode_range(ref) : null
    const totalRows = range ? range.e.r - range.s.r + 1 : 0
    const totalCols = range ? range.e.c - range.s.c + 1 : 0
    // raw:false → giá trị đã định dạng như Excel hiển thị (ngày, %, số có dấu phẩy)
    const all = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true }) as unknown[][]) : []
    const rows = all.slice(0, PREVIEW_MAX_ROWS).map(r => Array.from({ length: Math.min(PREVIEW_MAX_COLS, Math.max(r.length, 0)) }, (_, i) => clip(r[i])))
    return { name, rows, totalRows, totalCols, truncated: totalRows > PREVIEW_MAX_ROWS || totalCols > PREVIEW_MAX_COLS }
  })
  return { sheets, moreSheets: Math.max(0, names.length - PREVIEW_MAX_SHEETS) }
}

export const isXlsxPath = (path: string) => /\.xlsx$/i.test(path)
