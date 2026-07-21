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

// ĐẾN HẠN KỂ TỪ LẦN CHẠY CUỐI — quét mọi phút trong cửa sổ catch-up, trả về
// THỜI ĐIỂM SLOT khớp cuối cùng (shifted ICT epoch) hoặc null nếu không có.
//
// Dùng slot time thay execution time để lưu last_run_at: ngăn double-fire
// khi Test + auto cron đều chạy trong cùng ngày. (Test không cập nhật last_run_at —
// xem scheduled-runner.ts — nên không tạo conflict nữa.)
//
//   · Message ĐÃ chạy: floor = ngay SAU last_run_slot (chặn gửi lại slot cũ),
//     giới hạn catch-up tối đa `catchupMin` (25h) để phủ Vercel cron 1 lần/ngày.
//   · Message CHƯA chạy (last_run null): chỉ nhìn lại `newGraceMin` (~2h).
//   · nowIct: đã shift +7h (getUTC* đọc ra giờ VN).
//   · lastRunAt: ISO UTC string ghi nhận SLOT time (không phải execution time).
export function getMatchedSlotMs(
  expr: string,
  lastRunAt: string | null,
  nowIct: Date,
  catchupMin = 1440,   // 24h — đủ phủ Vercel cron 1 lần/ngày khi scheduler bỏ trống sáng
  newGraceMin = 130,
): number | null {
  const nowMs  = nowIct.getTime()
  const floorMs = lastRunAt
    ? Math.max(new Date(lastRunAt).getTime() + 7 * 3600_000 + 60_000, nowMs - catchupMin * 60_000)
    : nowMs - newGraceMin * 60_000
  let matched: number | null = null
  for (let t = Math.ceil(floorMs / 60_000) * 60_000; t <= nowMs; t += 60_000) {
    if (isCronDue(expr, new Date(t))) matched = t  // giữ slot muộn nhất trong cửa sổ
  }
  return matched
}

// Backward-compat wrapper (dùng cho test và các importer cũ).
export function isDueSince(
  expr: string,
  lastRunAt: string | null,
  nowIct: Date,
  catchupMin = 1440,
  newGraceMin = 130,
): boolean {
  return getMatchedSlotMs(expr, lastRunAt, nowIct, catchupMin, newGraceMin) !== null
}
