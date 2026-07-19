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
// nên chỉ hoạt động nếu scheduler chạy đúng từng phút). Scheduler thực tế chạy THƯA
// (GitHub Actions mỗi 15' và có thể trễ), nên ta quét mọi phút trong cửa sổ (now-window, now]:
// nếu CÓ 1 phút khớp cron_expression và phút đó SAU last_run → coi là đến hạn (catch-up, không gửi lại).
//   · nowIct    : thời điểm hiện tại đã shift sang ICT (getUTC* đọc ra giờ VN).
//   · lastRunAt : ISO string UTC từ DB (null nếu chưa chạy bao giờ).
//   · windowMin : độ rộng cửa sổ bắt kịp (mặc định 120' — phủ trễ của GitHub Actions).
export function isDueSince(
  expr: string,
  lastRunAt: string | null,
  nowIct: Date,
  windowMin = 120,
): boolean {
  const nowMs  = nowIct.getTime()
  const lastMs = lastRunAt ? new Date(lastRunAt).getTime() + 7 * 3600_000 : 0   // shift sang không gian ICT
  // Bắt đầu SAU last_run (tránh gửi lại phút đã chạy) và không xa quá cửa sổ.
  const startMs = Math.max(lastMs + 60_000, nowMs - windowMin * 60_000)
  for (let t = Math.ceil(startMs / 60_000) * 60_000; t <= nowMs; t += 60_000) {
    if (isCronDue(expr, new Date(t))) return true
  }
  return false
}
