import { expect, it } from "vitest"
import { build as buildBc, SKU_HEADERS, PRODUCT_HEADERS } from "@/lib/bc-datapool/builder"
import { build as buildThk } from "@/lib/threehk-datapool/builder"
import type { Frames, ThkPlanInput, Policy } from "@/lib/threehk-datapool/builder"
import { DEFAULT_ASSUMPTIONS, type PriceList, type ProductInput, type PlanLine } from "@/lib/bc-datapool/types"

const FX = { hkdPerUsd: 7.807, cnyPerUsd: 6.681, vndPerUsd: 26153, vndPerUsdInc: 25626.2 }
const A = { ...DEFAULT_ASSUMPTIONS, fixedPct: 0.55, dailyPct: 0.35, unl3gb10: 2, unlLevels: [{ dataMb: 3072, speedMbps: 10, gbPerDay: 2 }, { dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }] }
const FRAMES: Frames = { esimUsUsd: 0.51, simUsUsd: 0.34, simVnVnd: 11061 }
const bad: string[] = []
const chk = (c: boolean, m: string) => { if (!c) bad.push(m) }

function checkSheets(tag: string, s: { skuUS: (string | number)[][]; skuVN: (string | number)[][]; productUS: (string | number)[][]; productVN: (string | number)[][] }) {
  const usSkus = new Set(s.skuUS.map(r => String(r[20]))), vnSkus = new Set(s.skuVN.map(r => String(r[20])))
  const usProds = new Set(s.productUS.map(r => String(r[r.length - 1]))), vnProds = new Set(s.productVN.map(r => String(r[r.length - 1])))
  for (const [ten, rows, prods, skus] of [["US", s.skuUS, usProds, usSkus], ["VN", s.skuVN, vnProds, vnSkus]] as const) {
    for (const r of rows) {
      const sku = String(r[20]), pc = String(r[1])
      chk(r.length === SKU_HEADERS.length, `${tag} ${sku}: độ dài hàng SKU ${r.length} ≠ ${SKU_HEADERS.length}`)
      chk(sku.length === 13, `${tag} ${sku}: SKU không 13 ký tự`)
      chk(pc.length === 8, `${tag} ${sku}: product code "${pc}" không 8 ký tự`)
      chk(sku.startsWith(pc), `${tag} ${sku}: SKU không bắt đầu bằng product code ${pc}`)
      chk(prods.has(pc), `${tag} ${sku}: product code ${pc} không có trong sheet Product ${ten}`)
      chk(r[0] === ten, `${tag} ${sku}: cột tenant = ${r[0]}`)
      chk(r[11] === (ten === "US" ? "USD" : "VND"), `${tag} ${sku}: tiền tệ ${r[11]} sai cho ${ten}`)
      chk(Number(r[10]) > 0, `${tag} ${sku}: giá vốn ${r[10]} không dương`)
      if (ten === "VN") chk(Number.isInteger(Number(r[10])), `${tag} ${sku}: giá VND ${r[10]} không nguyên`)
      if (r[8]) chk(true, "")
      const dp = String(r[9])
      if (dp) chk(skus.has(dp), `${tag} ${sku}: datapackSku ${dp} không có trong sheet SKU ${ten}`)
      // vendorSku VN phải trỏ tới SKU US có thật (nếu có điền)
      if (ten === "VN") for (const col of [18, 19]) { const v = String(r[col] ?? ""); if (v) chk(usSkus.has(v), `${tag} ${sku}: vendorSku(${col}) ${v} không có SKU US`) }
      chk(String(r[6]).trim() === String(r[6]) && String(r[7]).trim() === String(r[7]), `${tag} ${sku}: tên có khoảng trắng thừa đầu/cuối`)
      chk(!/NaN|undefined|null/.test(r.join("|")), `${tag} ${sku}: có NaN/undefined/null trong hàng`)
    }
  }
  for (const r of [...s.productUS, ...s.productVN]) {
    chk(r.length === PRODUCT_HEADERS.length, `${tag} product ${r[r.length - 1]}: độ dài hàng ${r.length} ≠ ${PRODUCT_HEADERS.length}`)
    chk(!/NaN|undefined|null/.test(r.join("|")), `${tag} product ${r[r.length - 1]}: có NaN/undefined/null`)
  }
}

