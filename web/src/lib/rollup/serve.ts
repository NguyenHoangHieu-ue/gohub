import { logRun } from "./builder"
import { getRollupMode, rollupState, type RollupMode } from "./mode"

// Khuôn dùng chung cho một route đọc rollup (plan §6–§7): off → thô; shadow → thô + so sánh với rollup (ghi ru_runlog); on → rollup (rơi về thô khi cũ/lỗi).
export interface RollupCtx { route: string; mode: RollupMode; version: number; fresh: boolean; useRollup: boolean }

export async function rollupCtx(route: string): Promise<RollupCtx> {
  const mode = await getRollupMode(route)
  const st = mode === "off" ? null : await rollupState().catch(() => null)
  return { route, mode, version: st?.version ?? 0, fresh: !!st?.fresh, useRollup: mode === "on" && !!st?.fresh }
}
/** Hậu tố khoá cache: có version khi đang phục vụ rollup (đổi version → khoá mới). */
export const ruKey = (c: RollupCtx) => (c.useRollup ? `:ru${c.version}` : "")
/** Header cache biên: bỏ cache biên khi phục vụ rollup (đã đủ nhanh, và số/tên đổi phải hiện ngay). */
export const ruHeaders = (c: RollupCtx, fallback: Record<string, string>): Record<string, string> => (c.mode === "on" ? { "Cache-Control": "no-store" } : fallback)

export async function serve<T>(c: RollupCtx, raw: () => Promise<T>, ru: () => Promise<T>, diff: (raw: T, ru: T) => { ok: boolean }, meta: Record<string, unknown> = {}): Promise<T> {
  if (c.useRollup) {
    try { return await ru() }
    catch (e) { await logRun(`fallback:${c.route}`, null, false, 0, { error: (e as Error).message }).catch(() => undefined); return raw() }
  }
  const r = await raw()
  if (c.mode === "shadow" && c.fresh) {
    const t0 = Date.now()
    try { const d = diff(r, await ru()); await logRun(`shadow:${c.route}`, null, d.ok, Date.now() - t0, { ...meta, ...(d.ok ? {} : d) }) }
    catch (e) { await logRun(`shadow:${c.route}`, null, false, Date.now() - t0, { error: (e as Error).message }).catch(() => undefined) }
  }
  return r
}
