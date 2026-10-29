import { rq, rqMany, rtx, type Stmt } from "./client"
import { ensureRollupSchema } from "./schema"
import { fetchCustRows, fetchDimCustomerPage, fetchDimSku, fetchDimSource, fetchDimStaff, fetchSkuRows, fetchTotals, type DimCustomer } from "./source"
import { CUST_COLS, SKU_COLS, addDays, chunk, compareTotals, dayHash, groupByDay, monthStart, monthsInclusive, nextMonth, planDays, vnToday, type Basis, type CustRow, type SkuRow, type Totals } from "./pure"

// Bộ dựng rollup (plan §5): đọc gohub_dw (chỉ SELECT) → so băm theo ngày → chỉ GHI LẠI ngày đổi, mỗi ngày một giao dịch (xoá ngày rồi chèn lại).
const ROWS_PER_INSERT = 100
const FIRST_MONTH = "2025-01"   // fact có dữ liệu từ 01/2025
const BASES: Basis[] = ["ful", "sal"]
const now = () => new Date().toISOString()

// ── meta / bộ đếm ──
export async function getMeta(key: string): Promise<string | null> {
  const r = await rq("SELECT value FROM ru_meta WHERE key = ?", [key])
  return r.length ? String(r[0].value) : null
}
export const setMetaStmt = (key: string, value: string): Stmt => ({ sql: "INSERT INTO ru_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", args: [key, value, now()] })
export const setMeta = (key: string, value: string) => rq(setMetaStmt(key, value).sql, setMetaStmt(key, value).args)
const writesKey = () => `writes:${now().slice(0, 7)}`
const counterStmt = (key: string, n: number): Stmt => ({ sql: "INSERT INTO ru_counter (key, n) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET n = n + excluded.n", args: [key, n] })

export async function bumpVersion(): Promise<number> {
  const cur = Number(await getMeta("data_version") ?? 0) + 1
  await rqMany([setMetaStmt("data_version", String(cur)), setMetaStmt("last_refresh_at", now())].map(s => ({ sql: s.sql, args: s.args })))
  return cur
}

export async function logRun(mode: string, basis: string | null, ok: boolean, ms: number, detail: unknown): Promise<void> {
  try { await rq("INSERT INTO ru_runlog (at, mode, basis, ok, ms, detail) VALUES (?, ?, ?, ?, ?, ?)", [now(), mode, basis, ok ? 1 : 0, ms, JSON.stringify(detail).slice(0, 1500)]) } catch { /* nhật ký lỗi không được làm hỏng việc chính */ }
}

// ── ghi một ngày ──
const custArgs = (basis: Basis, r: CustRow) => [basis, r.day, r.company, r.source, r.customer, r.ship, r.revenue, r.cogs, r.gp, r.qty, r.lines, r.orders, r.hk3]
const skuArgs = (basis: Basis, r: SkuRow) => [basis, r.day, r.company, r.source, r.sku, r.revenue, r.cogs, r.gp, r.qty, r.lines, r.orders]
const placeholders = (cols: number, rows: number) => Array.from({ length: rows }, () => `(${Array(cols).fill("?").join(",")})`).join(",")

export function dayStatements(basis: Basis, day: string, cust: CustRow[], sku: SkuRow[], hash: string): Stmt[] {
  const st: Stmt[] = [
    { sql: "DELETE FROM ru_cust_day WHERE basis = ? AND day = ?", args: [basis, day] },
    { sql: "DELETE FROM ru_sku_day WHERE basis = ? AND day = ?", args: [basis, day] },
  ]
  for (const part of chunk(cust, ROWS_PER_INSERT)) st.push({ sql: `INSERT INTO ru_cust_day (basis, day, company, source, customer, ship, revenue_vnd, cogs_vnd, gp_vnd, qty, lines, orders, hk3_rev_vnd) VALUES ${placeholders(CUST_COLS, part.length)}`, args: part.flatMap(r => custArgs(basis, r)) })
  for (const part of chunk(sku, ROWS_PER_INSERT)) st.push({ sql: `INSERT INTO ru_sku_day (basis, day, company, source, sku, revenue_vnd, cogs_vnd, gp_vnd, qty, lines, orders) VALUES ${placeholders(SKU_COLS, part.length)}`, args: part.flatMap(r => skuArgs(basis, r)) })
  st.push({ sql: "INSERT INTO ru_day_hash (basis, day, hash, cust_rows, sku_rows, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(basis, day) DO UPDATE SET hash = excluded.hash, cust_rows = excluded.cust_rows, sku_rows = excluded.sku_rows, updated_at = excluded.updated_at", args: [basis, day, hash, cust.length, sku.length, now()] })
  return st
}
const removeDayStatements = (basis: Basis, day: string): Stmt[] => [
  { sql: "DELETE FROM ru_cust_day WHERE basis = ? AND day = ?", args: [basis, day] },
  { sql: "DELETE FROM ru_sku_day WHERE basis = ? AND day = ?", args: [basis, day] },
  { sql: "DELETE FROM ru_day_hash WHERE basis = ? AND day = ?", args: [basis, day] },
]

