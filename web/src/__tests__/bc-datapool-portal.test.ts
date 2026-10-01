import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { parsePlanFile } from "@/lib/bc-datapool/plan-catalog"
import { availableKinds, canonCountry, choosePlan, offers, resolvePlans, sellableCountries, type CatalogPlan, type PlanCatalog } from "@/lib/bc-datapool/plan-lookup"
import type { PlanLine, ProductInput } from "@/lib/bc-datapool/types"

const ROOT = path.resolve(__dirname, "../../..")
const esimFile = path.join(ROOT, "Purchase information.xlsx")
const simFile = path.join(ROOT, "Purchase information (1).xlsx")
const both = existsSync(esimFile) && existsSync(simFile)
const real = (): PlanCatalog => ({ uploadedAt: "", files: [], plans: [...parsePlanFile(readFileSync(esimFile)), ...parsePlanFile(readFileSync(simFile))] })

const plan = (p: Partial<PlanLine>): PlanLine => ({ kind: "Daily", dataAmount: 500, unit: "MB", days: [1], productId: "", ...p })
const product = (over: Partial<ProductInput> = {}): ProductInput => ({
  pool: "CMHK", simType: "eSIM", coverages: ["Japan"], operators: [], supportCountryCode: "JPN", isoCodes: "JP", countryNameEn: "Japan", countryNameVn: "Nhật Bản", plans: [plan({})], ...over,
})

