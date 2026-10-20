import { describe, expect, it, vi } from "vitest"
import { validateSql } from "@/lib/argon/sql-guard"
import { MAX_SQL_ROWS, cellText, execSql, previewTable, runReadOnly, toCsv } from "@/lib/argon/sql-tool"

describe("validateSql", () => {
  it("nhận SELECT và WITH…SELECT, bỏ comment và dấu ; cuối", () => {
    expect(validateSql("SELECT 1;")).toEqual({ ok: true, sql: "SELECT 1" })
    expect(validateSql("-- thử\nSELECT a FROM t /* ghi chú */ WHERE x = 1")).toMatchObject({ ok: true })
    expect(validateSql("with x as (select 1 as a) select * from x")).toMatchObject({ ok: true })
  })
  it("cho phép từ khoá nằm trong chuỗi và trong tên cột dài hơn (created_date, updated_at)", () => {
    expect(validateSql("SELECT created_date, 'DELETE me; DROP' AS s FROM fact_sales_revenue WHERE note = 'update'")).toMatchObject({ ok: true })
    expect(validateSql('SELECT "update" FROM t')).toMatchObject({ ok: true })
  })
  it("chặn ghi/DDL, kể cả giấu trong CTE", () => {
    for (const bad of [
      "DELETE FROM t", "UPDATE t SET a=1", "INSERT INTO t VALUES (1)", "DROP TABLE t", "TRUNCATE t", "CREATE TABLE x AS SELECT 1",
      "WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d", "SELECT * INTO newt FROM t", "SELECT 1; DROP TABLE t", "COPY t TO '/tmp/x'",
      "EXPLAIN ANALYZE SELECT 1", "SET statement_timeout=0", "BEGIN", "GRANT ALL ON t TO x",
    ]) expect(validateSql(bad).ok, bad).toBe(false)
  })
  it("chặn hàm nguy hiểm, dollar-quote và comment che từ khoá", () => {
    expect(validateSql("SELECT pg_sleep(100)").ok).toBe(false)
    expect(validateSql("SELECT pg_read_file('/etc/passwd')").ok).toBe(false)
    expect(validateSql("SELECT set_config('a','b',false)").ok).toBe(false)
    expect(validateSql("SELECT $$x$$").ok).toBe(false)
    expect(validateSql("SELECT 1 /* x */ ; DELETE FROM t").ok).toBe(false)
    expect(validateSql("SELECT 'abc").ok).toBe(false)
    expect(validateSql("SELECT 1 /* chưa đóng").ok).toBe(false)
  })
  it("chặn rỗng, quá dài, không bắt đầu bằng SELECT/WITH", () => {
    expect(validateSql("").ok).toBe(false)
    expect(validateSql("   -- chỉ comment").ok).toBe(false)
    expect(validateSql("SELECT 1 " + "x".repeat(20_001)).ok).toBe(false)
    expect(validateSql("VALUES (1)").ok).toBe(false)
  })
})

describe("CSV / bảng xem trước", () => {
  it("toCsv: BOM, thoát dấu phẩy/nháy/xuống dòng, null rỗng, ngày theo giờ địa phương không lệch", () => {
    const d = new Date(2026, 9, 20)   // 20/10/2026 0h địa phương, như pg đọc kiểu date
    const { csv, rowsWritten } = toCsv(["a", "b", "c", "d"], [{ a: "x,y", b: 'có "nháy"', c: null, d: d }], [0, 0, 0, 1082])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain('"x,y","có ""nháy""",,2026-10-20')
    expect(rowsWritten).toBe(1)
    expect(cellText(d, 1082)).toBe("2026-10-20")
  })
  it("toCsv cắt dòng khi vượt 1MB", () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ a: "x".repeat(100), b: i }))
    const r = toCsv(["a", "b"], rows)
    expect(r.rowsWritten).toBeLessThan(20_000)
    expect(Buffer.byteLength(r.csv)).toBeLessThanOrEqual(1024 * 1024 + 3)
  })
  it("previewTable: tối đa 25 dòng, rút gọn ô dài, thay | trong ô", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ n: i, t: "a|b" + "z".repeat(200) }))
    const t = previewTable(["n", "t"], rows)
    expect(t.split("\n")).toHaveLength(2 + 25)
    expect(t).toContain("a/b")
    expect(t).toContain("…")
  })
})

