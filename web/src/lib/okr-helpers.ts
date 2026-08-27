// Helpers dùng chung cho OKR tracking (tab My Metrics) — quarter parsing + lock logic.
// Lock: sau khi quý đã kết thúc (ngày cuối quý < hôm nay), record cũ không được sửa/xoá nữa —
// đảm bảo sếp xem lại số của quý trước sẽ không bị âm thầm đổi.

export function quarterRange(q: string, year: number) {
  const qNum = parseInt(q.replace("Q", "")) || 3
  const startMonth = (qNum - 1) * 3
  const endMonth = startMonth + 2
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, endMonth + 1, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { start: fmt(start), end: fmt(end) }
}

// "Q3-2026" -> { q: "Q3", year: 2026, start, end }
export function parseQuarterLabel(label: string) {
  const [q, y] = label.split("-")
  const year = parseInt(y) || new Date().getFullYear()
  const { start, end } = quarterRange(q || "Q3", year)
  return { q: q || "Q3", year, start, end }
}

export function isQuarterLocked(label: string): boolean {
  const { end } = parseQuarterLabel(label)
  const todayISO = new Date().toISOString().slice(0, 10)
  return todayISO > end
}

// Baseline GM% công ty T8/2026 (chốt từ offer letter/ảnh baseline) — dùng làm mốc so sánh cho
// SKU MỚI (không có giai đoạn "trước" cùng SKU để so sánh nội bộ).
export const OKR_GM_BASELINE = 36.7
export const OKR_HK3_BASELINE = 67.5
