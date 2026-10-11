import { describe, it, expect } from "vitest"
import { computeHabits, buildBaseline, isSensitiveHabit } from "@/lib/habit-learner"

// created_at ở UTC; giờ VN = +7. 2026-09-07 là thứ Hai.
const mon = (week: number, h = 2) => new Date(Date.UTC(2026, 8, 7 + week * 7, h, 0)).toISOString()   // h=2 UTC → 9h sáng VN thứ Hai
const ev = (created_at: string, user_message: string, tools_used: string[] = [], user_email = "a@b.c") => ({ created_at, user_message, tools_used, user_email })

describe("computeHabits (H0 học thói quen ngầm)", () => {
  it("chủ đề lặp dồn vào thứ Hai qua ≥3 tuần → weekday_topic", () => {
    const events = [0, 1, 2, 3].map(w => ev(mon(w), "Cho mình xem doanh thu B2B tuần trước nhé"))
    const { candidates } = computeHabits(events)
    expect(candidates.some(c => c.kind === "weekday_topic" && /Thứ Hai/.test(c.detail))).toBe(true)
  })

  it("chưa đủ bằng chứng (chỉ 2 tuần / 3 lần) → không có thói quen", () => {
    const events = [ev(mon(0), "doanh thu B2B tuần trước"), ev(mon(0, 5), "doanh thu B2B hôm nay"), ev(mon(1), "doanh thu B2B tuần này")]
    expect(computeHabits(events).candidates.filter(c => c.kind === "topic" || c.kind === "weekday_topic")).toEqual([])
  })

  it("nhắn ngắn + gõ không dấu + hay xin Excel", () => {
    const msgs = ["cho minh xem doanh thu thang nay", "khach nao moi", "xuat file excel giup minh", "bao nhieu don hom nay", "ra file excel nhe", "doanh thu tuan nay", "xem khach b2b", "excel doanh thu nhe", "gui file excel luon"]
    const events = msgs.map((m, i) => ev(mon(i % 4, 2 + (i % 3)), m))
    const { candidates } = computeHabits(events)
    expect(candidates.some(c => c.kind === "style" && c.key === "no_diacritics")).toBe(true)
    expect(candidates.some(c => c.kind === "style" && c.key === "short")).toBe(true)
    expect(candidates.some(c => c.kind === "format" && c.key === "excel")).toBe(true)
  })

  it("tool dùng lặp lại trong ≥3 tuần", () => {
    const events = [0, 1, 2, 3].map(w => ev(mon(w), "báo cáo vendor quý này", ["buildReport"]))
    expect(computeHabits(events).candidates.some(c => c.kind === "tool" && c.key === "buildReport")).toBe(true)
  })

  it("loại chủ đề nhạy cảm (lương, bệnh...)", () => {
    const events = [0, 1, 2, 3].map(w => ev(mon(w), "xem bảng lương tháng này của mình"))
    expect(computeHabits(events).candidates.some(c => /lương/.test(c.detail))).toBe(false)
    expect(isSensitiveHabit("hay hỏi về lương")).toBe(true)
    expect(isSensitiveHabit("hay hỏi doanh thu")).toBe(false)
  })

  it("câu hệ thống '[Đã ...' và tin quá ngắn không tính", () => {
    const { stats } = computeHabits([ev(mon(0), "[Đã duyệt hành động]"), ev(mon(0), "ok")])
    expect(stats.events).toBe(0)
  })

  it("phản hồi 👍 toàn câu có bảng → thói quen thích bảng", () => {
    const fb = [1, 2, 3, 4].map(() => ({ rating: 1, answer: "| a | b |\n|---|---|\n| 1 | 2 |", created_at: mon(0) }))
    expect(computeHabits([], fb).candidates.some(c => c.kind === "feedback" && c.key === "table")).toBe(true)
  })
})

