// date-math.ts (s183 Phase 2) — nguồn duy nhất cho getDaysInMonth/getDaysInRange, thay 2 bản gần giống
// nhau ở analytics-helpers.ts và bod-data.ts. Test ở đây khoá lại 2 việc: (1) số ngày tính đúng cho các
// case chuẩn (khớp test cũ đã có ở analytics-helpers.test.ts, giữ nguyên hành vi khi migrate), và
// (2) KHÔNG còn lệch theo timezone máy chạy — bản cũ parse "YYYY-MM-DD" qua `new Date(isoString)` (UTC)
// rồi so/trừ với `new Date(y,m,d)` (LOCAL), đúng trên Vercel (UTC) nhưng có thể lệch ngày trên máy dev ở
// timezone offset âm (vd US Eastern). Test dưới đây CHỦ Ý set TZ khác UTC để chứng minh vẫn đúng.

import { describe, test, expect, afterEach } from "vitest"
import { getDaysInMonth, getDaysInRange, vnToday, getSafeReportDate } from "@/lib/analytics-engine/date-math"

const ORIGINAL_TZ = process.env.TZ

afterEach(() => { process.env.TZ = ORIGINAL_TZ })

describe("getDaysInMonth", () => {
  test("số ngày chuẩn theo tháng, kể cả năm nhuận", () => {
    expect(getDaysInMonth("2026-02")).toBe(28)
    expect(getDaysInMonth("2024-02")).toBe(29) // nhuận
    expect(getDaysInMonth("2026-07")).toBe(31)
    expect(getDaysInMonth("2026-04")).toBe(30)
  })
})

describe("getDaysInRange", () => {
  test("khoảng nằm gọn trong tháng / trùm cả tháng / ngoài tháng", () => {
    expect(getDaysInRange("2026-07-01", "2026-07-10", "2026-07")).toBe(10)
    expect(getDaysInRange("2026-06-15", "2026-08-15", "2026-07")).toBe(31) // cả tháng 7
    expect(getDaysInRange("2026-07-01", "2026-07-10", "2026-09")).toBe(0) // ngoài tháng
  })

  test("khoảng 1 ngày duy nhất → 1", () => {
    expect(getDaysInRange("2026-07-15", "2026-07-15", "2026-07")).toBe(1)
  })

  test("khoảng cắt ngang đầu/cuối tháng — chỉ đếm phần overlap", () => {
    expect(getDaysInRange("2026-07-25", "2026-08-05", "2026-07")).toBe(7)  // 25..31
    expect(getDaysInRange("2026-07-25", "2026-08-05", "2026-08")).toBe(5)  // 1..5
  })
})

describe("Bất biến theo timezone máy chạy (fix bug lớp bod-data.ts/analytics-helpers.ts cũ)", () => {
  const cases: Array<[string, string, string, number]> = [
    ["2026-07-01", "2026-07-31", "2026-07", 31],
    ["2026-07-25", "2026-08-05", "2026-07", 7],
    ["2026-01-01", "2026-01-01", "2026-01", 1],
  ]

  for (const tz of ["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Ho_Chi_Minh"]) {
    test(`TZ=${tz} → kết quả giống hệt UTC (không phụ thuộc timezone runtime)`, () => {
      process.env.TZ = tz
      for (const [s, e, m, expected] of cases) {
        expect(getDaysInRange(s, e, m)).toBe(expected)
      }
      expect(getDaysInMonth("2026-02")).toBe(28)
    })
  }
})

describe("vnToday / getSafeReportDate (fix bug cutoff báo cáo B2C — thiếu chặn ngày chưa kết thúc)", () => {
  test("vnToday đọc đúng ngày VN dù server chạy UTC, kể cả lúc còn 'hôm qua' theo UTC", () => {
    // 2026-07-15 00:30 giờ VN = 2026-07-14 17:30 UTC (server Vercel chạy UTC).
    const instant = new Date(Date.UTC(2026, 6, 14, 17, 30))
    expect(vnToday(instant)).toEqual({ y: 2026, m: 7, d: 15 })
  })

  test("getSafeReportDate mặc định trả hôm qua (giờ VN), kể cả khi qua mốc UTC nửa đêm", () => {
    const instant = new Date(Date.UTC(2026, 6, 14, 17, 30)) // = 2026-07-15 00:30 ICT
    expect(getSafeReportDate(1, instant)).toBe("2026-07-14")
  })

  test("getSafeReportDate xử lý đúng qua ranh giới tháng/năm", () => {
    const endOfMonth = new Date(Date.UTC(2026, 6, 31, 17, 10)) // = 2026-08-01 00:10 ICT
    expect(getSafeReportDate(1, endOfMonth)).toBe("2026-07-31")
    const endOfYear = new Date(Date.UTC(2026, 11, 31, 17, 10)) // = 2027-01-01 00:10 ICT
    expect(getSafeReportDate(1, endOfYear)).toBe("2026-12-31")
  })

  test("daysAgo=0 trả đúng hôm nay giờ VN", () => {
    const instant = new Date(Date.UTC(2026, 6, 14, 17, 30)) // = 2026-07-15 00:30 ICT
    expect(getSafeReportDate(0, instant)).toBe("2026-07-15")
  })
})
