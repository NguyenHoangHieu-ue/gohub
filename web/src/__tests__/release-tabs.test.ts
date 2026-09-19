import { describe, test, expect } from "vitest"
import { tabsForFiles } from "@/lib/release-tabs"
import { withTabsFooter, tabsOfCommits } from "@/lib/release-notify"

describe("release-tabs — file → tên tab", () => {
  test("trang analytics theo nav", () => {
    expect(tabsForFiles(["web/src/app/(dashboard)/analytics/catalogue/page.tsx"])).toEqual(["Product Catalogue"])
    expect(tabsForFiles(["web/src/app/(dashboard)/analytics/b2b/page.tsx"])).toEqual(["B2B"])
    expect(tabsForFiles(["web/src/app/(dashboard)/analytics/page.tsx"])).toEqual(["Dashboard"])
    expect(tabsForFiles(["web/src/app/(dashboard)/analytics/creator/data-health/page.tsx"])).toEqual(["Giám sát Dữ liệu"])
  })

  test("trang ngoài analytics", () => {
    expect(tabsForFiles(["web/src/app/(dashboard)/chatbot/page.tsx"])).toEqual(["Bé Gấu"])
    expect(tabsForFiles(["web/src/app/(dashboard)/skus/page.tsx"])).toEqual(["System SKUs (Sản phẩm hệ thống)"])
  })

  test("API route và thư mục dùng chung quy về đúng tab", () => {
    expect(tabsForFiles(["web/src/app/api/analytics/product-catalogue/route.ts"])).toEqual(["Product Catalogue"])
    expect(tabsForFiles(["web/src/app/api/analytics/quarterly-b2b-customers/route.ts"])).toEqual(["Quarter Report"])
    expect(tabsForFiles(["web/src/app/api/items/route.ts"])).toEqual(["System SKUs (Sản phẩm hệ thống)"])
    expect(tabsForFiles(["web/src/lib/catalogue/plain-language.ts"])).toEqual(["Product Catalogue"])
    expect(tabsForFiles(["web/src/components/my-metrics/x.tsx"])).toEqual(["My Metrics"])
    expect(tabsForFiles(["web/src/lib/agents/be-gau.ts"])).toEqual(["Bé Gấu"])
  })

  test("đồng bộ nền + gộp nhiều file, bỏ trùng, giữ thứ tự", () => {
    const t = tabsForFiles([
      "web/src/lib/catalogue/a.ts", "web/src/components/catalogue/b.tsx",
      "backend/data_sync/sync.py", ".github/workflows/sync.yml", "web/src/app/api/analytics/b2c/kpis/route.ts",
    ])
    expect(t).toEqual(["Product Catalogue", "Đồng bộ dữ liệu sản phẩm (chạy nền)", "B2C"])
  })

  test("file không thuộc tab nào (docs, cấu hình, test) → rỗng", () => {
    expect(tabsForFiles(["docs/wiki/system/tabs/analytics-b2b.md", "CLAUDE.md", "web/src/__tests__/x.test.ts", "web/package.json"])).toEqual([])
    expect(tabsForFiles(undefined)).toEqual([])
  })

  test("giới hạn số tab", () => {
    const files = ["b2b", "b2c", "bod", "channels", "staff", "customers", "vendors"].map(s => `web/src/app/(dashboard)/analytics/${s}/page.tsx`)
    expect(tabsForFiles(files, 3)).toHaveLength(3)
  })
})

describe("thông báo release nêu tab", () => {
  const commits = [
    { sha: "a", message: "feat(catalogue): x", files: ["web/src/lib/catalogue/a.ts", "web/src/components/catalogue/b.tsx"] },
    { sha: "b", message: "fix(b2b): y", files: ["web/src/app/api/analytics/b2b/kpis/route.ts"] },
  ]
  test("tabsOfCommits gộp tab của cả nhóm commit", () => {
    expect(tabsOfCommits(commits)).toEqual(["Product Catalogue", "B2B"])
  })
  test("withTabsFooter thêm dòng Tab; không thêm khi tóm tắt rỗng hoặc không xác định được tab", () => {
    expect(withTabsFooter("• A\n• B", commits)).toBe("• A\n• B\n📍 Tab: Product Catalogue, B2B")
    expect(withTabsFooter("", commits)).toBe("")
    expect(withTabsFooter("• A", [{ sha: "c", message: "chore", files: ["package.json"] }])).toBe("• A")
    expect(withTabsFooter("• A", [{ sha: "c", message: "chore" }])).toBe("• A")
  })
})
