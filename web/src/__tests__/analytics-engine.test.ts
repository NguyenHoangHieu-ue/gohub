// Unit test cho Analytics Reporting Engine (s183 Phase 1) — lib/analytics-engine/* + lib/b2b-customer-cost.ts.
// Trước s183, các module này KHÔNG có test nào dù là nơi tính CM1/chi phí/pro-rata cho gần như mọi tab BI —
// mỗi lần Hiếu báo "số sai" (s162/s166/s168/s169/s182...) đều phải vá tay rồi "CHƯA verify số thật". Test ở
// đây khoá lại đúng những case đã từng là bug thật, để lần sau ai đổi công thức mà quên 1 case cũ thì test đỏ
// ngay, không phải đợi Hiếu test tay trên staging mới biết.

import { vi, describe, test, expect } from "vitest"

// Date-math trong quarter-projection.ts trộn `new Date(isoString)` (parse UTC) với `new Date(y,m,d)` (parse
// LOCAL timezone) — đúng trên Vercel (chạy UTC) nhưng lệch ±1 ngày nếu máy dev ở timezone khác UTC (vd ICT
// +7). Ghim TZ=UTC ở đây để test phản ánh đúng môi trường production, không phải máy chạy test tình cờ ở đâu.
process.env.TZ = "UTC"

// cost-engine.ts kéo theo analytics-helpers.ts (giá trị, không chỉ type) → kéo theo supabase/turso/
// quarterly-settings thật, throw lỗi thiếu env khi chạy test. Mock cô lập giống analytics-helpers.test.ts.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))
vi.mock("@/lib/quarterly-settings", () => ({
  fetchQuarterlySettings: vi.fn(),
  exclHash: () => "",
}))

import { calcChCostForPeriod, calcChannelOpCost, calcGroupOpCost, type CostRecord } from "@/lib/analytics-engine/cost-engine"
import { getProjectionFactor, isProjectable } from "@/lib/analytics-engine/projection"
import {
  buildQuarterMonthMeta, getKpiFactor, getElapsedRatio, MIN_PROJECT_DAYS,
} from "@/lib/analytics-engine/quarter-projection"
import { calcRecordCost, calcRecordCostProjected } from "@/lib/b2b-customer-cost"
import type { ChannelCostRow } from "@/lib/analytics-helpers"

describe("cost-engine — calcChCostForPeriod (B2B per-customer CH.Cost)", () => {
  test("cost_lines rỗng → fallback cost_type/cost_value phẳng", () => {
    const rec: CostRecord = { cost_type: "amount", cost_value: 1_000_000, cost_lines: "[]" }
    expect(calcChCostForPeriod(rec, 5_000_000, 0.5)).toBe(500_000) // amount × dayRatio
  })

  test("cost_type percent → % trên moRevenue, KHÔNG nhân dayRatio", () => {
    const rec: CostRecord = { cost_type: "percent", cost_value: 5, cost_lines: "[]" }
    expect(calcChCostForPeriod(rec, 10_000_000, 0.3)).toBe(500_000) // 5% × 10tr, dayRatio bỏ qua
  })

  test("cost_lines nhiều dòng, trộn amount + percent → cộng đúng từng dòng", () => {
    const rec: CostRecord = {
      cost_type: "amount", cost_value: 0,
      cost_lines: JSON.stringify([
        { label: "Platform Fee", type: "percent", value: 5 },
        { label: "Ads tháng", type: "amount", value: 2_000_000 },
      ]),
    }
    // percent: 5% × 10tr = 500k (không dayRatio) | amount: 2tr × 0.5 (dayRatio) = 1tr
    expect(calcChCostForPeriod(rec, 10_000_000, 0.5)).toBe(1_500_000)
  })
})

describe("cost-engine — calcChannelOpCost / calcGroupOpCost", () => {
  const mkRow = (over: Partial<ChannelCostRow> = {}): ChannelCostRow => ({
    channel: "Momo", month: "2026-08",
    ads:             { type: "amount", value: 0 },
    platformFee:     { type: "amount", value: 0 },
    sponsorProducts: { type: "amount", value: 0 },
    media:           { type: "amount", value: 0 },
    ...over,
  })

  test("amount cộng dồn theo dayRatio (pro-rate số ngày trong range)", () => {
    const rows = [mkRow({ ads: { type: "amount", value: 3_100_000 } })] // 31 ngày tháng 8 → 100k/ngày
    const cost = calcChannelOpCost(rows, "Momo", "2026-08-01", "2026-08-10", {})
    expect(cost).toBe(1_000_000) // 10/31 ngày × 3.1tr
  })

  test("percent áp trên doanh thu THỰC của kỳ (revByMonth), không pro-rate theo ngày", () => {
    const rows = [mkRow({ platformFee: { type: "percent", value: 10 } })]
    const cost = calcChannelOpCost(rows, "Momo", "2026-08-01", "2026-08-31", { "2026-08": 50_000_000 })
    expect(cost).toBe(5_000_000)
  })

  test("channel khác tên → không tính vào (filter đúng theo channelName)", () => {
    const rows = [mkRow({ channel: "ShopeePay", ads: { type: "amount", value: 1_000_000 } })]
    expect(calcChannelOpCost(rows, "Momo", "2026-08-01", "2026-08-31", {})).toBe(0)
  })

  test("calcGroupOpCost — phân bổ group cost theo revenue-share (fix s162: tránh cộng 2 lần vào cả 2 tier)", () => {
    const groupCosts = [{ group_name: "B2B", month: "2026-08", amount: "10000000" }]
    // KH chiếm 30% doanh thu group B2B tháng đó → chỉ nhận 30% group cost, không phải toàn bộ
    const cost = calcGroupOpCost(groupCosts, "B2B", 0.3, "2026-08-01", "2026-08-31")
    expect(cost).toBe(3_000_000)
  })
})

