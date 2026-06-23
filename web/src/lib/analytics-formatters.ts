export function formatCurrency(value: number | string | null | undefined): string {
  try {
    const num = typeof value === "string" ? parseFloat(value) : (value ?? 0)
    if (isNaN(num) || !isFinite(num)) return "0 ₫"
    try {
      return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
    } catch {
      return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫"
    }
  } catch { return "0 ₫" }
}

export function formatNumber(value: number | string | null | undefined): string {
  try {
    const num = typeof value === "string" ? parseFloat(value) : (value ?? 0)
    if (isNaN(num) || !isFinite(num)) return "0"
    try { return new Intl.NumberFormat("vi-VN").format(num) }
    catch { return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") }
  } catch { return "0" }
}

export function formatCompactNumber(value: number | string | null | undefined): string {
  try {
    const num = typeof value === "string" ? parseFloat(value) : (value ?? 0)
    if (isNaN(num) || !isFinite(num)) return "0"
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + " Tỷ"
    if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1) + " Tr"
    return formatNumber(num)
  } catch { return "0" }
}

export function formatDateToISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-"
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
  } catch { return value }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-"
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
  } catch { return value }
}

export function formatTruncatedString(value: string | null | undefined, maxLen = 25): string {
  if (!value) return ""
  return value.length <= maxLen ? value : value.substring(0, maxLen) + "..."
}

export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date()
  // Mặc định: đầu tháng -> hôm qua (T-1, tránh sync trễ). Ngày 1 -> tự lùi nguyên tháng trước.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return {
    startDate: formatDateToISO(start),
    endDate:   formatDateToISO(end),
  }
}

export function calcMoM(current: number, previous: number): number {
  if (!previous) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

export function calcProjection(actual: number, daysElapsed: number, totalDaysInMonth: number): number {
  if (!daysElapsed) return 0
  return Math.round(actual * (totalDaysInMonth / daysElapsed))
}
