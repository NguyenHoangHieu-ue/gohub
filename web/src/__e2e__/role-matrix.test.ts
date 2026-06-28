import { test, expect, Page } from "@playwright/test"
import { DEFAULT_ROLE_PERMISSIONS, ALL_ANALYTICS_IDS } from "../lib/analytics-roles"

// E2E ma trận Role × Tab analytics. Xác minh mỗi role:
//   1. Đăng nhập được.
//   2. MỌI tab được cấp → vào được (không redirect /chatbot), không "Forbidden", có heading.
//   3. 1 tab KHÔNG cấp → bị đẩy về /chatbot (access-control hoạt động).
//
// Credentials KHÔNG để trong repo — đọc từ env: E2E_<ROLE>_USER / E2E_<ROLE>_PASS.
// Role nào thiếu cred → test.skip (CI không có cred sẽ không fail). ops-&-cs dùng key OPSCS.
// Chạy: (terminal A) npm run dev   (terminal B) npx playwright test role-matrix
//   với env: $env:E2E_CREATOR_USER="..."; $env:E2E_CREATOR_PASS="..."; ...

const ROLE_ENV: Record<string, string> = {
  admin: "ADMIN", creator: "CREATOR", bod: "BOD", b2b: "B2B", b2c: "B2C",
  saleb2c: "SALEB2C", "ops-&-cs": "OPSCS", hr: "HR", product: "PRODUCT", staff: "STAFF",
}

// id tab → đường dẫn. Chỉ giữ id có trang analytics thực (loại "info" = route /info riêng).
const TAB_PATH: Record<string, string> = {
  dashboard: "/analytics",
  ...Object.fromEntries(
    ALL_ANALYTICS_IDS.filter(id => id !== "dashboard" && id !== "info").map(id => [id, `/analytics/${id}`]),
  ),
}

function allowedTabs(role: string): string[] {
  if (role === "admin" || role === "creator") return Object.keys(TAB_PATH)
  return (DEFAULT_ROLE_PERMISSIONS[role] ?? []).filter(id => id in TAB_PATH)
}

function deniedTab(role: string): string | null {
  if (role === "admin" || role === "creator") return null
  const allowed = new Set(allowedTabs(role))
  return Object.keys(TAB_PATH).find(id => !allowed.has(id)) ?? null
}

async function login(page: Page, user: string, pass: string) {
  await page.goto("/login")
  await page.locator('input[type="text"], input[name="username"]').first().fill(user)
  await page.locator('input[type="password"]').first().fill(pass)
  await page.getByRole("button", { name: /Đăng nhập/ }).first().click()
  // Login thành công → push /chatbot
  await page.waitForURL(/\/chatbot/, { timeout: 15000 })
}

for (const [role, envKey] of Object.entries(ROLE_ENV)) {
  const user = process.env[`E2E_${envKey}_USER`]
  const pass = process.env[`E2E_${envKey}_PASS`]

  test.describe(`Role: ${role}`, () => {
    test.skip(!user || !pass, `Thiếu E2E_${envKey}_USER/PASS — bỏ qua`)

    test(`${role}: tab được cấp vào được + không Forbidden`, async ({ page }) => {
      await login(page, user!, pass!)
      for (const id of allowedTabs(role)) {
        await page.goto(TAB_PATH[id])
        // Không bị đẩy về chatbot/login
        await expect(page, `tab "${id}" phải vào được`).not.toHaveURL(/\/(chatbot|login)\b/, { timeout: 10000 })
        // Không có thông báo cấm quyền
        await expect(page.getByText(/Forbidden|403|Unauthorized/i)).toHaveCount(0)
        // Có nội dung (heading) render
        await expect(page.locator("h1, h2").first()).toBeVisible()
      }
    })

    const denied = deniedTab(role)
    test(denied ? `${role}: tab KHÔNG cấp (${denied}) → redirect /chatbot` : `${role}: full-access (bỏ qua negative)`, async ({ page }) => {
      test.skip(!denied, "Role full-access, không có tab bị cấm")
      await login(page, user!, pass!)
      await page.goto(TAB_PATH[denied!])
      await expect(page).toHaveURL(/\/chatbot/, { timeout: 10000 })
    })
  })
}
