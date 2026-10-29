import { rqMany } from "./client"

// Schema Rollup (plan §4). Bảng WITHOUT ROWID khoá theo (basis, day, …) nên truy vấn theo khoảng ngày dùng đúng khoá chính, không quét cả bảng.
// Rollup chỉ chứa MÃ + số CỘNG ĐƯỢC; nhãn lấy từ dm_* lúc đọc.
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS ru_cust_day (
    basis TEXT NOT NULL, day TEXT NOT NULL, company TEXT NOT NULL, source TEXT NOT NULL, customer TEXT NOT NULL, ship INTEGER NOT NULL,
    revenue_vnd REAL NOT NULL, cogs_vnd REAL NOT NULL, gp_vnd REAL NOT NULL, qty REAL NOT NULL, lines INTEGER NOT NULL, orders INTEGER NOT NULL, hk3_rev_vnd REAL NOT NULL,
    PRIMARY KEY (basis, day, company, source, customer, ship)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS ru_sku_day (
    basis TEXT NOT NULL, day TEXT NOT NULL, company TEXT NOT NULL, source TEXT NOT NULL, sku TEXT NOT NULL,
    revenue_vnd REAL NOT NULL, cogs_vnd REAL NOT NULL, gp_vnd REAL NOT NULL, qty REAL NOT NULL, lines INTEGER NOT NULL, orders INTEGER NOT NULL,
    PRIMARY KEY (basis, day, company, source, sku)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS ru_day_hash (basis TEXT NOT NULL, day TEXT NOT NULL, hash TEXT NOT NULL, cust_rows INTEGER NOT NULL, sku_rows INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (basis, day)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS ru_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS ru_counter (key TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS ru_runlog (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, mode TEXT NOT NULL, basis TEXT, ok INTEGER NOT NULL, ms INTEGER NOT NULL, detail TEXT)`,
  `CREATE TABLE IF NOT EXISTS dm_source (source TEXT PRIMARY KEY, channel_name TEXT, group_name TEXT, sub_group_name TEXT, sapo_name TEXT) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS dm_customer (customer TEXT PRIMARY KEY, name TEXT, organization TEXT, organization_code TEXT, price_list_name TEXT, currency_code TEXT, sales_pic_code TEXT, status TEXT, hash TEXT NOT NULL) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS dm_sku (sku TEXT PRIMARY KEY, vendor TEXT, category_name TEXT, type_of_sim TEXT) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS dm_staff (code TEXT PRIMARY KEY, name TEXT) WITHOUT ROWID`,
]

let ready: Promise<void> | null = null
/** Tạo bảng nếu chưa có (idempotent); chạy một lần mỗi instance. */
export function ensureRollupSchema(): Promise<void> {
  ready ??= rqMany(SCHEMA.map(sql => ({ sql }))).then(() => {}, e => { ready = null; throw e })
  return ready
}
