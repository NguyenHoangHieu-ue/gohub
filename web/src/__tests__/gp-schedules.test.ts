import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
vi.mock("@/lib/agents/creator/jobs", () => ({ createJob: vi.fn(), triggerJobRun: vi.fn() }))
import { nextRunAt, validateSchedule, describeSchedule } from "@/lib/agents/creator/schedules"

// Mốc: 2026-10-05 (Thứ Hai) 10:00 giờ VN = 03:00 UTC
const NOW = new Date("2026-10-05T03:00:00Z")
const vn = (d: Date | null) => d && new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ")

describe("Gấu Pro việc theo lịch (G4) — tính lần chạy theo giờ VN", () => {
  it("daily: giờ hẹn còn trong hôm nay → hôm nay; đã qua → mai", () => {
    expect(vn(nextRunAt({ kind: "daily", time: "11:30" }, NOW))).toBe("2026-10-05 11:30")
    expect(vn(nextRunAt({ kind: "daily", time: "08:00" }, NOW))).toBe("2026-10-06 08:00")
  })
  it("daily 06:00 VN qua ranh giới ngày UTC (06:00 VN = 23:00 UTC hôm trước)", () => {
    expect(vn(nextRunAt({ kind: "daily", time: "06:00" }, NOW))).toBe("2026-10-06 06:00")
    expect(nextRunAt({ kind: "daily", time: "06:00" }, NOW)!.toISOString()).toBe("2026-10-05T23:00:00.000Z")
  })
  it("weekly: T2 8h hôm nay đã qua → T2 tuần sau; T3 → mai; CN → CN này", () => {
    expect(vn(nextRunAt({ kind: "weekly", time: "08:00", weekdays: [1] }, NOW))).toBe("2026-10-12 08:00")
    expect(vn(nextRunAt({ kind: "weekly", time: "08:00", weekdays: [2] }, NOW))).toBe("2026-10-06 08:00")
    expect(vn(nextRunAt({ kind: "weekly", time: "09:00", weekdays: [7] }, NOW))).toBe("2026-10-11 09:00")
  })
  it("monthly: ngày 31 với tháng thiếu ngày → ngày cuối tháng", () => {
    expect(vn(nextRunAt({ kind: "monthly", time: "09:00", day: 31 }, NOW))).toBe("2026-10-31 09:00")
    expect(vn(nextRunAt({ kind: "monthly", time: "09:00", day: 31 }, new Date("2026-11-01T03:00:00Z")))).toBe("2026-11-30 09:00")
  })
  it("once: tương lai → đúng giờ; đã qua → null", () => {
    expect(vn(nextRunAt({ kind: "once", time: "15:00", date: "2026-10-07" }, NOW))).toBe("2026-10-07 15:00")
    expect(nextRunAt({ kind: "once", time: "09:00", date: "2026-10-05" }, NOW)).toBeNull()
  })
  it("validate từ chối dữ liệu sai", () => {
    expect(validateSchedule({ kind: "daily", time: "25:00" }).error).toBeTruthy()
    expect(validateSchedule({ kind: "weekly", time: "08:00", weekdays: [] }).error).toBeTruthy()
    expect(validateSchedule({ kind: "hourly", time: "08:00" }).error).toBeTruthy()
    expect(validateSchedule({ kind: "weekly", time: "08:00", weekdays: [5, 1, 1] }).schedule?.weekdays).toEqual([1, 5])
    expect(describeSchedule({ kind: "weekly", time: "08:00", weekdays: [1, 5] })).toBe("T2, T6 hằng tuần 08:00")
  })
})