describe("H0.5 — chỉ giữ thói quen ĐẶC TRƯNG so với công ty (baseline)", () => {
  const other = (n: number, msg: string, tools: string[] = [], email = "x@y.z") =>
    Array.from({ length: n }, (_, i) => ev(mon(i % 4, 3), msg, tools, email))

  it("chủ đề mà cả công ty đều hỏi (giá gói) bị loại; chủ đề riêng của người này (vendor zephyr) được giữ", () => {
    const mine = [0, 1, 2, 3].flatMap(w => [ev(mon(w), "giá gói nhật bản 7 ngày bao nhiêu"), ev(mon(w, 3), "đối chiếu báo giá vendor zephyr voyages")])
    const others = other(60, "giá gói thái lan 5 ngày bao nhiêu")
    const base = buildBaseline([...mine, ...others])
    const { candidates } = computeHabits(mine, [], base)
    const topics = candidates.filter(c => c.kind === "topic" || c.kind === "weekday_topic").map(c => c.key)
    expect(topics.some(k => /zephyr/.test(k))).toBe(true)
    expect(topics.some(k => k === "giá gói" || k === "gói nhật" && false)).toBe(false)
    expect(topics).not.toContain("giá gói")
  })

  it("âm tiết đơn quá chung (phẩm, thông, tin) không bao giờ là chủ đề; tool lõi và kênh Web bị bỏ", () => {
    const mine = [0, 1, 2, 3].map(w => ev(mon(w), "cho mình thông tin sản phẩm mới", ["executeSQL", "buildReport"], "a@b.c"))
    const base = buildBaseline([...mine, ...other(40, "xem doanh thu hôm nay", [], "x@y.z")])
    const { candidates } = computeHabits(mine, [], base)
    const keys = candidates.map(c => c.key)
    expect(keys).not.toContain("phẩm")
    expect(keys).not.toContain("thông")
    expect(keys).not.toContain("executeSQL")
    expect(candidates.some(c => c.kind === "channel")).toBe(false)
    expect(keys).toContain("buildReport")
  })

  it("từ đơn tiếng Việt có dấu và từ chỉ cách trả lời không thành chủ đề", () => {
    const mine = [0, 1, 2, 3].map(w => ev(mon(w), "trả lời ngắn giúp mình nhưng phía khách khác chưa rõ"))
    const base = buildBaseline([...mine, ...other(50, "xem doanh thu hôm nay")])
    const keys = computeHabits(mine, [], base).candidates.filter(c => c.kind === "topic" || c.kind === "weekday_topic").map(c => c.key)
    for (const bad of ["nhưng", "phía", "khác", "ngắn", "trả lời", "trả lời ngắn"]) expect(keys).not.toContain(bad)
  })

  it("cụm toàn âm tiết chung (thông tin) và âm tiết không dấu (dung) không thành chủ đề; tên riêng ASCII (cmhk) thì có", () => {
    const mine = [0, 1, 2, 3].map(w => ev(mon(w), "cho mình thông tin dung cmhk"))
    const base = buildBaseline([...mine, ...other(50, "xem doanh thu hôm nay")])
    const keys = computeHabits(mine, [], base).candidates.filter(c => c.kind === "topic" || c.kind === "weekday_topic").map(c => c.key)
    expect(keys).not.toContain("thông tin")
    expect(keys).not.toContain("dung")
    expect(keys.some(k => /cmhk/.test(k))).toBe(true)
  })

  it("kênh Lark chỉ là thói quen khi khác số đông", () => {
    const mine = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1].map((w, i) => ev(mon(w, 3 + (i % 2)), `câu hỏi số ${i} về đơn hàng`, [], "lark:ou_abc"))
    const others = other(40, "xem doanh thu hôm nay", [], "x@y.z")
    expect(computeHabits(mine, [], buildBaseline([...mine, ...others])).candidates.some(c => c.kind === "channel" && c.key === "Lark")).toBe(true)
    const manyLark = other(40, "xem doanh thu hôm nay", [], "lark:ou_zzz")
    expect(computeHabits(mine, [], buildBaseline([...mine, ...manyLark])).candidates.some(c => c.kind === "channel")).toBe(false)
  })

  it("yêu cầu định dạng chỉ tính khi gấp ≥2 lần mức chung", () => {
    const mine = [0, 1, 2, 3].map(w => ev(mon(w), "tóm tắt giúp mình tình hình đơn hàng"))
    const everyoneAsks = other(40, "tóm tắt giúp mình doanh thu hôm nay")
    const rare = other(40, "xem doanh thu hôm nay")
    expect(computeHabits(mine, [], buildBaseline([...mine, ...everyoneAsks])).candidates.some(c => c.kind === "format" && c.key === "short")).toBe(false)
    expect(computeHabits(mine, [], buildBaseline([...mine, ...rare])).candidates.some(c => c.kind === "format" && c.key === "short")).toBe(true)
  })
})
