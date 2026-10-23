import { describe, test, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { buildDataMap, parseTabs } from "../../scripts/datamap/build.mjs"

const ROOT = path.resolve(__dirname, "../..")
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data-map.generated.json"), "utf8"))

describe("data-map", () => {
  test("file đã commit khớp kết quả quét code (quên chạy `npm run build:datamap` thì đỏ)", () => {
    expect(JSON.parse(JSON.stringify(buildDataMap(ROOT)))).toEqual(committed)
  }, 60_000)

  test("mọi tab trong nav.ts đều có trong sơ đồ", () => {
    const ids = parseTabs(ROOT).map((t: { id: string }) => t.id)
    expect(ids.length).toBeGreaterThanOrEqual(19)
    expect(committed.tabs.map((t: { id: string }) => t.id)).toEqual(ids)
  })

  test("mọi API trong sơ đồ có file route thật và ít nhất một bảng", () => {
    for (const [p, a] of Object.entries(committed.apis) as [string, { file: string; tables: unknown[]; external: string[] }][]) {
      expect(fs.existsSync(path.join(ROOT, a.file)), p).toBe(true)
      // /api/analytics/query nhận SQL từ giao diện nên không có bảng cố định; route GA4/GSC đọc API ngoài
      if (p !== "/api/analytics/query" && a.external.length === 0) expect(a.tables.length, p).toBeGreaterThan(0)
    }
  })

  test("không có tên bảng rác (từ khoá SQL, tiếng Anh)", () => {
    for (const name of Object.keys(committed.tables)) expect(name).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$|^(skus|users|channels)$/)
  })
})
