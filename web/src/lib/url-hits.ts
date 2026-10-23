import { waitUntil } from "@vercel/functions"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

// Prewarm theo hành vi (s240): đếm lượt gọi THẬT của từng URL analytics theo ngày (Turso url_hits), chuẩn hoá các tham số ngày
// "tương đối" (hôm nay, đầu tháng, đầu quý...) thành mẫu để hôm sau vẫn hâm nóng đúng bộ lọc người ta hay dùng, rồi cron
// làm nóng theo điểm số (lượt gọi gần đây nhiều nhất trước).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function vnDate(now: Date, offsetDays = 0): string {
  const d = new Date(now.getTime() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

function parts(date: string) { const [y, m, d] = date.split("-").map(Number); return { y, m, d } }
const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Các mốc tương đối của "hôm nay" (giờ VN). */
export function anchors(now: Date): Record<string, string> {
  const today = vnDate(now)
  const { y, m } = parts(today)
  const pmY = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
  const qStartM = Math.floor((m - 1) / 3) * 3 + 1
  return {
    today,
    yday: vnDate(now, -1),
    mstart: ymd(y, m, 1),
    pmstart: ymd(pmY, pm, 1),
    pmend: vnDate(new Date(Date.parse(`${ymd(y, m, 1)}T12:00:00+07:00`)), -1),
    qstart: ymd(y, qStartM, 1),
    ystart: ymd(y, 1, 1),
  }
}

const START_ORDER = ["mstart", "qstart", "ystart", "pmstart", "today", "yday", "pmend"]
const END_ORDER = ["today", "yday", "pmend", "mstart", "pmstart", "qstart", "ystart"]
const ANY_ORDER = ["today", "yday", "mstart", "pmstart", "pmend", "qstart", "ystart"]

function orderFor(param: string): string[] {
  const p = param.toLowerCase()
  if (/(^|_)(start|from)|^s(date)?$/.test(p) || p.startsWith("start") || p.startsWith("from")) return START_ORDER
  if (/(^|_)(end|to)|^e(date)?$/.test(p) || p.startsWith("end") || p.startsWith("to")) return END_ORDER
  return ANY_ORDER
}

/** Đổi giá trị ngày trùng mốc tương đối thành `{token}`; ngày quá khứ khác giữ nguyên (đã đóng, cache lâu). */
export function templateUrl(url: string, now = new Date()): string {
  const q = url.indexOf("?")
  if (q < 0) return url
  const a = anchors(now)
  // Thay đúng giá trị ngày trong chuỗi truy vấn, không mã hoá lại các tham số khác
  const query = url.slice(q + 1).replace(/(^|&)([^=&]+)=(\d{4}-\d{2}-\d{2})(?=&|$)/g, (m, pre, k, v) => {
    if (!DATE_RE.test(v)) return m
    const tok = orderFor(k).find(t => a[t] === v)
    return tok ? `${pre}${k}={${tok}}` : m
  })
  return `${url.slice(0, q)}?${query}`
}

/** Mở mẫu thành URL thật theo "hôm nay". */
export function expandUrl(template: string, now = new Date()): string {
  const a = anchors(now)
  return template.replace(/\{(today|yday|mstart|pmstart|pmend|qstart|ystart)\}/g, (_, t) => a[t])
}

/** Bỏ tham số chỉ để ép làm mới/chống cache (nocache, refresh, _t) — chúng không phải bộ lọc người dùng chọn. */
export function stripVolatileParams(url: string): string {
  const q = url.indexOf("?")
  if (q < 0) return url
  const kept = url.slice(q + 1).split("&").filter(p => p && !/^(nocache|refresh|_t)=/.test(p))
  return kept.length ? `${url.slice(0, q)}?${kept.join("&")}` : url.slice(0, q)
}

export interface UrlHitRow { url: string; day: string; hits: number }

/** Điểm số: lượt gọi trong 7 ngày gần nhất, ngày mới nặng hơn (hệ số 0,8 mỗi ngày lùi). */
export function rankUrls(rows: UrlHitRow[], now = new Date(), limit = 50): string[] {
  const score = new Map<string, number>()
  const today = Date.parse(`${vnDate(now)}T12:00:00+07:00`)
  for (const r of rows) {
    const age = Math.max(0, Math.round((today - Date.parse(`${r.day}T12:00:00+07:00`)) / 86_400_000))
    score.set(r.url, (score.get(r.url) ?? 0) + Number(r.hits) * Math.pow(0.8, age))
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([u]) => u)
}

// ── Ghi lượt gọi (gom trong bộ nhớ instance, ghi Turso theo lô) ─────────────────
const FLUSH_AGE_MS = 60_000
const _hits = new Map<string, number>()
let _lastFlush = Date.now()
let _tableReady = false

async function flushHits(): Promise<void> {
  if (_hits.size === 0) return
  const batch = [..._hits.entries()]
  _hits.clear()
  _lastFlush = Date.now()
  try {
    if (!_tableReady) {
      await tursoQuery("CREATE TABLE IF NOT EXISTS url_hits (day TEXT NOT NULL, url TEXT NOT NULL, hits INTEGER NOT NULL, PRIMARY KEY (day, url))")
      _tableReady = true
    }
    const day = vnDate(new Date())
    const marks = batch.map(() => "(?,?,?)").join(",")
    const args: (string | number)[] = []
    for (const [url, n] of batch) args.push(day, url, n)
    await tursoQuery(`INSERT INTO url_hits (day, url, hits) VALUES ${marks} ON CONFLICT(day, url) DO UPDATE SET hits = hits + excluded.hits`, args)
    if (Math.random() < 0.05) await tursoQuery("DELETE FROM url_hits WHERE day < ?", [vnDate(new Date(), -14)])
  } catch { /* đếm lỗi thì bỏ */ }
}

export function recordUrlHit(url: string): void {
  if (process.env.NODE_ENV === "test" || !tursoConfigured()) return
  if (!url.startsWith("/api/analytics/")) return
  const key = templateUrl(stripVolatileParams(url)).slice(0, 400)
  _hits.set(key, (_hits.get(key) ?? 0) + 1)
  if (Date.now() - _lastFlush > FLUSH_AGE_MS || _hits.size >= 40) waitUntil(flushHits())
}

/** URL nên hâm nóng, đã mở mẫu theo hôm nay, sắp theo điểm số. Rỗng nếu chưa có dữ liệu → nơi gọi dùng registry cũ. */
export async function topUrlsToWarm(limit = 50, now = new Date()): Promise<string[]> {
  if (!tursoConfigured()) return []
  try {
    const rows = await tursoQuery<UrlHitRow>("SELECT day, url, hits FROM url_hits WHERE day >= ? LIMIT 5000", [vnDate(now, -7)])
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of rankUrls(rows, now, limit * 2)) {
      const u = stripVolatileParams(expandUrl(t, now))
      if (!seen.has(u)) { seen.add(u); out.push(u) }
      if (out.length >= limit) break
    }
    return out
  } catch { return [] }
}
