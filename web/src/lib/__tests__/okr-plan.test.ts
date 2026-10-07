import { describe, it, expect } from "vitest"
import { buildMeasureContext, evaluate, measure, planOptions, type PlanItem } from "@/lib/okr-plan"
import type { MarketData, MarketSku } from "@/lib/market-breakdown"

const sku = (s: string, country: string, vendor: string): MarketSku =>
  ({ sku: s, vendor, country, country_code: "", product_code: "", form: "", plan: "", service: "", size: "" })

// months: [0..2] quý trước (Q3), [3..5] quý này (Q4)
const data: MarketData = {
  quarter: "Q4-2026", prevQuarter: "Q3-2026", curStart: "2026-10-01", curEnd: "2026-12-31", prevStart: "2026-07-01", prevEnd: "2026-09-30",
  months: ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], curMonths: ["2026-10", "2026-11", "2026-12"],
  group: "ALL", cutoff: "2026-11-15",
  skus: [sku("A1", "Trung Quốc", "3HK Datapool"), sku("A2", "Trung Quốc", "BC Datapool"), sku("B1", "Nhật Bản", "KDDI"), sku("C1", "Lào", "WM")],
  cells: [
    [0, 1, 800, 200, 1], [1, 1, 200, 80, 1], [2, 1, 1000, 300, 1],   // Q3: TQ 3HK 800, TQ BC 200, Nhật 1000
    [0, 3, 400, 100, 1], [1, 3, 600, 300, 1], [2, 3, 1000, 350, 1],   // Q4: TQ 3HK 400, TQ BC 600, Nhật 1000
    [3, 4, 100, 30, 1],                                                  // Q4: Lào mới
  ],
}
const ctx = buildMeasureContext(data)
const item = (p: Partial<PlanItem>): PlanItem => ({
  id: "x", quarter: "Q4-2026", kind: "manual", title: "", scope: {}, baseline: null, target: null, due_date: null,
  done: false, dropped: false, note: null, sort: 0, ...p,
})

describe("measure", () => {
  it("vendor_share: % doanh thu thị trường qua vendor, quý này và quý trước", () => {
    expect(measure(item({ kind: "vendor_share", scope: { country: "Trung Quốc", vendor: "BC Datapool" } }), ctx)).toEqual({ value: 60, prev: 20 })
  })
  it("market_gm và market_datapool", () => {
    expect(measure(item({ kind: "market_gm", scope: { country: "Trung Quốc" } }), ctx)).toEqual({ value: 40, prev: 28 })
    expect(measure(item({ kind: "market_datapool", scope: { country: "Trung Quốc" } }), ctx)).toEqual({ value: 100, prev: 100 })
  })
  it("vendor_dependency trên tổng công ty", () => {
    expect(measure(item({ kind: "vendor_dependency", scope: { vendor: "KDDI" } }), ctx)).toEqual({ value: 47.62, prev: 50 })
  })
  it("new_markets / new_skus đếm thứ có doanh thu quý này mà quý trước không có", () => {
    expect(measure(item({ kind: "new_markets" }), ctx).value).toBe(1)
    expect(measure(item({ kind: "new_skus" }), ctx).value).toBe(1)
  })
  it("quotes_review dùng số báo giá đang chờ", () => {
    expect(measure(item({ kind: "quotes_review" }), null, 3)).toEqual({ value: 3, prev: null })
  })
})

describe("evaluate", () => {
  const Q = ["2026-10-01", "2026-12-31"] as const
  it("tới mục tiêu → done", () => {
    const e = evaluate(item({ kind: "vendor_share", target: 50 }), { value: 60, prev: 20 }, ...Q, "2026-11-15")
    expect(e.status).toBe("done")
  })
  it("chậm so với mức lẽ ra phải đạt hôm nay", () => {
    // giữa quý (~50%) mà mới đi 25% quãng đường 20 → 100
    const e = evaluate(item({ kind: "vendor_share", target: 100 }), { value: 40, prev: 20 }, ...Q, "2026-11-15")
    expect(e.status).toBe("behind")
    expect(e.progress).toBeCloseTo(0.25)
  })
  it("mục tiêu giảm (thấp hơn mốc) vẫn tính đúng chiều", () => {
    const e = evaluate(item({ kind: "vendor_dependency", target: 40 }), { value: 44, prev: 50 }, ...Q, "2026-11-15")
    expect(e.progress).toBeCloseTo(0.6)
    expect(e.status).toBe("on_track")
  })
  it("quá hạn chưa đạt → overdue; việc tay chưa tick quá hạn → overdue", () => {
    expect(evaluate(item({ kind: "new_skus", target: 10, due_date: "2026-11-01" }), { value: 3, prev: 0 }, ...Q, "2026-11-15").status).toBe("overdue")
    expect(evaluate(item({ kind: "manual", due_date: "2026-11-01" }), { value: null, prev: null }, ...Q, "2026-11-15").status).toBe("overdue")
    expect(evaluate(item({ kind: "manual", done: true }), { value: null, prev: null }, ...Q, "2026-11-15").status).toBe("done")
  })
  it("mốc nhập tay đè mốc quý trước", () => {
    const e = evaluate(item({ kind: "vendor_share", target: 100, baseline: 60 }), { value: 80, prev: 20 }, ...Q, "2026-11-15")
    expect(e.baseline).toBe(60)
    expect(e.progress).toBeCloseTo(0.5)
  })
})

it("planOptions xếp thị trường/vendor theo doanh thu", () => {
  const o = planOptions(ctx)
  expect(o.countries[0]).toBe("Trung Quốc")
  expect(o.vendors).toContain("WM")
})
