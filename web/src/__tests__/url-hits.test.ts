import { describe, test, expect } from "vitest"
import { anchors, templateUrl, expandUrl, rankUrls, vnDate, stripVolatileParams } from "../lib/url-hits"

// 2026-10-23 12:00 giờ VN
const NOW = new Date("2026-10-23T05:00:00Z")

describe("url-hits", () => {
  test("mốc tương đối theo giờ VN", () => {
    const a = anchors(NOW)
    expect(a).toMatchObject({ today: "2026-10-23", yday: "2026-10-22", mstart: "2026-10-01", pmstart: "2026-09-01", pmend: "2026-09-30", qstart: "2026-10-01", ystart: "2026-01-01" })
  })

  test("đầu tháng 1: tháng trước = tháng 12 năm trước", () => {
    const a = anchors(new Date("2026-01-15T05:00:00Z"))
    expect(a.pmstart).toBe("2025-12-01")
    expect(a.pmend).toBe("2025-12-31")
  })

  test("templateUrl: MTD → {mstart}..{today}; ngày quá khứ khác giữ nguyên; tham số khác không đổi", () => {
    expect(templateUrl("/api/analytics/bod-summary?startDate=2026-10-01&endDate=2026-10-23&companyCode=ALL", NOW))
      .toBe("/api/analytics/bod-summary?startDate={mstart}&endDate={today}&companyCode=ALL")
    expect(templateUrl("/api/analytics/x?startDate=2026-08-01&endDate=2026-08-31", NOW)).toBe("/api/analytics/x?startDate=2026-08-01&endDate=2026-08-31")
    expect(templateUrl("/api/analytics/x?quarter=Q3&year=2026", NOW)).toBe("/api/analytics/x?quarter=Q3&year=2026")
    expect(templateUrl("/api/analytics/x", NOW)).toBe("/api/analytics/x")
  })

  test("đầu tháng: startDate trùng hôm nay vẫn hiểu là đầu tháng", () => {
    const first = new Date("2026-10-01T05:00:00Z")
    expect(templateUrl("/api/analytics/x?startDate=2026-10-01&endDate=2026-10-01", first)).toBe("/api/analytics/x?startDate={mstart}&endDate={today}")
  })

  test("expandUrl mở mẫu theo ngày hôm sau", () => {
    const tomorrow = new Date("2026-10-24T05:00:00Z")
    expect(expandUrl("/api/analytics/x?startDate={mstart}&endDate={today}", tomorrow)).toBe("/api/analytics/x?startDate=2026-10-01&endDate=2026-10-24")
  })

  test("rankUrls: lượt gần đây nặng hơn, cắt theo limit", () => {
    const rows = [
      { url: "a", day: "2026-10-23", hits: 5 }, { url: "b", day: "2026-10-16", hits: 20 },
      { url: "b", day: "2026-10-22", hits: 1 }, { url: "c", day: "2026-10-23", hits: 1 },
    ]
    expect(rankUrls(rows, NOW, 2)).toEqual(["a", "b"])
    expect(vnDate(NOW)).toBe("2026-10-23")
  })

  test("stripVolatileParams bỏ nocache/refresh/_t, giữ bộ lọc thật", () => {
    expect(stripVolatileParams("/api/analytics/x?a=1&nocache=1&_t=99&refresh=1")).toBe("/api/analytics/x?a=1")
    expect(stripVolatileParams("/api/analytics/x?nocache=1")).toBe("/api/analytics/x")
    expect(stripVolatileParams("/api/analytics/x?q=A&b=2")).toBe("/api/analytics/x?q=A&b=2")
  })
})
