import { describe, expect, it } from "vitest"
import { getReportAsOfDate, isoDateLocal } from "../b2c-report-period"

describe("Vietnam completed reporting day", () => {
  it.each([
    ["2026-09-07T07:00:00Z", "2026-09-06"],
    ["2026-09-06T16:59:59Z", "2026-09-05"],
    ["2026-09-06T17:00:00Z", "2026-09-06"],
    ["2026-08-31T17:00:00Z", "2026-08-31"],
    ["2025-12-31T17:00:00Z", "2025-12-31"],
  ])("uses the last completed VN day for %s", (now, expected) => {
    expect(isoDateLocal(getReportAsOfDate(new Date(now)))).toBe(expected)
  })
})
