import { describe, test, expect, vi, afterEach } from "vitest"
import { currentQuarter, quarterOptions } from "@/lib/my-metrics-format"
import { defaultTargetsFor } from "@/lib/my-metrics-types"

afterEach(() => vi.useRealTimers())

describe("My Metrics — chọn quý không gắn cứng Q3/Q4", () => {
  test("tháng 1/2027 → Q1-2027 (trước đây ra Q3-2027)", () => {
    vi.useFakeTimers().setSystemTime(new Date(2027, 0, 15))
    expect(currentQuarter()).toEqual({ q: "Q1", year: 2027 })
    expect(quarterOptions()).toEqual([
      { q: "Q3", year: 2026 }, { q: "Q4", year: 2026 }, { q: "Q1", year: 2027 },
    ])
  })

  test("giữ tối đa 4 quý gần nhất", () => {
    vi.useFakeTimers().setSystemTime(new Date(2027, 7, 1))
    expect(quarterOptions().map(o => `${o.q}-${o.year}`)).toEqual(["Q4-2026", "Q1-2027", "Q2-2027", "Q3-2027"])
  })

  test("Q4-2026 → Q3/Q4 2026", () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 9, 6))
    expect(quarterOptions().map(o => `${o.q}-${o.year}`)).toEqual(["Q3-2026", "Q4-2026"])
  })

  test("target: quý có trong offer letter dùng đúng; quý sau tạm dùng quý gần nhất", () => {
    expect(defaultTargetsFor("Q3-2026")).toMatchObject({ isFallback: false, targets: { begau: 450 } })
    expect(defaultTargetsFor("Q1-2027")).toMatchObject({ isFallback: true, source: "Q4-2026", targets: { begau: 650 } })
  })
})
