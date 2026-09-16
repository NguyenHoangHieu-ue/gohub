import { describe, it, expect } from "vitest"
import { classifyFreshness, type DataHealthEntry } from "@/lib/data-health-config"
import { median, detectAnomalies } from "@/lib/data-health-anomaly"

const entry: DataHealthEntry = {
  key: "test", label: "Test", category: "Doanh thu", source: "gohub_dw", table: "t", dateCol: "d",
  warnAfterHours: 24, redAfterHours: 48,
}

describe("classifyFreshness", () => {
  it("green khi trong ngưỡng vàng", () => {
    expect(classifyFreshness(5, entry)).toBe("green")
  })
  it("yellow khi vượt ngưỡng vàng nhưng chưa tới đỏ", () => {
    expect(classifyFreshness(30, entry)).toBe("yellow")
  })
  it("red khi vượt ngưỡng đỏ", () => {
    expect(classifyFreshness(50, entry)).toBe("red")
  })
  it("unknown khi không có delayHours", () => {
    expect(classifyFreshness(null, entry)).toBe("unknown")
  })
})

describe("median", () => {
  it("mảng rỗng trả 0", () => expect(median([])).toBe(0))
  it("số lẻ phần tử lấy đúng phần tử giữa", () => expect(median([3, 1, 2])).toBe(2))
  it("số chẵn phần tử lấy trung bình 2 giữa", () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe("detectAnomalies", () => {
  it("không đánh dấu khi chưa đủ ngày làm baseline", () => {
    const rows = [{ date: "1", value: 100 }, { date: "2", value: 1000 }]
    const out = detectAnomalies(rows)
    expect(out.every(r => !r.anomaly)).toBe(true)
  })

  it("đánh dấu ngày lệch mạnh so median 7 ngày trước", () => {
    const rows = [
      { date: "1", value: 100 }, { date: "2", value: 100 }, { date: "3", value: 100 },
      { date: "4", value: 100 }, { date: "5", value: 100 }, { date: "6", value: 100 },
      { date: "7", value: 100 }, { date: "8", value: 20 },   // rớt 80% so baseline
    ]
    const out = detectAnomalies(rows)
    expect(out[7].anomaly).toBe(true)
    expect(out[7].diffPct).toBeLessThan(0)
  })

  it("không đánh dấu khi lệch dưới ngưỡng", () => {
    const rows = [
      { date: "1", value: 100 }, { date: "2", value: 100 }, { date: "3", value: 100 },
      { date: "4", value: 100 }, { date: "5", value: 100 }, { date: "6", value: 100 },
      { date: "7", value: 100 }, { date: "8", value: 110 },  // +10%, dưới ngưỡng 35%
    ]
    const out = detectAnomalies(rows)
    expect(out[7].anomaly).toBe(false)
  })
})
