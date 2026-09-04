import { describe, expect, it } from "vitest";
import {
  MonthProjectionStrategy,
  ProjectionContext,
  UngatedProjectionStrategy,
  buildQuarterMonthMeta,
} from "./projection";

describe("projection formulas", () => {
  it("MonthProjectionStrategy keeps actual when elapsed < 7 days (no spike gate)", () => {
    const strategy = new MonthProjectionStrategy();
    expect(strategy.calculateProjection(100, 3, 30)).toBe(100);
  });

  it("MonthProjectionStrategy applies pro-rata factor when elapsed >= 7 days", () => {
    const strategy = new MonthProjectionStrategy();
    expect(strategy.calculateProjection(100, 10, 30)).toBe(300);
  });

  it("UngatedProjectionStrategy applies factor even under 7 days (separate from gated)", () => {
    const strategy = new UngatedProjectionStrategy();
    expect(strategy.calculateProjection(100, 3, 30)).toBe(1000);
  });

  it("ProjectionContext delegates to the active strategy", () => {
    const ctx = new ProjectionContext(new MonthProjectionStrategy());
    expect(ctx.getProjectedValue(100, 10, 30)).toBe(300);
    ctx.setStrategy(new UngatedProjectionStrategy());
    expect(ctx.getProjectedValue(100, 10, 30)).toBe(300);
  });

  it("buildQuarterMonthMeta marks completed/current/future correctly", () => {
    const asOf = new Date(2026, 7, 15); // 2026-08-15
    const months = buildQuarterMonthMeta(3, 2026, asOf); // Q3 = Jul/Aug/Sep
    expect(months[0].status).toBe("completed");
    expect(months[1].status).toBe("current");
    expect(months[1].elapsedDays).toBe(15);
    expect(months[2].status).toBe("future");
    expect(months[2].elapsedDays).toBe(0);
  });
});