describe("projection.ts — getProjectionFactor (single date-range projection)", () => {
  const REAL_DATE = Date
  function mockToday(iso: string) {
    class FixedDate extends REAL_DATE {
      constructor(...args: any[]) {
        if (args.length === 0) { super(iso); return }
        // @ts-ignore
        super(...args)
      }
    }
    // @ts-ignore
    global.Date = FixedDate
  }
  function restoreDate() { global.Date = REAL_DATE }

  test("range cắt ngang 2 tháng → factor = 1 (không project)", () => {
    mockToday("2026-08-15")
    expect(getProjectionFactor("2026-07-25", "2026-08-05")).toBe(1)
    restoreDate()
  })

  test("tháng đã qua (không phải tháng hiện tại) → factor = 1", () => {
    mockToday("2026-08-15")
    expect(getProjectionFactor("2026-07-01", "2026-07-31")).toBe(1)
    restoreDate()
  })

  test("MTD tháng hiện tại → factor = daysInMonth / daysElapsed, > 1", () => {
    mockToday("2026-08-10") // tháng 8 có 31 ngày
    const factor = getProjectionFactor("2026-08-01", "2026-08-10") // 10 ngày đã qua
    expect(factor).toBeCloseTo(31 / 10, 5)
    expect(isProjectable("2026-08-01", "2026-08-10")).toBe(true)
    restoreDate()
  })

  test("tháng hiện tại nhưng đã hết tháng (end = ngày cuối) → factor = 1 (không projectable)", () => {
    mockToday("2026-08-31")
    expect(getProjectionFactor("2026-08-01", "2026-08-31")).toBe(1)
    restoreDate()
  })
})

describe("quarter-projection.ts — buildQuarterMonthMeta", () => {
  const asOf = new Date("2026-08-15") // đang ở giữa tháng 8, quý Q3 = T7/T8/T9
  const todayStr = "2026-08-15"

  test("tháng đã hoàn thành (T7) → isProjected=false, factor=1, elapsed=dim", () => {
    const [jul] = buildQuarterMonthMeta(["2026-07"], asOf, todayStr)
    expect(jul.isProjected).toBe(false)
    expect(jul.factor).toBe(1)
    expect(jul.elapsed).toBe(jul.dim) // 31 ngày đã trôi hết
    expect(jul.isFuture).toBe(false)
  })

  test("tháng tương lai (T9, chưa tới) → isFuture=true, elapsed=0", () => {
    const [sep] = buildQuarterMonthMeta(["2026-09"], asOf, todayStr)
    expect(sep.isFuture).toBe(true)
    expect(sep.elapsed).toBe(0)
  })

  test("tháng hiện tại, elapsed >= MIN_PROJECT_DAYS → isProjected=true, factor=dim/elapsed", () => {
    const [aug] = buildQuarterMonthMeta(["2026-08"], asOf, todayStr) // 15 ngày đã qua, 31 ngày trong tháng
    expect(aug.elapsed).toBe(15)
    expect(aug.elapsed).toBeGreaterThanOrEqual(MIN_PROJECT_DAYS)
    expect(aug.isProjected).toBe(true)
    expect(aug.factor).toBeCloseTo(31 / 15, 5)
  })

  test("tháng hiện tại, elapsed < MIN_PROJECT_DAYS (đầu tháng) → GATED, factor=1 (giữ actual, tránh nhảy số)", () => {
    const earlyAsOf = new Date("2026-08-03")
    const [aug] = buildQuarterMonthMeta(["2026-08"], earlyAsOf, "2026-08-03")
    expect(aug.elapsed).toBe(3)
    expect(aug.elapsed).toBeLessThan(MIN_PROJECT_DAYS)
    expect(aug.isProjected).toBe(false)
    expect(aug.factor).toBe(1) // bảng "Tổng hợp theo tháng" GIỮ actual đầu tháng
  })
})

