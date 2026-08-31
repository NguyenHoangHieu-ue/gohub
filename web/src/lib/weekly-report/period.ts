// Xác định kỳ báo cáo cho Weekly Report — luôn "tuần trước" (Thứ 2→CN gần nhất đã hoàn thành),
// bất kể chạy vào ngày nào trong tuần, + tháng hiện tại (MTD) so tháng trước (Actual đầy đủ).
// Giờ tính theo ICT (UTC+7) — server Vercel chạy UTC.

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000

function todayIct(): Date {
  const now = new Date(Date.now() + ICT_OFFSET_MS)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000)
}

// Cộng/trừ N ngày trên chuỗi "YYYY-MM-DD" — dùng ngoài module này (data.ts) để tính cửa sổ so sánh.
export function addDaysStr(dateStr: string, days: number): string {
  return fmt(addDays(new Date(`${dateStr}T00:00:00Z`), days))
}
export function daysBetweenStr(startStr: string, endStr: string): number {
  const a = new Date(`${startStr}T00:00:00Z`)
  const b = new Date(`${endStr}T00:00:00Z`)
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
}

export interface ReportPeriods {
  todayStr: string
  cutoffDate: string          // CURRENT_DATE - 1 (ICT) — data gohub_dw chỉ có tới đây
  lastWeekStart: string       // Thứ 2 tuần trước
  lastWeekEnd: string         // CN tuần trước
  prevWeekStart: string       // Thứ 2 tuần trước nữa
  prevWeekEnd: string         // CN tuần trước nữa
  monthStart: string          // Ngày 1 tháng hiện tại
  monthEnd: string            // Ngày cuối tháng hiện tại (calendar, dùng làm endDate cho getDateFilter — tự clamp CURRENT_DATE-1)
  monthLabel: string          // "Tháng 8/2026"
  prevMonthStart: string
  prevMonthEnd: string
  prevMonthLabel: string      // "Tháng 7/2026"
  weekRangeLabel: string      // "24/08 - 30/08"
  prevWeekRangeLabel: string  // "17/08 - 23/08"
}

export function getReportPeriods(): ReportPeriods {
  const today = todayIct()
  const cutoff = addDays(today, -1)

  // dow: 0=CN,1=T2..6=T7 → daysSinceMonday: T2=0..CN=6
  const dow = today.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const thisWeekMonday = addDays(today, -daysSinceMonday)
  const lastWeekStart = addDays(thisWeekMonday, -7)
  const lastWeekEnd   = addDays(thisWeekMonday, -1)
  const prevWeekStart = addDays(lastWeekStart, -7)
  const prevWeekEnd   = addDays(lastWeekStart, -1)

  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() // 0-indexed
  const monthStart = new Date(Date.UTC(y, m, 1))
  const monthEnd   = new Date(Date.UTC(y, m + 1, 0))
  const prevMonthStart = new Date(Date.UTC(y, m - 1, 1))
  const prevMonthEnd   = new Date(Date.UTC(y, m, 0))

  const dm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`

  return {
    todayStr: fmt(today),
    cutoffDate: fmt(cutoff),
    lastWeekStart: fmt(lastWeekStart),
    lastWeekEnd: fmt(lastWeekEnd),
    prevWeekStart: fmt(prevWeekStart),
    prevWeekEnd: fmt(prevWeekEnd),
    monthStart: fmt(monthStart),
    monthEnd: fmt(monthEnd),
    monthLabel: `Tháng ${m + 1}/${y}`,
    prevMonthStart: fmt(prevMonthStart),
    prevMonthEnd: fmt(prevMonthEnd),
    prevMonthLabel: `Tháng ${m === 0 ? 12 : m}/${m === 0 ? y - 1 : y}`,
    weekRangeLabel: `${dm(lastWeekStart)} - ${dm(lastWeekEnd)}`,
    prevWeekRangeLabel: `${dm(prevWeekStart)} - ${dm(prevWeekEnd)}`,
  }
}

// ── Format số tiền VND kiểu Việt (tỷ/triệu ₫) — dùng thống nhất toàn report ──
export function fmtVnd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ ₫`
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu ₫`
  return `${n.toLocaleString("vi-VN")} ₫`
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

export function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function pctChange(cur: number, prev: number): number {
  if (!prev) return cur > 0 ? 100 : 0
  return ((cur - prev) / Math.abs(prev)) * 100
}
