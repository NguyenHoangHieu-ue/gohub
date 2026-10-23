import { describe, test, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// Khoá hồi quy an toàn cache (s240): route GHI dữ liệu trong api/analytics + api/config phải gọi hàm xoá/làm mới cache
// (flushByDeps / flushAnalyticsCache / softExpireAll...) hoặc nằm trong danh sách đã duyệt dưới đây (ghi cấu hình/target mà
// route đọc đã tính phần đó SAU cache, hoặc không ảnh hưởng số liệu BI). Route MỚI không có flush mà không có trong
// danh sách → test đỏ, buộc người viết cân nhắc.
const API = path.resolve(__dirname, "../app/api")
const SCAN = ["analytics", "config"]
const FLUSHES = /flushByDeps|flushAnalyticsCache|softExpireAll|flushAnalyticsCacheByPrefixes|flushQuoteCompare|invalidate\(|nocache|bypass/
const WRITES = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/

const REVIEWED = new Set([
  "analytics/3hk-sku-meta", "analytics/b2b-customer-targets", "analytics/channel-costs-fix-renamed", "analytics/channel-costs-repair",
  "analytics/company-monthly-targets", "analytics/customer/report", "analytics/inventory-plan/skus", "analytics/inventory-plan/weekly",
  "analytics/inventory-po", "analytics/market/vendor-quotes/extract", "analytics/market/vendor-quotes", "analytics/market/vendor-quotes/[id]",
  "analytics/my-metrics/evidence", "analytics/my-metrics/evidence/upload", "analytics/my-metrics/explain-nodes", "analytics/my-metrics/lark-config",
  "analytics/my-metrics/lark-config/scan-history", "analytics/my-metrics/lark-config/scan-now", "analytics/my-metrics/lark-events/[id]/override",
  "analytics/my-metrics/lark-events/[id]/review", "analytics/my-metrics/lark-events/[id]", "analytics/my-metrics/manual", "analytics/my-metrics/sku-tags",
  "analytics/products/report", "analytics/quarterly-settings", "analytics/quarterly-targets", "analytics/query", "analytics/squad-targets",
  "analytics/staff-targets", "analytics/track", "analytics/usage-stats/classify", "analytics/usage-stats/evaluate",
  "analytics/vendors/report", "config/assistant-feature-users", "config/assistant-features", "config/chatbot-rules", "config/inventory-alert-thresholds",
  "config/role-permissions", "config/sku-destination-rule", "config/squad-config", "config/tab-visibility", "config/writable-tabs",
])

function routes(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) routes(p, out)
    else if (e.name === "route.ts") out.push(p)
  }
  return out
}

describe("cache-invalidation", () => {
  test("route ghi dữ liệu mới phải xoá/làm mới cache hoặc được duyệt rõ ràng", () => {
    const offenders: string[] = []
    for (const d of SCAN) {
      for (const f of routes(path.join(API, d))) {
        const src = fs.readFileSync(f, "utf8")
        if (!WRITES.test(src) || FLUSHES.test(src)) continue
        const id = path.relative(API, path.dirname(f)).split(path.sep).join("/")
        if (!REVIEWED.has(id)) offenders.push(id)
      }
    }
    expect(offenders, "Route ghi mới thiếu flushByDeps — thêm flush hoặc đưa vào REVIEWED kèm lý do").toEqual([])
  })

  test("danh sách REVIEWED không chứa route đã biến mất", () => {
    for (const id of REVIEWED) expect(fs.existsSync(path.join(API, id, "route.ts")), id).toBe(true)
  })
})
