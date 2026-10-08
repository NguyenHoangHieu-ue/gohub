import { describe, test, expect } from "vitest"
import { normalizeSpec, resolveData, formatValue, compact, totalRow } from "../lib/report/spec"
import { chartSvg } from "../lib/report/charts"
import { buildReportXlsx } from "../lib/report/xlsx"
import ExcelJS from "exceljs"

describe("report spec", () => {
  test("bảng + ô số kèm sql lấy số thật từ SQL (không dùng số model gõ)", async () => {
    const { spec } = normalizeSpec({ title: "T", summary: ["a"], sections: [{ heading: "M",
      kpis: [{ label: "Doanh thu", value: 1, type: "money", sql: "SELECT 1" }],
      table: { columns: [{ key: "kh", label: "KH" }, { key: "rev", label: "DT", type: "money" }], sql: "SELECT kh, rev", rows: [{ kh: "giả", rev: 1 }], totalRow: true },
      chart: { type: "bar", title: "C", x: "kh", series: [{ key: "rev", label: "DT" }] } }] })
    const errs = await resolveData(spec!, async sql => sql === "SELECT 1"
      ? { rows: [{ total: "6270000000" }] }
      : { rows: [{ kh: "MoMo", rev: 3453461647 }, { kh: "Shopee", rev: 2069484663 }] })
    expect(errs).toEqual([])
    expect(spec!.sections[0].kpis![0].value).toBe(6270000000)
    expect(spec!.sections[0].table!.rows).toHaveLength(2)
    expect(spec!.sections[0].chart!.data).toHaveLength(2)                   // biểu đồ dùng dữ liệu bảng
    expect(totalRow(spec!.sections[0].table!)!.rev).toBe(5522946310)
  })
  test("thiếu tiêu đề / mục → lỗi tiếng Việt", () => {
    expect(normalizeSpec({ summary: [], sections: [] }).error).toBeTruthy()
    expect(normalizeSpec({ title: "x", sections: [] }).error).toContain("mục")
  })
  test("định dạng số kiểu Việt", () => {
    expect(formatValue(3453461647.4, "money")).toBe("3.453.461.647")
    expect(formatValue(17.14, "percent")).toBe("17,1%")
    expect(compact(6_270_000_000)).toBe("6,27 tỷ")
    expect(compact(590_383_766)).toBe("590,4 tr")
  })
  test("biểu đồ SVG thoát ký tự đặc biệt, có dữ liệu", () => {
    const svg = chartSvg({ type: "bar", title: "A & <B>", x: "k", series: [{ key: "v", label: "V" }], data: [{ k: "x", v: 5 }] })
    expect(svg).toContain("A &amp; &lt;B&gt;")
    expect(svg).toContain("<rect")
  })
  test("Excel: dòng tổng là công thức SUM đúng cột, cố định dòng tiêu đề", async () => {
    const { spec } = normalizeSpec({ title: "T", summary: [], sections: [{ heading: "Bảng", table: {
      columns: [{ key: "kh", label: "KH" }, { key: "rev", label: "DT", type: "money" }, { key: "p", label: "%", type: "percent" }],
      rows: [{ kh: "a", rev: 10, p: 5 }, { kh: "b", rev: 20, p: 6 }], totalRow: true } }] })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildReportXlsx(spec!, new Map()) as any)
    const ws = wb.getWorksheet("Bảng")!
    expect(ws.getRow(4).getCell(2).value).toEqual({ formula: "SUM(B2:B3)" })
    expect(ws.getRow(4).getCell(3).value).toBeNull()                      // không cộng cột %
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 })
  })
})
