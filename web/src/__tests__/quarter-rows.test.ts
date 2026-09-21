import { describe, test, expect } from "vitest"
import { splitQuarterRows, type QuarterBaseRow } from "@/lib/analytics-engine/quarter-rows"

const cur  = ["2026-07", "2026-08", "2026-09"]
const prev = ["2026-04", "2026-05", "2026-06"]
const row = (month: string, bg: string, channel: string | null, revenue: number, gp: number, hk3 = 0, source_code = "SC"): QuarterBaseRow =>
  ({ month, bg, channel, source_code, revenue: String(revenue), gp: String(gp), hk3: String(hk3) })

describe("splitQuarterRows — tách kết quả gộp thành 7 mảng như 7 query cũ", () => {
  const base: QuarterBaseRow[] = [
    row("2026-07", "B2B", "Shopee", 100, 10, 5),
    row("2026-07", "B2B", "Lazada", 50, 5, 1),
    row("2026-07", "B2C", "Web", 30, 3, 2),
    row("2026-07", "OTHER", null, 7, 1, 4),           // nhóm khác: chỉ vào hk3Rows
    row("2026-07", "B2B", null, 9, 1, 0),             // B2B kênh rỗng: vào groupRows, KHÔNG vào channelRows
    row("2026-08", "B2C", "Web", 40, 4, 0),
    row("2026-05", "B2B", "Shopee", 80, 8, 3),        // quý trước
    row("2026-06", "B2B", "Shopee", 20, 2, 0),
    row("2026-06", "B2C", "Web", 60, 6, 0),
    row("2026-06", "OTHER", null, 99, 9, 9),          // quý trước, nhóm khác: bị bỏ
    row("2026-03", "B2B", "Shopee", 1000, 100, 100),  // ngoài cả 2 quý: bị bỏ
  ]
  const cust = [
    { month: "2026-07", customer_code: "A", revenue: "10" },
    { month: "2026-08", customer_code: "A", revenue: "5" },
    { month: "2026-05", customer_code: "A", revenue: "7" },
    { month: "2026-06", customer_code: "A", revenue: "3" },
    { month: "2026-06", customer_code: "B", revenue: "4" },
    { month: "2026-02", customer_code: "C", revenue: "999" },
  ]
  const out = splitQuarterRows(base, cust, cur, prev)

  test("groupRows: cộng theo (tháng, nhóm) chỉ cho B2B/B2C của quý này, gồm cả kênh rỗng", () => {
    const g = (m: string, bg: string) => out.groupRows.find(r => r.month === m && r.bg === bg)
    expect(parseFloat(g("2026-07", "B2B")!.revenue)).toBe(159)   // 100+50+9
    expect(parseFloat(g("2026-07", "B2B")!.gp)).toBe(16)
    expect(parseFloat(g("2026-07", "B2C")!.revenue)).toBe(30)
    expect(parseFloat(g("2026-08", "B2C")!.revenue)).toBe(40)
    expect(out.groupRows.some(r => r.bg === "OTHER")).toBe(false)
    expect(out.groupRows.every(r => cur.includes(r.month))).toBe(true)
  })

  test("channelRows: chỉ kênh có tên, giữ nguyên chuỗi số gốc + source_code + hk3, sắp theo tháng/nhóm/kênh", () => {
    expect(out.channelRows.map(r => `${r.month}|${r.bg}|${r.channel}`)).toEqual([
      "2026-07|B2B|Lazada", "2026-07|B2B|Shopee", "2026-07|B2C|Web", "2026-08|B2C|Web",
    ])
    const shopee = out.channelRows.find(r => r.channel === "Shopee")!
    expect(shopee).toMatchObject({ revenue: "100", gp: "10", hk3: "5", source_code: "SC" })
  })

  test("hk3Rows: cộng hk3 MỌI nhóm (kể cả OTHER, kênh rỗng) theo tháng quý này", () => {
    const h = (m: string) => parseFloat(out.hk3Rows.find(r => r.month === m)!.hk3)
    expect(h("2026-07")).toBe(5 + 1 + 2 + 4 + 0)
    expect(h("2026-08")).toBe(0)
    expect(out.hk3Rows.some(r => prev.includes(r.month))).toBe(false)
  })

  test("prevGroupRows/prevChannelRows: chỉ quý trước, B2B/B2C, bỏ nhóm khác", () => {
    const pg = (bg: string) => parseFloat(out.prevGroupRows.find(r => r.bg === bg)!.revenue)
    expect(pg("B2B")).toBe(100)   // 80+20
    expect(pg("B2C")).toBe(60)
    expect(out.prevGroupRows.some(r => r.bg === "OTHER")).toBe(false)
    expect(out.prevChannelRows.map(r => `${r.month}|${r.bg}|${r.channel}`).sort()).toEqual([
      "2026-05|B2B|Shopee", "2026-06|B2B|Shopee", "2026-06|B2C|Web",
    ])
  })

  test("custRevRows (quý này giữ tháng) & prevCustRevRows (quý trước cộng theo KH)", () => {
    expect(out.custRevRows).toEqual([
      { month: "2026-07", customer_code: "A", revenue: "10" },
      { month: "2026-08", customer_code: "A", revenue: "5" },
    ])
    const p = Object.fromEntries(out.prevCustRevRows.map(r => [r.customer_code, parseFloat(r.revenue)]))
    expect(p).toEqual({ A: 10, B: 4 })
  })

  test("tổng doanh thu B2B+B2C quý này khớp tổng hạt gốc (bảo toàn)", () => {
    const fromGroups = out.groupRows.reduce((s, r) => s + parseFloat(r.revenue), 0)
    const fromBase = base.filter(r => cur.includes(r.month) && (r.bg === "B2B" || r.bg === "B2C")).reduce((s, r) => s + parseFloat(r.revenue), 0)
    expect(fromGroups).toBeCloseTo(fromBase, 6)
  })

  test("dữ liệu rỗng → 7 mảng rỗng, không lỗi", () => {
    const e = splitQuarterRows([], [], cur, prev)
    expect(Object.values(e).every(a => Array.isArray(a) && a.length === 0)).toBe(true)
  })
})
