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

// Hiếu chốt s225: có 7 ngày ân hạn sau cuối quý để duyệt nốt case (Q3 mất 34 case treo vì khoá ngay ngày đầu quý sau);
// quý trong REOPENED_QUARTERS được mở lại theo yêu cầu Hiếu — xoá khỏi danh sách khi đã xử lý xong.
export const LOCK_GRACE_DAYS = 7
export const REOPENED_QUARTERS = ["Q3-2026"]

export function isQuarterLocked(label: string): boolean {
  if (REOPENED_QUARTERS.includes(label)) return false
  const { end } = parseQuarterLabel(label)
  const lockFrom = new Date(new Date(`${end}T00:00:00Z`).getTime() + LOCK_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const todayISO = new Date().toISOString().slice(0, 10)
  return todayISO > lockFrom
}

// "Q3-2026" -> "Q2-2026" (Q1 wraps to Q4 of previous year) — dùng để so sánh QoQ.
export function prevQuarterLabel(label: string): string {
  const { q, year } = parseQuarterLabel(label)
  const qNum = parseInt(q.replace("Q", "")) || 3
  return qNum === 1 ? `Q4-${year - 1}` : `Q${qNum - 1}-${year}`
}

// Quý chứa 1 ngày bất kỳ — dùng gắn nhãn quarter ĐÚNG cho thread lịch sử (quét ngược nhiều tháng có
// thể rơi vào quý trước, không phải lúc nào cũng là quý hiện tại).
export function quarterLabelForDate(d: Date): string {
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  const qNum = Math.floor((m - 1) / 3) + 1
  return `Q${qNum}-${y}`
}

// Quý hiện tại theo lịch thật (server-side) — dùng gắn nhãn quarter cho record cron tự tạo.
export function currentQuarterLabel(): string {
  return quarterLabelForDate(new Date())
}

// Baseline GM% công ty T8/2026 (chốt từ offer letter/ảnh baseline) — dùng làm mốc so sánh cho
// SKU MỚI (không có giai đoạn "trước" cùng SKU để so sánh nội bộ).
export const OKR_GM_BASELINE = 36.7
export const OKR_HK3_BASELINE = 67.5

// "Tasks via Bé Gấu" (s195+18-B) — chỉ tính task ĐÃ THẬT SỰ xuất dữ liệu từ DB (không phải chào hỏi/
// trả lời chay). Danh sách tool "đọc dữ liệu bảng thật" — loại webSearch (web ngoài, không phải DB nội
// bộ) và readKnowledgeBase/searchKnowledgeBase (semantic search KB, không phải query bảng dữ liệu có
// cấu trúc) và các tool Gấu Pro khác (MRP/browser/gen ảnh — không liên quan "task tính KPI").
// s230 (Hiếu chốt 2026-10-11): thêm GA4/GSC/Lark Base + tool tự đọc dữ liệu (báo cáo, CM1 B2B, báo giá vendor,
// SKU win-rate); câu của Creator không tính. Đổi luật có hiệu lực từ TASK_RULE_CHANGED_AT.
export const DATA_TASK_TOOLS = [
  "executeSQL", "querySupabase", "queryProduct", "listSupabaseTables",
  "queryGA4", "queryGSC", "queryLarkBase",
  "buildReport", "b2bCustomerCm1", "compareVendorQuotes", "trackSKUWinRate",
] as const
export const TASK_RULE_CHANGED_AT = "2026-10-11"
export function isDataTask(tools: string[] | null | undefined, role?: string | null): boolean {
  if (role === "creator") return false
  return !!tools && tools.some(t => (DATA_TASK_TOOLS as readonly string[]).includes(t))
}
