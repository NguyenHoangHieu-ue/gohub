import { describe, it, expect } from "vitest"
import {
  isQuarterReliable, extractQuarter, effectiveTargets, sumVals, addVals, ratioPct, relChange, cellOf, quartersBefore, ROW_DEFS,
} from "@/lib/quarterly-company-view"
import type { QReport, MonthStats } from "@/lib/quarterly-types"

const stats = (revenue: number, gp: number, cm1: number, hk3Rev?: number, hk3Pct = 0): MonthStats => ({
  revenue, gp, gpPct: 0, channelCost: 0, groupCost: 0, cm1, cm1Pct: 0, hk3Rev, hk3Pct,
})
const month = (m: string, total: MonthStats, b2b: MonthStats, b2c: MonthStats) =>
  ({ month: m, isProjected: false, factor: 1, elapsed: 30, dim: 30, hk3Pct: 0, hk3Rev: 0, actualHk3: 0, total, b2b, b2c })

const report = {
  quarter: "Q3", year: 2026, months: [], b2bChannels: [], b2cChannels: [], elapsed_days: 0, quarter_days: 0,
  quarterTotal: {} as any,
  summary: [
    month("2026-07", stats(100, 40, 10, 70), stats(80, 30, 8, 60), stats(20, 10, 2, 10)),
    month("2026-08", stats(200, 80, 30, 150), stats(150, 60, 25, 120), stats(50, 20, 5, 30)),
  ],
} as unknown as QReport

describe("extractQuarter", () => {
  it("cộng tổng các tháng đã có theo segment", () => {
    const all = extractQuarter(report, "ALL")
    expect(all.total).toEqual({ rev: 300, gp: 120, cm1: 40, hk3: 220 })
    expect(all.months["2026-07"]).toEqual({ rev: 100, gp: 40, cm1: 10, hk3: 70 })
    expect(extractQuarter(report, "B2B").total.rev).toBe(230)
    expect(extractQuarter(report, "B2C").total.cm1).toBe(7)
  })
  it("response cũ chưa có hk3Rev → suy từ hk3Pct × revenue", () => {
    const old = { ...report, summary: [month("2026-07", stats(100, 0, 0, undefined, 25), stats(0, 0, 0), stats(0, 0, 0))] } as unknown as QReport
    expect(extractQuarter(old, "ALL").total.hk3).toBe(25)
  })
  it("thiếu report / quý chưa có tháng nào → total rỗng (không phải 0, tránh QoQ -100%)", () => {
    const e = extractQuarter(null, "ALL")
    expect(e.total).toEqual({})
    expect(Object.keys(e.months)).toHaveLength(0)
  })
})

describe("effectiveTargets", () => {
  const seg = (rev: number[]) => ({ rev, gp: [0, 0, 0], cm1: [0, 0, 0], hk3rev: [0, 0, 0] })
  it("ALL chưa nhập → B2B + B2C từng tháng", () => {
    const e = effectiveTargets({ B2B: seg([7, 8, 9]), B2C: seg([1, 2, 3]) })
    expect(e.ALL.map(v => v.rev)).toEqual([8, 10, 12])
    expect(e.ALL[0].gp).toBeUndefined()
  })
  it("ALL nhập riêng → giữ nguyên, không bị cộng đè (đúng như file Excel: ALL ≠ B2B+B2C)", () => {
    const e = effectiveTargets({ ALL: seg([8.0, 8.8, 9.7]), B2B: seg([7, 7.5, 7.2]), B2C: seg([2.3, 2, 2.2]) })
    expect(e.ALL.map(v => v.rev)).toEqual([8.0, 8.8, 9.7])
  })
  it("chưa nhập gì → tất cả undefined", () => {
    const e = effectiveTargets(undefined)
    expect(e.B2B[0]).toEqual({ rev: undefined, gp: undefined, cm1: undefined, hk3: undefined })
  })
})

describe("sum / ratio / relChange", () => {
  it("sumVals bỏ metric chưa có tháng nào", () => {
    expect(sumVals([{ rev: 1 }, { rev: 2, gp: 5 }, {}])).toEqual({ rev: 3, gp: 5 })
  })
  it("addVals giữ metric chỉ có ở 1 bên", () => {
    expect(addVals({ rev: 1 }, { gp: 2 })).toEqual({ rev: 1, gp: 2 })
  })
  it("ratioPct cần doanh thu > 0", () => {
    expect(ratioPct(50, 200)).toBe(25)
    expect(ratioPct(50, 0)).toBeUndefined()
    expect(ratioPct(undefined, 10)).toBeUndefined()
  })
  it("relChange tương đối, kể cả dòng % (30% → 23% ≈ -23%)", () => {
    expect(relChange(110, 100)).toBeCloseTo(10)
    expect(relChange(23, 30)).toBeCloseTo(-23.33, 1)
    expect(relChange(5, 0)).toBeUndefined()
    expect(relChange(-50, -100)).toBeCloseTo(50) // |cũ| ở mẫu
  })
  it("cellOf: dòng % = tử/doanh thu", () => {
    const gpPct = ROW_DEFS.find(r => r.key === "gp_pct")!
    expect(cellOf(gpPct, { rev: 200, gp: 50 })).toBe(25)
  })
  it("quartersBefore", () => {
    expect(quartersBefore(1)).toEqual([])
    expect(quartersBefore(3)).toEqual([1, 2])
  })
})

describe("isQuarterReliable — chặn QoQ/cả năm khi quý chưa đủ dữ liệu", () => {
  const sm = (m: string, elapsed: number, dim: number, isProjected: boolean) => ({ ...month(m, stats(1, 1, 1), stats(1, 1, 1), stats(1, 1, 1)), elapsed, dim, isProjected })
  const rep = (list: ReturnType<typeof sm>[]) => ({ summary: list } as unknown as QReport)
  const keys = ["2026-07", "2026-08", "2026-09"]
  it("đủ 3 tháng, tháng cuối đang chạy đã chiếu → tin cậy", () => {
    expect(isQuarterReliable(rep([sm("2026-07", 31, 31, false), sm("2026-08", 31, 31, false), sm("2026-09", 24, 30, true)]), keys)).toBe(true)
  })
  it("thiếu tháng (quý chưa xong, chưa có T9) → không tin cậy", () => {
    expect(isQuarterReliable(rep([sm("2026-07", 31, 31, false), sm("2026-08", 31, 31, false)]), keys)).toBe(false)
  })
  it("tháng đang chạy < 7 ngày (chưa chiếu) → không tin cậy", () => {
    expect(isQuarterReliable(rep([sm("2026-07", 31, 31, false), sm("2026-08", 31, 31, false), sm("2026-09", 3, 30, false)]), keys)).toBe(false)
  })
  it("không có report → không tin cậy", () => {
    expect(isQuarterReliable(null, keys)).toBe(false)
  })
})
