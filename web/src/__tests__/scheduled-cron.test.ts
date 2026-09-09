import { describe, test, expect } from "vitest"
import { isDueSince, isCronDue } from "@/lib/scheduled-cron"

// Test scheduler "đến hạn kể từ last_run" với ĐÚNG 3 lịch thật đang bị kẹt:
//   Monthly "0 8 15 * *" · Weekly "0 9 * * 1" · Daily "1 8 * * *"
// nowIct = Date có getUTC* = giờ VN. lastRun = ISO UTC (isDueSince tự +7h khi so).

// ICT wall-clock → Date (đọc qua getUTC* ra đúng giờ VN)
const ict = (y: number, mo: number, d: number, h: number, mi: number) => new Date(Date.UTC(y, mo, d, h, mi))
// ISO UTC sao cho +7h = giờ VN mong muốn (mô phỏng last_run_at trong DB)
const lastRun = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(Date.UTC(y, mo, d, h, mi) - 7 * 3600_000).toISOString()

describe("isDueSince — 3 lịch thật (fix message không tự chạy)", () => {
  // 2026-07-20 là THỨ HAI (dow=1) — dùng cho Weekly.
  test("2026-07-20 đúng là thứ Hai", () => {
    expect(ict(2026, 6, 20, 9, 0).getUTCDay()).toBe(1)
  })

  test("Daily '1 8 * * *' — đến 08:15, lần cuối hôm qua → ĐẾN HẠN", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 19, 8, 5), ict(2026, 6, 20, 8, 15))).toBe(true)
  })
  test("Daily — đã chạy hôm nay 08:05 → KHÔNG gửi lại", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 20, 8, 5), ict(2026, 6, 20, 8, 15))).toBe(false)
  })
  test("Daily — mới 07:50 (chưa tới 08:01) → CHƯA đến hạn", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 19, 8, 5), ict(2026, 6, 20, 7, 50))).toBe(false)
  })

  test("Weekly '0 9 * * 1' — thứ Hai 09:20, lần cuối tuần trước → ĐẾN HẠN", () => {
    expect(isDueSince("0 9 * * 1", lastRun(2026, 6, 13, 9, 2), ict(2026, 6, 20, 9, 20))).toBe(true)
  })
  test("Weekly — thứ Ba 09:20 → KHÔNG đến hạn (không phải thứ Hai)", () => {
    expect(isDueSince("0 9 * * 1", lastRun(2026, 6, 13, 9, 2), ict(2026, 6, 21, 9, 20))).toBe(false)
  })
  test("Weekly — thứ Hai đã chạy 09:05 → KHÔNG gửi lại", () => {
    expect(isDueSince("0 9 * * 1", lastRun(2026, 6, 20, 9, 5), ict(2026, 6, 20, 9, 40))).toBe(false)
  })

  test("Monthly '0 8 15 * *' — ngày 15 lúc 08:20, lần cuối tháng trước → ĐẾN HẠN", () => {
    expect(isDueSince("0 8 15 * *", lastRun(2026, 5, 15, 8, 5), ict(2026, 6, 15, 8, 20))).toBe(true)
  })
  test("Monthly — ngày 16 → KHÔNG đến hạn", () => {
    expect(isDueSince("0 8 15 * *", lastRun(2026, 5, 15, 8, 5), ict(2026, 6, 16, 8, 20))).toBe(false)
  })

  test("Chưa chạy bao giờ (last_run null) — đúng slot trong cửa sổ → ĐẾN HẠN", () => {
    expect(isDueSince("1 8 * * *", null, ict(2026, 6, 20, 8, 15))).toBe(true)
  })

  test("scheduler chạy thưa 15' + trễ: 08:14 vẫn bắt kịp slot 08:01 (cửa sổ 120')", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 19, 8, 5), ict(2026, 6, 20, 8, 14))).toBe(true)
  })

  test("isCronDue vẫn khớp đúng phút (backward compat)", () => {
    expect(isCronDue("1 8 * * *", ict(2026, 6, 20, 8, 1))).toBe(true)
    expect(isCronDue("1 8 * * *", ict(2026, 6, 20, 8, 2))).toBe(false)
  })
})

// Catch-up khi scheduler THƯA/TRỄ (GitHub Actions bỏ trống khung sáng) — đây là gốc lỗi
// "message không tự chạy": slot cron trôi qua nhưng lần quét gần nhất cách xa >120'.
describe("isDueSince — catch-up khi scheduler bỏ khung giờ (24h)", () => {
  test("Daily '1 8 * * *' — slot 08:01 sáng bị lỡ, lần quét đầu lúc 17:00 chiều → VẪN đến hạn", () => {
    // last_run hôm qua; scheduler im từ đêm tới 17:00 (>120' sau 08:01) → cũ MẤT, nay bắt kịp.
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 19, 8, 5), ict(2026, 6, 20, 17, 0))).toBe(true)
  })
  test("Daily — kẹt nhiều ngày (last_run 2 ngày trước), quét lúc 17:00 → đến hạn (gửi 1 lần)", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 18, 3, 6), ict(2026, 6, 20, 17, 0))).toBe(true)
  })
  test("Weekly '0 9 * * 1' — thứ Hai nhưng lần quét đầu lúc 15:00 (lỡ 09:00) → đến hạn", () => {
    expect(isDueSince("0 9 * * 1", lastRun(2026, 6, 13, 9, 2), ict(2026, 6, 20, 15, 0))).toBe(true)
  })
  test("Monthly '0 8 15 * *' — ngày 15 nhưng quét đầu lúc 20:00 (lỡ 08:00) → đến hạn", () => {
    expect(isDueSince("0 8 15 * *", lastRun(2026, 5, 15, 8, 5), ict(2026, 6, 15, 20, 0))).toBe(true)
  })
  test("Không double-send: đã chạy catch-up lúc 17:00 rồi, quét lại 17:30 → KHÔNG gửi lại", () => {
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 20, 17, 0), ict(2026, 6, 20, 17, 30))).toBe(false)
  })
  test("Không hồi tố quá 24h: last_run 3 ngày trước, chưa tới giờ hôm nay → chỉ bắt trong 24h", () => {
    // now = 20/07 07:00 (trước 08:01 hôm nay); trong 24h qua có slot 19/07 08:01 → đến hạn (1 lần).
    expect(isDueSince("1 8 * * *", lastRun(2026, 6, 17, 8, 5), ict(2026, 6, 20, 7, 0))).toBe(true)
  })
})
