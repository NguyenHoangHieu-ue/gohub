import { describe, expect, test } from "vitest"
import { dropExisting } from "@/lib/bc-datapool/dedupe"
import { DEFAULT_ASSUMPTIONS } from "@/lib/bc-datapool/types"
import { build, productCode, type Frames, type ProductTpl, type ThkPlanInput } from "@/lib/threehk-datapool/builder"
import { priceOf, resolveSupport, type NccRow } from "@/lib/threehk-datapool/resolve"

// Tỷ giá lúc tạo gói Thái Lan trong hệ thống: HKD/USD cho EA Fixed 5GB = 1.75 USD
const FX = { hkdPerUsd: 7.86, cnyPerUsd: 6.7, vndPerUsd: 26000, vndPerUsdInc: 25600 }
const FRAMES: Frames = { esimUsUsd: 0.51, simUsUsd: 0.34, simVnVnd: 11061 }
const PRICE = { pricePerGbHkd: 5, network: "AIS / True", kyc: false }
const TPL: ProductTpl = {
  product_code: "ECTHA3DX", tenant: "US", supported_countries: "TH", network_type: "4G/5G", onsite_carrier: "AIS / True", kyc_code: "1", kyc_needed: "No", kyc_links: null,
  note: "note TH", activation_time: "It will be activated after receiving the network signal.", activation: null, local_phone_number: "No", local_number_country: null,
  top_up_options: "No", hotspot: "Yes", apn_original: "mobile.three.com.hk", apn: "gohub.com",
}
type Extra = { usSimFull?: boolean; vnEsimData?: boolean }
const input = (sim: "eSIM" | "SIM", plans: ThkPlanInput[], extra: Extra = {}) => ({
  input: { simType: sim, supportCountryCode: "THA", isoCodes: "TH", countryNameEn: "Thailand", countryNameVn: "Thái Lan", plans, ...extra },
  price: PRICE, tpls: [TPL],
})
const run = (sim: "eSIM" | "SIM", plans: ThkPlanInput[], extra: Extra = {}) => build([input(sim, plans, extra)], { fx: FX, a: DEFAULT_ASSUMPTIONS, frames: FRAMES })
const skuOf = (rows: (string | number)[][], code: string) => rows.find(r => r[20] === code)!

