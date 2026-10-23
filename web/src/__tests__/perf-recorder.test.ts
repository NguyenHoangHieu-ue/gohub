import { describe, test, expect } from "vitest"
import { perfRouteOf, summarizePerf } from "../lib/perf-recorder"

describe("perf-recorder", () => {
  test("perfRouteOf lấy phần trước dấu ':' đầu tiên", () => {
    expect(perfRouteOf("b2c-monthly:v15:2026-10")).toBe("b2c-monthly")
    expect(perfRouteOf("vendor-list")).toBe("vendor-list")
  })

  test("summarizePerf: tỉ lệ trúng, p50/p95, sắp theo compute p95 giảm dần", () => {
    const ev = [
      ...[1, 2, 3, 4].map(ms => ({ route: "a", outcome: "l1" as const, ms })),
      { route: "a", outcome: "miss" as const, ms: 900 },
      { route: "a", outcome: "compute" as const, ms: 800 },
      { route: "b", outcome: "l2" as const, ms: 30 },
      { route: "b", outcome: "compute" as const, ms: 5000 },
    ]
    const s = summarizePerf(ev)
    expect(s[0].route).toBe("b")
    const a = s.find(x => x.route === "a")!
    expect(a.calls).toBe(5)
    expect(a.hitRate).toBeCloseTo(0.8)
    expect(a.computeP50).toBe(800)
    expect(a.serveP95).toBe(900)
  })
})