// Bất biến cho cả 2 builder (BC + 3HK) trên ~730 tổ hợp: độ dài hàng khớp header, SKU 13 ký tự, product code tồn tại trong sheet cùng tenant, tiền tệ đúng tenant,
// giá > 0 (VND nguyên), datapackSku/vendorSku trỏ tới SKU có thật, không NaN/undefined/null trong hàng. Gồm cả dung lượng không hợp lệ (0, âm, 1000MB...) để chắc chỉ ra cảnh báo, không ra hàng hỏng.
it("bất biến builder BC + 3HK", () => {
  // ───── 3HK ─────
  const policies: Policy[] = ["F", "P", "T", "X"]
  const amounts: [number, "GB" | "MB"][] = [[1, "GB"], [1.5, "GB"], [5, "GB"], [10, "GB"], [500, "MB"], [100, "MB"], [900, "MB"], [0.5, "GB"], [999, "GB"], [0, "GB"], [1.25, "GB"], [1000, "MB"], [-1, "GB"], [550, "MB"]]
  let n3 = 0
  for (const sim of ["eSIM", "SIM"] as const) for (const usSimFull of [false, true]) for (const vnEsimData of [false, true]) for (const policy of policies) for (const [amount, unit] of amounts) {
    const plan: ThkPlanInput = { policy, amount: policy === "X" ? 3 : amount, unit: policy === "X" ? "GB" : unit, days: [1, 7, 15, 30, 99] }
    const r = buildThk([{ input: { simType: sim, supportCountryCode: "THA", isoCodes: "TH", countryNameEn: "Thailand", countryNameVn: "Thái Lan", plans: [plan], usSimFull, vnEsimData }, price: { pricePerGbHkd: 5, network: "AIS", kyc: false }, tpls: [] }], { fx: FX, a: A, frames: FRAMES })
    n3++
    checkSheets(`3HK ${sim} ${policy} ${amount}${unit} us=${usSimFull} vn=${vnEsimData}`, r.sheets)
    chk(r.costRows.length === r.usCost.length + r.vnCost.length - r.costRows.filter((_, i) => r.usCost.includes(i) && r.vnCost.includes(i)).length, `3HK ${sim} ${policy}: costRows không khớp usCost/vnCost`)
  }
  // 2 dòng gói cùng SKU, 2 sản phẩm cùng nước
  const dup = buildThk([{ input: { simType: "eSIM", supportCountryCode: "THA", isoCodes: "TH", countryNameEn: "Thailand", countryNameVn: "Thái Lan", plans: [{ policy: "F", amount: 5, unit: "GB", days: [7] }, { policy: "F", amount: 5, unit: "GB", days: [7] }] }, price: { pricePerGbHkd: 5, network: "AIS", kyc: false }, tpls: [] }], { fx: FX, a: A, frames: FRAMES })

  // ───── BC ─────
  const list: PriceList = { fileName: "x", uploadedAt: "", pools: {
    CMHK: { currency: "HKD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [{ coverage: "Japan", operator: "KDDI", plmn: "1", pricePerGb: 5.3, kyc: false }, { coverage: "Japan", operator: "SB", plmn: "2", pricePerGb: 5.5, kyc: true }] },
    SINGTEL: { currency: "USD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [{ coverage: "Taiwan", operator: "TM", plmn: "3", pricePerGb: 0.68, kyc: false }] } } }
  let nb = 0
  for (const pool of ["CMHK", "SINGTEL"] as const) for (const sim of ["eSIM", "SIM"] as const) {
    const cov = pool === "CMHK" ? "Japan" : "Taiwan"
    for (const kind of ["Daily", "Fixed", "Unlimited"] as const) for (const [amount, unit] of amounts) for (const speed of [10, 5, 7]) {
      if (kind !== "Unlimited" && speed !== 10) continue
      const pl: PlanLine = kind === "Unlimited"
        ? { kind, dataAmount: amount, unit, days: [1, 7, 30], productId: "123", speedMbps: speed, bcAmount: amount * 2, bcUnit: unit }
        : { kind, dataAmount: amount, unit, days: [1, 7, 30], productId: "123" }
      const p: ProductInput = { pool, simType: sim, coverages: [cov], operators: list.pools[pool].rows.map(r => `${r.coverage}|${r.operator}`), supportCountryCode: pool === "CMHK" ? "JPN" : "TWN", isoCodes: pool === "CMHK" ? "JP" : "TW", countryNameEn: cov, countryNameVn: cov, plans: [pl] }
      const r = buildBc([p], list, FX, A, { whiteSimVnd: 16028 })
      nb++
      checkSheets(`BC ${pool} ${sim} ${kind} ${amount}${unit} ${speed}`, r.sheets)
    }
  }
  const uniq = Array.from(new Set(bad))
  expect(uniq.slice(0, 10)).toEqual([])
  expect(n3).toBeGreaterThan(400); expect(nb).toBeGreaterThan(250)
  expect(dup.warnings.some(w => /trùng SKU/.test(w))).toBe(true)
}, 120000)
