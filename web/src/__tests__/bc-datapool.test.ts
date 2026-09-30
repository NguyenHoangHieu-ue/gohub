import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { build, PRODUCT_HEADERS, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import { dataCode, dayCode, productCode, skuCode } from "@/lib/bc-datapool/codes"
import { parsePriceList } from "@/lib/bc-datapool/price-list"
import { ceil2, dataCostUsd, frameFeeUsd, usdToVnd } from "@/lib/bc-datapool/pricing"
import { DEFAULT_ASSUMPTIONS, type PlanKind, type PlanLine, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"

const A = DEFAULT_ASSUMPTIONS
// Tỷ giá đúng như lúc làm file mẫu Taiwan (Singtel) và Japan (CMHK)
const FX_TW = { hkdPerUsd: 7.801, cnyPerUsd: 6.687, vndPerUsd: 26266 }
const FX_JP = { hkdPerUsd: 7.802, cnyPerUsd: 6.687, vndPerUsd: 26490 }
const plan = (p: Partial<PlanLine>): PlanLine => ({ kind: "Daily", dataAmount: 500, unit: "MB", days: [1], productId: "1", ...p })

const list: PriceList = {
  fileName: "t.xlsx",
  uploadedAt: "",
  pools: {
    CMHK: { currency: "HKD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [
      { coverage: "Japan", operator: "KDDI", plmn: "44051", pricePerGb: 5.3, kyc: false },
      { coverage: "Japan", operator: "SoftBank", plmn: "44020", pricePerGb: 5.3, kyc: false },
    ] },
    SINGTEL: { currency: "USD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [
      { coverage: "Taiwan", operator: "Taiwan Mobile", plmn: "46697", pricePerGb: 0.68, kyc: false },
      { coverage: "Taiwan", operator: "Chunghwa Telecom", plmn: "46692", pricePerGb: 0.95, kyc: false },
    ] },
  },
}

describe("mã SKU / Product", () => {
  test("mã dung lượng theo wiki ma-sku", () => {
    expect(dataCode(500, "MB")).toBe("5HM")
    expect(dataCode(100, "MB")).toBe("1HM")
    expect(dataCode(1.5, "GB")).toBe("1D5")
    expect(dataCode(0.5, "GB")).toBe("0D5")
    expect(dataCode(5, "GB")).toBe("005")
    expect(dataCode(50, "GB")).toBe("050")
    expect(dataCode(550, "MB")).toBeNull()
    expect(dataCode(1000, "MB")).toBeNull()
    expect(dataCode(1.25, "GB")).toBeNull()
  })
  test("mã ngày 2 ký tự", () => {
    expect(dayCode(1)).toBe("01")
    expect(dayCode(30)).toBe("30")
    expect(dayCode(100)).toBeNull()
  })
  test("khớp mã trong file mẫu Taiwan/Japan", () => {
    expect(productCode("US", "eSIM", "TWN", "SINGTEL", "Daily")).toBe("ECTWNW1T")
    expect(productCode("VN", "eSIM", "TWN", "SINGTEL", "Fixed")).toBe("3CTWNW1F")
    expect(productCode("US", "eSIM", "JPN", "CMHK", "Unlimited")).toBe("ECJPNWDX")
    expect(skuCode("ECTWNW1T", 500, "MB", 1)).toBe("ECTWNW1T5HM01")
    expect(skuCode("ECTWNW1T", 1.5, "GB", 30)).toBe("ECTWNW1T1D530")
    expect(skuCode("3CJPNWDX", 3, "GB", 1)).toBe("3CJPNWDX00301")
  })
})