function fakePool(rows: Record<string, unknown>[], fail?: Error) {
  const log: string[] = []
  const client = {
    query: async (q: unknown) => {
      const s = String(q); log.push(s)
      if (fail && s.startsWith("SELECT * FROM")) throw fail
      return s.startsWith("SELECT * FROM") ? { rows, fields: Object.keys(rows[0] ?? { a: 1 }).map(name => ({ name, dataTypeID: 25 })) } : { rows: [] }
    },
    release: () => log.push("release"),
  }
  return { pool: { connect: async () => client }, log }
}

describe("runReadOnly / execSql", () => {
  it("chạy trong BEGIN READ ONLY + statement_timeout, bọc LIMIT, luôn ROLLBACK và release", async () => {
    const { pool, log } = fakePool([{ a: 1 }])
    const r = await runReadOnly("SELECT a FROM t", pool as never)
    expect(r.rows).toHaveLength(1)
    expect(log[0]).toBe("BEGIN READ ONLY")
    expect(log[1]).toMatch(/SET LOCAL statement_timeout = 20000/)
    expect(log[2]).toContain(`SELECT * FROM (SELECT a FROM t) AS _argon LIMIT ${MAX_SQL_ROWS + 1}`)
    expect(log.slice(-2)).toEqual(["ROLLBACK", "release"])
  })
  it("báo cắt khi vượt trần dòng", async () => {
    const { pool } = fakePool(Array.from({ length: MAX_SQL_ROWS + 1 }, (_, i) => ({ a: i })))
    const r = await runReadOnly("SELECT a FROM t", pool as never)
    expect(r.truncated).toBe(true)
    expect(r.rows).toHaveLength(MAX_SQL_ROWS)
  })
  it("lỗi DB: vẫn ROLLBACK + release, execSql trả lỗi chữ (không ném)", async () => {
    const { pool, log } = fakePool([{ a: 1 }], new Error("canceling statement due to statement timeout"))
    const r = await execSql({ query: "SELECT a FROM t" }, { missionId: "m", phase: "run", callsSoFar: 0 }, { pool: () => pool as never, write: async () => ({}) })
    expect(r.ok).toBe(false)
    expect(r.result).toContain("quá 20 giây")
    expect(log.slice(-2)).toEqual(["ROLLBACK", "release"])
  })
  it("từ chối SQL xấu, quá số câu, saveAs sai chỗ / sai pha; không đụng DB", async () => {
    const connect = vi.fn()
    const deps = { pool: () => ({ connect }) as never, write: async () => ({}) }
    expect((await execSql({ query: "DROP TABLE t" }, { missionId: "m", phase: "run", callsSoFar: 0 }, deps)).ok).toBe(false)
    expect((await execSql({ query: "SELECT 1" }, { missionId: "m", phase: "run", callsSoFar: 25 }, deps)).result).toContain("hết 25 câu")
    expect((await execSql({ query: "SELECT 1", saveAs: "reports/x.csv" }, { missionId: "m", phase: "run", callsSoFar: 0 }, deps)).result).toContain("data/")
    expect((await execSql({ query: "SELECT 1", saveAs: "data/x.csv" }, { missionId: "m", phase: "plan", callsSoFar: 0 }, deps)).result).toContain("chưa được lưu")
    expect(connect).not.toHaveBeenCalled()
  })
  it("saveAs ở pha chạy: ghi CSV đầy đủ vào workspace và báo trong kết quả", async () => {
    const { pool } = fakePool([{ vendor: "BC", rev: "100" }, { vendor: "3HK", rev: "200" }])
    const written: { path: string; content: string }[] = []
    const r = await execSql({ query: "SELECT vendor, rev FROM t", saveAs: "data/rev.csv" }, { missionId: "m", phase: "run", callsSoFar: 0 },
      { pool: () => pool as never, write: async (_m, path, content) => { written.push({ path, content }); return {} } })
    expect(r.ok).toBe(true)
    expect(r.result).toContain("Đã lưu data/rev.csv (2/2 dòng)")
    expect(r.result).toContain("| vendor | rev |")
    expect(written[0].path).toBe("data/rev.csv")
    expect(written[0].content).toContain("BC,100")
  })
})
