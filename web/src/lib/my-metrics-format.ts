// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { formatCompactNumber } from "@/lib/analytics-formatters"

export const fck  = (n: number) => formatCompactNumber(n)
export const pct  = (n: number) => `${n.toFixed(1)}%`
export const hhmm = (iso: string) => iso ? new Date(iso).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"

export function currentQuarter(): { q: "Q3" | "Q4"; year: number } {
  const m = new Date().getMonth() + 1
  const y = new Date().getFullYear()
  return m <= 9 ? { q: "Q3", year: y } : { q: "Q4", year: y }
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
