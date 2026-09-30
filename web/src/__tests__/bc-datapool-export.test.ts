import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { build, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import { dropExisting } from "@/lib/bc-datapool/dedupe"
import { diffCatalog, diffPriceList, hasCatalogChanges, hasPriceChanges } from "@/lib/bc-datapool/diff"
import { buildWorkbook, CALC_SHEET } from "@/lib/bc-datapool/export"
import type { CatalogPlan, PlanCatalog } from "@/lib/bc-datapool/plan-catalog"
import { DEFAULT_ASSUMPTIONS, type PlanLine, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"

const A = DEFAULT_ASSUMPTIONS
const FX = { hkdPerUsd: 7.801, cnyPerUsd: 6.687, vndPerUsd: 26266, vndPerUsdInc: 26266 }
const plan = (p: Partial<PlanLine>): PlanLine => ({ kind: "Daily", dataAmount: 500, unit: "MB", days: [1, 30], productId: "1", ...p })

const list: PriceList = {
  fileName: "gia.xlsx", uploadedAt: "",
  pools: {
    CMHK: { currency: "HKD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [
      { coverage: "Japan", operator: "KDDI", plmn: "1", pricePerGb: 5.3, kyc: false },
      { coverage: "Japan", operator: "SoftBank", plmn: "2", pricePerGb: 5.5, kyc: false },
    ] },
    SINGTEL: { currency: "USD", imsiFee: 0.5, esimFeeCny: 2, simFeeCny: 3, rows: [
      { coverage: "Taiwan", operator: "Taiwan Mobile", plmn: "3", pricePerGb: 0.68, kyc: false },
    ] },
  },
}

const jp = (over: Partial<ProductInput> = {}): ProductInput => ({
  pool: "CMHK", simType: "eSIM", coverages: ["Japan"], operators: ["Japan|KDDI", "Japan|SoftBank"], supportCountryCode: "JPN", isoCodes: "JP", countryNameEn: "Japan", countryNameVn: "Nhật Bản",
  plans: [plan({ productId: "11" }), plan({ kind: "Fixed", dataAmount: 5, unit: "GB", productId: "22" }), plan({ kind: "Unlimited", dataAmount: 3, unit: "GB", productId: "33" })], ...over,
})
const tw = (): ProductInput => ({
  pool: "SINGTEL", simType: "eSIM", coverages: ["Taiwan"], operators: ["Taiwan|Taiwan Mobile"], supportCountryCode: "TWN", isoCodes: "TW", countryNameEn: "Taiwan", countryNameVn: "Đài Loan",
  plans: [plan({ dataAmount: 1.5, unit: "GB", productId: "44" }), plan({ kind: "Fixed", dataAmount: 10, unit: "GB", productId: "55" })],
})

// ── Bộ tính công thức tối thiểu (đủ cho các hàm file xuất dùng) để kiểm CÔNG THỨC thật sự cho ra đúng giá trị đã ghi ──
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
    js = js.replace(/\bROUNDUP\(/g, "UP(").replace(/\bROUND\(/g, "RD(").replace(/\bIF\(/g, "IF(").replace(/(\)|\w)="/g, '$1==="')
    return new Function("V", "UP", "RD", "IF", `return (${js})`)(val, up, rd, (c: boolean, a: unknown, b: unknown) => (c ? a : b)) as number | string
  }
  return { val, run }
}

describe("file xuất: ô giá là công thức", () => {
  const r = build([jp(), tw()], list, FX, A)
  const wb = buildWorkbook(r, { fx: FX, a: A, list, whiteSimVnd: null })

  test("đủ 4 sheet template + sheet Tính giá, tiêu đề template giữ nguyên", () => {
    expect(wb.SheetNames).toEqual(["Template_sku_US", "Template_sku_VN", "Template_product_US", "Template_product_VN", CALC_SHEET])
    const head = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Template_sku_US, { header: 1 })[0]
    expect(head).toEqual(SKU_HEADERS)
  })

  test("latestCogs (SKU US + VN) là công thức trỏ sheet Tính giá, kèm giá trị tính sẵn", () => {
    for (const [name, col] of [["Template_sku_US", "P"], ["Template_sku_VN", "Q"]] as const) {
      const ws = wb.Sheets[name]
      const n = XLSX.utils.decode_range(ws["!ref"]!).e.r
      expect(n).toBeGreaterThan(5)
      for (let row = 2; row <= n + 1; row++) {
        const c = ws[`K${row}`] as XLSX.CellObject
        expect(c.f, `${name} K${row}`).toMatch(new RegExp(`^'${CALC_SHEET}'!${col}\\d+$`))
        expect(typeof c.v).toBe("number")
      }
    }
  })

  test("TOÀN BỘ công thức tính lại ra đúng giá trị đã ghi (data pool → USD → phí khung → COGS US → COGS VN)", () => {
    const { val, run } = evaluator(wb)
    let formulas = 0
    for (const sheet of ["Template_sku_US", "Template_sku_VN", CALC_SHEET]) {
      for (const [addr, cell] of Object.entries(wb.Sheets[sheet])) {
        if (addr.startsWith("!")) continue
        const c = cell as XLSX.CellObject
        if (!c.f) continue
        formulas++
        const got = run(sheet, c.f)
        expect(got, `${sheet}!${addr} =${c.f}`).toBeCloseTo(Number(c.v), 9)
      }
    }
    expect(formulas).toBeGreaterThan(60)
    // Kiểm ngược vài số đã biết: Singtel Taiwan Daily 1.5GB × 1 ngày và CMHK Japan Daily 500MB × 1 ngày
    const row = (sku: string) => r.costRows.findIndex(c => c.skuUS === sku) + 2
    expect(val(CALC_SHEET, `P${row("ECTWNW1T1D501")}`)).toBe(r.costRows.find(c => c.skuUS === "ECTWNW1T1D501")!.cogsUsd)
    expect(val(CALC_SHEET, `P${row("ECJPNWDT5HM01")}`)).toBe(0.51)   // SoftBank 5.5 HKD/GB là nhà mạng đắt nhất đã chọn; phí khung ROUNDUP 0.37
  })

  test("MỌI công thức trong file chỉ dùng ROUNDUP — không có ROUND", () => {
    let seen = 0
    for (const sheet of wb.SheetNames)
      for (const [addr, cell] of Object.entries(wb.Sheets[sheet])) {
        if (addr.startsWith("!")) continue
        const f = (cell as XLSX.CellObject).f
        if (!f) continue
        seen++
        expect(f, `${sheet}!${addr}`).not.toMatch(/\bROUND\(/)
        if (/ROUND/.test(f)) expect(f).toMatch(/ROUNDUP\(/)
      }
    expect(seen).toBeGreaterThan(60)
  })

  test("xem trước: mỗi dòng giá có chuỗi công thức đã thế số (rê chuột), toàn ROUNDUP", () => {
    for (const c of r.costRows) {
      for (const t of [c.explain.dataPool, c.explain.dataUsd, c.explain.fee, c.explain.cogsUsd, c.explain.cogsVnd]) {
        expect(t.length).toBeGreaterThan(10)
        expect(t).not.toMatch(/\bROUND\(/)
      }
      expect(c.explain.dataPool).toContain("ROUNDUP(")
      expect(c.explain.cogsVnd).toContain(`${c.cogsVnd.toLocaleString("vi-VN")} VND`)
    }
    const jp = r.costRows.find(c => c.skuUS === "ECJPNWDT5HM01")!
    expect(jp.explain.dataPool).toBe("ROUNDUP(giá/GB 5.5 × (500/1024) GB × 1 ngày × 38%, 2) = 1.03 HKD")
    expect(jp.explain.dataUsd).toBe("ROUNDUP(1.03 HKD ÷ 7.801, 2) = 0.14 USD")
    expect(jp.explain.fee).toBe("ROUNDUP(phí eSIM 2 CNY ÷ 6.687 + IMSI 0.5 HKD ÷ 7.801, 2) = 0.37 USD")
    expect(jp.explain.cogsUsd).toBe("ROUNDUP(data 0.14 + phí khung 0.37, 2) = 0.51 USD")
    expect(r.costRows.find(c => c.skuUS === "ECTWNW1F01001")!.explain.dataUsd).toContain("Pool tính bằng USD")
  })

  test("ghi ra .xlsx rồi đọc lại vẫn còn công thức + giá trị (đúng như người dùng sẽ mở trong Excel)", () => {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
    const back = XLSX.read(buf, { type: "buffer" })
    const k2 = back.Sheets.Template_sku_US.K2 as XLSX.CellObject
    expect(k2.f).toMatch(/^'Tính giá'!P\d+$/)
    expect(typeof k2.v).toBe("number")
    const m2 = back.Sheets["Tính giá"].M2 as XLSX.CellObject
    expect(m2.f).toContain("ROUNDUP(")
    expect(back.Sheets["Tính giá"].T15.f).toBe("ROUNDUP(T11/$T$3+T10/$T$2,2)")
  })

  test("đổi tham số (tỷ giá VND) thì giá VN đổi theo — chứng minh không phải số chết", () => {
    const w2 = buildWorkbook(r, { fx: FX, a: A, list, whiteSimVnd: null })
    ;(w2.Sheets[CALC_SHEET].T4 as XLSX.CellObject).v = 30000
    const { val } = evaluator(w2)
    const i = r.costRows.findIndex(c => c.skuVN === "3CTWNW1F01001")
    expect(val(CALC_SHEET, `Q${i + 2}`)).toBe(Math.ceil(r.costRows[i].cogsUsd * 30000))
    expect(val(CALC_SHEET, `Q${i + 2}`)).not.toBe(r.costRows[i].cogsVnd)
  })

  test("SIM: SIM full (VN) và datapack cũng dùng công thức; phí SIM = giá SIM trắng + IMSI", () => {
    const rs = build([jp({ simType: "SIM", plans: [plan({ productId: "9", days: [1] })] })], list, FX, A, { whiteSimVnd: 16028 })
    const w = buildWorkbook(rs, { fx: FX, a: A, list, whiteSimVnd: 16028 })
    const { run } = evaluator(w)
    const calc = w.Sheets[CALC_SHEET]
    let n = 0
    for (const [addr, cell] of Object.entries(calc)) {
      const c = cell as XLSX.CellObject
      if (addr.startsWith("!") || !c.f) continue
      n++
      expect(run(CALC_SHEET, c.f), addr).toBeCloseTo(Number(c.v), 9)
    }
    expect(n).toBeGreaterThan(8)
    const e = rs.costRows.find(c => c.type.startsWith("SIM full"))!
    const a = rs.costRows.find(c => c.type.startsWith("SIM datapack"))!
    expect(e.feeUsd).toBeGreaterThan(0.6)
    expect(a.feeUsd).toBe(0)
    expect(e.cogsUsd).toBeCloseTo(a.cogsUsd + e.feeUsd, 2)
  })
})

describe("tỷ giá theo chiều đổi (JSC / Inc)", () => {
  const fx = { hkdPerUsd: 7.801, cnyPerUsd: 6.687, vndPerUsd: 26266, vndPerUsdInc: 25731.22 }
  const sim = () => build([jp({ simType: "SIM", plans: [plan({ productId: "9", days: [1] })] })], list, fx, A, { whiteSimVnd: 16028 })

  test("giá SIM trắng VND→USD dùng tỷ giá Inc (25731.22); COGS VN USD→VND dùng tỷ giá JSC (26266)", () => {
    const e = sim().costRows.find(c => c.type.startsWith("SIM full"))!
    expect(e.feeUsd).toBe(0.69)   // ROUNDUP(16028/25731.22 + 0.5/7.801) = ROUNDUP(0.6870) — nếu dùng 26266 sẽ là 0.67
    expect(e.cogsVnd).toBe(Math.ceil(e.cogsUsd * 26266 - 1e-9))
    expect(e.explain.fee).toContain("25.731,22")
    expect(e.explain.fee).toContain("Inc")
    expect(e.explain.cogsVnd).toContain("JSC")
  })

  test("file xuất: tham số riêng cho 2 chiều VND/USD; công thức SIM dùng ô Inc và tính lại khớp", () => {
    const rs = sim()
    const wb = buildWorkbook(rs, { fx, a: A, list, whiteSimVnd: 16028 })
    const calc = wb.Sheets[CALC_SHEET]
    expect((calc.T4 as XLSX.CellObject).v).toBe(26266)
    expect((calc.T9 as XLSX.CellObject).v).toBe(25731.22)
    expect((calc.T17 as XLSX.CellObject).f).toBe("ROUNDUP($T$8/$T$9+T10/$T$2,2)")
    const { run } = evaluator(wb)
    for (const [addr, c] of Object.entries(calc)) {
      const cell = c as XLSX.CellObject
      if (addr.startsWith("!") || !cell.f) continue
      expect(run(CALC_SHEET, cell.f), addr).toBeCloseTo(Number(cell.v), 9)
    }
  })
})

describe("SKU/Product đã có trong hệ thống → báo kèm mã, bỏ đi, tạo phần còn lại", () => {
  const china = (): ProductInput => ({
    pool: "CMHK", simType: "eSIM", coverages: ["China"], operators: ["China|China Mobile"], supportCountryCode: "CHN", isoCodes: "CN", countryNameEn: "China", countryNameVn: "Trung Quốc",
    plans: [plan({ dataAmount: 1, unit: "GB", days: [10, 11, 12], productId: "999" })],
  })
  const l2: PriceList = { ...list, pools: { ...list.pools, CMHK: { ...list.pools.CMHK, rows: [{ coverage: "China", operator: "China Mobile", plmn: "1", pricePerGb: 4.6, kyc: false }] } } }

  test("China CMHK Daily 1GB × 10,11,12 ngày mà 10 ngày đã có: báo SKU 10 ngày, chỉ tạo 11 và 12", () => {
    const built = build([china()], l2, FX, A)
    expect(built.sheets.skuUS.map(x => x[20])).toEqual(["ECCHNWDT00110", "ECCHNWDT00111", "ECCHNWDT00112"])
    const skus = new Map([["ECCHNWDT00110", "Active"], ["3CCHNWDT00110", "Inactive"]])
    const { result, skipped } = dropExisting(built, skus, new Map())
    expect(skipped.skus).toEqual([
      { sku: "ECCHNWDT00110", tenant: "US", status: "Active", label: "eSIM full · Daily 1GB × 10 ngày" },
      { sku: "3CCHNWDT00110", tenant: "VN", status: "Inactive", label: "eSIM full · Daily 1GB × 10 ngày" },
    ])
    expect(result.sheets.skuUS.map(x => x[20])).toEqual(["ECCHNWDT00111", "ECCHNWDT00112"])
    expect(result.sheets.skuVN.map(x => x[20])).toEqual(["3CCHNWDT00111", "3CCHNWDT00112"])
    expect(result.costRows.map(c => c.days)).toEqual([11, 12])
    expect(result.usCost).toEqual([0, 1])
    expect(result.vnCost).toEqual([0, 1])
    expect(result.sheets.productUS).toHaveLength(1)   // Product chưa có → vẫn tạo
    expect(skipped.products).toEqual([])
  })

  test("Product đã có thì không tạo lại dòng Product, vẫn thêm SKU mới", () => {
    const built = build([china()], l2, FX, A)
    const { result, skipped } = dropExisting(built, new Map(), new Map([["ECCHNWDT", "Active"], ["3CCHNWDT", "Active"]]))
    expect(result.sheets.productUS).toHaveLength(0)
    expect(result.sheets.productVN).toHaveLength(0)
    expect(result.sheets.skuUS).toHaveLength(3)
    expect(skipped.products.map(p => p.code)).toEqual(["ECCHNWDT", "3CCHNWDT"])
  })

  test("chỉ 1 bên (US) đã có: bỏ bên đó, bên VN vẫn tạo; dòng tính giá được giữ", () => {
    const built = build([china()], l2, FX, A)
    const { result, skipped } = dropExisting(built, new Map([["ECCHNWDT00111", "Active"]]), new Map())
    expect(skipped.skus).toHaveLength(1)
    expect(result.sheets.skuUS).toHaveLength(2)
    expect(result.sheets.skuVN).toHaveLength(3)
    expect(result.costRows).toHaveLength(3)
  })

  test("tất cả đã có: không còn SKU nào", () => {
    const built = build([china()], l2, FX, A)
    const all = new Map([...built.sheets.skuUS, ...built.sheets.skuVN].map(r => [String(r[20]), "Active"] as [string, string]))
    const { result } = dropExisting(built, all, new Map())
    expect(result.sheets.skuUS).toHaveLength(0)
    expect(result.sheets.skuVN).toHaveLength(0)
    expect(result.costRows).toHaveLength(0)
  })

  test("file xuất sau khi bỏ SKU đã có: công thức vẫn trỏ ĐÚNG dòng tính giá và tính lại khớp", () => {
    const built = build([china()], l2, FX, A)
    const { result } = dropExisting(built, new Map([["ECCHNWDT00110", "Active"], ["3CCHNWDT00110", "Active"]]), new Map())
    const wb = buildWorkbook(result, { fx: FX, a: A, list: l2, whiteSimVnd: null })
    const { run, val } = evaluator(wb)
    for (const sheet of ["Template_sku_US", "Template_sku_VN", CALC_SHEET])
      for (const [addr, cell] of Object.entries(wb.Sheets[sheet])) {
        const c = cell as XLSX.CellObject
        if (addr.startsWith("!") || !c.f) continue
        expect(run(sheet, c.f), `${sheet}!${addr}`).toBeCloseTo(Number(c.v), 9)
      }
    // SKU 11 ngày (dòng 2 của sheet SKU) lấy đúng giá của dòng tính giá 11 ngày
    const us = wb.Sheets.Template_sku_US
    expect(us.B2.v).toBe("ECCHNWDT")
    expect(us.U2.v).toBe("ECCHNWDT00111")   // SKU CODE = cột U (thứ 21)
    expect(val("Template_sku_US", "K2")).toBe(result.costRows.find(c => c.days === 11)!.cogsUsd)
    expect(val("Template_sku_VN", "K3")).toBe(result.costRows.find(c => c.days === 12)!.cogsVnd)
  })
})

describe("thông báo thay đổi khi upload", () => {
  const clone = (l: PriceList): PriceList => JSON.parse(JSON.stringify(l))

  test("bảng giá: lần đầu không có bản cũ → compared=false", () => {
    const d = diffPriceList(null, list)
    expect(d.compared).toBe(false)
    expect(hasPriceChanges(d)).toBe(false)
  })

  test("bảng giá: giống hệt → không thay đổi", () => {
    expect(hasPriceChanges(diffPriceList(list, clone(list)))).toBe(false)
  })

  test("bảng giá: phát hiện đổi giá, nhà mạng mới/bị bỏ, đổi phí IMSI", () => {
    const n = clone(list)
    n.pools.CMHK.rows[0].pricePerGb = 6                                                     // KDDI 5.3 → 6
    n.pools.CMHK.rows.pop()                                                                 // bỏ SoftBank
    n.pools.SINGTEL.rows.push({ coverage: "Laos", operator: "LaoTel", plmn: "9", pricePerGb: 1.13, kyc: false })   // mới
    n.pools.SINGTEL.imsiFee = 0.6
    const d = diffPriceList(list, n)
    expect(d.counts).toEqual({ added: 1, removed: 1, changed: 1, fees: 1 })
    expect(d.changed[0]).toMatchObject({ pool: "CMHK", operator: "KDDI", from: 5.3, to: 6, currency: "HKD" })
    expect(d.removed[0].operator).toBe("SoftBank")
    expect(d.added[0]).toMatchObject({ coverage: "Laos", to: 1.13 })
    expect(d.fees[0]).toMatchObject({ pool: "SINGTEL", field: "IMSI", from: 0.5, to: 0.6 })
    expect(hasPriceChanges(d)).toBe(true)
  })

  const cp = (id: string, days: number[], over: Partial<CatalogPlan> = {}): CatalogPlan => ({
    id, sim: "eSIM", kind: "Daily", countries: ["Japan"], amount: 500, unit: "MB", pool: "CMHK", operators: ["KDDI"], timing: "Natural Day", throttleKbps: 384, name: id, days, ...over,
  })
  const cat = (plans: CatalogPlan[]): PlanCatalog => ({ uploadedAt: "", files: [], plans })

  test("Portal: phát hiện gói mới, gói bị bỏ, đổi số ngày bán", () => {
    const old = cat([cp("A", [1, 2, 3]), cp("B", [1]), cp("C", [1, 2])])
    const d = diffCatalog(old, [cp("A", [1, 2, 3, 4]), cp("C", [1]), cp("D", [1], { amount: 1, unit: "GB" })])
    expect(d.counts).toEqual({ added: 1, removed: 1, changed: 2 })
    expect(d.added[0].id).toBe("D")
    expect(d.removed[0].id).toBe("B")
    expect(d.changed.find(x => x.id === "A")!.detail).toContain("mở thêm 4 ngày")
    expect(d.changed.find(x => x.id === "C")!.detail).toContain("ngừng bán 2 ngày")
    expect(hasCatalogChanges(d)).toBe(true)
  })

  test("Portal: chỉ upload file eSIM thì gói SIM cũ KHÔNG bị tính là bị bỏ; bản cũ chưa có throttle không tính là đổi", () => {
    const old = cat([cp("A", [1], { throttleKbps: undefined }), cp("S1", [1], { sim: "SIM" })])
    const d = diffCatalog(old, [cp("A", [1])])
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 })
  })
})

describe("Unlimited: dataMB / speedMbps / tốc độ cao khác nhau", () => {
  const fx = { hkdPerUsd: 7.801, cnyPerUsd: 6.687, vndPerUsd: 26266, vndPerUsdInc: 26266 }
  const unl = (over: Partial<PlanLine>) => plan({ kind: "Unlimited", dataAmount: 3, unit: "GB", days: [1, 2], productId: "9", ...over })
  const run = (over: Partial<PlanLine>) => build([jp({ plans: [unl(over)] })], list, fx, A)

  test("mặc định 3GB tốc độ cao + Unlimited 10Mbps: dataMB 3072, speedMbps 10, mã X, tên cũ, hệ số 1.7", () => {
    const r = run({})
    expect(r.warnings).toEqual([])
    expect(r.sheets.skuUS[0].slice(12, 15)).toEqual(["3GB of high-speed data per day, then unlimited data at 10Mbps", 3072, 10])
    expect(r.sheets.skuUS[0][20]).toBe("ECJPNWDX00301")
    expect(r.sheets.skuUS[0][6]).toBe("eSIM Nhật Bản Unlimited 10mbps 1 ngày")
    expect(r.sheets.productUS.map(x => x[35])).toEqual(["ECJPNWDX"])
    expect(r.costRows[0].unlKey).toBe("unl3gb10")
  })

  test("500MB tốc độ cao + Unlimited 10Mbps: dataMB 500, mã X, hệ số 1.8, tên có '500 MB tốc độ cao'", () => {
    const r = run({ dataAmount: 500, unit: "MB", bcAmount: 6, bcUnit: "GB" })
    expect(r.warnings).toEqual([])
    expect(r.sheets.skuUS[0].slice(12, 15)).toEqual(["500MB of high-speed data per day, then unlimited data at 10Mbps", 500, 10])
    expect(r.sheets.skuUS[0][20]).toBe("ECJPNWDX5HM01")
    expect(r.sheets.skuUS[0][6]).toBe("eSIM Nhật Bản 500 MB tốc độ cao Unlimited 10mbps 1 ngày")
    expect(r.sheets.skuUS[0][7]).toBe("eSIM Japan 500 MB high-speed Unlimited 10mbps 1 Day(s)")
    expect(r.costRows[0].unlKey).toBe("unl500mb10")
    expect(r.costRows[0].explain.dataPool).toContain("1.8 GB/ngày")
  })

  test("500MB tốc độ cao + Unlimited 5Mbps: speedMbps 5, mã A (Daily Unlimited 5mbps), hệ số 1.6, text 5Mbps", () => {
    const r = run({ dataAmount: 500, unit: "MB", speedMbps: 5 })
    expect(r.warnings).toEqual([])
    expect(r.sheets.skuUS[0].slice(12, 15)).toEqual(["500MB of high-speed data per day, then unlimited data at 5Mbps", 500, 5])
    expect(r.sheets.skuUS[0][20]).toBe("ECJPNWDA5HM01")
    expect(r.sheets.productUS.map(x => [x[6], x[35]])).toEqual([["A", "ECJPNWDA"]])
    expect(r.costRows[0].unlKey).toBe("unl500mb5")
    expect(r.costRows[0].explain.dataPool).toContain("1.6 GB/ngày")
  })

  test("giá khác nhau theo hệ số: 1.6 < 1.7 < 1.8 GB/ngày", () => {
    const c = (o: Partial<PlanLine>) => run({ days: [10], ...o }).costRows[0].dataPool
    const a5 = c({ dataAmount: 500, unit: "MB", speedMbps: 5 }), a3 = c({}), a10 = c({ dataAmount: 500, unit: "MB" })
    expect(a5).toBeLessThan(a3)
    expect(a3).toBeLessThan(a10)
    expect(a5).toBeCloseTo(Math.ceil(5.5 * 1.6 * 10 * 100 - 1e-9) / 100, 6)
  })

  test("tổ hợp chưa có hệ số (3GB + 5Mbps, 1GB + 10Mbps) → cảnh báo, không sinh SKU (không đoán)", () => {
    for (const o of [{ speedMbps: 5 }, { dataAmount: 1 }]) {
      const r = run(o)
      expect(r.warnings.join()).toContain("chưa có hệ số GB/ngày")
      expect(r.sheets.skuUS).toHaveLength(0)
    }
    expect(run({ speedMbps: 7 }).warnings.join()).toContain("tốc độ Unlimited phải là 5 hoặc 10")
    expect(run({ dataAmount: 8, bcAmount: 6, bcUnit: "GB" }).warnings.join()).toMatch(/chưa có hệ số|lớn hơn tổng gói/)
  })

  test("1 Product cho mỗi tốc độ: 10Mbps = X, 5Mbps = A; Daily/Fixed để trống dataMB/speedMbps", () => {
    const r = build([jp({ plans: [unl({ dataAmount: 500, unit: "MB", days: [1] }), unl({ dataAmount: 500, unit: "MB", speedMbps: 5, days: [1] }), plan({ productId: "1", days: [1] })] })], list, fx, A)
    expect(r.warnings).toEqual([])
    expect(r.sheets.productUS.map(x => x[35]).sort()).toEqual(["ECJPNWDA", "ECJPNWDT", "ECJPNWDX"])
    expect(r.sheets.skuUS.map(x => x[13])).toEqual([500, 500, ""])
    expect(r.sheets.skuUS.map(x => x[14])).toEqual([10, 5, ""])
  })

  test("file xuất: 3 ô hệ số Unlimited riêng (T7, T20, T21); công thức từng dòng dùng đúng ô và tính lại khớp", () => {
    const r = build([jp({ plans: [unl({ days: [1] }), unl({ dataAmount: 500, unit: "MB", days: [1] }), unl({ dataAmount: 500, unit: "MB", speedMbps: 5, days: [1] })] })], list, fx, A)
    const wb = buildWorkbook(r, { fx, a: A, list, whiteSimVnd: null })
    const calc = wb.Sheets[CALC_SHEET]
    expect([calc.T7, calc.T20, calc.T21].map(c => (c as XLSX.CellObject).v)).toEqual([1.7, 1.6, 1.8])
    const fm = (i: number) => (calc[`M${i + 2}`] as XLSX.CellObject).f
    expect(fm(0)).toContain("$T$7")
    expect(fm(1)).toContain("$T$21")
    expect(fm(2)).toContain("$T$20")
    const { run } = evaluator(wb)
    for (const [addr, c] of Object.entries(calc)) {
      const cell = c as XLSX.CellObject
      if (addr.startsWith("!") || !cell.f) continue
      expect(run(CALC_SHEET, cell.f), addr).toBeCloseTo(Number(cell.v), 9)
    }
  })
})

