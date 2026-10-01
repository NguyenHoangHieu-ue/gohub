import { describe, it, expect } from "vitest"
import { buildPeriods, periodsRange, buildTimeline, type DayRow } from "../b2b-ecom-timeline"

describe("buildPeriods", () => {
  it("tháng: chỉ các tháng đã bắt đầu, tháng đang chạy ≥7 ngày thì chiếu", () => {
    const p = buildPeriods("month", 2026, 1, "2026-09-13")
    expect(p.map(x => x.label)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"])
    const t9 = p[8]
    expect(t9.isCurrent).toBe(true)
    expect(t9.elapsed).toBe(13)
    expect(t9.projected).toBe(true)
    expect(t9.factor).toBeCloseTo(30 / 13)
    expect(p[7].projected).toBe(false)
    expect(p[7].factor).toBe(1)
  })

  it("tháng đang chạy < 7 ngày giữ actual (không chiếu)", () => {
    const p = buildPeriods("month", 2026, 1, "2026-09-05")
    expect(p[8].elapsed).toBe(5)
    expect(p[8].projected).toBe(false)
    expect(p[8].factor).toBe(1)
  })

  it("ngày đầu quý: tháng/quý mới chưa có kỳ nào (asOf thuộc quý trước)", () => {
    const m = buildPeriods("month", 2026, 1, "2026-09-30")
    expect(m).toHaveLength(9)
    expect(buildPeriods("quarter", 2026, 1, "2026-09-30").map(x => x.label)).toEqual(["Q1", "Q2", "Q3"])
  })

  it("tuần: Thứ 2–CN cắt theo tháng (9/2026 bắt đầu Thứ 3)", () => {
    const p = buildPeriods("week", 2026, 9, "2026-09-30")
    expect(p.map(x => `${x.start}~${x.end}`)).toEqual([
      "2026-09-01~2026-09-06", "2026-09-07~2026-09-13", "2026-09-14~2026-09-20", "2026-09-21~2026-09-27", "2026-09-28~2026-09-30",
    ])
    expect(p[0].sub).toBe("01–06/09")
    expect(p.every(x => !x.isCurrent)).toBe(true)
  })

  it("tuần đang chạy chiếu từ 3 ngày", () => {
    const p = buildPeriods("week", 2026, 9, "2026-09-16")
    const cur = p[p.length - 1]
    expect(cur.start).toBe("2026-09-14")
    expect(cur.elapsed).toBe(3)
    expect(cur.projected).toBe(true)
    expect(cur.factor).toBeCloseTo(7 / 3)
    expect(p).toHaveLength(3)
  })

  it("periodsRange cắt ở asOf", () => {
    const p = buildPeriods("month", 2026, 1, "2026-09-13")
    expect(periodsRange(p, "2026-09-13")).toEqual({ start: "2026-01-01", end: "2026-09-13" })
    expect(periodsRange([], "2026-09-13")).toBeNull()
  })
})

const row = (d: string, customer: string, sim: string | null, staff: string | null, revenue: number, margin: number): DayRow => ({
  customer_name: customer, sim_type: sim, staff_name: staff, d, revenue: String(revenue), margin: String(margin), units: "1", orders: "1",
})

describe("buildTimeline", () => {
  const asOf = "2026-09-13"
  const periods = buildPeriods("month", 2026, 1, asOf).filter(p => p.key >= "2026-08")
  const rows = [
    row("2026-08-10", "VN Ecom Shopee", "SIM", "HUỲNH LÊ MINH", 100, 40),
    row("2026-08-20", "VN Ecom Shopee", "SIM", "Kieu Anh", 50, 20),
    row("2026-09-02", "VN Ecom Shopee", "eSIM", null, 30, 10),
    row("2026-09-03", "VN Ecom Lazada", "SIM", null, 20, 5),
  ]

  it("gom Customer → Shop → Sub-shop, tổng không double-count", () => {
    const tl = buildTimeline(rows, periods, asOf, () => undefined)
    const shopee = tl.rows.find(r => r.id === "VN Ecom Shopee::::")!
    expect(shopee.metrics[0].revenue).toBe(150) // T8
    expect(shopee.metrics[1].revenue).toBe(30)  // T9
    const sub = tl.rows.filter(r => r.level === 2).map(r => `${r.subshop}:${r.metrics[0].revenue}`)
    expect(sub).toEqual(["Gohub:100", "Nobrand:50"])
    expect(tl.totals.metrics[0].revenue).toBe(150)
    expect(tl.totals.total.revenue).toBe(200)
  })

  it("kỳ đang chạy: est = actual × factor; kỳ xong: est = actual", () => {
    const tl = buildTimeline(rows, periods, asOf, () => undefined)
    const shopee = tl.rows.find(r => r.id === "VN Ecom Shopee::::")!
    expect(shopee.metrics[0].est.revenue).toBe(150)
    expect(shopee.metrics[1].est.revenue).toBeCloseTo(30 * 30 / 13)
  })

  it("CH.Cost: amount pro-rata theo ngày, percent × doanh thu; CM1 = GP − CH.Cost", () => {
    const cost = (m: string, c: string, s: string, sub: string) =>
      m === "2026-09" && c === "VN Ecom Shopee" && s === "" && sub === ""
        ? { cost_type: "amount", cost_value: 0, cost_lines: JSON.stringify([{ type: "amount", value: 3000 }, { type: "percent", value: 10 }]) }
        : undefined
    const tl = buildTimeline(rows, periods, asOf, cost)
    const shopee = tl.rows.find(r => r.id === "VN Ecom Shopee::::")!
    // T9: 3000 × 13/30 + 10% × 30 = 1300 + 3
    expect(shopee.metrics[1].chCost).toBeCloseTo(1303)
    expect(shopee.metrics[1].cm1).toBeCloseTo(10 - 1303)
    expect(shopee.metrics[0].chCost).toBe(0)
  })

  it("quý: cost amount chia theo từng tháng trong quý", () => {
    const q = buildPeriods("quarter", 2026, 1, "2026-09-30").filter(p => p.label === "Q3")
    const cost = (m: string) => (m === "2026-08" ? { cost_type: "amount", cost_value: 0, cost_lines: JSON.stringify([{ type: "amount", value: 3100 }]) } : undefined)
    const tl = buildTimeline(rows, q, "2026-09-30", cost)
    const shopee = tl.rows.find(r => r.id === "VN Ecom Shopee::::")!
    expect(shopee.metrics[0].chCost).toBeCloseTo(3100) // T8 đủ 31 ngày
    expect(shopee.metrics[0].revenue).toBe(180)
  })
})
