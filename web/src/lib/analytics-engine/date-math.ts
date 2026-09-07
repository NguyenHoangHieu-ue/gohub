/**
 * Date-math thuần cho pro-rata/projection — KHÔNG import gì (client-safe, dùng được cả FE lẫn BE).
 *
 * Nguồn DUY NHẤT cho "số ngày trong tháng" / "số ngày overlap giữa 1 khoảng ngày và 1 tháng". Trước
 * s183 Phase 2 có 2 bản gần giống nhau (`analytics-helpers.ts` và `bod-data.ts`), cả 2 đều parse chuỗi
 * "YYYY-MM-DD" qua `new Date(isoString)` (UTC) rồi so sánh/trừ với `new Date(y, m, d)` (LOCAL) — đúng
 * trên Vercel (chạy UTC) nhưng có thể lệch ngày trên máy dev ở timezone lệch âm so với UTC (vd US). Ở
 * đây parse thủ công Y/M/D ra số nguyên rồi quy về ordinal ngày qua `Date.UTC` (hàm thuần, không đọc giờ
 * địa phương của runtime) — không còn phụ thuộc timezone máy chạy nữa.
 */

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d: d || 1 }
}

// Ordinal ngày (số ngày kể từ epoch) — chỉ cần đúng THỨ TỰ và HIỆU số ngày, không cần là ngày lịch thật.
// Date.UTC là hàm thuần túy toán học trên tham số đầu vào, không đọc timezone của máy chạy.
function ymdToOrdinal(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

/** Số ngày trong 1 tháng, vd `"2026-02"` → 28, `"2024-02"` → 29 (nhuận). */
export function getDaysInMonth(monthStr: string): number {
  const { y, m } = parseYMD(monthStr)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Số ngày overlap giữa khoảng `[startDate, endDate]` (chuỗi `YYYY-MM-DD`, bao gồm 2 đầu mút) và tháng
 * `monthStr` (`YYYY-MM`). Trả 0 nếu khoảng không chạm tháng đó.
 */
export function getDaysInRange(startDate: string, endDate: string, monthStr: string): number {
  const { y, m } = parseYMD(monthStr)
  const monthStartOrd = ymdToOrdinal(y, m, 1)
  const monthEndOrd = ymdToOrdinal(y, m, getDaysInMonth(monthStr))

  const s = parseYMD(startDate)
  const e = parseYMD(endDate)
  const startOrd = ymdToOrdinal(s.y, s.m, s.d)
  const endOrd = ymdToOrdinal(e.y, e.m, e.d)

  const rangeStartOrd = Math.max(startOrd, monthStartOrd)
  const rangeEndOrd = Math.min(endOrd, monthEndOrd)
  return rangeEndOrd < rangeStartOrd ? 0 : rangeEndOrd - rangeStartOrd + 1
}
