import { describe, test, expect } from "vitest"
import { latestDataTime, checksumChanged, checksumOf } from "../lib/data-freshness"

describe("data-freshness", () => {
  test("latestDataTime lấy mốc lớn nhất giữa ETL và checksum", () => {
    const etl = JSON.stringify({ a: "2026-10-23T03:00:00Z", b: "2026-10-23T04:50:00Z" })
    const cs = JSON.stringify({ checksum: "x", changedAt: "2026-10-23T05:10:00Z" })
    expect(latestDataTime(etl, cs)).toBe("2026-10-23T05:10:00.000Z")
    expect(latestDataTime(etl, null)).toBe("2026-10-23T04:50:00.000Z")
    expect(latestDataTime(null, null)).toBeNull()
    expect(latestDataTime("{hỏng", "{")).toBeNull()
  })
  test("checksumChanged: lần đầu không tính là đổi", () => {
    expect(checksumChanged(null, "a")).toBe(false)
    expect(checksumChanged({ checksum: "a", changedAt: "" }, "a")).toBe(false)
    expect(checksumChanged({ checksum: "a", changedAt: "" }, "b")).toBe(true)
    expect(checksumOf([1, null, "x"])).toBe("1||x")
  })
})
