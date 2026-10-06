import { describe, test, expect, vi } from "vitest"
import {
  decodeSkuAttributes, classifyService, groupBy, crossTab, monthlyBy,
  SERVICE_CALL, SERVICE_LOCAL, SERVICE_DATA_ONLY, SERVICE_UNKNOWN, type MarketData,
} from "@/lib/market-breakdown"

describe("decodeSkuAttributes", () => {
  test("SKU 13 ký tự: hình thức, loại gói, dung lượng/ngày", () => {
    expect(decodeSkuAttributes("3CUSAWMY00507")).toEqual({ form: "eSIM", plan: "Trọn gói", size: "5GB · 7 ngày", product_code: "3CUSAWMY" })
    expect(decodeSkuAttributes("ECJPN3DBUNL01")).toMatchObject({ form: "eSIM", plan: "Không giới hạn", size: "Không giới hạn · 1 ngày" })
    expect(decodeSkuAttributes("3EJPN3DF00507")).toMatchObject({ form: "SIM vật lý" })
    expect(decodeSkuAttributes("2CTHACBP5HM10")).toMatchObject({ plan: "Theo ngày", size: "500MB/ngày · 10 ngày" })
    expect(decodeSkuAttributes("1D000WDK00000")).toMatchObject({ form: "Khung SIM", plan: "Khung/eSIM trắng" })
    expect(decodeSkuAttributes("3AKOR3DF0D530")).toMatchObject({ form: "Nạp thêm data", size: "0.5GB · 30 ngày" })
  })
  test("mã không phải 13 ký tự → Khác", () => {
    expect(decodeSkuAttributes("CHN3D07GBFY05D")).toMatchObject({ form: "Khác", plan: "Khác" })
  })
})

describe("classifyService", () => {
  test("SĐT local ưu tiên hơn call; không có trong catalog → Chưa rõ", () => {
    expect(classifyService("Yes", "Yes", true)).toBe(SERVICE_LOCAL)
    expect(classifyService("Yes", "No", true)).toBe(SERVICE_CALL)
    expect(classifyService("No", null, true)).toBe(SERVICE_DATA_ONLY)
    expect(classifyService(null, null, false)).toBe(SERVICE_UNKNOWN)
  })
})

const data: MarketData = {
  quarter: "Q4-2026", prevQuarter: "Q3-2026", curStart: "2026-10-01", curEnd: "2026-12-31", prevStart: "2026-07-01", prevEnd: "2026-09-30",
  months: ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], curMonths: ["2026-10", "2026-11", "2026-12"],
  group: "ALL", cutoff: "2026-10-05",
  skus: [
    { sku: "A", vendor: "3HK", country_code: "JPN", country: "Japan", product_code: "PA", form: "eSIM", plan: "Daily", service: SERVICE_DATA_ONLY, size: "" },
    { sku: "B", vendor: "KDDI", country_code: "JPN", country: "Japan", product_code: "PB", form: "SIM", plan: "Fixed", service: SERVICE_CALL, size: "" },
    { sku: "C", vendor: "3HK", country_code: "KOR", country: "Korea", product_code: "PC", form: "eSIM", plan: "Daily", service: SERVICE_DATA_ONLY, size: "" },
  ],
  cells: [
    [0, 3, 100, 40, 1], [0, 0, 50, 10, 1],
    [1, 4, 60, 30, 2],
    [2, 3, 30, 3, 1], [2, 1, 80, 8, 1],
  ],
}

describe("groupBy / crossTab / monthlyBy", () => {
  test("gộp theo thị trường, tách kỳ này/kỳ trước, đếm SKU kỳ này", () => {
    const rows = groupBy(data, "country")
    expect(rows.map(r => r.key)).toEqual(["Japan", "Korea"])
    expect(rows[0]).toMatchObject({ rev: 160, gp: 70, revPrev: 50, gpPrev: 10, skuCount: 2 })
    expect(rows[1]).toMatchObject({ rev: 30, revPrev: 80, skuCount: 1 })
  })
  test("lọc trong 1 thị trường theo vendor", () => {
    const rows = groupBy(data, "vendor", s => s.country === "Japan")
    expect(rows.map(r => [r.key, r.rev])).toEqual([["3HK", 100], ["KDDI", 60]])
  })
  test("sắp theo GP khi metric=gp", () => {
    expect(groupBy(data, "vendor", undefined, "gp").map(r => r.key)).toEqual(["3HK", "KDDI"])
  })
  test("crossTab gộp cột ngoài top N vào Khác", () => {
    const { cols, rows } = crossTab(data, "country", "vendor", ["Japan", "Korea"], 1)
    expect(cols).toEqual(["3HK", "Khác"])
    expect(rows).toEqual([{ key: "Japan", "3HK": 100, Khác: 60 }, { key: "Korea", "3HK": 30 }])
  })
  test("monthlyBy đủ 6 tháng", () => {
    const { rows } = monthlyBy(data, "vendor", 5, "rev", s => s.country === "Japan")
    expect(rows.map(r => r.key)).toEqual(data.months)
    expect(rows[3]).toEqual({ key: "2026-10", "3HK": 100 })
    expect(rows[4]).toEqual({ key: "2026-11", KDDI: 60 })
  })
})

import { marketName } from "@/lib/market-names"
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
describe("marketName — tên thị trường đọc được", () => {
  const cont = (i: string) => ({ GB: "Europe", FR: "Europe", DE: "Europe", IT: "Europe", JP: "Asia", US: "Americas" } as Record<string, string>)[i] ?? null
  test("1 nước, 2–3 nước, nhóm lớn theo châu lục", () => {
    expect(marketName("JPN", ["JP"], cont)).toBe("Nhật Bản")
    expect(marketName("ANZ", ["AU", "NZ"], cont)).toBe("Úc – New Zealand")
    expect(marketName("E33", ["GB", "FR", "DE", "IT"], cont)).toBe("Châu Âu · 4 nước (E33)")
    expect(marketName("WOR", ["GB", "FR", "JP", "US"], cont)).toBe("Nhiều khu vực · 4 nước (WOR)")
  })
})
