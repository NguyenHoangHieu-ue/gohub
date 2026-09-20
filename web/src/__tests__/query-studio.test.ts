import { describe, it, expect } from "vitest"
import {
  inferColumns, suggestConfig, aggregateForChart, computeCards, sortRows, columnTotals, filterRows, toNumber, AXIS_KEY,
  type VisualConfig,
} from "@/lib/query-studio"

const cfg = (over: Partial<VisualConfig>): VisualConfig => ({ type: "column", axis: null, legend: null, values: [], topN: 20, stacked: false, ...over })

describe("query-studio — nhận diện kiểu cột", () => {
  it("numeric dạng chuỗi (pg trả bigint/numeric là string) vẫn là number", () => {
    const rows = [{ rev: "1234.50", n: 5 }, { rev: "10", n: 7 }]
    expect(inferColumns(rows).map(c => c.kind)).toEqual(["number", "number"])
  })
  it("ngày ISO là date, mã có số 0 đầu KHÔNG bị coi là số", () => {
    const rows = [{ d: "2026-09-01", code: "0012" }, { d: "2026-09-02T10:00:00.000Z", code: "0034" }]
    expect(inferColumns(rows)).toEqual([{ name: "d", kind: "date" }, { name: "code", kind: "text" }])
  })
  it("cột rỗng toàn null → text, không có dòng → []", () => {
    expect(inferColumns([{ a: null }])).toEqual([{ name: "a", kind: "text" }])
    expect(inferColumns([])).toEqual([])
  })
  it("toNumber", () => {
    expect(toNumber("12.5")).toBe(12.5)
    expect(toNumber("abc")).toBeNull()
    expect(toNumber(NaN)).toBeNull()
  })
})

describe("query-studio — gợi ý biểu đồ", () => {
  it("1 dòng nhiều số → card", () => {
    const rows = [{ a: "1", b: "2" }]
    expect(suggestConfig(inferColumns(rows), rows)).toMatchObject({ type: "card" })
  })
  it("có cột ngày + số → line theo ngày", () => {
    const rows = [{ d: "2026-09-01", v: "1" }, { d: "2026-09-02", v: "2" }]
    expect(suggestConfig(inferColumns(rows), rows)).toMatchObject({ type: "line", axis: "d", values: [{ field: "v", agg: "sum" }] })
  })
  it("chỉ text → table", () => {
    const rows = [{ a: "x" }, { a: "y" }]
    expect(suggestConfig(inferColumns(rows), rows).type).toBe("table")
  })
})

describe("query-studio — gom nhóm", () => {
  const rows = [
    { ch: "B2B", m: "T1", v: "10" }, { ch: "B2B", m: "T2", v: "30" },
    { ch: "B2C", m: "T1", v: "5" }, { ch: "B2C", m: "T1", v: "5" },
  ]
  const cols = inferColumns(rows)

  it("cộng Sum theo Axis, xếp giảm dần theo tổng với trục text", () => {
    const r = aggregateForChart(rows, cfg({ axis: "ch", values: [{ field: "v", agg: "sum" }] }), cols)
    expect(r.data.map(d => [d[AXIS_KEY], d.v0])).toEqual([["B2B", 40], ["B2C", 10]])
  })
  it("Legend tách series theo giá trị legend", () => {
    const r = aggregateForChart(rows, cfg({ axis: "m", legend: "ch", values: [{ field: "v", agg: "sum" }] }), cols)
    expect(r.series.map(s => s.dataKey).sort()).toEqual(["B2B", "B2C"])
    const t1 = r.data.find(d => d[AXIS_KEY] === "T1")!
    expect(t1.B2B).toBe(10)
    expect(t1.B2C).toBe(10)
  })
  it("Count / Average / Distinct", () => {
    const c = aggregateForChart(rows, cfg({ axis: "ch", values: [{ field: "v", agg: "count" }, { field: "v", agg: "avg" }, { field: "m", agg: "distinct" }] }), cols)
    const b2b = c.data.find(d => d[AXIS_KEY] === "B2B")!
    expect([b2b.v0, b2b.v1, b2b.v2]).toEqual([2, 20, 2])
  })
  it("Top N cắt bớt và báo truncated", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ k: `k${i}`, v: String(i) }))
    const r = aggregateForChart(many, cfg({ axis: "k", values: [{ field: "v", agg: "sum" }], topN: 5 }), inferColumns(many))
    expect(r.data).toHaveLength(5)
    expect(r.truncated).toBe(true)
    expect(r.data[0][AXIS_KEY]).toBe("k29")
  })
  it("Top N KHÔNG cắt trục ngày (giữ đủ chuỗi thời gian)", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ d: `2026-09-${String(i + 1).padStart(2, "0")}`, v: "1" }))
    const r = aggregateForChart(days, cfg({ axis: "d", values: [{ field: "v", agg: "sum" }], topN: 5 }), inferColumns(days))
    expect(r.data).toHaveLength(30)
    expect(r.truncated).toBe(false)
  })
  it("trục ngày sắp tăng dần, timestamp gom theo ngày", () => {
    const d = [{ d: "2026-09-02T08:00:00Z", v: "1" }, { d: "2026-09-01T23:00:00Z", v: "2" }, { d: "2026-09-02T01:00:00Z", v: "3" }]
    const r = aggregateForChart(d, cfg({ axis: "d", values: [{ field: "v", agg: "sum" }] }), inferColumns(d))
    expect(r.data.map(x => [x[AXIS_KEY], x.v0])).toEqual([["2026-09-01", 2], ["2026-09-02", 4]])
  })
  it("thiếu axis hoặc values → rỗng", () => {
    expect(aggregateForChart(rows, cfg({ axis: null, values: [{ field: "v", agg: "sum" }] }), cols).data).toEqual([])
  })
  it("card tính trên toàn bộ dòng", () => {
    expect(computeCards(rows, cfg({ values: [{ field: "v", agg: "sum" }] }))[0].value).toBe(50)
  })
})

describe("query-studio — bảng", () => {
  const rows = [{ n: "10", s: "b" }, { n: "9", s: "a" }, { n: null, s: "c" }]
  it("sort số theo giá trị (không theo chuỗi), null xuống cuối", () => {
    expect(sortRows(rows, "n", "asc", "number").map(r => r.n)).toEqual(["9", "10", null])
    expect(sortRows(rows, "n", "desc", "number").map(r => r.n)).toEqual(["10", "9", null])
  })
  it("tổng cột số + lọc từ khoá", () => {
    expect(columnTotals(rows, inferColumns(rows))).toEqual({ n: 19 })
    expect(filterRows(rows, "A")).toHaveLength(1)
    expect(filterRows(rows, "  ")).toHaveLength(3)
  })
})
