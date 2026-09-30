import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { parseFxWorkbook } from "@/lib/fx/parse"
import { convert, currentMonth, emptyTable, FX_ROWS, momPct, monthLabel, parseMonthLabel, rateAt, setCell, toFlat, type FxTable } from "@/lib/fx/table"

const T: FxTable = {
  version: 1,
  values: {
    "JSC:VND/USD": { "2026-08": 26490, "2026-09": 26266 },
    "INC:VND/USD": { "2026-08": 25941, "2026-09": 25731.22 },
    "INC:HKD/USD": { "2026-09": 7.801 },
    "INC:CNY/USD": { "2026-09": 6.687 },
    "JSC:VND/CNY": { "2026-09": 3960.18 },
  },
}

describe("quy tắc chiều đổi tiền", () => {
  test("USD → VND dùng tỷ giá JSC; VND → USD dùng tỷ giá Inc (đúng ví dụ của Hiếu: 26266 vs 25731)", () => {
    const up = convert(T, 1, "USD", "VND", "2026-09")!
    expect(up.value).toBe(26266)
    expect(up.steps).toEqual([{ rowId: "JSC:VND/USD", rate: 26266, month: "2026-09", op: "×" }])
    const down = convert(T, 25731.22, "VND", "USD", "2026-09")!
    expect(down.value).toBeCloseTo(1, 9)
    expect(down.steps[0]).toMatchObject({ rowId: "INC:VND/USD", op: "÷" })
  })
  test("USD ↔ ngoại tệ khác dùng tỷ giá Inc (X/USD), cả hai chiều", () => {
    expect(convert(T, 7.801, "HKD", "USD", "2026-09")!.value).toBeCloseTo(1, 9)
    expect(convert(T, 1, "USD", "CNY", "2026-09")!.value).toBe(6.687)
  })
  test("VND ↔ CNY dùng tỷ giá JSC (VND/X)", () => {
    expect(convert(T, 2, "CNY", "VND", "2026-09")!.value).toBeCloseTo(7920.36, 6)
    expect(convert(T, 3960.18, "VND", "CNY", "2026-09")!.value).toBeCloseTo(1, 9)
  })
  test("cặp còn lại đổi qua USD (HKD → VND = HKD÷HKD/USD × VND/USD JSC)", () => {
    const r = convert(T, 7.801, "HKD", "VND", "2026-09")!
    expect(r.value).toBeCloseTo(26266, 6)
    expect(r.steps.map(s => s.rowId)).toEqual(["INC:HKD/USD", "JSC:VND/USD"])
  })
  test("cùng loại tiền → giữ nguyên; thiếu tỷ giá → null", () => {
    expect(convert(T, 5, "USD", "USD", "2026-09")).toEqual({ value: 5, steps: [] })
    expect(convert(T, 5, "USD", "JPY", "2026-09")).toBeNull()
  })
})

describe("tháng áp dụng", () => {
  test("tháng chưa nhập → lấy tháng gần nhất TRƯỚC ĐÓ; không lấy tương lai", () => {
    expect(rateAt(T, "JSC:VND/USD", "2026-09")).toEqual({ rate: 26266, month: "2026-09" })
    expect(rateAt(T, "JSC:VND/USD", "2026-12")).toEqual({ rate: 26266, month: "2026-09" })
    expect(rateAt(T, "JSC:VND/USD", "2026-08")).toEqual({ rate: 26490, month: "2026-08" })
    expect(rateAt(T, "JSC:VND/USD", "2026-07")).toBeNull()
    expect(convert(T, 1, "USD", "VND", "2026-08")!.value).toBe(26490)
  })
  test("nhãn tháng ↔ khoá tháng", () => {
    expect(monthLabel("2026-09")).toBe("T09/2026")
    expect(parseMonthLabel("T09/2026")).toBe("2026-09")
    expect(parseMonthLabel("Q3")).toBeNull()
    expect(currentMonth(new Date(2026, 8, 30))).toBe("2026-09")
  })
  test("setCell thêm/xoá ô, không sửa bảng cũ; MoM tính so tháng đã nhập liền trước", () => {
    const t2 = setCell(T, "JSC:VND/USD", "2026-10", 26300)
    expect(t2.values["JSC:VND/USD"]["2026-10"]).toBe(26300)
    expect(T.values["JSC:VND/USD"]["2026-10"]).toBeUndefined()
    expect(setCell(t2, "JSC:VND/USD", "2026-10", null).values["JSC:VND/USD"]["2026-10"]).toBeUndefined()
    expect(setCell(T, "JSC:VND/USD", "2026-10", -5).values["JSC:VND/USD"]["2026-10"]).toBeUndefined()
    expect(momPct(T, "JSC:VND/USD", "2026-09")).toBeCloseTo((26266 - 26490) / 26490, 9)
    expect(momPct(T, "JSC:VND/USD", "2026-08")).toBeNull()
  })
})

describe("khoá phẳng fx.* cho nơi cũ", () => {
  test("ghi giá tháng hiện tại (hoặc gần nhất trước đó), giữ quy ước đơn vị cho 1 USD", () => {
    const flat = Object.fromEntries(toFlat(T, "2026-09").map(f => [f.key, f.value]))
    expect(flat["fx.usd_vnd"]).toBe(26266)
    expect(flat["fx.vnd_usd_inc"]).toBe(25731.22)
    expect(flat["fx.hkd_usd"]).toBe(7.801)
    expect(flat["fx.usd_cny"]).toBe(6.687)
    expect(flat["fx.vnd_cny"]).toBe(3960.18)
    expect(flat["fx.usd_jpy"]).toBeUndefined()   // chưa nhập thì không ghi
  })
  test("13 dòng, id duy nhất", () => {
    expect(FX_ROWS).toHaveLength(13)
    expect(new Set(FX_ROWS.map(r => r.id)).size).toBe(13)
    expect(emptyTable().values).toEqual({})
  })
})

const file = path.resolve(__dirname, "../../..", "Tỷ giá nội bộ theo tháng.xlsx")
describe("đọc file Excel thật", () => {
  test.skipIf(!existsSync(file))("Tỷ giá nội bộ theo tháng.xlsx → 13 dòng đúng số của Hiếu", () => {
    const { table, rows } = parseFxWorkbook(readFileSync(file))
    expect(rows).toBe(13)
    expect(table.values["JSC:VND/USD"]["2026-09"]).toBe(26266)
    expect(table.values["JSC:VND/USD"]["2026-01"]).toBe(26377)
    expect(table.values["INC:VND/USD"]["2026-09"]).toBe(25731.22)
    expect(table.values["INC:HKD/USD"]["2026-09"]).toBe(7.801)
    expect(table.values["INC:CNY/USD"]["2026-09"]).toBe(6.687)
    expect(table.values["JSC:VND/HKD"]["2026-09"]).toBe(3427)   // A9 = "Gohub JSC - HKD" (B9 gõ nhầm "VND/GBP" — nhận diện theo cột A)
    expect(table.values["JSC:VND/GBP"]["2026-09"]).toBe(35886)
    expect(table.values["INC:TWD/USD"]["2026-09"]).toBe(31.666)
    expect(table.values["INC:VND/USD"]["2026-06"]).toBeUndefined()   // chưa nhập
    expect(Object.keys(table.values)).toHaveLength(13)
    // đúng ví dụ Hiếu nêu
    expect(convert(table, 1, "USD", "VND", "2026-09")!.value).toBe(26266)
    expect(convert(table, 25731.22, "VND", "USD", "2026-09")!.value).toBeCloseTo(1, 9)
  })
})
