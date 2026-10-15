// So giá vốn (COGS) đang có trong hệ thống với giá TÍNH LẠI theo tỷ giá / công thức Datapool / bảng giá hiện tại. Thuần (không I/O).
// Chuỗi ROUNDUP nhiều bước khiến giá cũ tính tay/khác thời điểm lệch tới ~0,01 USD (≈ vài trăm VND) dù đúng logic → coi là "khớp (làm tròn)".
export type CogsVerdict = "match" | "rounding" | "diff"

export interface CogsCompare { current: number; expected: number; diff: number; diffPct: number; verdict: CogsVerdict }

// Làm tròn chỉ giải thích được chênh ≤ 1 cent USD (1 bước ROUNDUP 2 chữ số), tương đương ≤ ~275 VND sau khi đổi sang VND. Chênh lớn hơn là THAY ĐỔI THẬT (giá pool, tỷ giá,
// giả định) — đặc biệt với gói nhỏ (Daily 1 ngày) vài % giá chỉ là vài trăm đồng: ngưỡng cũ 600đ/2 cent làm các gói đó bị coi là "làm tròn" và rơi khỏi sheet cập nhật.
const USD_TOL = 0.0100001
const VND_TOL = 275

export function compareCogs(current: number, expected: number, currency: string): CogsCompare {
  const diff = Math.round((current - expected) * 10000) / 10000
  const abs = Math.abs(diff)
  const tol = currency === "VND" ? VND_TOL : USD_TOL
  const verdict: CogsVerdict = abs < 1e-9 ? "match" : abs <= tol ? "rounding" : "diff"
  return { current, expected, diff, diffPct: expected ? Math.round((diff / expected) * 10000) / 100 : 0, verdict }
}

/** % tăng/giảm khi đổi từ giá cũ (hệ thống) sang giá mới (tính lại): dương = giá mới cao hơn. */
export const changePct = (current: number | null, expected: number | null): number | null =>
  current == null || expected == null || !current ? null : Math.round(((expected - current) / current) * 10000) / 100