describe("giá vốn — khớp số trong file mẫu", () => {
  test("Singtel Taiwan (USD): Daily 500MB×1 = 0.93, Fixed 5GB = 2.67, VND 24428", () => {
    const fee = frameFeeUsd("eSIM", list.pools.SINGTEL, FX_TW)
    expect(fee).toBe(0.8)
    const d1 = dataCostUsd(plan({}), 1, 0.68, "USD", FX_TW, A)
    expect(d1).toBe(0.13)
    expect(ceil2(d1 + fee)).toBe(0.93)
    expect(usdToVnd(0.93, FX_TW)).toBe(24428)
    const fixed = dataCostUsd(plan({ kind: "Fixed", dataAmount: 5, unit: "GB" }), 30, 0.68, "USD", FX_TW, A)
    expect(Math.round((fixed + fee) * 100) / 100).toBe(2.67)
  })
  test("Singtel Taiwan Daily 3GB×30 = 24.06", () => {
    const fee = frameFeeUsd("eSIM", list.pools.SINGTEL, FX_TW)
    const d = dataCostUsd(plan({ dataAmount: 3, unit: "GB" }), 30, 0.68, "USD", FX_TW, A)
    expect(Math.round((d + fee) * 100) / 100).toBe(24.06)
  })
  test("CMHK Japan (HKD): phí khung 0.36, Daily 500MB×1 = 0.49, VND 12981", () => {
    const fee = frameFeeUsd("eSIM", list.pools.CMHK, FX_JP)
    expect(fee).toBe(0.36)
    const d = dataCostUsd(plan({}), 1, 5.3, "HKD", FX_JP, A)
    expect(d).toBe(0.13)
    expect(Math.round((d + fee) * 100) / 100).toBe(0.49)
    expect(usdToVnd(0.49, FX_JP)).toBe(12981)
  })
  test("CMHK Japan Unlimited 1 ngày = 1.52 (1.7GB/ngày, không nhân %)", () => {
    const fee = frameFeeUsd("eSIM", list.pools.CMHK, FX_JP)
    const d = dataCostUsd(plan({ kind: "Unlimited", dataAmount: 3, unit: "GB" }), 1, 5.3, "HKD", FX_JP, A)
    expect(Math.round((d + fee) * 100) / 100).toBe(1.52)
  })
})

describe("build()", () => {
  const product = (over: Partial<ProductInput> = {}): ProductInput => ({
    pool: "CMHK", simType: "eSIM", coverages: ["Japan"], operators: ["Japan|KDDI", "Japan|SoftBank"],
    supportCountryCode: "JPN", isoCodes: "JP", countryNameEn: "Japan", countryNameVn: "Nhật Bản",
    plans: [plan({ productId: "111" }), plan({ kind: "Unlimited", dataAmount: 3, unit: "GB", days: [1, 2], productId: "222" })],
    ...over,
  })

  test("đủ số cột như template, US/VN đối xứng, vendorSku VN = SKU US", () => {
    const r = build([product()], list, FX_JP, A)
    expect(r.warnings).toEqual([])
    expect(r.sheets.skuUS).toHaveLength(3)
    expect(r.sheets.skuVN).toHaveLength(3)
    expect(r.sheets.productUS).toHaveLength(2)
    for (const row of [...r.sheets.skuUS, ...r.sheets.skuVN]) expect(row).toHaveLength(SKU_HEADERS.length)
    for (const row of [...r.sheets.productUS, ...r.sheets.productVN]) expect(row).toHaveLength(PRODUCT_HEADERS.length)
    expect(r.sheets.skuUS[0][18]).toBe("ECJPNWDT5HM01")
    expect(r.sheets.skuUS[0][16]).toBe("111")
    expect(r.sheets.skuVN[0][18]).toBe("3CJPNWDT5HM01")
    expect(r.sheets.skuVN[0][16]).toBe("ECJPNWDT5HM01")
    expect(r.sheets.skuUS[0][10]).toBe(0.49)
    expect(r.sheets.skuVN[0][10]).toBe(12981)
    expect(r.sheets.skuUS[1][6]).toBe("eSIM Nhật Bản Unlimited 10mbps 1 ngày")
    expect(r.sheets.skuUS[1][12]).toBe("3GB of high-speed data per day, then unlimited data at 10Mbps")
    expect(r.sheets.productUS.map(x => x[35])).toEqual(["ECJPNWDT", "ECJPNWDX"])
    expect(r.sheets.productUS[0][22]).toBe("KDDI/SoftBank")
    expect(r.sheets.productVN[0][1]).toBe(3)
  })

  test("nhiều nhà mạng → lấy giá cao nhất đã chọn", () => {
    const p = product({ pool: "SINGTEL", coverages: ["Taiwan"], supportCountryCode: "TWN", isoCodes: "TW",
      operators: ["Taiwan|Taiwan Mobile", "Taiwan|Chunghwa Telecom"], plans: [plan({ kind: "Fixed", dataAmount: 5, unit: "GB", productId: "9" })] })
    const r = build([p], list, FX_TW, A)
    expect(r.costRows[0].pricePerGb).toBe(0.95)
  })

  test("cảnh báo: thiếu ProductID, trùng SKU, không mã hoá được", () => {
    const p = product({ plans: [plan({ productId: "" }), plan({ productId: "2" }), plan({ dataAmount: 550, productId: "3" })] })
    const w = build([p], list, FX_JP, A).warnings.join("\n")
    expect(w).toContain("chưa nhập ProductID")
    expect(w).toContain("trùng SKU ECJPNWDT5HM01")
    expect(w).toContain("không mã hoá được 550MB")
  })
})