describe("3HK Datapool builder", () => {
  test("mã Product theo tenant/loại", () => {
    expect(productCode("US", "C", "THA", "X")).toBe("ECTHA3DX")
    expect(productCode("VN", "A", "THA", "F")).toBe("3ATHA3DF")
    expect(productCode("US", "E", "CHN", "P")).toBe("CECHN3DP")
  })

  test("eSIM Fixed 5GB 5 ngày khớp hệ thống: EA 1.75, EC = EA + khung 0.51", () => {
    const r = run("eSIM", [{ policy: "F", amount: 5, unit: "GB", days: [5] }])
    expect(r.warnings.filter(w => !/chưa có Product/.test(w))).toEqual([])
    const ea = skuOf(r.sheets.skuUS, "EATHA3DF00505"), ec = skuOf(r.sheets.skuUS, "ECTHA3DF00505")
    expect(ea[10]).toBe(1.75); expect(ea[8]).toBe(""); expect(ea[18]).toBe("")
    expect(ec[10]).toBe(2.26); expect(ec[8]).toBe("AB0003DK00000"); expect(ec[9]).toBe("EATHA3DF00505")
    expect(ea[12]).toBe("256 kbps"); expect(ea[17]).toBe(60)
    const c3 = skuOf(r.sheets.skuVN, "3CTHA3DF00505")
    expect(c3[18]).toBe("ECTHA3DF00505"); expect(c3[8]).toBe(""); expect(c3[10]).toBe(Math.ceil(2.26 * 26000))
    expect(r.sheets.skuVN.map(x => x[20])).toEqual(["3CTHA3DF00505"])
  })

  test("đặc biệt: eSIM data đầu VN (vnEsimData)", () => {
    const r = run("eSIM", [{ policy: "F", amount: 5, unit: "GB", days: [5] }], { vnEsimData: true })
    const a3 = skuOf(r.sheets.skuVN, "3ATHA3DF00505")
    expect(a3[18]).toBe("EATHA3DF00505"); expect(a3[19]).toBe("EATHA3DF00505"); expect(a3[10]).toBe(Math.ceil(1.75 * 26000))
    expect(r.sheets.skuVN.map(x => x[20]).sort()).toEqual(["3ATHA3DF00505", "3CTHA3DF00505"])
    expect(r.sheets.productVN.map(x => x[35]).sort()).toEqual(["3ATHA3DF", "3CTHA3DF"])
  })

  test("Fixed: giá không đổi theo số ngày; Daily nhân số ngày", () => {
    const f = run("eSIM", [{ policy: "F", amount: 5, unit: "GB", days: [5, 15] }])
    expect(skuOf(f.sheets.skuUS, "EATHA3DF00515")[10]).toBe(1.75)
    const d = run("eSIM", [{ policy: "T", amount: 1, unit: "GB", days: [1, 3] }])
    // 1GB × 5 HKD × 38% = 1.9 HKD / 7.86 = 0.2417 → 0.25 ; 3 ngày = 5.7 / 7.86 = 0.7252 → 0.73
    expect(skuOf(d.sheets.skuUS, "EATHA3DT00101")[10]).toBe(0.25)
    expect(skuOf(d.sheets.skuUS, "EATHA3DT00103")[10]).toBe(0.73)
  })

  test("Unlimited X: 3GB→10Mbps, 1.7 GB/ngày, throttle + dataMB/speedMbps", () => {
    const r = run("eSIM", [{ policy: "X", amount: 3, unit: "GB", days: [15] }])
    const ea = skuOf(r.sheets.skuUS, "EATHA3DX00315")
    // 5 × 1.7 × 15 = 127.5 HKD / 7.86 = 16.22 USD
    expect(ea[10]).toBe(16.23)
    expect(ea[12]).toBe("3GB of high-speed data per day, then unlimited data at 10Mbps"); expect(ea[13]).toBe(3072); expect(ea[14]).toBe(10)
    expect(skuOf(r.sheets.skuVN, "3CTHA3DX00315")[12]).toMatch(/tốc độ cao mỗi ngày/)
    const prod = r.sheets.productUS.find(p => p[35] === "ECTHA3DX")!
    expect(prod[17]).toBe("GMT + 8"); expect(prod[33]).toBe("note TH"); expect(prod[6]).toBe("X")
  })

  test("Unlimited sai dung lượng bị chặn", () => {
    const r = run("eSIM", [{ policy: "X", amount: 5, unit: "GB", days: [3] }])
    expect(r.warnings.some(w => /chưa có hệ số GB\/ngày cho Unlimited 5GB/.test(w))).toBe(true)
    expect(r.sheets.skuUS).toHaveLength(0)
  })

  test("SIM: datapack A + SIM full E (US = EA + 0.34 · VN = EA VND + khung 11.061)", () => {
    const base = run("SIM", [{ policy: "F", amount: 5, unit: "GB", days: [5] }])
    expect(base.sheets.skuUS.map(x => x[20])).toEqual(["EATHA3DF00505"])
    expect(base.sheets.skuVN.map(x => x[20]).sort()).toEqual(["3ATHA3DF00505", "3ETHA3DF00505"])
    const r = run("SIM", [{ policy: "F", amount: 5, unit: "GB", days: [5] }], { usSimFull: true })
    const ce = skuOf(r.sheets.skuUS, "CETHA3DF00505"), e3 = skuOf(r.sheets.skuVN, "3ETHA3DF00505")
    expect(ce[10]).toBe(2.09); expect(ce[8]).toBe("CD0003DK00000"); expect(ce[9]).toBe("EATHA3DF00505")
    expect(e3[10]).toBe(Math.ceil(1.75 * 26000) + 11061); expect(e3[8]).toBe("1D0003DK00000"); expect(e3[9]).toBe("3ATHA3DF00505")
    expect(r.sheets.productUS.find(p => p[35] === "CETHA3DF")![1]).toBe("C")
    expect(r.sheets.productUS.find(p => p[35] === "EATHA3DF")![15]).toMatch(/AB0003DK00000/)
  })

  test("thiếu giá khung → bỏ loại đó và cảnh báo", () => {
    const r = build([input("eSIM", [{ policy: "F", amount: 5, unit: "GB", days: [5] }])], { fx: FX, a: DEFAULT_ASSUMPTIONS, frames: { ...FRAMES, esimUsUsd: null } })
    expect(r.warnings.some(w => /thiếu giá khung eSIM/.test(w))).toBe(true)
    expect(r.sheets.skuUS.map(x => x[20])).toEqual(["EATHA3DF00505"])
  })

  test("MB mã hoá 3HM; ngày/dung lượng không mã hoá được bị báo", () => {
    expect(skuOf(run("eSIM", [{ policy: "F", amount: 300, unit: "MB", days: [1] }]).sheets.skuUS, "EATHA3DF3HM01")).toBeTruthy()
    expect(run("eSIM", [{ policy: "F", amount: 250, unit: "MB", days: [1] }]).warnings.some(w => /không mã hoá được/.test(w))).toBe(true)
  })

  test("bỏ SKU/Product đã có (dùng chung dedupe với BC)", () => {
    const r = run("eSIM", [{ policy: "F", amount: 5, unit: "GB", days: [5, 15] }], { vnEsimData: true })
    const { result, skipped } = dropExisting(r, new Map([["EATHA3DF00505", "Active"], ["3ATHA3DF00505", "Active"]]), new Map([["EATHA3DF", "Active"]]))
    expect(skipped.skus.map(s => s.sku).sort()).toEqual(["3ATHA3DF00505", "EATHA3DF00505"])
    expect(skipped.products.map(p => p.code)).toEqual(["EATHA3DF"])
    expect(result.sheets.skuUS.map(x => x[20])).not.toContain("EATHA3DF00505")
    expect(result.sheets.skuUS.map(x => x[20])).toContain("EATHA3DF00515")
  })
})

