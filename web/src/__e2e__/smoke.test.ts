import { test, expect } from "@playwright/test";

test.describe("GoHub Intel Web App - E2E Smoke Tests", () => {
  
  test("should load the login page or home page and render login fields", async ({ page }) => {
    // Go to the baseURL (http://localhost:3000) or directly to the login page
    // Playwright will run on local dev server or staging URL
    await page.goto("/login");
    
    // Check if the login title/card is present on the page
    const loginHeading = page.locator("h1, h2, h3, .text-2xl, .font-bold").first();
    await expect(loginHeading).toBeVisible();
    
    // Check if the email/username input is present
    const usernameInput = page.locator('input[type="email"], input[type="text"], input[name="username"]').first();
    await expect(usernameInput).toBeVisible();
    
    // Check if the password input is present
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();
  });
});
