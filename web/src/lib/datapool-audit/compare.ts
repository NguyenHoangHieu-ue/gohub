// So giá vốn (COGS) đang có trong hệ thống với giá TÍNH LẠI theo tỷ giá / công thức Datapool / bảng giá hiện tại. Thuần (không I/O).
export type CogsVerdict = "match" | "rounding" | "diff"

export interface CogsCompare { current: number; expected: number; diff: number; diffPct: number; verdict: CogsVerdict }

// Chênh ≤ 1 cent USD (1 bước ROUNDUP 2 chữ số) ≈ ≤ 275 VND là "chênh làm tròn" (coi như khớp, không vào danh sách LỆCH / sheet cập nhật). Lớn hơn là THAY ĐỔI THẬT —
// kể cả gói nhỏ Daily 1 ngày (vài % = vài trăm đồng, vượt 275). Hiếu chốt lại 2026-10-16 sau khi bỏ ngưỡng hoàn toàn (2026-10-15) làm 5.155 SKU 3HK ROUND cũ hiện LỆCH dù chỉ 1 cent.
const USD_TOL = 0.0100001
const VND_TOL = 275

export function compareCogs(current: number, expected: number, currency?: string): CogsCompare {
  const diff = Math.round((current - expected) * 10000) / 10000
  const abs = Math.abs(diff)
  const tol = currency === "VND" ? VND_TOL : USD_TOL
  const verdict: CogsVerdict = abs < 1e-9 ? "match" : abs <= tol ? "rounding" : "diff"
  return { current, expected, diff, diffPct: expected ? Math.round((diff / expected) * 10000) / 100 : 0, verdict }
}

/** % tăng/giảm khi đổi từ giá cũ (hệ thống) sang giá mới (tính lại): dương = giá mới cao hơn. */
export const changePct = (current: number | null, expected: number | null): number | null =>
  current == null || expected == null || !current ? null : Math.round(((expected - current) / current) * 10000) / 100