describe("3HK giá + nước", () => {
  const ncc: NccRow[] = [
    { zone: "B", country: "Thailand", network: "AIS / True", price_per_gb_hkd: 5, is_kyc: false },
    { zone: "B", country: "Taiwan", network: "Chunghwa", price_per_gb_hkd: 5, is_kyc: true },
    { zone: "C", country: "Germany", network: "Vodafone Germany", price_per_gb_hkd: 7, is_kyc: false },
  ]
  test("nhiều nước: lấy giá đắt nhất, KYC nếu có nước KYC", () => {
    expect(priceOf(ncc, ["Thailand", "Germany"])).toMatchObject({ pricePerGbHkd: 7, kyc: false })
    expect(priceOf(ncc, ["Thailand", "Taiwan"])?.kyc).toBe(true)
    expect(priceOf(ncc, ["Thailand", "Nowhere"])).toBeNull()
  })
  test("resolveSupport: ưu tiên mã ISO alpha-3 khi nhiều mã cùng tên", () => {
    const groups = [
      { code: "THD", en: "Thailand", vn: "Thái Lan", iso: "TH" },
      { code: "THA", en: "Thailand", vn: "Thái Lan", iso: "TH" },
    ]
    expect(resolveSupport(["Thailand"], groups, []).code).toBe("THA")
    expect(resolveSupport(["Narnia"], groups, []).code).toBe("")
  })
})

