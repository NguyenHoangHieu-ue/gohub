import { describe, expect, it } from "vitest"
import { SKU_SCOPES, jsonValue, skuLine } from "@/lib/argon/catalog-packs"
import { PACKS } from "@/lib/argon/data-packs"
import { ARGON_TOOLS } from "@/lib/argon/tools"

describe("gói thông tin sản phẩm (sync từ database)", () => {
  it("jsonValue đọc cột kiểu JSON, chịu được chuỗi thường/rỗng", () => {
    expect(jsonValue('{"key":"A","value":"SIM/eSIM data"}')).toBe("SIM/eSIM data")
    expect(jsonValue("SIM full")).toBe("SIM full")
    expect(jsonValue(null)).toBe("")
  })
  it("skuLine: 1 dòng/SKU, bỏ ký tự phá cột, giá vốn kèm tiền tệ", () => {
    const l = skuLine({ sku_code: "3ACHMW1T00101", product_code: "3ACHMW1T", tenant: "VN", status: "Active", sim_esim: "eSIM", product_type: '{"key":"A","value":"SIM/eSIM data"}', throttle_speed: "128 kbps|x\n",
      day_amount: 1, day_amount_unit: "Day(s)", data_amount: 1, data_amount_unit: "GB", latest_cogs: 6539, latest_cogs_currency: "VND", vendor_sku: "ABC", vendor_sku_sim: null, data_plan: "1GB/ngày", frame: null, datapack: null })
    expect(l.split("|")).toEqual(["3ACHMW1T00101", "3ACHMW1T", "VN", "eSIM", "SIM/eSIM data", "1GB", "1d", "128 kbps x", "6539 VND", "ABC", "", "1GB/ngày"])
    expect(l).not.toContain("\n")
  })
  it("gói catalog đăng ký đúng, không lọt vào công cụ lấy số liệu của Argon", () => {
    const cat = PACKS.find(p => p.id === "product-catalog")!, sku = PACKS.find(p => p.id === "skus-by-vendor")!
    expect(cat.noQuarter).toBe(true); expect(sku.scopes?.map(s => s.id)).toEqual(SKU_SCOPES.map(s => s.id))
    const reports = JSON.stringify(ARGON_TOOLS)
    expect(reports).not.toContain("product-catalog"); expect(reports).not.toContain("skus-by-vendor"); expect(reports).not.toContain("wiki-business")
  })
})
