import { describe, test, expect, vi } from "vitest"
vi.mock("@/lib/agents/genai-stream", () => ({ genai: vi.fn() }))
import { normalizeExtracted } from "@/lib/vendor-quote-extract"

const iso = new Set(["VN", "JP", "GB", "FR"])
const groups = [{ code: "EUR", en: "Europe", iso: "FR, DE" }, { code: "GLB", en: "Global", iso: "JP, FR" }]

describe("normalizeExtracted — không tin kết quả model", () => {
  test("giữ dòng hợp lệ, đổi chuỗi giá kiểu VN/GBP sang số, chuẩn hoá loại gói", () => {
    const out = normalizeExtracted({
      vendor: " VNPT ", currency: "vnd", quote_date: "2026-09-15",
      items: [
        { name: "TR50N", countries: ["vn"], plan: "daily", data_gb: 5, days: 7, price_esim: "78.000", price_sim: 65000 },
        { name: "EU 1GB", countries: [], market_code: "eur", plan: "Fixed", data_gb: 1, days: 7, price_esim: "£1.99" },
        { name: "RU", countries: ["JP"], plan: "Unlimited", data_gb: 9, days: 3, price_esim: 173000, has_call: true },
      ],
    }, iso, groups)
    expect(out).toMatchObject({ vendor: "VNPT", currency: "VND", quote_date: "2026-09-15" })
    expect(out.items[0]).toMatchObject({ plan: "Daily", countries: ["VN"], price_esim: 78000, price_sim: 65000 })
    expect(out.items[1]).toMatchObject({ market_code: "EUR", price_esim: 1.99, price_sim: null })
    expect(out.items[2]).toMatchObject({ data_gb: 0, has_call: true })
    expect(out.warnings).toEqual([])
  })
  test("bỏ dòng thiếu giá/ngày/loại; cảnh báo mã nước lạ và dòng chưa gán nước", () => {
    const out = normalizeExtracted({
      items: [
        { name: "Không giá", countries: ["JP"], plan: "Fixed", data_gb: 1, days: 7 },
        { name: "Sai loại", countries: ["JP"], plan: "Weekly", data_gb: 1, days: 7, price_esim: 1 },
        { name: "Nước lạ", countries: ["XX", "JP"], plan: "Fixed", data_gb: 1, days: 7, price_esim: 1 },
        { name: "Vùng lạ", countries: [], market_code: "ZZZ", plan: "Fixed", data_gb: 1, days: 7, price_esim: 1 },
      ],
    }, iso, groups)
    expect(out.items.map(i => i.name)).toEqual(["Nước lạ", "Vùng lạ"])
    expect(out.items[0].countries).toEqual(["JP"])
    expect(out.items[1].market_code).toBeNull()
    expect(out.warnings.join(" | ")).toMatch(/Không giá.*Sai loại.*XX.*Vùng lạ/)
  })
})
