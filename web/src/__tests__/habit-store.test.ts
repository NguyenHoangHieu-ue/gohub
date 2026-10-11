import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) } }))
import { habitLine, habitSource, selectSafeHabits, planHabitWrites, MAX_NEW_PER_RUN, MAX_HABITS_PER_USER, HABIT_EXPIRE_DAYS, type HabitRow } from "@/lib/habit-store"
import type { HabitCandidate } from "@/lib/habit-learner"

const c = (kind: HabitCandidate["kind"], key: string, count = 10, detail = ""): HabitCandidate => ({ kind, key, detail: detail || `${kind} ${key}`, count, weeks: 4 })
const row = (id: number, source: string, content: string, ageDays = 0): HabitRow => ({ id, username: "an", content, source, updated_at: new Date(Date.now() - ageDays * 86_400_000).toISOString() })

describe("habit-store (H1 tự lưu thói quen)", () => {
  it("mẫu câu cố định, không model", () => {
    expect(habitLine(c("format", "short", 29))).toBe("Hay yêu cầu trả lời ngắn gọn/tóm tắt (quan sát 29 lần).")
    expect(habitLine(c("topic", "cmhk", 21))).toBe('Hay nhắc tới "cmhk" (quan sát 21 lần).')
    expect(habitLine(c("weekday_topic", "doanh thu", 8, 'hỏi về "doanh thu" chủ yếu vào Thứ Hai (6/8 lần)'))).toBe('Hay hỏi về "doanh thu" vào Thứ Hai (quan sát 8 lần).')
    expect(habitLine(c("time_of_day", "chiều", 30))).toContain("buổi chiều")
  })

  it("chỉ nhóm an toàn: bỏ tool, bỏ 👎, bỏ chủ đề không phải tên riêng ASCII", () => {
    const out = selectSafeHabits([c("tool", "createLarkTask"), c("feedback", "down"), c("feedback", "table"), c("topic", "cập nhật"), c("topic", "cmhk"), c("format", "excel"), c("style", "short"), c("channel", "Lark")])
    expect(out.map(x => `${x.kind}:${x.key}`)).toEqual(["feedback:table", "topic:cmhk", "format:excel", "style:short", "channel:Lark"])
  })

  it("lần đầu: chèn tối đa 3 mục mới/đêm; có khoá nguồn để cập nhật sau", () => {
    const plan = planHabitWrites("an", [c("format", "short"), c("format", "excel"), c("style", "short"), c("channel", "Lark"), c("topic", "cmhk")], [])
    expect(plan.insert).toHaveLength(MAX_NEW_PER_RUN)
    expect(plan.insert[0].source).toBe("auto-habit:format:short")
    expect(plan.insert[0].kind).toBe("preference")
  })

  it("đã có: nội dung đổi → update; giữ nguyên → touch (làm mới lần quan sát gần nhất); không chèn trùng", () => {
    const existing = [row(1, habitSource(c("format", "short")), "Hay yêu cầu trả lời ngắn gọn/tóm tắt (quan sát 20 lần)."), row(2, habitSource(c("format", "excel")), "Hay xin kết quả dạng file Excel (quan sát 10 lần).")]
    const plan = planHabitWrites("an", [c("format", "short", 29), c("format", "excel", 10)], existing)
    expect(plan.insert).toEqual([])
    expect(plan.update).toEqual([{ id: 1, content: "Hay yêu cầu trả lời ngắn gọn/tóm tắt (quan sát 29 lần)." }])
    expect(plan.touch).toEqual([2])
  })

  it("không quan sát được nữa: chỉ lưu trữ khi quá hạn", () => {
    const existing = [row(1, "auto-habit:format:chart", "Hay yêu cầu biểu đồ (quan sát 5 lần).", HABIT_EXPIRE_DAYS + 5), row(2, "auto-habit:format:table", "Hay yêu cầu trình bày dạng bảng (quan sát 5 lần).", 10)]
    const plan = planHabitWrites("an", [], existing)
    expect(plan.archive).toEqual([1])
  })

  it("trần số thói quen mỗi người", () => {
    const existing = Array.from({ length: MAX_HABITS_PER_USER }, (_, i) => row(i + 1, `auto-habit:topic:t${i}xxx`, "x"))
    expect(planHabitWrites("an", [c("format", "short")], existing).insert).toEqual([])
  })
})
