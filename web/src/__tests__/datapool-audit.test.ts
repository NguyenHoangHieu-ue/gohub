import { describe, expect, test } from "vitest"
import { build as buildBc, PRODUCT_HEADERS, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import { build as buildThk } from "@/lib/threehk-datapool/builder"
import { DEFAULT_ASSUMPTIONS, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"
import { auditAll, mismatchSignature, parseOperators, summarize, type AuditCtx, type AuditProductInput, type AuditSkuInput } from "@/lib/datapool-audit/engine"

const FX = { hkdPerUsd: 7.807, cnyPerUsd: 6.681, vndPerUsd: 26153, vndPerUsdInc: 25626.2 }
const FRAMES = { esimUsUsd: 0.51, simUsUsd: 0.34, simVnVnd: 11061 }
const A = { ...DEFAULT_ASSUMPTIONS, dailyPct: 0.35, unl3gb10: 2, unlLevels: [{ dataMb: 3072, speedMbps: 10, gbPerDay: 2 }] }
const list: PriceList = { fileName: "x", uploadedAt: "", pools: {
  CMHK: { currency: "HKD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [{ coverage: "Japan", operator: "KDDI", plmn: "1", pricePerGb: 5.3, kyc: false }, { coverage: "Japan", operator: "SoftBank", plmn: "2", pricePerGb: 5.5, kyc: false }] },
  SINGTEL: { currency: "USD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [{ coverage: "Taiwan", operator: "Taiwan Mobile", plmn: "3", pricePerGb: 0.68, kyc: false }] } } }
const refs = [{ code: "JP", name: "Japan" }, { code: "TW", name: "Taiwan" }, { code: "TH", name: "Thailand" }]
const ncc = [{ zone: "B", country: "Thailand", network: "AIS", price_per_gb_hkd: 5, is_kyc: false }]
const CTX: AuditCtx = { fx: FX, a: A, ncc, refs, groups: [], priceList: list, frames: FRAMES, whiteSimVnd: 16028 }

type Sheets = { skuUS: (string | number)[][]; skuVN: (string | number)[][]; productUS: (string | number)[][]; productVN: (string | number)[][] }
// Chuyển kết quả builder (sheet) thành dòng skus/products như trong DB — để kiểm engine soát TÍNH LẠI ĐÚNG như lúc tạo.
function toDb(r: { sheets: Sheets }) {
  const col = (n: string) => SKU_HEADERS.findIndex(h => h.replace("*", "") === n)
  const skus: AuditSkuInput[] = [...r.sheets.skuUS, ...r.sheets.skuVN].map(row => ({
    sku_code: String(row[col("SKU CODE")]), product_code: String(row[col("productCode")]), tenant: String(row[0]), status: "Active",
    data_amount: Number(row[col("dataAmount")]), data_amount_unit: String(row[col("dataAmountUnit")]), day_amount: Number(row[col("dayAmount")]),
    data: row[col("dataMB")] === "" ? null : Number(row[col("dataMB")]), speed: row[col("speedMbps")] === "" ? null : Number(row[col("speedMbps")]), throttle_speed: String(row[col("throttleSpeed")]),
    latest_cogs: Number(row[col("latestCogs")]), latest_cogs_currency: String(row[col("latestCogsCurrency")]), product_type: "x",
  }))
  const pc = (n: string) => PRODUCT_HEADERS.findIndex(h => h.replace("*", "").toLowerCase() === n.toLowerCase())
  const products: AuditProductInput[] = [...r.sheets.productUS, ...r.sheets.productVN].map(row => ({
    product_code: String(row[row.length - 1]), supported_countries: String(row[pc("supportedCountries")]), onsite_carrier: String(row[pc("onsiteCarrier")] ?? ""), type_of_sim: String(row[pc("typeOfSim")] ?? ""),
  }))
  return { skus, products }
}

const jp = (ops = ["Japan|KDDI", "Japan|SoftBank"], simType: "eSIM" | "SIM" = "eSIM"): ProductInput => ({
  pool: "CMHK", simType, coverages: ["Japan"], operators: ops, supportCountryCode: "JPN", isoCodes: "JP", countryNameEn: "Japan", countryNameVn: "Nhật Bản", esimDataUs: true, esimDataVn: true,
  plans: [
    { kind: "Daily", dataAmount: 500, unit: "MB", days: [1, 30], productId: "1" }, { kind: "Fixed", dataAmount: 5, unit: "GB", days: [7], productId: "2" },
    { kind: "Unlimited", dataAmount: 3, unit: "GB", days: [5], productId: "3", speedMbps: 10, bcAmount: 6, bcUnit: "GB" },
  ],
})
const tw = (): ProductInput => ({ pool: "SINGTEL", simType: "eSIM", coverages: ["Taiwan"], operators: ["Taiwan|Taiwan Mobile"], supportCountryCode: "TWN", isoCodes: "TW", countryNameEn: "Taiwan", countryNameVn: "Đài Loan", plans: [{ kind: "Daily", dataAmount: 1.5, unit: "GB", days: [7], productId: "4" }] })
const th = (sim: "eSIM" | "SIM") => buildThk([{ input: { simType: sim, supportCountryCode: "THA", isoCodes: "TH", countryNameEn: "Thailand", countryNameVn: "Thái Lan", usSimFull: sim === "SIM", vnEsimData: sim === "eSIM",
  plans: [{ policy: "F", amount: 5, unit: "GB", days: [7] }, { policy: "T", amount: 1, unit: "GB", days: [3] }, { policy: "X", amount: 3, unit: "GB", speedMbps: 10, days: [5] }] }, price: { pricePerGbHkd: 5, network: "AIS", kyc: false }, tpls: [] }], { fx: FX, a: A, frames: FRAMES })

function dbAll() {
  const parts = [buildBc([jp(), tw(), jp(undefined, "SIM")], list, FX, A, { whiteSimVnd: 16028 }), th("eSIM"), th("SIM")].map(toDb)
  return { skus: parts.flatMap(p => p.skus), products: Array.from(new Map(parts.flatMap(p => p.products).map(p => [p.product_code, p])).values()) }
}

describe("soát giá vốn: engine tính lại ĐÚNG như lúc tạo sản phẩm", () => {
  test("mọi SKU do 2 builder sinh ra → soát lại cùng đầu vào = KHỚP tuyệt đối (BC CMHK/Singtel, 3HK; US/VN; A/C/E; Daily/Fixed/Unlimited)", () => {
    const { skus, products } = dbAll()
    const rows = auditAll(skus, products, CTX)
    expect(rows.length).toBe(skus.length)
    const bad = rows.filter(r => r.verdict !== "match")
    expect(bad.map(r => `${r.sku}:${r.verdict}:${r.note ?? ""}:${r.current}≠${r.expected}`)).toEqual([])
    expect(new Set(rows.map(r => r.vendor))).toEqual(new Set(["3HK", "BC_CMHK", "BC_SINGTEL"]))
    expect(summarize(rows).diff).toBe(0)
  })

  test("SIM full (E) VN: phí khung VND được cộng và hiện rõ (calc.feeVnd + chú giải), 3HK = khung SIM VN, BC = SIM trắng", () => {
    const { skus, products } = dbAll()
    const e = auditAll(skus, products, CTX).filter(r => r.type === "E" && r.tenant === "VN")
    expect(e.some(r => r.vendor === "3HK")).toBe(true)
    expect(e.some(r => r.vendor !== "3HK")).toBe(true)
    for (const r of e) {
      expect(r.calc!.feeVnd).toBe(r.vendor === "3HK" ? FRAMES.simVnVnd : 16028)
      expect(r.calc!.cogsVnd).toBe(Math.ceil((r.vendor === "3HK" ? r.calc!.dataUsd : r.calc!.cogsUsd) * FX.vndPerUsd - 1e-9) + r.calc!.feeVnd)
      if (r.vendor !== "3HK") expect(r.calc!.feeUsd).toBeGreaterThan(0)   // BC SIM full có IMSI
      expect(r.explain).toContain(r.vendor === "3HK" ? "khung SIM VN" : "SIM trắng")
    }
  })

  test("đổi giả định Daily % → chỉ SKU Daily lệch (kèm %), Fixed/Unlimited vẫn khớp", () => {
    const { skus, products } = dbAll()
    const rows = auditAll(skus, products, { ...CTX, a: { ...A, dailyPct: 0.45 } })
    const diff = rows.filter(r => r.verdict === "diff")
    expect(diff.length).toBeGreaterThan(0)
    expect(diff.every(r => r.calc!.kind === "Daily")).toBe(true)
    expect(rows.filter(r => r.calc?.kind !== "Daily").every(r => r.verdict === "match")).toBe(true)
    expect(diff[0].diffPct).toBeLessThan(0)   // giá hệ thống đang THẤP hơn giá tính lại
  })

  test("đổi hệ số 1 mức Unlimited → chỉ SKU Unlimited của mức đó lệch", () => {
    const { skus, products } = dbAll()
    const rows = auditAll(skus, products, { ...CTX, a: { ...A, unlLevels: [{ dataMb: 3072, speedMbps: 10, gbPerDay: 2.3 }] } })
    expect(rows.filter(r => r.verdict === "diff").every(r => r.calc!.kind === "Unlimited")).toBe(true)
    expect(rows.filter(r => r.calc!.kind === "Unlimited" && r.verdict === "diff").length).toBeGreaterThan(0)
  })

  test("đổi tỷ giá HKD → mọi SKU tính qua HKD lệch (3HK + CMHK), Singtel (USD) không đổi", () => {
    const { skus, products } = dbAll()
    const rows = auditAll(skus, products, { ...CTX, fx: { ...FX, hkdPerUsd: 8.5 } })
    expect(rows.filter(r => r.vendor === "BC_SINGTEL").every(r => r.verdict === "match")).toBe(true)
    expect(rows.some(r => r.vendor === "3HK" && r.verdict === "diff")).toBe(true); expect(rows.some(r => r.vendor === "BC_CMHK" && r.verdict === "diff")).toBe(true)
  })

  test("đổi giá pool: CMHK tăng giá/GB → lệch; Product tạo với CHỈ nhà mạng KDDI vẫn tính theo 5.3 (không bị SoftBank 5.5 kéo)", () => {
    const only = buildBc([jp(["Japan|KDDI"])], list, FX, A, { whiteSimVnd: 16028 })
    const { skus, products } = toDb(only)
    expect(parseOperators(products[0].onsite_carrier)).toEqual(["kddi"])
    expect(auditAll(skus, products, CTX).every(r => r.verdict === "match")).toBe(true)
    const up = structuredClone(list); up.pools.CMHK.rows[0].pricePerGb = 6
    expect(auditAll(skus, products, { ...CTX, priceList: up }).some(r => r.verdict === "diff")).toBe(true)
  })

  test("bỏ qua + nêu lý do: không có Product, nước chưa có giá, mức Unlimited không còn trong bảng, thiếu bảng giá BC", () => {
    const { skus, products } = dbAll()
    const noProd = auditAll(skus, products.filter(p => !p.product_code.includes("JPN")), CTX)
    expect(noProd.filter(r => r.vendor === "BC_CMHK").every(r => r.verdict === "skip" && /Product/.test(r.note!))).toBe(true)
    expect(auditAll(skus, products, { ...CTX, ncc: [] }).filter(r => r.vendor === "3HK").every(r => r.verdict === "skip" && /ncc_3hk/.test(r.note!))).toBe(true)
    const noLevel = auditAll(skus, products, { ...CTX, a: { ...A, unlLevels: [] } }).filter(r => r.calc === undefined && /bảng mức/.test(r.note ?? ""))
    expect(noLevel.length).toBeGreaterThan(0)
    expect(auditAll(skus, products, { ...CTX, priceList: null }).filter(r => r.vendor !== "3HK").every(r => r.verdict === "skip")).toBe(true)
  })

  test("SKU chưa có giá vốn → nocogs; khung SIM/eSIM profile bị loại; chữ ký lệch ổn định và đổi khi tình trạng đổi", () => {
    const { skus, products } = dbAll()
    const withNull = skus.map((s, i) => (i === 0 ? { ...s, latest_cogs: null } : s))
    expect(auditAll(withNull, products, CTX).find(r => r.sku === skus[0].sku_code && r.tenant === (skus[0].tenant === "US" ? "US" : "VN"))!.verdict).toBe("nocogs")
    expect(auditAll([{ ...skus[0], product_type: "SIM frame" }], products, CTX)).toHaveLength(0)
    const r1 = auditAll(skus, products, { ...CTX, a: { ...A, dailyPct: 0.45 } }), r2 = auditAll(skus, products, { ...CTX, a: { ...A, dailyPct: 0.45 } }), r3 = auditAll(skus, products, { ...CTX, a: { ...A, dailyPct: 0.5 } })
    expect(mismatchSignature(r1)).toBe(mismatchSignature(r2)); expect(mismatchSignature(r1)).not.toBe(mismatchSignature(r3))
    expect(mismatchSignature(auditAll(skus, products, CTX))).toMatch(/^0:/)
  })
})

// ── file xuất: mọi công thức tính lại đúng bằng giá trị engine (kiểm bằng bộ tính công thức tối thiểu) ──
import * as XLSX from "xlsx"
import { buildAuditWorkbook, AUDIT_SHEET, UPDATE_SHEET, PARAM_SHEET } from "@/lib/datapool-audit/export"
const up = (x: number, n: number) => { const k = 10 ** n; return Math.sign(x) * Math.ceil(Math.abs(x) * k - 1e-9) / k }
const rd = (x: number, n: number) => { const k = 10 ** n; return Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9) / k }
function evaluator(wb: XLSX.WorkBook) {
  const cache = new Map<string, number | string>()
  const val = (sheet: string, addr: string): number | string => {
    const key = `${sheet}!${addr}`
    if (cache.has(key)) return cache.get(key)!
    const c = wb.Sheets[sheet][addr.replace(/\$/g, "")] as XLSX.CellObject | undefined
    if (!c) return 0
    const v = c.f ? run(sheet, c.f) : (c.v as number | string)
    cache.set(key, v)
    return v
  }
  const run = (sheet: string, f: string): number | string => {
    let js = f.replace(/'([^']+)'!(\$?[A-Z]{1,2}\$?\d+)/g, (_m, s, a) => `V("${s}","${a}")`)
    js = js.replace(/(?<![A-Za-z"'!])(\$?[A-Z]{1,2}\$?\d+)(?![\d"(])/g, (_m, a) => `V("${sheet}","${a}")`)
    js = js.replace(/\bROUNDUP\(/g, "UP(").replace(/\bROUND\(/g, "RD(").replace(/(\)|\w)=(?!=)/g, "$1===")
    return new Function("V", "UP", "RD", "IF", `return (${js})`)(val, up, rd, (c: boolean, a: unknown, b: unknown) => (c ? a : b)) as number | string
  }
  return { val, run }
}

describe("file xuất soát giá vốn", () => {
  test("mọi ô công thức tính lại đúng giá trị engine (3 vendor, US/VN, A/C/E, Daily/Fixed/Unlimited) và sheet Cập nhật trỏ đúng ô Tính lại", () => {
    const { skus, products } = dbAll()
    const ctx = { ...CTX, a: { ...A, dailyPct: 0.45 } }          // có SKU lệch
    const rows = auditAll(skus, products, ctx)
    const wb = buildAuditWorkbook(rows, ctx)
    expect(wb.SheetNames).toEqual([PARAM_SHEET, AUDIT_SHEET, UPDATE_SHEET])
    const sh = wb.Sheets[AUDIT_SHEET]
    const { run } = evaluator(wb)
    let formulas = 0
    for (const [addr, c] of Object.entries(sh)) {
      const cell = c as XLSX.CellObject
      if (addr.startsWith("!") || !cell.f) continue
      formulas++
      let got: number | string
      try { got = run(AUDIT_SHEET, cell.f) } catch (e) { throw new Error(`${addr}: ${cell.f} → ${(e as Error).message}`) }
      expect(got, `${AUDIT_SHEET}!${addr}`).toBeCloseTo(Number(cell.v), 6)
    }
    expect(formulas).toBeGreaterThan(rows.length * 8)
    const upd = wb.Sheets[UPDATE_SHEET]
    const bad = rows.filter(r => r.verdict === "diff")
    expect(bad.length).toBeGreaterThan(0)
    for (let i = 0; i < bad.length; i++) {
      const cell = upd[`C${i + 2}`] as XLSX.CellObject
      expect(run(UPDATE_SHEET, cell.f!)).toBeCloseTo(bad[i].expected!, 6); expect(upd[`B${i + 2}`].v).toBe(bad[i].sku)
    }
    // đổi tham số trong file → giá tính lại đổi theo (công thức sống): Daily % của file đặt về 0.35 thì SKU Daily khớp lại giá hệ thống
    wb.Sheets[PARAM_SHEET].B7.v = 0.35
    const i = rows.findIndex(r => r.calc?.kind === "Daily" && r.tenant === "US"), r = i + 2
    const { run: run2 } = evaluator(wb)
    expect(run2(AUDIT_SHEET, (sh[`Q${r}`] as XLSX.CellObject).f!)).toBeCloseTo(rows[i].current!, 6)
  })
})

describe("thứ tự soát + ngưỡng làm tròn", () => {
  test("sắp xếp: vendor → loại → kiểu gói → Product → dung lượng → ngày", () => {
    const { skus, products } = dbAll()
    const rows = auditAll(skus, products, CTX)
    const key = (r: (typeof rows)[number]) => [r.vendor, r.type, r.kind, r.product]
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i]
      if (JSON.stringify(key(a)) === JSON.stringify(key(b))) expect(a.amountMb < b.amountMb || (a.amountMb === b.amountMb && a.days <= b.days)).toBe(true)
    }
  })
})