export interface RefreshResult { basis: Basis; start: string; end: string; fresh: number; changed: number; removed: number; same: number; written: number; ms: number }

/** Làm mới cửa sổ ngày [start, end) của một cơ sở (ful/sal). Trả số ngày đổi/xoá/giữ nguyên. */
export async function refreshWindow(basis: Basis, start: string, end: string): Promise<RefreshResult> {
  const t0 = Date.now()
  await ensureRollupSchema()
  const [cust, sku] = [await fetchCustRows(basis, start, end), await fetchSkuRows(basis, start, end)]   // tuần tự: pool gohub_dw chỉ 3 kết nối và dùng chung
  const cBy = groupByDay(cust), sBy = groupByDay(sku)
  const fresh = new Map<string, string>()
  for (const day of new Set([...cBy.keys(), ...sBy.keys()])) fresh.set(day, dayHash(cBy.get(day) ?? [], sBy.get(day) ?? []))
  const stored = new Map((await rq("SELECT day, hash, cust_rows, sku_rows FROM ru_day_hash WHERE basis = ? AND day >= ? AND day < ?", [basis, start, end])).map(r => [String(r.day), r] as const))
  const plan = planDays(start, end, fresh, new Map([...stored].map(([d, r]) => [d, String(r.hash)])))
  let written = 0
  for (const day of plan.changed) {
    const c = cBy.get(day) ?? [], s = sBy.get(day) ?? []
    const prev = stored.get(day)
    const stmts = [...dayStatements(basis, day, c, s, fresh.get(day)!)]
    const n = c.length + s.length + (prev ? Number(prev.cust_rows) + Number(prev.sku_rows) : 0)
    stmts.push(counterStmt(writesKey(), n))
    await rtx(stmts)
    written += n
  }
  for (const day of plan.removed) {
    const prev = stored.get(day)!
    const n = Number(prev.cust_rows) + Number(prev.sku_rows)
    await rtx([...removeDayStatements(basis, day), counterStmt(writesKey(), n)])
    written += n
  }
  if (plan.changed.length || plan.removed.length) await bumpVersion()
  return { basis, start, end, fresh: fresh.size, changed: plan.changed.length, removed: plan.removed.length, same: plan.same, written, ms: Date.now() - t0 }
}

/** Làm mới `days` ngày gần nhất (gồm hôm nay) cho cả hai cơ sở. */
export async function refreshRecent(days = 45, bases: Basis[] = BASES): Promise<RefreshResult[]> {
  const today = vnToday()
  const out: RefreshResult[] = []
  for (const b of bases) out.push(await refreshWindow(b, addDays(today, -days + 1), addDays(today, 2)))   // +2: dư một ngày phòng lệch múi giờ giữa DW và giờ VN
  await setMeta("last_check_at", now())   // đã so với DW xong (kể cả khi không có gì đổi): tầng đọc dùng để biết rollup còn tươi
  return out
}

// ── dựng lịch sử (có thể chạy nhiều lần, mỗi lần làm tiếp phần còn lại) ──
const backfillKey = (b: Basis, m: string) => `backfill:${b}:${m}`
export interface BackfillResult { done: { basis: Basis; month: string; changed: number; ms: number }[]; pending: number; stoppedForTime: boolean }

