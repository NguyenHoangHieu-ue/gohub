import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// Vercel Cron luôn gọi bằng GET. Route chỉ export POST → 405 mỗi lần, cron "chạy" mà không làm gì và không ai biết
// (refresh-monthly-kpis từng chết 2 tháng vì lý do này, s202). Test này bắt cả lớp lỗi đó.
const root = path.resolve(__dirname, "../..")
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")) as { crons?: { path: string }[] }

describe("vercel.json crons", () => {
  const crons = vercel.crons ?? []
  it("có khai báo cron", () => { expect(crons.length).toBeGreaterThan(0) })

  for (const c of crons) {
    it(`${c.path} export GET`, () => {
      const file = path.join(root, "src/app", c.path, "route.ts")
      expect(fs.existsSync(file), `thiếu file ${file}`).toBe(true)
      const src = fs.readFileSync(file, "utf8")
      expect(/export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(src), `${c.path} chỉ có POST/thiếu GET → Vercel Cron nhận 405`).toBe(true)
    })
  }
})
