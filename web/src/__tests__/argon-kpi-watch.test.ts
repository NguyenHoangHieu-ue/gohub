import { describe, expect, it } from "vitest"
import { activeAlerts, evaluateKpi, mergeAlerts, totalsFromMonth, vnQuarter, type MonthIn } from "@/lib/argon/kpi-watch"

// Số tháng 10 đã chiếu (isProjected): giống dòng thật của /api/analytics/quarterly-report > summary.
const oct: MonthIn = {
  month: "2026-10", isProjected: true, elapsed: 25, dim: 31,
  total: { revenue: 7_320_000_000, gp: 2_660_000_000, cm1: 1_860_000_000 },
  b2b: { revenue: 5_470_000_000, gp: 1_690_000_000, cm1: 1_030_000_000 },
  b2c: { revenue: 1_850_000_000, gp: 970_000_000, cm1: 826_000_000 },
}
// Target 3 tháng của quý (mảng 3 số): tháng 10 là phần tử đầu.
const targets = { ALL: { rev: [10e9, 3e9, 4e9], gp: [1e9, 1e9, 1e9], cm1: [0.6e9, 0.6e9, 0.6e9] }, B2B: { rev: [7e9, 2.5e9, 3e9] } }
const now = new Date("2026-10-26T00:00:00Z")

describe("evaluateKpi (KPI lệch kế hoạch, theo THÁNG đang chạy)", () => {
  it("gộp MỘT thẻ cho mỗi phân khúc: chỉ liệt kê chỉ số chiếu < 85% target tháng; không có target / vượt target thì im", () => {
    const a = evaluateKpi({ months: [oct], targets, now })
    expect(a.map(x => x.key)).toEqual(["kpi:ALL:2026-10", "kpi:B2B:2026-10"])   // ALL: chỉ doanh thu lệch (gp/cm1 vượt); B2B: doanh thu; B2C không có target
    expect(a[0].lows.map(l => [l.metric, l.pct])).toEqual([["rev", 73.2]]); expect(a[0].severity).toBe(2)
    expect(a[0].title).toBe("Toàn công ty T10/2026 chiếu dưới target: Doanh thu 73.2%"); expect(a[0].detail).toContain("thiếu 2,68 tỷ"); expect(a[0].detail).toContain("25/31 ngày")
    expect(a[0].question).toContain("Phân tích nguyên nhân")
    expect(a[1].lows[0].pct).toBe(78.1)   // B2B 5,47 / 7 tỷ
    const many = evaluateKpi({ months: [oct], targets: { B2B: { rev: [7e9], gp: [3e9], cm1: [2e9] } }, now })
    expect(many).toHaveLength(1); expect(many[0].lows).toHaveLength(3); expect(many[0].severity).toBe(3)   // GP 1,69/3 = 56%, CM1 1,03/2 = 51%
    expect(many[0].question).toContain("bắt đầu từ CM1")   // lệch nhiều nhất
  })
  it("tháng chưa chiếu (mới <7 ngày) hoặc đã xong thì không cảnh báo; < 70% là nặng (mức gấp 3)", () => {
    expect(evaluateKpi({ months: [{ ...oct, isProjected: false }], targets, now })).toEqual([])
    const worse = evaluateKpi({ months: [oct], targets: { ALL: { rev: [20e9, 0, 0] } }, now })
    expect(worse).toHaveLength(1); expect(worse[0].severity).toBe(3)
  })
  it("đọc đúng phần tử target theo thứ tự tháng trong quý (T11 = phần tử thứ 2)", () => {
    const nov: MonthIn = { ...oct, month: "2026-11" }
    const a = evaluateKpi({ months: [nov], targets: { ALL: { rev: [1, 20e9, 1] } }, now })
    expect(a).toHaveLength(1); expect(a[0].lows[0].target).toBe(20e9); expect(a[0].key).toBe("kpi:ALL:2026-11")
  })
  it("mergeAlerts giữ ngày phát sinh + trạng thái bỏ qua nếu chưa nặng hơn, báo lại khi nặng hơn, xoá chỗ đã hết lệch", () => {
    const first = evaluateKpi({ months: [oct], targets: { ALL: { rev: [10e9, 0, 0] } }, now })
    const dismissed = first.map(a => ({ ...a, at: "2026-10-20T00:00:00.000Z", dismissedUntil: "2026-11-01T00:00:00.000Z" }))
    const same = mergeAlerts(dismissed, first, now)
    expect(same[0].at).toBe("2026-10-20T00:00:00.000Z"); expect(activeAlerts(same, now.getTime())).toHaveLength(0)
    const worse = mergeAlerts(dismissed, evaluateKpi({ months: [oct], targets: { ALL: { rev: [20e9, 0, 0] } }, now }), now)
    expect(activeAlerts(worse, now.getTime())).toHaveLength(1)   // nặng hơn (3 > 2) → hiện lại
    expect(mergeAlerts(dismissed, [], now)).toEqual([])
  })
  it("totalsFromMonth chịu thiếu trường; vnQuarter theo giờ Việt Nam", () => {
    expect(totalsFromMonth(null).ALL).toEqual({ rev: 0, gp: 0, cm1: 0 })
    expect(vnQuarter(new Date("2026-09-30T18:00:00Z"))).toMatchObject({ q: 4, year: 2026, label: "Q4-2026" })   // 01:00 ngày 1/10 giờ VN
    expect(vnQuarter(new Date("2026-12-31T10:00:00Z")).q).toBe(4)
  })
})
