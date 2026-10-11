import { describe, it, expect } from "vitest"
import { computeHabits, isSensitiveHabit } from "@/lib/habit-learner"

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
