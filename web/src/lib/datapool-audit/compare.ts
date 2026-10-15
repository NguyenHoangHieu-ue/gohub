// So giá vốn (COGS) đang có trong hệ thống với giá TÍNH LẠI theo tỷ giá / công thức Datapool / bảng giá hiện tại. Thuần (không I/O).
export type CogsVerdict = "match" | "rounding" | "diff"

export interface CogsCompare { current: number; expected: number; diff: number; diffPct: number; verdict: CogsVerdict }

// Hiếu chốt (2026-10-15): MỌI bước làm tròn dùng ROUNDUP, giá vốn phải đúng bằng giá tính lại — KHÔNG còn ngưỡng "chênh làm tròn". Lệch dù 1 đồng / 1 cent
// (vd 5.155 SKU 3HK cũ tính bằng ROUND) cũng là LỆCH và vào sheet cập nhật. Kiểu "rounding" giữ trong type cho tương thích nhưng không còn được tạo ra.
export function compareCogs(current: number, expected: number, _currency?: string): CogsCompare {
  const diff = Math.round((current - expected) * 10000) / 10000
  const abs = Math.abs(diff)
  const verdict: CogsVerdict = abs < 1e-9 ? "match" : "diff"
  return { current, expected, diff, diffPct: expected ? Math.round((diff / expected) * 10000) / 100 : 0, verdict }
}

/** % tăng/giảm khi đổi từ giá cũ (hệ thống) sang giá mới (tính lại): dương = giá mới cao hơn. */
export const changePct = (current: number | null, expected: number | null): number | null =>
  current == null || expected == null || !current ? null : Math.round(((expected - current) / current) * 10000) / 100