/** Dựng các tháng chưa có dấu "done" (tháng hiện tại không đánh dấu: luôn làm lại). Dừng khi hết ngân sách thời gian. */
export async function backfillNext(deadline: number, opts: { basis?: Basis; from?: string; to?: string } = {}): Promise<BackfillResult> {
  await ensureRollupSchema()
  const cur = vnToday().slice(0, 7)
  const months = monthsInclusive(opts.from ?? FIRST_MONTH, opts.to ?? cur)
  const bases = opts.basis ? [opts.basis] : BASES
  const marks = new Map((await rq("SELECT key FROM ru_meta WHERE key LIKE 'backfill:%'")).map(r => [String(r.key), true] as const))
  const todo = bases.flatMap(b => months.filter(m => m === cur || !marks.has(backfillKey(b, m))).map(m => ({ b, m })))
  const done: BackfillResult["done"] = []
  let stoppedForTime = false
  for (const { b, m } of todo) {
    if (Date.now() > deadline) { stoppedForTime = true; break }
    const t0 = Date.now()
    const r = await refreshWindow(b, monthStart(m), monthStart(nextMonth(m)))
    if (m !== cur) await setMeta(backfillKey(b, m), now())
    done.push({ basis: b, month: m, changed: r.changed, ms: Date.now() - t0 })
  }
  return { done, pending: todo.length - done.length, stoppedForTime }
}

// ── bản sao dim ──
const hashStr = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16) }
const custHash = (c: DimCustomer) => hashStr([c.name, c.organization, c.organization_code, c.price_list_name, c.currency_code, c.sales_pic_code, c.status].map(v => v ?? "").join("\u0001"))

/** Dim nhỏ: thay toàn bộ trong một giao dịch (vài chục nghìn dòng, chỉ chạy khi băm đổi). */
export async function syncSmallDims(): Promise<{ source: number; sku: number; staff: number; skipped: string[] }> {
  await ensureRollupSchema()
  const [src, sku, staff] = [await fetchDimSource(), await fetchDimSku(), await fetchDimStaff()]
  const skipped: string[] = []
  const replace = async (name: string, input: Record<string, string | null>[], cols: string[], table: string): Promise<void> => {
    // Khoá TRIM() có thể trùng giữa các dòng dim (vd dim_sku): giữ dòng đầu tiên của mỗi khoá, như một phép join LEFT lấy dòng đầu.
    const rows = [...new Map(input.map(r => [r[cols[0]], r] as const).reverse()).values()].reverse()
    const h = hashStr(JSON.stringify(rows))
    if ((await getMeta(`dimhash:${name}`)) === h) { skipped.push(name); return }
    const stmts: Stmt[] = [{ sql: `DELETE FROM ${table}` }]
    for (const part of chunk(rows, ROWS_PER_INSERT)) stmts.push({ sql: `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders(cols.length, part.length)}`, args: part.flatMap(r => cols.map(c => r[c] ?? null)) })
    stmts.push(setMetaStmt(`dimhash:${name}`, h), counterStmt(writesKey(), rows.length))
    await rtx(stmts)
  }
  await replace("source", src as unknown as Record<string, string | null>[], ["source", "channel_name", "group_name", "sub_group_name", "sapo_name"], "dm_source")
  await replace("sku", sku as unknown as Record<string, string | null>[], ["sku", "vendor", "category_name", "type_of_sim"], "dm_sku")
  await replace("staff", staff as unknown as Record<string, string | null>[], ["code", "name"], "dm_staff")
  if (skipped.length < 3) await bumpVersion()
  return { source: src.length, sku: sku.length, staff: staff.length, skipped }
}

