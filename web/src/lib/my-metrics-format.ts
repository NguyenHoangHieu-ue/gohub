// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { formatCompactNumber } from "@/lib/analytics-formatters"

export const fck  = (n: number) => formatCompactNumber(n)
export const pct  = (n: number) => `${n.toFixed(1)}%`
export const hhmm = (iso: string) => iso ? new Date(iso).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"

export type QuarterKey = "Q1" | "Q2" | "Q3" | "Q4"

export function currentQuarter(): { q: QuarterKey; year: number } {
  const d = new Date()
  return { q: `Q${Math.floor(d.getMonth() / 3) + 1}` as QuarterKey, year: d.getFullYear() }
}

// OKR bắt đầu Q3-2026 → nút chọn quý = từ Q3-2026 tới quý hiện tại, giữ tối đa 4 quý gần nhất.
export function quarterOptions(): { q: QuarterKey; year: number }[] {
  const cur = currentQuarter()
  const out: { q: QuarterKey; year: number }[] = []
  let year = 2026, n = 3
  while (year < cur.year || (year === cur.year && n <= Number(cur.q[1]))) {
    out.push({ q: `Q${n}` as QuarterKey, year })
    if (++n > 4) { n = 1; year++ }
  }
  return out.slice(-4)
}

// Achievement 0-100, "cao hơn = tốt" (revenue%, task count, GM delta)
export function achHigherBetter(actual: number, target: number) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (actual / target) * 100))
}
// Achievement 0-100, "thấp hơn = tốt" (SLA giờ, vendor speed phút)
export function achLowerBetter(actual: number | null, target: number) {
  if (actual == null || target <= 0) return 0
  return Math.max(0, Math.min(100, 100 - ((actual - target) / target * 100)))
}

// ─── Image Upload Helper ──────────────────────────────────────────────────────
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)
  const r = await fetch("/api/analytics/my-metrics/evidence/upload", { method: "POST", body: fd })
  if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? "Upload failed") }
  const j = await r.json()
  return j.url as string
}
