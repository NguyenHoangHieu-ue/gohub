import { describe, expect, it } from "vitest";
import {
  allocateGroupCost,
  cac,
  contributionMargin1,
  contributionMargin1Pct,
  grossProfit,
  grossProfitMargin,
  threeHkContributionPct,
} from "./financial";

describe("financial formulas", () => {
  it("computes gross profit and margin", () => {
    expect(grossProfit(1000, 400)).toBe(600);
    expect(grossProfitMargin(1000, 400)).toBe(60);
  });

  it("computes CM1 and CM1%", () => {
    const gp = grossProfit(1000, 400);
    const cm1 = contributionMargin1(gp, 100);
    expect(cm1).toBe(500);
    expect(contributionMargin1Pct(cm1, 1000)).toBe(50);
  });

  it("allocates group cost by revenue share", () => {
    expect(allocateGroupCost(1000, 250, 1000)).toBe(250);
    expect(allocateGroupCost(1000, 0, 0)).toBe(0);
  });

  it("computes 3HK contribution % and CAC", () => {
    expect(threeHkContributionPct(297, 1000)).toBeCloseTo(29.7);
    expect(cac(5000, 10)).toBe(500);
  });
});