const ROOT = path.resolve(__dirname, "../../..")
describe("template bắt buộc & bảng báo giá thật (chỉ chạy khi file có trong repo root)", () => {
  const tpl = path.join(ROOT, "Format_add_new_packages.xlsx")
  test.skipIf(!existsSync(tpl))("tiêu đề cột khớp Format_add_new_packages.xlsx", () => {
    const wb = XLSX.readFile(tpl)
    const head = (n: string) => (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1 })[0] ?? []).filter(x => x != null)
    expect(head("Template_sku_US")).toEqual(SKU_HEADERS)
    expect(head("Template_sku_VN")).toEqual(SKU_HEADERS)
    expect(head("Template_product_US")).toEqual(PRODUCT_HEADERS)
    expect(head("Template_product_VN")).toEqual(PRODUCT_HEADERS)
  })
  const price = path.join(ROOT, "Gohub Updated Pool Offer （20260923).xlsx")
  test.skipIf(!existsSync(price))("đọc bảng báo giá 23/09", () => {
    const pl = parsePriceList(readFileSync(price), "x.xlsx")
    expect(pl.pools.CMHK.currency).toBe("HKD")
    expect(pl.pools.SINGTEL.currency).toBe("USD")
    expect(pl.pools.CMHK.imsiFee).toBe(0.5)
    expect(pl.pools.CMHK.rows.find(r => r.coverage === "Japan" && r.operator === "KDDI")?.pricePerGb).toBe(5.3)
    expect(pl.pools.SINGTEL.rows.find(r => r.operator === "Taiwan Mobile")?.pricePerGb).toBe(0.68)
    expect(pl.pools.CMHK.rows.find(r => r.coverage === "Hong Kong")?.kyc).toBe(true)
  })
})

