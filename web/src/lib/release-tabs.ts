// Suy ra TÊN TAB bị ảnh hưởng từ danh sách file của commit — để thông báo Lark nói rõ "cập nhật ở tab nào".
// Xác định bằng ĐƯỜNG DẪN FILE (chắc chắn, không nhờ Gemini đoán). Nhãn tab lấy từ nav.ts nên tab MỚI thêm vào
// menu tự có tên — chỉ vùng "dùng chung" (components/lib/api) mới cần bảng ánh xạ bên dưới.
import {
  ANALYTICS_GROUPS, CREATOR_GROUP, MANAGEMENT_GROUP, NAV_PRODUCT, NAV_TO_GAU, NAV_TOP,
} from "@/lib/nav"

const HREF_LABEL = new Map<string, string>()
for (const it of [
  ...NAV_TOP, ...NAV_PRODUCT, NAV_TO_GAU,
  ...ANALYTICS_GROUPS.flatMap(g => g.items), ...MANAGEMENT_GROUP.items, ...CREATOR_GROUP.items,
]) HREF_LABEL.set(it.href, it.label)

/** Tên dễ hiểu hơn nhãn menu kỹ thuật khi đưa vào thông báo cho nhân viên. */
const FRIENDLY: Record<string, string> = {
  "/chatbot": "Bé Gấu",
  "/skus": "System SKUs (Sản phẩm hệ thống)",
  "/analytics/fulfillment": "Inventory (Tồn kho)",
  "/analytics/creator/ai": "Gấu Pro",
}

const SYNC_LABEL = "Đồng bộ dữ liệu sản phẩm (chạy nền)"

/** API route `/api/analytics/<name>` → href của tab. Tên không có ở đây sẽ thử khớp thẳng `/analytics/<name>`. */
const API_ANALYTICS: [RegExp, string][] = [
  [/^product-catalogue/, "/analytics/catalogue"],
  [/^(b2b|strategic-performance)/, "/analytics/b2b"],
  [/^b2c/, "/analytics/b2c"],
  [/^(quarterly|squad-progress|monthly-kpis)/, "/analytics/quarterly"],
  [/^bod/, "/analytics/bod"],
  [/^(ga4|gsc|website)/, "/analytics/website"],
  [/^(staff|staff-performance)/, "/analytics/staff"],
  [/^(order|orders)/, "/analytics/orders"],
  [/^(fulfillment|inventory)/, "/analytics/fulfillment"],
  [/^3hk/, "/analytics/3hk-usage"],
  [/^(cs-|lark-tickets)/, "/analytics/cs-troubleshoot"],
  [/^(products|product-)/, "/analytics/products"],
  [/^(okr|my-metrics)/, "/analytics/my-metrics"],
  [/^(data-health|db-status)/, "/analytics/creator/devtools"],
]

/** API route cấp cao `/api/<name>` → href. */
const API_TOP: Record<string, string> = {
  chat: "/chatbot", skus: "/skus", items: "/skus", listings: "/skus", products: "/skus",
  ncc: "/ncc", countries: "/countries", promotions: "/promotions", "to-gau": "/analytics/to-gau",
  admin: "/admin", "creator-ai": "/analytics/creator/ai", users: "/analytics/users",
}

/** Thư mục dùng chung (components/lib) → href. Khớp theo tiền tố, kiểm theo thứ tự. */
const SHARED: [string, string][] = [
  ["components/catalogue/", "/analytics/catalogue"], ["lib/catalogue/", "/analytics/catalogue"],
  ["components/quarterly", "/analytics/quarterly"], ["components/my-metrics/", "/analytics/my-metrics"],
  ["components/to-gau/", "/analytics/to-gau"], ["components/channels/", "/analytics/channels"],
  ["components/inventory/", "/analytics/fulfillment"], ["components/b2c", "/analytics/b2c"],
  ["lib/agents/be-gau", "/chatbot"], ["lib/agents/creator", "/analytics/creator/ai"],
  ["lib/b2b-", "/analytics/b2b"], ["lib/weekly-report/", "/analytics/scheduled"],
  ["lib/scheduled-", "/analytics/scheduled"],
]

function labelFor(href: string): string | null {
  const l = HREF_LABEL.get(href)
  if (l) return FRIENDLY[href] ?? l
  // Trang có thật nhưng không nằm trong menu (VD My Metrics chỉ vài người thấy) → tên từ đoạn URL cuối: "my-metrics" → "My Metrics"
  const seg = href.split("/").filter(Boolean).pop()
  if (seg && href.startsWith("/analytics/") && /^[a-z0-9-]+$/.test(seg)) {
    return seg.split("-").map(w => (/^\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ")
  }
  return null
}

function tabForFile(pathIn: string): string | null {
  const p = pathIn.replace(/\\/g, "/").replace(/^web\/src\//, "")
  if (/^(backend\/data_sync\/|\.github\/workflows\/sync\.yml)/.test(pathIn.replace(/\\/g, "/"))) return SYNC_LABEL

  let m = p.match(/^app\/\(dashboard\)\/analytics\/([^/]+)(?:\/([^/]+))?/)
  if (m) {
    const [, a, b] = m
    if (a === "layout.tsx") return null
    if (a === "page.tsx") return labelFor("/analytics")
    if (b) { const l = labelFor(`/analytics/${a}/${b}`); if (l) return l }
    return labelFor(`/analytics/${a}`)
  }
  m = p.match(/^app\/\(dashboard\)\/([^/]+)/)
  if (m && m[1] !== "layout.tsx") return labelFor(`/${m[1]}`)

  m = p.match(/^app\/api\/analytics\/([^/]+)/)
  if (m) {
    for (const [re, href] of API_ANALYTICS) if (re.test(m[1])) return labelFor(href)
    return labelFor(`/analytics/${m[1]}`)
  }
  m = p.match(/^app\/api\/([^/]+)/)
  if (m && API_TOP[m[1]]) return labelFor(API_TOP[m[1]])

  for (const [prefix, href] of SHARED) if (p.startsWith(prefix)) return labelFor(href)
  if (p.startsWith("components/notification-bell")) return "Chuông thông báo"
  return null
}

/** Danh sách tên tab (không trùng, giữ thứ tự xuất hiện, tối đa `max`) bị ảnh hưởng bởi các file. */
export function tabsForFiles(files: string[] | undefined | null, max = 6): string[] {
  const out: string[] = []
  for (const f of files ?? []) {
    const t = tabForFile(String(f))
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}
