// Khớp lịch cron cho scheduled message — THUẦN (không import gì) để test nhanh, không cần env.

// Khớp 1 biểu thức cron 5 trường với thời điểm `d`. Hỗ trợ *, danh sách (a,b), khoảng (a-b), step (*/n hoặc a-b/n).
// `d` nên là thời gian theo MÚI GIỜ MUỐN KHỚP (đọc qua getUTC* — caller tự shift sang ICT nếu cần).
export function isCronDue(expr: string, d: Date): boolean {
  const parts = (expr || "").trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hr, dom, mon, dow] = parts

  const matchField = (field: string, val: number, lo0: number, hi0: number): boolean =>
    field.split(",").some(part => {
      if (part === "*") return true
      if (part.includes("/")) {
        const [range, stepStr] = part.split("/")
        const step = parseInt(stepStr, 10) || 1
        const [lo, hi] = range === "*" ? [lo0, hi0] : range.split("-").map(Number)
        if (val < lo || val > (hi ?? lo)) return false
        return (val - lo) % step === 0
      }
      if (part.includes("-")) { const [lo, hi] = part.split("-").map(Number); return val >= lo && val <= hi }
      return parseInt(part, 10) === val
    })

  return (
    matchField(min, d.getUTCMinutes(), 0, 59) &&
    matchField(hr,  d.getUTCHours(),   0, 23) &&
    matchField(dom, d.getUTCDate(),    1, 31) &&
    matchField(mon, d.getUTCMonth() + 1, 1, 12) &&
    matchField(dow, d.getUTCDay(),     0, 6)
  )
}

// ĐẾN HẠN KỂ TỪ LẦN CHẠY CUỐI — bền hơn isCronDue (vốn đòi khớp ĐÚNG phút hiện tại,
// nên chỉ hoạt động nếu scheduler chạy đúng từng phút). Scheduler thực tế chạy RẤT THƯA:
// GitHub Actions khai báo mỗi 15' nhưng bị throttle nặng (thực đo ~1 lần/giờ) và THƯỜNG
// BỎ TRỐNG khung 00:00–10:00 UTC = 07:00–17:00 ICT — ĐÚNG khung giờ các báo cáo sáng
// (Daily 08:01, Weekly T2 09:00, Monthly 15 08:00). Cửa sổ cũ 120' không phủ nổi khoảng
// trống này → phút cron trôi qua mà không có lần quét nào gần → message MẤT LUÔN.
//
// Cách mới: quét mọi phút trong (floor, now]; nếu CÓ 1 phút khớp cron_expression → đến hạn.
//   · Message ĐÃ từng chạy: floor = ngay SAU last_run (chặn gửi lại), nhưng giới hạn
//     catch-up tối đa `catchupMin` (24h) — đủ để BẤT KỲ lần quét nào trong ngày cũng bắt
//     kịp slot cron đã trôi qua, kể cả khi scheduler im lặng suốt buổi sáng. Dedup vẫn nhờ
//     last_run_at (chỉ gửi 1 lần cho mỗi lần đến hạn, không spam các slot bị lỡ trước đó).
//   · Message CHƯA chạy bao giờ (last_run null): chỉ nhìn lại `newGraceMin` (~2h) để tránh
//     "bắn hồi tố" ngay khi vừa tạo message (không lôi lại slot của sáng nay).
//   · nowIct: thời điểm hiện tại đã shift sang ICT (getUTC* đọc ra giờ VN).
//   · lastRunAt: ISO string UTC từ DB (null nếu chưa chạy bao giờ).
export function isDueSince(
  expr: string,
  lastRunAt: string | null,
  nowIct: Date,
  catchupMin = 1440,   // ĐÃ chạy: bắt kịp slot cron trong tối đa 24h qua (phủ scheduler thưa/trễ)
  newGraceMin = 130,   // CHƯA chạy: chỉ bắt slot trong ~2h gần nhất (không hồi tố lúc vừa tạo)
): boolean {
  const nowMs  = nowIct.getTime()
  const floorMs = lastRunAt
    ? Math.max(new Date(lastRunAt).getTime() + 7 * 3600_000 + 60_000, nowMs - catchupMin * 60_000)
    : nowMs - newGraceMin * 60_000
  for (let t = Math.ceil(floorMs / 60_000) * 60_000; t <= nowMs; t += 60_000) {
    if (isCronDue(expr, new Date(t))) return true
  }
  return false
}
