import { waitUntil } from "@vercel/functions"
import { tursoQuery, tursoConfigured } from "@/lib/turso"
import { normalizePerfRoute } from "@/lib/perf-route"

// Đo thời gian THẬT của cache BI (s240): mỗi lần cachedQuery chạy ghi 1 sự kiện (route, kết quả, ms) vào Turso
// bảng perf_events. Dùng cho Data Map (p50/p95) và tìm endpoint nguội chậm. Ghi theo lô, lỗi thì bỏ — không bao giờ
// làm chậm hay làm hỏng request thật.
export type PerfOutcome = "l1" | "l2" | "stale" | "miss" | "compute"
export interface PerfEvent { ts: number; route: string; outcome: PerfOutcome; ms: number }

const FLUSH_SIZE = 25
const FLUSH_AGE_MS = 30_000
const BUF_CAP = 500
const RETENTION_DAYS = 14

const _buf: PerfEvent[] = []
let _lastFlush = Date.now()
let _tableReady = false

/** Khoá cache → tên route (bỏ hậu tố tham số/phiên bản). */
export function perfRouteOf(key: string): string {
  return normalizePerfRoute(key)
}

async function flush(): Promise<void> {
  if (_buf.length === 0) return
  const batch = _buf.splice(0, _buf.length)
  _lastFlush = Date.now()
  try {
    if (!_tableReady) {
      await tursoQuery("CREATE TABLE IF NOT EXISTS perf_events (ts INTEGER NOT NULL, route TEXT NOT NULL, outcome TEXT NOT NULL, ms INTEGER NOT NULL)")
      await tursoQuery("CREATE INDEX IF NOT EXISTS idx_perf_events_ts ON perf_events (ts)")
      _tableReady = true
    }
    const marks = batch.map(() => "(?,?,?,?)").join(",")
    const args: (string | number)[] = []
    for (const e of batch) args.push(e.ts, e.route, e.outcome, e.ms)
    await tursoQuery(`INSERT INTO perf_events (ts, route, outcome, ms) VALUES ${marks}`, args)
    if (Math.random() < 0.05) {
      await tursoQuery("DELETE FROM perf_events WHERE ts < ?", [Date.now() - RETENTION_DAYS * 86_400_000])
    }
  } catch { /* đo lường lỗi thì bỏ, không ảnh hưởng request */ }
}

export function recordPerf(key: string, outcome: PerfOutcome, ms: number): void {
  if (process.env.NODE_ENV === "test" || !tursoConfigured()) return
  if (_buf.length < BUF_CAP) _buf.push({ ts: Date.now(), route: perfRouteOf(key), outcome, ms: Math.max(0, Math.round(ms)) })
  if (_buf.length >= FLUSH_SIZE || Date.now() - _lastFlush > FLUSH_AGE_MS) waitUntil(flush())
}

export interface PerfSummary {
  route: string
  calls: number
  hitRate: number          // tỉ lệ l1+l2+stale trên tổng lượt phục vụ
  serveP50: number | null  // ms phục vụ (l1/l2/stale/miss)
  serveP95: number | null
  computeP50: number | null // ms tính lại khi nguội
  computeP95: number | null
  computes: number
}

function pct(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

export function summarizePerf(events: Pick<PerfEvent, "route" | "outcome" | "ms">[]): PerfSummary[] {
  const by = new Map<string, { serve: number[]; compute: number[]; hits: number; served: number }>()
  for (const e0 of events) {
    const e = { route: normalizePerfRoute(e0.route), outcome: e0.outcome, ms: Number(e0.ms) }
    const g = by.get(e.route) ?? { serve: [], compute: [], hits: 0, served: 0 }
    if (e.outcome === "compute") g.compute.push(e.ms)
    else {
      g.serve.push(e.ms)
      g.served++
      if (e.outcome !== "miss") g.hits++
    }
    by.set(e.route, g)
  }
  return [...by.entries()].map(([route, g]) => {
    const s = [...g.serve].sort((a, b) => a - b)
    const c = [...g.compute].sort((a, b) => a - b)
    return {
      route, calls: g.served, computes: g.compute.length,
      hitRate: g.served ? g.hits / g.served : 0,
      serveP50: pct(s, 50), serveP95: pct(s, 95),
      computeP50: pct(c, 50), computeP95: pct(c, 95),
    }
  }).sort((a, b) => (b.computeP95 ?? 0) - (a.computeP95 ?? 0))
}
