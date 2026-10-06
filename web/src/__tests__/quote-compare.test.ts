import { describe, test, expect } from "vitest"
import {
  specFromSku, poolOffer, packageOffer, addPackage, addPoolPrice, compareRow, specKey,
  type PoolSource, type PackageSource, type PoolPrice,
} from "@/lib/quote-compare"

const a = { fixedPct: 0.55, dailyPct: 0.38 }
const hk3 = (): PoolSource => {
  const byIso = new Map<string, PoolPrice>()
  addPoolPrice(byIso, "JP", { price: 5, operator: "Docomo", kyc: false })
  addPoolPrice(byIso, "JP", { price: 6, operator: "Đắt hơn", kyc: false })
  addPoolPrice(byIso, "AU", { price: 6.5, operator: "Telstra", kyc: false })
  addPoolPrice(byIso, "NZ", { price: 6.5, operator: "Spark", kyc: false })
  return {
    id: "3HK", label: "3HK Datapool", currency: "HKD", toUsd: 1 / 7.798, byIso,
    frameUsd: { eSIM: 0.51, SIM: 0.42 },
    unlimitedGbPerDay: s => s === 10 ? 1.8 : s === 5 ? 1.6 : null,
  }
}

describe("specFromSku", () => {
  test("đọc loại gói, hình thức, tốc độ Unlimited", () => {
    expect(specFromSku("3CJPN3DF00507", ["JP"], 5, "GB", 7)).toEqual({ iso: ["JP"], plan: "Fixed", dataGb: 5, days: 7, speedMbps: null, form: "eSIM" })
    expect(specFromSku("1ETHA3DP5HM10", ["TH"], 500, "MB", 10)).toMatchObject({ plan: "Daily", dataGb: 500 / 1024, form: "SIM" })
    expect(specFromSku("3CJPN3DBUNL05", ["JP"], null, null, 5)).toMatchObject({ plan: "Unlimited", speedMbps: 10 })
    expect(specFromSku("1D0003DK00000", ["JP"], 0, "GB", 0)).toBeNull()
  })
})

describe("poolOffer", () => {
  test("khớp COGS thật 3HK Nhật Fixed 5GB/7 ngày eSIM (60.103đ ≈ 2,28 USD)", () => {
    const o = poolOffer(hk3(), specFromSku("3CJPN3DF00507", ["JP"], 5, "GB", 7)!, a)!
    // 5 × 0,55 = 2,75GB × 5 HKD = 13,75 HKD → 1,77 USD (ROUNDUP) + khung eSIM 0,51
    expect(o.usd).toBe(2.28)
    expect(o.detail).toContain("Docomo 5 HKD/GB")
  })
  test("Daily, Unlimited 10Mbps, data pack không cộng khung", () => {
    expect(poolOffer(hk3(), { iso: ["JP"], plan: "Daily", dataGb: 1, days: 10, speedMbps: null, form: "Data pack" }, a)!.usd).toBe(2.44) // 3,8GB × 5 = 19 HKD
    expect(poolOffer(hk3(), { iso: ["JP"], plan: "Unlimited", dataGb: 0, days: 5, speedMbps: 10, form: "eSIM" }, a)!.usd).toBe(ceilSum(45 / 7.798, 0.51))
    expect(poolOffer(hk3(), { iso: ["JP"], plan: "Unlimited", dataGb: 0, days: 5, speedMbps: 20, form: "eSIM" }, a)).toBeNull()
  })
  test("nhiều nước: phải phủ đủ, lấy nước đắt nhất", () => {
    expect(poolOffer(hk3(), { iso: ["AU", "NZ"], plan: "Fixed", dataGb: 2, days: 7, speedMbps: null, form: "SIM" }, a)!.detail).toContain("6.5 HKD/GB")
    expect(poolOffer(hk3(), { iso: ["AU", "SG"], plan: "Fixed", dataGb: 2, days: 7, speedMbps: null, form: "SIM" }, a)).toBeNull()
  })
})

const ceilSum = (x: number, y: number) => Math.ceil((Math.ceil(x * 100 - 1e-9) / 100 + y) * 100 - 1e-9) / 100

describe("packageOffer", () => {
  const wm: PackageSource = { id: "WM", label: "WorldMove", offers: new Map(), simFrameUsd: 0.6 }
  addPackage(wm, { iso: ["JP"], plan: "Fixed", dataGb: 5, days: 7, priceUsd: 3, name: "A", kyc: false })
  addPackage(wm, { iso: ["JP"], plan: "Fixed", dataGb: 5, days: 7, priceUsd: 2.5, name: "B rẻ hơn", kyc: false })
  test("khớp đúng gói, giữ gói rẻ nhất, SIM cộng khung, data pack không áp dụng", () => {
    const spec = specFromSku("3CJPN3DF00507", ["JP"], 5, "GB", 7)!
    expect(packageOffer(wm, spec)).toMatchObject({ usd: 2.5, detail: expect.stringContaining("B rẻ hơn") })
    expect(packageOffer(wm, { ...spec, form: "SIM" })!.usd).toBe(3.1)
    expect(packageOffer(wm, { ...spec, form: "Data pack" })).toBeNull()
    expect(packageOffer(wm, { ...spec, days: 10 })).toBeNull()
  })
  test("specKey không phụ thuộc thứ tự nước", () => {
    expect(specKey(["NZ", "AU"], "Fixed", 2, 7)).toBe(specKey(["AU", "NZ"], "Fixed", 2, 7))
  })
})

describe("compareRow", () => {
  test("tiết kiệm tính trên phương án rẻ nhất KHÁC vendor hiện tại", () => {
    const base = { sku: "X", market: "Japan", vendor: "3HK DATAPOOL", form: "eSIM" as const, plan: "Fixed" as const, size: "", units: 100, rev: 0, currentUsd: 3 }
    const r = compareRow(base, [
      { source: "3HK", label: "3HK", usd: 2.28, detail: "", kyc: false },
      { source: "WM", label: "WM", usd: 2.5, detail: "", kyc: false },
    ], "3HK", 26000)
    expect(r.best?.source).toBe("WM")
    expect(r.savePerUnitUsd).toBe(0.5)
    expect(r.saveQuarterVnd).toBe(1_300_000)
    expect(r.offers[0].source).toBe("3HK")
  })
})
