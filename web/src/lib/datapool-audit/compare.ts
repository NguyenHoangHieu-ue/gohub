// So giá vốn (COGS) đang có trong hệ thống với giá TÍNH LẠI theo tỷ giá / công thức Datapool / bảng giá hiện tại. Thuần (không I/O).
// Chuỗi ROUNDUP nhiều bước khiến giá cũ tính tay/khác thời điểm lệch tới ~0,01 USD (≈ vài trăm VND) dù đúng logic → coi là "khớp (làm tròn)".
export type CogsVerdict = "match" | "rounding" | "diff"

export interface CogsCompare { current: number; expected: number; diff: number; diffPct: number; verdict: CogsVerdict }

const USD_TOL = 0.02          // ≤ 2 cent: coi như khớp
const USD_ROUND = 0.0100001   // ≤ 1 cent: chỉ do làm tròn
const VND_TOL = 600           // ≈ 2 cent × 26.000 (chuỗi ROUNDUP USD → VND)

export function compareCogs(current: number, expected: number, currency: string): CogsCompare {
  const diff = Math.round((current - expected) * 10000) / 10000
  const abs = Math.abs(diff)
  const tol = currency === "VND" ? VND_TOL : USD_TOL
  const round = currency === "VND" ? VND_TOL / 2 : USD_ROUND
  const verdict: CogsVerdict = abs < 1e-9 ? "match" : abs <= round ? "rounding" : abs <= tol ? "rounding" : "diff"
  return { current, expected, diff, diffPct: expected ? Math.round((diff / expected) * 10000) / 100 : 0, verdict }
}
