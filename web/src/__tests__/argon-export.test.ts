import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { toDocx, toXlsx } from "@/lib/argon/export"

describe("argon export", () => {
  it("docx: ra file zip hợp lệ (PK) có chứa chữ của tài liệu, bảng và gạch đầu dòng", async () => {
    const buf = await toDocx("Báo cáo thử", "# Mục 1\n- ý một\n- ý **hai**\n| Cột A | Cột B |\n|---|---|\n| 1 | 2 |\nĐoạn thường")
    expect(buf.subarray(0, 2).toString()).toBe("PK")
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.files["word/document.xml"].async("text")
    for (const t of ["Báo cáo thử", "Mục 1", "ý một", "hai", "Cột A", "Đoạn thường"]) expect(xml).toContain(t)
    expect(xml).toContain("<w:tbl>")
  })
  it("xlsx: tách đúng từng sheet từ định dạng === Sheet ===, giữ dấu phẩy trong ô có nháy", () => {
    const buf = toXlsx('=== Sheet: Tháng 10 ===\nTên,Giá\n"Thái, Lan",12\n\n=== Sheet: Ghi chú ===\nx')
    const wb = XLSX.read(buf, { type: "buffer" })
    expect(wb.SheetNames).toEqual(["Tháng 10", "Ghi chú"])
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Tháng 10"], { header: 1 })
    expect(rows[1][0]).toBe("Thái, Lan")
    expect(Number(rows[1][1])).toBe(12)
  })
  it("xlsx: văn bản không phải bảng vẫn xuất được 1 sheet", () => {
    const wb = XLSX.read(toXlsx("a,b\n1,2"), { type: "buffer" })
    expect(wb.SheetNames).toEqual(["Sheet1"])
  })
})
