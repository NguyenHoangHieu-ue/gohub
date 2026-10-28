import { describe, expect, it } from "vitest"
import { addDays, chunk, compareTotals, dayHash, groupByDay, isDay, isMonth, monthsInclusive, nextMonth, planDays, type CustRow, type SkuRow } from "@/lib/rollup/pure"
import { custSql, skuSql, totalsSql } from "@/lib/rollup/source"
import { dayStatements } from "@/lib/rollup/builder"

const c = (o: Partial<CustRow> = {}): CustRow => ({ day: "2026-10-01", company: "VN", source: "S1", customer: "K1", ship: 0, revenue: 100, cogs: 60, gp: 40, qty: 2, lines: 2, orders: 1, hk3: 0, ...o })
const s = (o: Partial<SkuRow> = {}): SkuRow => ({ day: "2026-10-01", company: "VN", source: "S1", sku: "A", revenue: 100, cogs: 60, gp: 40, qty: 2, lines: 2, orders: 1, ...o })

describe("rollup: ngày tháng", () => {
  it("isDay/isMonth chặt", () => {
    expect(isDay("2026-10-28")).toBe(true); expect(isDay("2026-13-01")).toBe(false); expect(isDay("2026-10-28' OR 1=1")).toBe(false)
    expect(isMonth("2026-10")).toBe(true); expect(isMonth("2026-00")).toBe(false)
  })
  it("addDays/nextMonth/monthsInclusive qua ranh giới tháng và năm", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01"); expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(nextMonth("2025-12")).toBe("2026-01")
    expect(monthsInclusive("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
  })
  it("chunk", () => { expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]) })
})

describe("rollup: băm theo ngày", () => {
  it("không phụ thuộc thứ tự dòng; đổi một số đo thì băm đổi", () => {
    const a = [c({ customer: "K1" }), c({ customer: "K2", revenue: 5 })], sk = [s(), s({ sku: "B" })]
    expect(dayHash(a, sk)).toBe(dayHash([...a].reverse(), [...sk].reverse()))
    expect(dayHash(a, sk)).not.toBe(dayHash([c({ customer: "K1", revenue: 101 }), a[1]], sk))
    expect(dayHash(a, sk)).not.toBe(dayHash(a, [s()]))
  })
  it("làm tròn 4 chữ số thập phân: nhiễu dấu phẩy động không làm đổi băm", () => {
    expect(dayHash([c({ revenue: 100.00001 })], [])).toBe(dayHash([c({ revenue: 100.000012 })], []))
  })
  it("groupByDay", () => {
    const m = groupByDay([c({ day: "2026-10-01" }), c({ day: "2026-10-02" }), c({ day: "2026-10-01", customer: "K2" })])
    expect(m.get("2026-10-01")!.length).toBe(2); expect(m.size).toBe(2)
  })
})

describe("rollup: planDays", () => {
  it("changed = mới hoặc băm khác; removed = đã lưu nhưng DW hết dòng; ngoài cửa sổ bị bỏ qua", () => {
    const fresh = new Map([["2026-10-01", "a"], ["2026-10-02", "b2"], ["2026-10-03", "c"], ["2026-12-01", "z"]])
    const stored = new Map([["2026-10-01", "a"], ["2026-10-02", "b"], ["2026-10-04", "d"], ["2026-09-01", "old"]])
    expect(planDays("2026-10-01", "2026-11-01", fresh, stored)).toEqual({ changed: ["2026-10-02", "2026-10-03"], removed: ["2026-10-04"], same: 1 })
  })
})

describe("rollup: đối chiếu tổng", () => {
  const t = { revenue: 1000, cogs: 600, gp: 400, qty: 10, lines: 5 }
  it("khớp trong dung sai; lệch tiền > 1 VND hoặc số dòng thì báo", () => {
    expect(compareTotals(t, { ...t, revenue: 1000.4 }).ok).toBe(true)
    const bad = compareTotals(t, { ...t, revenue: 1002, lines: 4 })
    expect(bad.ok).toBe(false); expect(Object.keys(bad.diffs).sort()).toEqual(["lines", "revenue"])
  })
})

describe("rollup: SQL đọc gohub_dw (chỉ SELECT, tham số được kiểm)", () => {
  it("ful so chuỗi ngày, sal ép created_date; có hk3 và COUNT DISTINCT order", () => {
    const f = custSql("ful", "2026-10-01", "2026-11-01")
    expect(f).toMatch(/^SELECT/); expect(f).toContain("f.fulfiled_date >= '2026-10-01' AND f.fulfiled_date < '2026-11-01'")
    expect(f).toContain("COUNT(DISTINCT f.order_code)"); expect(f).toContain("3HKDATAPOOL"); expect(f).toContain("SHIPPINGFEE0")
    const sa = skuSql("sal", "2026-10-01", "2026-11-01")
    expect(sa).toContain("f.created_date::date::text"); expect(sa).toContain("f.created_date >= '2026-10-01'::date")
    expect(sa).not.toContain("gross_profit_vnd")   // Created: giá vốn/GP = 0 như các tab hiện tại
    expect(totalsSql("ful", "2026-10-01", "2026-10-02")).toContain("COUNT(*) AS lines")
  })
  it("từ chối tham số xấu (chống chèn SQL)", () => {
    expect(() => custSql("ful", "2026-10-01' OR '1'='1", "2026-11-01")).toThrow()
    expect(() => custSql("ful", "2026-11-01", "2026-10-01")).toThrow()
    expect(() => skuSql("xx" as never, "2026-10-01", "2026-11-01")).toThrow()
  })
  it("không có câu lệnh ghi nào", () => {
    for (const q of [custSql("ful", "2026-10-01", "2026-11-01"), skuSql("sal", "2026-10-01", "2026-11-01"), totalsSql("ful", "2026-10-01", "2026-11-01")]) expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i)
  })
})

describe("rollup: câu lệnh ghi một ngày", () => {
  it("xoá ngày cũ trước, chèn theo lô 100 dòng, cuối cùng cập nhật băm", () => {
    const cust = Array.from({ length: 230 }, (_, i) => c({ customer: `K${i}` }))
    const st = dayStatements("ful", "2026-10-01", cust, [s()], "h")
    expect(st[0].sql).toContain("DELETE FROM ru_cust_day"); expect(st[1].sql).toContain("DELETE FROM ru_sku_day")
    const inserts = st.filter(x => x.sql.startsWith("INSERT INTO ru_cust_day"))
    expect(inserts.length).toBe(3); expect(inserts[0].args!.length).toBe(100 * 13); expect(inserts[2].args!.length).toBe(30 * 13)
    expect(st[st.length - 1].sql).toContain("ru_day_hash")
  })
})

describe("rollup: NaN trong DW", () => {
  it("tổng tiền/giá vốn/GP bỏ qua giá trị NaN của numeric (không để một dòng hỏng làm cả tháng thành NaN)", () => {
    for (const q of [custSql("ful", "2026-10-01", "2026-11-01"), skuSql("ful", "2026-10-01", "2026-11-01"), totalsSql("ful", "2026-10-01", "2026-11-01")]) {
      expect(q).toContain("'NaN'::numeric")
      expect(q).toMatch(/CASE WHEN f\.cogs_amount_vnd = 'NaN'::numeric THEN 0/)
    }
  })
})
