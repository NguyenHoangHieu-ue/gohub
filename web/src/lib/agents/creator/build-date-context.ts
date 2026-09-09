export function buildDateContext(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }))
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const yesterday      = new Date(now); yesterday.setDate(now.getDate() - 1)
  const mtdStart       = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const ytdStart       = new Date(now.getFullYear(), 0, 1)
  const dow = ["Chủ nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"][now.getDay()]
  return `\n\n━━━ NGÀY THÁNG (auto, giờ VN) ━━━
Hôm nay: ${fmt(now)} (${dow}). Data cutoff gohub_dw = CURRENT_DATE-1 = ${fmt(yesterday)} (ETL sáng ~08h ICT, hôm nay chưa đủ data).
"tháng này" / "MTD" = ${fmt(mtdStart)} → ${fmt(yesterday)}
"tháng trước" (đủ ngày) = ${fmt(lastMonthStart)} → ${fmt(lastMonthEnd)}
"YTD" = ${fmt(ytdStart)} → ${fmt(yesterday)}
→ Khi user nói "tháng này" / "gần đây" / "hôm nay" / "tháng trước" → DÙNG NGAY các mốc trên, KHÔNG hỏi lại ngày. Luôn cắt data tới ${fmt(yesterday)}.`
}