describe("Portal quyết định gói nào được tạo (dữ liệu thật)", () => {
  test.skipIf(!both)("khu vực chỉ hiện nơi Portal bán ở đúng pool + SIM (BC không bán thì ẩn)", () => {
    const c = real()
    const cm = sellableCountries(c, "eSIM", "CMHK"), st = sellableCountries(c, "eSIM", "SINGTEL")
    for (const ok of ["japan", "china", "south korea", "thailand", "vietnam"]) expect(cm.has(ok), `CMHK ${ok}`).toBe(true)
    for (const no of ["indonesia", "taiwan", "malaysia", "philippines", "hong kong", "india", "laos"]) expect(cm.has(no), `CMHK ${no}`).toBe(false)
    for (const ok of ["taiwan", "indonesia", "china", "laos", "cambodia"]) expect(st.has(ok), `Singtel ${ok}`).toBe(true)
    for (const no of ["japan", "thailand", "vietnam", "south korea", "united states"]) expect(st.has(no), `Singtel ${no}`).toBe(false)
    expect(canonCountry("U.S.A")).toBe("united states")
  })

  test.skipIf(!both)("dung lượng chỉ những gói Portal bán (khác nhau theo nước/pool/SIM)", () => {
    const c = real()
    const am = (q: Parameters<typeof offers>[1]) => offers(c, q).map(o => `${o.amount}${o.unit}`)
    expect(am({ sim: "eSIM", pool: "CMHK", coverage: "China", kind: "Daily" })).toEqual(["1GB"])
    expect(am({ sim: "eSIM", pool: "CMHK", coverage: "Japan", kind: "Daily" })).toEqual(["500MB", "1GB", "1.5GB", "2GB", "3GB"])
    expect(am({ sim: "eSIM", pool: "CMHK", coverage: "Japan", kind: "Fixed" })).toEqual(["3GB", "5GB", "10GB", "20GB"])
    expect(am({ sim: "SIM", pool: "CMHK", coverage: "Japan", kind: "Fixed" })).toEqual(["3GB", "5GB", "10GB", "15GB", "20GB", "30GB", "50GB"])
    // Unlimited: liệt kê gói BC thật "Daily {tổng} Throttle to 1Mbps" → 6GB (dung lượng tốc độ cao khách thấy là thông tin nội bộ, nhập riêng)
    expect(am({ sim: "eSIM", pool: "CMHK", coverage: "Japan", kind: "Unlimited" })).toEqual(["6GB"])
    // Khu vực Portal không bán → không có dung lượng nào
    expect(am({ sim: "eSIM", pool: "SINGTEL", coverage: "Japan", kind: "Daily" })).toEqual([])
  })

  test.skipIf(!both)("loại gói khả dụng theo khu vực; số ngày của gói", () => {
    const c = real()
    expect(availableKinds(c, { sim: "eSIM", pool: "CMHK", coverage: "Japan" })).toEqual(["Daily", "Fixed", "Unlimited"])
    expect(availableKinds(c, { sim: "eSIM", pool: "CMHK", coverage: "China" })).toEqual(["Daily"])
    expect(availableKinds(c, { sim: "eSIM", pool: "SINGTEL", coverage: "Japan" })).toEqual([])
    const jp = offers(c, { sim: "eSIM", pool: "CMHK", coverage: "Japan", kind: "Daily" })[0]
    expect(jp.plan.days).toHaveLength(30)
  })

  test.skipIf(!both)("ProductID nhập tay phải có trong Portal VÀ khớp cấu hình", () => {
    const c = real()
    const run = (pl: Partial<PlanLine>, over: Partial<ProductInput> = {}) => resolvePlans([product({ plans: [plan(pl)], ...over })], c).warnings.join("\n")
    // đúng: Japan CMHK eSIM Daily 3GB = 1786346622038926
    expect(run({ dataAmount: 3, unit: "GB", productId: "1786346622038926" })).toBe("")
    // đúng: Japan Unlimited 3GB = Daily 6GB throttle 1Mbps 1786346622046927
    expect(run({ kind: "Unlimited", dataAmount: 3, unit: "GB", productId: "1786346622046927" })).toBe("")
    // ID không có trong Portal
    expect(run({ dataAmount: 3, unit: "GB", productId: "123456" })).toContain("không có trong file Portal")
    // ID của gói khác (Daily 6GB throttle) nhưng khai báo Daily 3GB
    const bad = run({ dataAmount: 3, unit: "GB", productId: "1786346622046927" })
    expect(bad).toContain("không khớp cấu hình")
    expect(bad).toContain("Throttle to 1Mbps")
    // ID Japan dùng cho Taiwan
    expect(run({ dataAmount: 3, unit: "GB", productId: "1786346622038926" }, { coverages: ["China"] })).toContain("nước")
    // Unlimited khai báo nhưng ID là Daily thường
    expect(run({ kind: "Unlimited", dataAmount: 3, unit: "GB", productId: "1786346622038926" })).toContain("không khớp cấu hình")
  })

  test.skipIf(!both)("Tra ProductID Unlimited chỉ theo gói BC Daily {tổng} Throttle 1Mbps (dung lượng tốc độ cao/tốc độ không dùng để tra gói)", () => {
    const c = real()
    const r = resolvePlans([product({ plans: [plan({ kind: "Unlimited", dataAmount: 500, unit: "MB", speedMbps: 10, bcAmount: 6, bcUnit: "GB" })] })], c)
    expect(r.info[0].status).toBe("portal")
    expect(r.info[0].productId).toBe("1786346622046927")
    expect(r.warnings).toEqual([])
    // Nhập tay đúng ID BC cho tổ hợp khác cũng khớp
    expect(resolvePlans([product({ plans: [plan({ kind: "Unlimited", dataAmount: 500, unit: "MB", speedMbps: 5, bcAmount: 6, bcUnit: "GB", productId: "1786346622046927" })] })], c).warnings).toEqual([])
  })

  test.skipIf(!both)("để trống ProductID mà BC không bán gói này → lỗi; không đoán", () => {
    const c = real()
    const r = resolvePlans([product({ pool: "SINGTEL", plans: [plan({ dataAmount: 3, unit: "GB" })] })], c)   // Japan không bán ở Singtel
    expect(r.info[0].status).toBe("missing")
    expect(r.warnings.join()).toContain("không tìm thấy gói")
    const r2 = resolvePlans([product({ plans: [plan({ dataAmount: 4, unit: "GB" })] })], c)   // Japan Daily không có 4GB
    expect(r2.info[0].status).toBe("missing")
  })
})

describe("choosePlan", () => {
  const cp = (id: string, over: Partial<CatalogPlan> = {}): CatalogPlan => ({
    id, sim: "eSIM", kind: "Daily", countries: ["Indonesia"], amount: 500, unit: "MB", pool: "SINGTEL", operators: ["XL"], timing: "24-Hour", throttleKbps: 384, name: id, days: [1, 2], ...over,
  })
  test("1 gói → dùng luôn; trùng hệt → ID mới nhất; khác thật → null", () => {
    expect(choosePlan([cp("A")])!.plan.id).toBe("A")
    const d = choosePlan([cp("1786591876635610"), cp("1790671064942479")])!
    expect(d.plan.id).toBe("1790671064942479")
    expect(d.duplicates).toHaveLength(2)
    expect(choosePlan([cp("A"), cp("B", { days: [1] })])).toBeNull()
    expect(choosePlan([])).toBeNull()
  })
})