// Đối chiếu TOÀN BỘ SKU của 2 file mẫu người dùng đã làm tay (Taiwan/Cambodia/Laos = Singtel, Japan = CMHK).
describe("đối chiếu file mẫu thật", () => {
  type Row = unknown[]
  const KIND: Record<string, PlanKind> = { T: "Daily", F: "Fixed", X: "Unlimited" }
  const sheetRows = (file: string, name: string): Row[] => {
    const wb = XLSX.readFile(path.join(ROOT, file))
    return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, defval: null }).slice(1).filter(r => r[0] && r[1])
  }
  const plansFrom = (usRows: Row[]) => {
    const by = new Map<string, PlanLine & { product: string }>()
    for (const r of usRows) {
      const product = String(r[1]), key = `${product}|${r[2]}|${r[3]}`
      const cur = by.get(key) ?? { product, kind: KIND[product.slice(-1)], dataAmount: Number(r[2]), unit: r[3] as "MB" | "GB", days: [], productId: String(r[16]) }
      cur.days.push(Number(r[4])); by.set(key, cur)
    }
    return Array.from(by.values())
  }
  const check = (file: string, fx: typeof FX_TW, defs: { pool: "CMHK" | "SINGTEL"; coverage: string; operators: string[]; code: string; en: string; vn: string; iso: string }[]) => {
    const us = sheetRows(file, "SKU US"), vn = sheetRows(file, "SKU VN")
    const plans = plansFrom(us)
    const products: ProductInput[] = defs.map(d => ({
      pool: d.pool, simType: "eSIM", coverages: [d.coverage], operators: d.operators.map(o => `${d.coverage}|${o}`), supportCountryCode: d.code, isoCodes: d.iso,
      countryNameEn: d.en, countryNameVn: d.vn, plans: plans.filter(p => p.product.slice(2, 5) === d.code),
    }))
    const r = build(products, samplePrices, fx, A)
    expect(r.warnings.filter(w => !/KYC/.test(w))).toEqual([])
    expect(r.sheets.skuUS).toHaveLength(us.length)
    expect(r.sheets.skuVN).toHaveLength(vn.length)
    const bad: string[] = []
    // So từng dòng theo thứ tự (một số ô SKU CODE của file mẫu là công thức không có giá trị lưu sẵn nên không dùng làm khoá)
    const cmp = (tag: string, want: Row[], got: (string | number)[][]) => want.forEach((row, i) => {
      const m = got[i]
      const codeOk = row[18] == null || m[18] === String(row[18])
      if (!m || Math.abs(Number(m[10]) - Number(row[10])) > 0.004 || m[16] !== String(row[16]) || !codeOk) bad.push(`${tag} #${i + 2} ${row[18] ?? m?.[18]}: mẫu ${row[10]} ↔ ${m?.[10]}`)
    })
    cmp("US", us, r.sheets.skuUS)
    cmp("VN", vn, r.sheets.skuVN)
    expect(bad).toEqual([])
  }
  const samplePrices: PriceList = {
    ...list,
    pools: {
      CMHK: list.pools.CMHK,
      SINGTEL: { ...list.pools.SINGTEL, rows: [
        { coverage: "Taiwan", operator: "Taiwan Mobile", plmn: "", pricePerGb: 0.68, kyc: false },
        { coverage: "Cambodia", operator: "Cellcard", plmn: "", pricePerGb: 0.75, kyc: false },
        { coverage: "Laos", operator: "LaoTel", plmn: "", pricePerGb: 1.13, kyc: false },
      ] },
    },
  }
  test.skipIf(!existsSync(path.join(ROOT, "eSIM_Taiwan_BCDatapool.xlsx")))("Taiwan + Cambodia + Laos: 345 SKU × 2 tenant khớp COGS", () => {
    check("eSIM_Taiwan_BCDatapool.xlsx", FX_TW, [
      { pool: "SINGTEL", coverage: "Taiwan", operators: ["Taiwan Mobile"], code: "TWN", en: "Taiwan", vn: "Đài Loan", iso: "TW" },
      { pool: "SINGTEL", coverage: "Cambodia", operators: ["Cellcard"], code: "KHM", en: "Cambodia", vn: "Campuchia", iso: "KH" },
      { pool: "SINGTEL", coverage: "Laos", operators: ["LaoTel"], code: "LAO", en: "Laos", vn: "Lào", iso: "LA" },
    ])
  })
  test.skipIf(!existsSync(path.join(ROOT, "eSIM_BCDatapool_Japan.xlsx")))("Japan (Daily + Unlimited): khớp COGS", () => {
    check("eSIM_BCDatapool_Japan.xlsx", FX_JP, [
      { pool: "CMHK", coverage: "Japan", operators: ["KDDI", "SoftBank"], code: "JPN", en: "Japan", vn: "Nhật Bản", iso: "JP" },
    ])
  })
})