describe("quarter-projection.ts — getKpiFactor (regression s182: KHÔNG gate theo MIN_PROJECT_DAYS)", () => {
  test("đầu tháng (elapsed=2 < 7) — getKpiFactor VẪN chiếu ngay (khác factor gated ở trên = 1)", () => {
    const earlyAsOf = new Date("2026-09-02")
    const [sep] = buildQuarterMonthMeta(["2026-09"], earlyAsOf, "2026-09-02")
    expect(sep.factor).toBe(1) // bảng tháng: gated, chưa đủ 7 ngày → giữ actual
    expect(getKpiFactor(sep)).toBeCloseTo(30 / 2, 5) // KPI/PR per-customer: ungated, chiếu ngay ×15
  })

  test("tháng đã xong (elapsed=dim) → getKpiFactor = 1, khớp factor gated", () => {
    const asOf = new Date("2026-08-15")
    const [jul] = buildQuarterMonthMeta(["2026-07"], asOf, "2026-08-15")
    expect(getKpiFactor(jul)).toBe(1)
  })

  test("tháng tương lai (elapsed=0) → getKpiFactor = 1 (điều kiện elapsed>0 chặn chia cho 0)", () => {
    const asOf = new Date("2026-08-15")
    const [sep] = buildQuarterMonthMeta(["2026-09"], asOf, "2026-08-15")
    expect(getKpiFactor(sep)).toBe(1)
  })
})

describe("quarter-projection.ts — getElapsedRatio (regression s166: pro-rate cost dạng amount)", () => {
  test("giữa tháng (elapsed=15/31) → ratio ≈ 0.484, KHÔNG phải 1", () => {
    const asOf = new Date("2026-08-15")
    const [aug] = buildQuarterMonthMeta(["2026-08"], asOf, "2026-08-15")
    expect(getElapsedRatio(aug)).toBeCloseTo(15 / 31, 5)
  })

  test("elapsedRatio × getKpiFactor = 1 cho MỌI tháng đã bắt đầu (bất kể elapsed) — bản chất triệt tiêu s166 mô tả", () => {
    for (const asOfDay of [2, 7, 15, 31]) {
      const asOf = new Date(`2026-08-${String(asOfDay).padStart(2, "0")}`)
      const [aug] = buildQuarterMonthMeta(["2026-08"], asOf, asOf.toISOString().slice(0, 10))
      const product = getElapsedRatio(aug) * getKpiFactor(aug)
      expect(product).toBeCloseTo(1, 10)
    }
  })
})

describe("b2b-customer-cost.ts — calcRecordCostProjected (regression s166: cost amount không bị nhân đúp)", () => {
  test("amount type, factor=1 elapsedRatio=1 (calcRecordCost = actual, tháng đã xong) → giữ nguyên value", () => {
    const rec = { cost_type: "amount", cost_value: 2_000_000, cost_lines: "[]" }
    expect(calcRecordCost(rec, 10_000_000)).toBe(2_000_000)
  })

  test("amount type, PR giữa tháng — dùng đúng elapsedRatio TRƯỚC KHI factor chiếu hết tháng → trừ đúng 1 lần", () => {
    const rec = { cost_type: "amount", cost_value: 3_100_000, cost_lines: "[]" } // 31 ngày, 100k/ngày
    // Bug s166: nếu hardcode elapsedRatio=1 rồi vẫn nhân outer factor (dim/elapsed) → cost bị nhân đúp.
    // Đúng: cost PR = value × elapsedRatio (không nhân thêm factor ở NGOÀI cho phần cost — hàm tự xử lý).
    const elapsedRatio = 15 / 31
    const cost = calcRecordCostProjected(rec, 10_000_000, /* factor */ 31 / 15, elapsedRatio)
    expect(cost).toBeCloseTo(3_100_000 * elapsedRatio, 2) // ≈ 1.5tr, KHÔNG phải 3.1tr (nhân đúp)
  })

  test("percent type, PR giữa tháng — nhân CẢ factor (chiếu revenue hết tháng), KHÔNG dùng elapsedRatio", () => {
    const rec = { cost_type: "percent", cost_value: 5, cost_lines: "[]" }
    const cost = calcRecordCostProjected(rec, 10_000_000, 2, 15 / 31)
    expect(cost).toBe(1_000_000) // 5% × 10tr × factor(2) = 1tr — elapsedRatio không áp cho percent
  })

  test("cost_lines JSON trộn amount + percent → mỗi dòng áp đúng công thức riêng", () => {
    const rec = {
      cost_type: "amount", cost_value: 0,
      cost_lines: JSON.stringify([
        { type: "amount", value: 1_000_000 },
        { type: "percent", value: 10 },
      ]),
    }
    const cost = calcRecordCostProjected(rec, 5_000_000, 2, 0.5)
    // amount: 1tr × 0.5(elapsedRatio) = 500k | percent: 10% × 5tr × 2(factor) = 1tr → tổng 1.5tr
    expect(cost).toBe(1_500_000)
  })

  test("rec undefined → trả 0, không throw", () => {
    expect(calcRecordCostProjected(undefined, 1_000_000, 2, 0.5)).toBe(0)
  })
})
