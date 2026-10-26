import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"
import { EVAL_USER, buildFixtures } from "@/lib/argon/eval-fixtures"
import { isExternalSource } from "@/lib/argon/quarantine"
import { injectionHits } from "@/lib/argon/run-safety"
import { routeRun } from "@/lib/argon/run-route"

const { cases } = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval/argon-cases.json"), "utf8")) as { cases: Record<string, any>[] }
const fx = buildFixtures("2026-10-26")

describe("dữ liệu mẫu eval Argon", () => {
  it("người dùng giả không thể là người dùng thật; ngày tương đối đúng theo hôm nay", () => {
    expect(EVAL_USER).toMatch(/^eval-/)
    expect(fx.dates).toEqual({ EFF: "2026-10-31", OLD_EXP: "2026-10-30", FRI: "2026-10-29", NIMBUS_EXP: "2026-12-25" })
    expect(fx.sources.find(s => s.key === "aurora")!.text).toContain("2026-10-31")
  })
  it("mail và thread là nguồn NGOÀI (qua buồng cách ly), kế hoạch nội bộ thì không; thư gài bị quét ra dấu hiệu, thư thường thì không", () => {
    const ext = Object.fromEntries(fx.sources.map(s => [s.key, isExternalSource({ id: s.key, name: s.name, kind: s.kind, meta: s.meta })]))
    expect(ext).toEqual({ aurora: true, nimbus: true, evil: true, thread: true, plan: false })
    expect(injectionHits(fx.sources.find(s => s.key === "evil")!.text).length).toBeGreaterThanOrEqual(3)
    for (const k of ["aurora", "nimbus", "thread", "plan"]) expect(injectionHits(fx.sources.find(s => s.key === k)!.text), k).toEqual([])
  })
})

describe("bộ câu hỏi eval Argon", () => {
  it("id không trùng; mọi {PLACEHOLDER} đều là ngày có thật; regex hợp lệ; expectRoute khớp router", () => {
    const ids = cases.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of cases) {
      const all = JSON.stringify(c)
      for (const m of all.matchAll(/\{([A-Z_]+)\}/g)) expect(Object.keys(fx.dates), `${c.id} {${m[1]}}`).toContain(m[1])
      for (const p of [...(c.must ?? []), ...(c.mustNot ?? []), ...(c.state?.factsWithTextMustBeReviewed ?? []), ...(c.state?.noFactMatching ?? [])]) expect(() => new RegExp(String(p).replace(/\{[A-Z_]+\}/g, "x"), "i"), `${c.id} ${p}`).not.toThrow()
      if (c.expectRoute) expect(routeRun(String(c.question).replace(/\{[A-Z_]+\}/g, "2026-10-31"), { mission: true }).route, `${c.id}: ${c.question}`).toBe(c.expectRoute)
    }
  })
  it("có đủ 4 nhóm: đọc Kho, không bịa, an toàn, ghi nhớ; mỗi ca có tiêu chí cho giám khảo", () => {
    expect(new Set(cases.map(c => String(c.group)[0]))).toEqual(new Set(["A", "B", "C", "D"]))
    for (const c of cases) expect(String(c.criteria ?? "").length, c.id).toBeGreaterThan(20)
  })
})
