import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { build, SKU_HEADERS } from "@/lib/bc-datapool/builder"
import { diffCatalog, diffPriceList, hasCatalogChanges, hasPriceChanges } from "@/lib/bc-datapool/diff"
import { buildWorkbook, CALC_SHEET } from "@/lib/bc-datapool/export"
import type { CatalogPlan, PlanCatalog } from "@/lib/bc-datapool/plan-catalog"
import { DEFAULT_ASSUMPTIONS, type PlanLine, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"

const A = DEFAULT_ASSUMPTIONS
const FX = { hkdPerUsd: 7.801, cnyPerUsd: 6.687, vndPerUsd: 26266 }
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