describe("3HK Unlimited tự thêm ở Công Thức Datapool", () => {
  const A2 = { ...DEFAULT_ASSUMPTIONS, unl3gb10: 2, unlCustom: [{ dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }, { dataMb: 500, speedMbps: 10, gbPerDay: 1.9 }] }
  const runA = (plans: ThkPlanInput[]) => build([input("eSIM", plans)], { fx: FX, a: A2, frames: FRAMES })

  test("1GB + 5Mbps: tên, throttle, dataMB/speedMbps, giá theo hệ số 2.1, mã X dung lượng 001", () => {
    const r = runA([{ policy: "X", amount: 1, unit: "GB", speedMbps: 5, days: [5] }])
    expect(r.warnings.filter(w => !/chưa có Product/.test(w))).toEqual([])
    const ea = skuOf(r.sheets.skuUS, "EATHA3DX00105")
    expect(ea[6]).toBe("eSIM Thái Lan Unlimited 5mbps 5 ngày"); expect(ea[7]).toBe("eSIM Thailand Unlimited 5mbps 5 Day(s)")
    expect(ea[12]).toBe("1GB of high-speed data per day, then unlimited data at 5Mbps"); expect(ea[13]).toBe(1024); expect(ea[14]).toBe(5)
    // 2.1 GB/ngày × 5 ngày × 5 HKD = 52.5 HKD → /7.86 = 6.68 → ROUNDUP 6.68
    expect(ea[10]).toBe(Math.ceil((52.5 / FX.hkdPerUsd) * 100 - 1e-9) / 100)
    expect(skuOf(r.sheets.skuVN, "3CTHA3DX00105")[12]).toBe("1GB tốc độ cao mỗi ngày, sau đó không giới hạn ở tốc độ 5Mbps")
    expect(r.costRows[0].unlCustomIdx).toBe(0)
  })
  test("500MB + 10Mbps (mức tự thêm) mã 5HM; mức có sẵn 3GB+10Mbps vẫn hoạt động với hệ số 2", () => {
    const r = runA([{ policy: "X", amount: 500, unit: "MB", speedMbps: 10, days: [3] }, { policy: "X", amount: 3, unit: "GB", days: [3] }])
    expect(r.sheets.skuUS.map(x => x[20])).toEqual(expect.arrayContaining(["EATHA3DX5HM03", "EATHA3DX00303"]))
    expect(skuOf(r.sheets.skuUS, "EATHA3DX5HM03")[13]).toBe(500)
    expect(r.costRows.find(c => c.skuUS === "EATHA3DX00303")!.unlKey).toBe("unl3gb10")
  })
  test("mức chưa khai báo → cảnh báo chặn xuất, không sinh SKU", () => {
    const r = runA([{ policy: "X", amount: 2, unit: "GB", speedMbps: 10, days: [3] }])
    expect(r.warnings.some(w => /chưa có hệ số GB\/ngày cho Unlimited 2GB tốc độ cao \+ 10Mbps/.test(w))).toBe(true)
    expect(r.sheets.skuUS).toHaveLength(0)
  })
  test("file xuất: hệ số tự thêm nằm ở R11 và công thức dòng đó trỏ R11", async () => {
    const { buildWorkbook, CALC_SHEET } = await import("@/lib/threehk-datapool/export")
    const r = runA([{ policy: "X", amount: 1, unit: "GB", speedMbps: 5, days: [5] }])
    const ws = buildWorkbook(r, { fx: FX, a: A2, frames: FRAMES }).Sheets[CALC_SHEET]
    expect(ws["R11"].v).toBe(2.1); expect(ws["R12"].v).toBe(1.9)
    expect(ws["J2"].f).toBe("ROUNDUP(H2*$R$11*G2,2)")
    expect(ws["D2"].v).toBe("Unlimited 5Mbps")
  })
})

describe("coveredGroups (thêm cả nhóm nước)", () => {
  const ncc: NccRow[] = [
    { zone: "D", country: "Australia", network: "Telstra", price_per_gb_hkd: 5, is_kyc: false }, { zone: "D", country: "New Zealand", network: "Spark", price_per_gb_hkd: 5, is_kyc: false },
    { zone: "A2", country: "UK", network: "EE", price_per_gb_hkd: 5, is_kyc: false }, { zone: "A2", country: "US", network: "TMO", price_per_gb_hkd: 5, is_kyc: false },
  ]
  const refs = [{ code: "AU", name: "Australia" }, { code: "NZ", name: "New Zealand" }, { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" }]
  const groups = [
    { code: "ANZ", en: "Australia, New Zealand", vn: "", iso: "AU, NZ" }, { code: "USK", en: "UK US", vn: "", iso: "GB,US" },
    { code: "XYZ", en: "Có nước không có trong bảng giá", vn: "", iso: "AU,FR" }, { code: "AUS", en: "Australia", vn: "", iso: "AU" },
  ]
  test("chỉ nhóm ≥ 2 nước và MỌI nước đều có trong bảng giá; nhận US/UK", async () => {
    const { coveredGroups } = await import("@/lib/threehk-datapool/resolve")
    const r = coveredGroups(ncc, groups, refs)
    expect(r.map(g => g.code).sort()).toEqual(["ANZ", "USK"])
    expect(r.find(g => g.code === "ANZ")!.countries).toEqual(["Australia", "New Zealand"])
    expect(r.find(g => g.code === "USK")!.countries).toEqual(["UK", "US"])
  })
})
