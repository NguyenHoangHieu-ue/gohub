// Lịch sử NHẬP TAY (target, chi phí, tỷ giá, công thức, kế hoạch…): phần THUẦN — so sánh bản ghi, giới hạn kích thước, gộp lần lưu liên tiếp, mô tả thay đổi. Không I/O (có test).
// Nguyên tắc chống phình: (1) chỉ ghi khi giá trị THẬT SỰ đổi (lưu lại số cũ y nguyên thì bỏ qua); (2) chỉ lưu các TRƯỜNG ĐỔI dạng [cũ, mới], không chụp cả dòng; (3) mỗi giá trị ≤ 500 ký tự, mỗi
// lần ≤ 4.000 ký tự; (4) cùng người sửa cùng dòng trong 10 phút → gộp vào 1 mục (giữ số cũ đầu tiên + số mới cuối cùng); (5) dọn định kỳ (xem store.ts: pruneHistory).
export type Changes = Record<string, [unknown, unknown]>

/** Trường kỹ thuật không tính là "thay đổi" của người dùng. */
export const IGNORED_FIELDS = new Set(["updated_at", "updated_by", "created_at", "created_by", "synced_at"])
export const MAX_VALUE_CHARS = 500
export const MAX_CHANGES_CHARS = 4000
export const COALESCE_MS = 10 * 60_000

const nullish = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")
const numeric = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)
const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])])) : v

/** Hai giá trị coi là giống nhau? Rỗng/null/undefined như nhau; "5" = 5; đối tượng so theo nội dung (không phụ thuộc thứ tự khoá); chuỗi so sau khi cắt khoảng trắng. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (nullish(a) && nullish(b)) return true
  if (nullish(a) || nullish(b)) return false
  const na = numeric(a), nb = numeric(b)
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-9
  const parse = (v: unknown) => { if (typeof v !== "string") return v; const t = v.trim(); if (!/^[[{]/.test(t)) return t; try { return JSON.parse(t) } catch { return t } }
  const pa = parse(a), pb = parse(b)
  if (typeof pa === "object" || typeof pb === "object") return JSON.stringify(sortKeys(pa)) === JSON.stringify(sortKeys(pb))
  return String(pa).trim() === String(pb).trim()
}

/** Các trường đổi giữa before và after (before/after null = thêm/xoá). Bỏ qua trường kỹ thuật. */
export function diffRecords(before: Record<string, unknown> | null, after: Record<string, unknown> | null, ignore: Iterable<string> = []): Changes {
  const skip = new Set([...IGNORED_FIELDS, ...ignore])
  const out: Changes = {}
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (skip.has(k)) continue
    const a = before?.[k], b = after?.[k]
    if (!sameValue(a, b)) out[k] = [nullish(a) ? null : a, nullish(b) ? null : b]
  }
  return out
}

const clip = (v: unknown): unknown => {
  if (typeof v === "string") return v.length > MAX_VALUE_CHARS ? `${v.slice(0, MAX_VALUE_CHARS)}…` : v
  if (v && typeof v === "object") { const s = JSON.stringify(v); return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS)}…` : v }
  return v
}

/** Cắt giá trị dài + giới hạn tổng; `truncated` = có giá trị bị cắt (không khôi phục nguyên vẹn được). */
export function capChanges(changes: Changes): { changes: Changes; truncated: boolean } {
  let truncated = false, total = 0
  const out: Changes = {}
  for (const [k, [a, b]] of Object.entries(changes)) {
    const ca = clip(a), cb = clip(b)
    if (ca !== a || cb !== b) truncated = true
    const size = k.length + JSON.stringify([ca, cb]).length
    if (total + size > MAX_CHANGES_CHARS) { truncated = true; continue }
    total += size; out[k] = [ca, cb]
  }
  return { changes: out, truncated }
}

/** Gộp lần sửa mới vào mục trước: số cũ lấy từ mục trước, số mới lấy từ lần này; trường quay về như cũ thì bỏ. */
export function mergeChanges(prev: Changes, next: Changes): Changes {
  const out: Changes = {}
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const oldV = k in prev ? prev[k][0] : next[k][0]
    const newV = k in next ? next[k][1] : prev[k][1]
    if (!sameValue(oldV, newV)) out[k] = [oldV, newV]
  }
  return out
}

/** Có nên gộp vào mục gần nhất của dòng này không (cùng người, cả hai là "update", trong 10 phút)? */
export function shouldCoalesce(last: { by: string; at: string; action: string } | null, by: string, action: string, now = Date.now()): boolean {
  return !!last && last.action === "update" && action === "update" && last.by === by && now - Date.parse(last.at) <= COALESCE_MS
}

export function actionOf(before: unknown, after: unknown): "create" | "update" | "delete" { return !before ? "create" : !after ? "delete" : "update" }

const show = (v: unknown) => (v === null || v === undefined ? "(trống)" : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" ? v.toLocaleString("vi-VN") : String(v))
/** "target_cm1: 1.000.000 → 1.500.000" cho 1 trường. */
export const describeChange = (field: string, [a, b]: [unknown, unknown]) => `${field}: ${show(a)} → ${show(b)}`

export interface RetentionLimits { perRow: number; maxAgeDays: number; globalMax: number; globalKeep: number }
export const RETENTION: RetentionLimits = { perRow: 100, maxAgeDays: 730, globalMax: 150_000, globalKeep: 120_000 }
