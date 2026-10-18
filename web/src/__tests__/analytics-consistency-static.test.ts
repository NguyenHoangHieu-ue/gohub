import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

// Test TĨNH (chạy trong CI, không cần mạng): chặn tái phát các kiểu "mỗi tab một bản" đã gây lệch số giữa các tab.
// Bổ sung cho src/__e2e__/tab-consistency.test.ts (so số thật giữa các tab, chạy tay: npm run test:consistency).

const SRC = join(__dirname, "..")
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
const files = [...walk(join(SRC, "app", "api")), ...walk(join(SRC, "lib"))]
  .filter(f => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"))
const rel = (f: string) => f.slice(SRC.length + 1).replace(/\\/g, "/")
const read = (f: string) => readFileSync(f, "utf8")

describe("Tab analytics — không tái tạo logic dùng chung", () => {
  it("tỷ lệ ngày pro-rata chỉ qua rangeDayRatio (cost-engine), không tự chia getDaysInRange / getDaysInMonth", () => {
    const re = /getDaysInRange\([^)]*\)\s*\/\s*(getDaysInMonth\(|dim\b)/
    const offenders = files.filter(f => re.test(read(f)) && !/analytics-engine\/(cost-engine|date-math)\.ts$/.test(rel(f)))
    expect(offenders.map(rel), "dùng rangeDayRatio(start, end, 'YYYY-MM') từ @/lib/analytics-engine/cost-engine").toEqual([])
  })

  it("chi phí kênh / chi phí nhóm chỉ đọc qua getChannelCostsForMonths / getGroupCostsForMonths", () => {
    // Ngoại lệ có chủ đích: lọc B2C_CHANNELS + parse riêng (xem wiki analytics-data-model s236), route quản lý chi phí, đồng bộ/sửa dữ liệu.
    const allowed = [
      "lib/analytics-helpers.ts", "lib/b2c-report-snapshot.ts", "lib/b2c-channel-budget.ts",
      "app/api/analytics/b2c/monthly/route.ts", "app/api/analytics/b2c/metric/route.ts",
      "app/api/analytics/b2b/kpis/route.ts", "app/api/analytics/monthly-kpis/route.ts",
      "app/api/cron/refresh-monthly-kpis/route.ts",
    ]
    const offenders = files.filter(f => {
      const r = rel(f)
      if (allowed.includes(r) || r.startsWith("lib/agents/") || r.startsWith("lib/data-") || /channel-(group-)?costs|sync-turso-costs|channel-costs-(repair|fix)|fix-turso/.test(r)) return false
      return /from\("analytics_channel_(group_)?costs"\)/.test(read(f))
    })
    expect(offenders.map(rel), "dùng getChannelCostsForMonths / getGroupCostsForMonths (analytics-helpers)").toEqual([])
  })

  it("danh sách KH loại trừ áp cho nhánh B2C phải qua excludedForB2C (danh sách gốc chứa 'B2C Customer VN/US' → xoá gần hết B2C)", () => {
    // Các file có truyền excludedCustomers vào excludeOpsByCode cho một truy vấn B2C phải import excludedForB2C.
    const mustUse = ["lib/weekly-report/data.ts", "app/api/analytics/b2c/kpis/route.ts", "app/api/analytics/b2c/performance/route.ts", "app/api/analytics/b2c/trend/route.ts"]
    for (const r of mustUse) {
      expect(read(join(SRC, r)), `${r} thiếu excludedForB2C`).toMatch(/excludedForB2C/)
    }
  })

  it("route analytics có cache phải cho bỏ cache bằng nocache=1 (để kiểm số tươi không bị bản cũ che)", () => {
    const names = [
      "channels/kpis", "channels/performance", "bod-group-margin", "bod-channel-performance", "bod-report",
      "b2c/kpis", "b2b/kpis", "staff-report", "quarterly-report", "monthly-kpis", "all-time-performance",
    ]
    const missing = names.filter(n => !/noCache\(req\)/.test(read(join(SRC, "app", "api", "analytics", n, "route.ts"))))
    expect(missing, "thêm noCache(req) vào tham số bypass của cachedQuery").toEqual([])
  })

  it("Channels/Staff/BOD cùng loại khách trong danh sách loại trừ như Quarter Report (makeExcludeSql / ByCode)", () => {
    const need: Record<string, RegExp> = {
      "app/api/analytics/channels/kpis/route.ts": /makeExcludeSql\(/,
      "app/api/analytics/channels/performance/route.ts": /makeExcludeSql\(/,
      "app/api/analytics/channels/trend/route.ts": /makeExcludeSql\(/,
      "app/api/analytics/staff-report/route.ts": /makeExcludeSql\(/,
      "app/api/analytics/staff-report/customers/route.ts": /makeExcludeSql\(/,
      "app/api/analytics/monthly-kpis/route.ts": /makeExcludeSql\(/,
      "app/api/cron/refresh-monthly-kpis/route.ts": /makeExcludeSql\(/,
      "lib/bod-data.ts": /makeExcludeSqlByCode\(/,
    }
    for (const [r, re] of Object.entries(need)) expect(read(join(SRC, r)), `${r} thiếu bộ lọc KH loại trừ`).toMatch(re)
  })

  it("getAnalyticsSource: Created không dùng literal số làm tên cột (SUM(f.0) → lỗi 500)", () => {
    const helpers = readFileSync(join(__dirname, "..", "lib", "analytics-helpers.ts"), "utf8")
    const block = helpers.slice(helpers.indexOf("export function getAnalyticsSource"))
    expect(block).not.toMatch(/(marginCol|cogsCol):s*isSales ? "d+"/)
  })
})
