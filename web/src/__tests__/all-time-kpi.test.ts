import { describe, it, expect } from "vitest"
import { allTimeKpis } from "@/lib/all-time-kpi"

const row = (group_name: string, revenue: number, margin: number, gpm2_val: number) => ({ group_name, revenue, margin, gpm2_val })

describe("allTimeKpis", () => {
  it("tỷ suất = tổng tử / tổng doanh thu (có trọng số), không phải trung bình cộng các dòng", () => {
    // tháng A: rev 100, GP 50 (50%); tháng B: rev 900, GP 90 (10%) → trung bình cộng 30% nhưng thực = 140/1000 = 14%
    const k = allTimeKpis([row("B2C", 100, 50, 20), row("B2C", 900, 90, 180)])
    expect(k.revenue).toBe(1000)
    expect(k.gpmPct).toBeCloseTo(14)
    expect(k.cm1Pct).toBeCloseTo(20)
  })
  it("cộng cả B2B Strategic, Non-Strategic và B2C; bỏ nhóm Other/Excluded", () => {
    const k = allTimeKpis([
      row("B2B-Strategic", 500, 100, 50), row("B2B-Non-Strategic", 300, 60, 30), row("B2C", 200, 100, 40),
      row("Other", 999999, 999999, 999999),
    ])
    expect(k.revenue).toBe(1000)
    expect(k.gpmPct).toBeCloseTo(26)
    expect(k.cm1Pct).toBeCloseTo(12)
  })
  it("CM1 âm cho ra % âm; doanh thu 0 → 0% (không chia 0)", () => {
    expect(allTimeKpis([row("B2C", 100, 10, -5)]).cm1Pct).toBeCloseTo(-5)
    expect(allTimeKpis([row("B2C", 0, 0, 0)])).toEqual({ revenue: 0, gpmPct: 0, cm1Pct: 0 })
    expect(allTimeKpis(null)).toEqual({ revenue: 0, gpmPct: 0, cm1Pct: 0 })
  })
  it("nhận số dạng chuỗi (pg driver)", () => {
    expect(allTimeKpis([row("B2C", "200" as any, "50" as any, "20" as any)]).gpmPct).toBeCloseTo(25)
  })
})

import { rangeDayRatio } from "@/lib/analytics-engine/cost-engine"

describe("rangeDayRatio — chi phí amount theo số ngày trong khoảng lọc", () => {
  it("tháng phủ đủ → 1", () => {
    expect(rangeDayRatio("2026-08-01", "2026-08-31", "2026-08")).toBe(1)
    expect(rangeDayRatio("2026-01-01", "2026-09-26", "2026-03")).toBe(1)
  })
  it("tháng dở: 26/30 ngày (01–26/09)", () => {
    expect(rangeDayRatio("2026-09-01", "2026-09-26", "2026-09")).toBeCloseTo(26 / 30, 10)
  })
  it("khoảng bắt đầu giữa tháng: 15–31/08 = 17/31", () => {
    expect(rangeDayRatio("2026-08-15", "2026-08-31", "2026-08")).toBeCloseTo(17 / 31, 10)
  })
  it("khoảng không chạm tháng → 0; khoảng vắt 2 tháng chia đúng theo từng tháng", () => {
    expect(rangeDayRatio("2026-09-01", "2026-09-26", "2026-08")).toBe(0)
    expect(rangeDayRatio("2026-08-20", "2026-09-10", "2026-08")).toBeCloseTo(12 / 31, 10)
    expect(rangeDayRatio("2026-08-20", "2026-09-10", "2026-09")).toBeCloseTo(10 / 30, 10)
  })
  it("tháng 2 nhuận / không nhuận", () => {
    expect(rangeDayRatio("2028-02-01", "2028-02-10", "2028-02")).toBeCloseTo(10 / 29, 10)
    expect(rangeDayRatio("2026-02-01", "2026-02-10", "2026-02")).toBeCloseTo(10 / 28, 10)
  })
})
