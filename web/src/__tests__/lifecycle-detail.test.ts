import { vi, describe, test, expect } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
vi.mock("@/lib/analytics-db", () => ({ queryAnalytics: vi.fn() }))
vi.mock("@/lib/turso", () => ({ tursoQuery: vi.fn() }))
vi.mock("@/lib/quarterly-settings", () => ({ fetchQuarterlySettings: vi.fn(), exclHash: () => "" }))

import { selectB2BLifecycle, attachB2BProfiles, buildB2CLifecycleDetail } from "@/lib/analytics-engine/lifecycle-detail"
import type { AdminCustomerDetail } from "@/lib/admin-gohub"

const lr = (code: string, first: string, pic: string | null = "PIC1") =>
  ({ customer_code: code, customer_name: "", sales_pic_code: pic, first_order_date: first })

describe("selectB2BLifecycle — cùng định nghĩa ô tổng quan, thêm danh sách", () => {
  // Quý Q3-2026: 2026-07-01 → 2026-09-20
  const lifecycleRows = [
    lr("NEW1", "2026-08-10"), lr("NEW2", "2026-07-05"),           // đơn đầu trong quý → mới
    lr("REC1", "2025-03-01"), lr("REC2", "2026-02-01"),           // mua trước quý + có doanh thu quý này → quay lại
    lr("OUT1", "2025-01-01"), lr("OUT2", "2026-05-01"), lr("OUT3", "2024-01-01"), // mua trước, quý này không → rời bỏ
    lr("FUT", "2026-09-25"),                                      // đơn đầu SAU qEnd → bỏ qua
  ]
  const revThisQ = new Map([["NEW1", 300], ["NEW2", 100], ["REC1", 50], ["REC2", 900]])
  const revPrevQ = new Map([["REC1", 40], ["OUT1", 700], ["OUT2", 20]])
  const sel = selectB2BLifecycle({ lifecycleRows, revThisQ, revPrevQ, qStart: "2026-07-01", qEnd: "2026-09-20" })

  test("đếm đúng 3 nhóm, KH có đơn đầu sau qEnd bị bỏ qua", () => {
    expect(sel.totals.new.count).toBe(2)
    expect(sel.totals.recurring.count).toBe(2)
    expect(sel.totals.inactive.count).toBe(3)
    expect(sel.totals.new.revenue).toBe(400)
    expect(sel.totals.recurring.revenue).toBe(950)
    expect(sel.totals.inactive.revenue).toBe(720)   // doanh thu quý trước đã mất
  })

  test("danh sách sắp theo doanh thu giảm dần", () => {
    expect(sel.selected.new.map(c => c.code)).toEqual(["NEW1", "NEW2"])
    expect(sel.selected.recurring.map(c => c.code)).toEqual(["REC2", "REC1"])
  })

  test("rời bỏ: đếm TẤT CẢ nhưng chỉ liệt kê KH có doanh thu quý trước (theo doanh thu quý trước giảm dần)", () => {
    expect(sel.totals.inactive.recent).toBe(2)
    expect(sel.selected.inactive.map(c => c.code)).toEqual(["OUT1", "OUT2"])   // OUT3 không có doanh thu quý trước → chỉ nằm trong số đếm
  })

  test("attachB2BProfiles: gắn tên/tier/PIC, thiếu hồ sơ → dùng mã KH; truncated theo limit", () => {
    const d = attachB2BProfiles(sel, code => code === "NEW1" ? { name: "Công ty Một", tier: "VIP", picName: "An" } : undefined)
    expect(d.new.rows[0]).toMatchObject({ id: "NEW1", name: "Công ty Một", tag: "VIP", owner: "An", revenue: 300, firstOrderAt: "2026-08-10" })
    expect(d.new.rows[1]).toMatchObject({ id: "NEW2", name: "NEW2", owner: "PIC1" })
    expect(d.inactive.count).toBe(3)
    expect(d.inactive.recentCount).toBe(2)
    expect(d.inactive.rows).toHaveLength(2)
    const small = attachB2BProfiles(selectB2BLifecycle({ lifecycleRows, revThisQ, revPrevQ, qStart: "2026-07-01", qEnd: "2026-09-20", limit: 1 }), () => undefined, 1)
    expect(small.recurring.rows).toHaveLength(1)
    expect(small.recurring.truncated).toBe(true)
    expect(small.recurring.count).toBe(2)   // số đếm KHÔNG bị cắt theo limit
  })
})

describe("buildB2CLifecycleDetail — B2C từ Admin GoHub API", () => {
  const c = (id: string, userType: "new" | "returning", revenueVnd: number, market: "VN" | "US" = "VN"): AdminCustomerDetail => ({
    id, name: "KH " + id, emailMasked: "a***@x.com", market, userType, revenueVnd, orders: 1, firstOrderAt: "2026-08-01T03:00:00Z", lastOrderAt: "2026-09-01T03:00:00Z",
  })
  const cur = [c("a", "new", 100), c("b", "returning", 300), c("c", "returning", 50, "US")]
  const prev = [c("b", "returning", 200), c("d", "returning", 900), c("e", "new", 10)]
  const d = buildB2CLifecycleDetail(cur, prev)

  test("mới / quay lại theo userType của API, doanh thu + doanh thu quý trước của cùng KH", () => {
    expect(d.new.count).toBe(1)
    expect(d.recurring.count).toBe(2)
    expect(d.recurring.rows.map(r => r.id)).toEqual(["b", "c"])
    expect(d.recurring.rows[0]).toMatchObject({ revenue: 300, prevRevenue: 200 })
    expect(d.new.revenue).toBe(100)
  })

  test("rời bỏ = có mua quý trước nhưng không có trong danh sách quý này, sắp theo doanh thu quý trước", () => {
    expect(d.inactive.rows.map(r => r.id)).toEqual(["d", "e"])
    expect(d.inactive.count).toBe(2)
    expect(d.inactive.recentCount).toBe(2)
    expect(d.inactive.revenue).toBe(910)
    expect(d.inactive.rows[0]).toMatchObject({ revenue: 0, prevRevenue: 900, tag: "VN" })
  })

  test("cắt theo limit nhưng số đếm giữ nguyên", () => {
    const big = Array.from({ length: 700 }, (_, i) => c("n" + i, "new", i))
    const dd = buildB2CLifecycleDetail(big, [])
    expect(dd.new.count).toBe(700)
    expect(dd.new.rows).toHaveLength(500)
    expect(dd.new.truncated).toBe(true)
    expect(dd.new.rows[0].id).toBe("n699")
  })
})