/** Khách: phân trang theo khoá, chỉ ghi dòng có băm khác. Làm tiếp từ con trỏ lưu trong ru_meta; trả con trỏ khi hết giờ. */
export async function syncCustomers(deadline: number, pageSize = 3000): Promise<{ pages: number; changed: number; finished: boolean; cursor: string }> {
  await ensureRollupSchema()
  let cursor = (await getMeta("dimcust:cursor")) ?? ""
  let pages = 0, changed = 0
  for (;;) {
    if (Date.now() > deadline) return { pages, changed, finished: false, cursor }
    const page = await fetchDimCustomerPage(cursor, pageSize)
    if (!page.length) { await setMeta("dimcust:cursor", ""); if (changed) await bumpVersion(); return { pages, changed, finished: true, cursor: "" } }
    const hi = page[page.length - 1].customer
    const have = new Map((await rq("SELECT customer, hash FROM dm_customer WHERE customer > ? AND customer <= ?", [cursor, hi])).map(r => [String(r.customer), String(r.hash)] as const))
    const todo = page.filter(c => have.get(c.customer) !== custHash(c))
    // Cả trang trong MỘT giao dịch (nhiều câu 300 dòng): ít vòng gọi Turso hơn nhiều so với từng lô 100 dòng.
    if (todo.length) {
      const stmts: Stmt[] = chunk(todo, 300).map(part => ({ sql: `INSERT OR REPLACE INTO dm_customer (customer, name, organization, organization_code, price_list_name, currency_code, sales_pic_code, status, hash) VALUES ${placeholders(9, part.length)}`, args: part.flatMap(c => [c.customer, c.name, c.organization, c.organization_code, c.price_list_name, c.currency_code, c.sales_pic_code, c.status, custHash(c)]) }))
      stmts.push(counterStmt(writesKey(), todo.length))
      await rtx(stmts)
    }
    changed += todo.length
    cursor = hi; pages++
    await setMeta("dimcust:cursor", cursor)
  }
}

// ── đối chiếu rollup với bảng thô theo THÁNG ──
export interface ReconcileResult { basis: Basis; month: string; ok: boolean; raw: Totals; cust: Totals; sku: Totals; diffCust?: unknown; diffSku?: unknown }
export async function reconcileMonth(basis: Basis, month: string): Promise<ReconcileResult> {
  await ensureRollupSchema()
  const start = monthStart(month), end = monthStart(nextMonth(month))
  const raw = await fetchTotals(basis, start, end)
  const [[c], [s]] = await rqMany([
    { sql: "SELECT COALESCE(SUM(revenue_vnd),0) revenue, COALESCE(SUM(cogs_vnd),0) cogs, COALESCE(SUM(gp_vnd),0) gp, COALESCE(SUM(qty),0) qty, COALESCE(SUM(lines),0) lines FROM ru_cust_day WHERE basis = ? AND day >= ? AND day < ?", args: [basis, start, end] },
    { sql: "SELECT COALESCE(SUM(revenue_vnd),0) revenue, COALESCE(SUM(cogs_vnd),0) cogs, COALESCE(SUM(gp_vnd),0) gp, COALESCE(SUM(qty),0) qty, COALESCE(SUM(lines),0) lines FROM ru_sku_day WHERE basis = ? AND day >= ? AND day < ?", args: [basis, start, end] },
  ])
  const t = (r: Record<string, string | number | null>): Totals => ({ revenue: Number(r.revenue), cogs: Number(r.cogs), gp: Number(r.gp), qty: Number(r.qty), lines: Number(r.lines) })
  const cust = t(c), sku = t(s)
  const dc = compareTotals(raw, cust), ds = compareTotals(raw, sku)
  const res: ReconcileResult = { basis, month, ok: dc.ok && ds.ok, raw, cust, sku, ...(dc.ok ? {} : { diffCust: dc.diffs }), ...(ds.ok ? {} : { diffSku: ds.diffs }) }
  await setMeta(`reconcile:${basis}:${month}`, JSON.stringify({ at: now(), ok: res.ok }))
  return res
}

export async function health() {
  await ensureRollupSchema()
  const [days, counts, meta, counters, runs] = await rqMany([
    { sql: "SELECT basis, COUNT(*) AS days, MIN(day) AS first_day, MAX(day) AS last_day, SUM(cust_rows) AS cust_rows, SUM(sku_rows) AS sku_rows FROM ru_day_hash GROUP BY basis" },
    { sql: "SELECT (SELECT COUNT(*) FROM dm_source) AS dm_source, (SELECT COUNT(*) FROM dm_sku) AS dm_sku, (SELECT COUNT(*) FROM dm_staff) AS dm_staff, (SELECT COUNT(*) FROM dm_customer) AS dm_customer" },
    { sql: "SELECT key, value, updated_at FROM ru_meta WHERE key IN ('data_version','last_refresh_at','dimcust:cursor') OR key LIKE 'reconcile:%' ORDER BY key" },
    { sql: "SELECT key, n FROM ru_counter ORDER BY key" },
    { sql: "SELECT at, mode, basis, ok, ms, detail FROM ru_runlog ORDER BY id DESC LIMIT 60" },
  ])
  return { days, dims: counts[0], meta, counters, runs }
}
