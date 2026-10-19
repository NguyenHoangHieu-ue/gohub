import { describe, expect, test } from "vitest"
import { buildDestinations, quote, type QuoteContext } from "@/lib/product-tools/quote"
import { DEFAULT_ASSUMPTIONS, type PriceList } from "@/lib/bc-datapool/types"
import type { PlanCatalog } from "@/lib/bc-datapool/plan-lookup"

const days30 = Array.from({ length: 30 }, (_, i) => i + 1)
const list: PriceList = {
  fileName: "t.xlsx", uploadedAt: "2026-10-01T00:00:00Z",
  pools: {
    CMHK: { currency: "HKD", rows: [{ coverage: "Japan", operator: "KDDI", plmn: "1", pricePerGb: 5.3, kyc: false }, { coverage: "Thailand", operator: "AIS", plmn: "2", pricePerGb: 4, kyc: true }], imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 1 },
    SINGTEL: { currency: "USD", rows: [{ coverage: "Japan", operator: "SoftBank", plmn: "3", pricePerGb: 0.9, kyc: false }], imsiFee: 0.1, esimFeeCny: 2, simFeeCny: 1 },
  },
}
const plan = (id: string, sim: "eSIM" | "SIM", kind: "Daily" | "Fixed", countries: string[], amount: number, pool: "CMHK" | "SINGTEL") =>
  ({ id, sim, kind, countries, amount, unit: "GB" as const, pool, operators: [], timing: "Natural Day", name: `${countries.join(",")}-${kind} ${amount}GB`, days: days30 })
const catalog: PlanCatalog = {
  uploadedAt: "", files: [],
  plans: [
    plan("p1", "eSIM", "Daily", ["Japan"], 1, "CMHK"), plan("p2", "eSIM", "Fixed", ["Japan"], 5, "CMHK"),
    plan("p3", "eSIM", "Daily", ["Japan"], 1, "SINGTEL"), plan("p4", "eSIM", "Daily", ["Thailand"], 1, "CMHK"),
  ],
}
const ctx: QuoteContext = {
  list, catalog,
  ncc: [{ zone: "D", country: "Japan", network: "NTT", price_per_gb_hkd: 6, is_kyc: false }],
  groups: [], refs: [],
  fx: { hkdPerUsd: 7.8, cnyPerUsd: 6.7, vndPerUsd: 26000, vndPerUsdInc: 25000, month: "2026-10" },
  a: DEFAULT_ASSUMPTIONS,
  frames: { esimUsUsd: 0.51, simUsUsd: 0.34, simVnVnd: 11000 },
  whiteSimVnd: 17000,
}
const ceil2 = (x: number) => Math.ceil(x * 100 - 1e-9) / 100

describe("Tính giá: điểm đến gộp từ BC + 3HK", () => {
  const { dests } = buildDestinations(ctx)
  test("Japan có đủ 3 nhà cung cấp cho eSIM, Thailand chỉ BC CMHK và cần KYC", () => {
    const jp = dests.find(d => d.label === "Japan")!
    expect(jp.vendors.eSIM.sort()).toEqual(["CMHK", "SINGTEL", "THK"])
    const th = dests.find(d => d.label === "Thailand")!
    expect(th.vendors.eSIM).toEqual(["CMHK"])
    expect(th.kyc).toBe(true)
  })
  test("SIM thẻ: BC chỉ hiện nước Portal có bán gói SIM (catalog test không có) → chỉ 3HK", () => {
    const jp = dests.find(d => d.label === "Japan")!
    expect(jp.vendors.SIM).toEqual(["THK"])
  })
})

describe("Tính giá: kết quả khớp công thức độc lập", () => {
  const jp = buildDestinations(ctx).dests.find(d => d.label === "Japan")!
  const res = quote(ctx, { destKey: jp.key, sim: "eSIM", plans: [{ kind: "Daily", amount: 1, unit: "GB", days: [3] }] })

  test("mỗi nhà cung cấp 1 dòng eSIM full, giá vốn US/VN đúng", () => {
    expect(res.rows.map(r => r.vendor).sort()).toEqual(["CMHK", "SINGTEL", "THK"])
    const fee = ceil2(2 / 6.7 + 0.5 / 7.8)
    const cm = res.rows.find(r => r.vendor === "CMHK")!
    const dataCm = ceil2((5.3 * 1 * 3 * DEFAULT_ASSUMPTIONS.dailyPct) / 7.8)
    expect(cm.dataUsd).toBe(dataCm)
    expect(cm.cogsUsd).toBe(ceil2(dataCm + fee))
    expect(cm.cogsVnd).toBe(Math.ceil(ceil2(dataCm + fee) * 26000 - 1e-9))
    const st = res.rows.find(r => r.vendor === "SINGTEL")!
    const dataSt = ceil2(0.9 * 1 * 3 * DEFAULT_ASSUMPTIONS.dailyPct)
    expect(st.dataUsd).toBe(dataSt)
    expect(st.cogsUsd).toBe(ceil2(dataSt + ceil2(2 / 6.7 + 0.1)))
    const th = res.rows.find(r => r.vendor === "THK")!
    expect(th.dataUsd).toBe(ceil2((6 * 1 * 3 * DEFAULT_ASSUMPTIONS.dailyPct) / 7.8))
    expect(th.cogsUsd).toBe(ceil2(th.dataUsd + 0.51))
  })
  test("không lộ mã SKU/Product/ProductID trong kết quả", () => {
    const json = JSON.stringify(res)
    expect(json).not.toMatch(/XXX|ProductID|skuUS|skuVN|productId/)
    expect(res.rows.every(r => r.form === "full")).toBe(true)
  })
  test("gói data rời (A) chỉ hiện khi bật includeDataOnly", () => {
    const withData = quote(ctx, { destKey: jp.key, sim: "eSIM", plans: [{ kind: "Daily", amount: 1, unit: "GB", days: [3] }], includeDataOnly: true })
    expect(withData.rows.some(r => r.form === "data")).toBe(true)
    expect(res.rows.some(r => r.form === "data")).toBe(false)
  })
  test("gói BC không bán (Fixed 7GB) vẫn tính giá nhưng gắn ghi chú; 3HK không bị gắn", () => {
    const r = quote(ctx, { destKey: jp.key, sim: "eSIM", plans: [{ kind: "Fixed", amount: 7, unit: "GB", days: [7] }] })
    expect(r.rows.find(x => x.vendor === "CMHK")!.note).toMatch(/Portal BC không có gói này/)
    expect(r.rows.find(x => x.vendor === "THK")!.note).toBeUndefined()
  })
  test("Unlimited chưa có hệ số thì không ra dòng và có cảnh báo, không văng lỗi", () => {
    const r = quote(ctx, { destKey: jp.key, sim: "eSIM", plans: [{ kind: "Unlimited", amount: 7, unit: "GB", speedMbps: 10, days: [3] }] })
    expect(r.rows.length).toBe(0)
    expect(r.notes.join(" ")).toMatch(/hệ số/)
  })
  test("điểm đến lạ → lỗi rõ ràng", () => {
    expect(() => quote(ctx, { destKey: "khong-co", sim: "eSIM", plans: [{ kind: "Daily", amount: 1, unit: "GB", days: [3] }] })).toThrow(/Không tìm thấy/)
  })
})
