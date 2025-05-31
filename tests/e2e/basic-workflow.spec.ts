import { test, expect } from "@playwright/test";

test.describe("Basic App Workflow", () => {
  test("should load the application and show main components", async ({
    page,
  }) => {
    await page.goto("/");

    // Check if the main app loads
    await expect(page).toHaveTitle(/日本株クライアントサイド・バックテスト/);

    // Check for key UI elements
    await expect(page.locator('[data-testid="api-key-modal"]')).toBeVisible();
  });

  test("should handle API key input", async ({ page }) => {
    await page.goto("/");

    // Wait for API key modal
    const modal = page.locator('[data-testid="api-key-modal"]');
    await expect(modal).toBeVisible();

    // Input J-Quants refresh token
    const tokenInput = page.locator(
      '[data-testid="jquants-refresh-token-input"]'
    );
    await tokenInput.fill("test-refresh-token");

    // Click save button
    const saveButton = page.locator('[data-testid="api-key-save-button"]');
    await saveButton.click();

    // Modal should close and stock selector should appear
    await expect(modal).not.toBeVisible();
    await expect(
      page.locator('[data-testid="stock-period-selector"]')
    ).toBeVisible();
  });

  test("should show strategy editor", async ({ page }) => {
    // Mock API response to skip real API call
    await page.route("**/jquants-api/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "mock-token" }),
      });
    });

    await page.goto("/");

    // Fill API key to proceed
    await page
      .locator('[data-testid="jquants-refresh-token-input"]')
      .fill("test-token");
    await page.locator('[data-testid="api-key-save-button"]').click();

    // Strategy editor should be visible
    await expect(page.locator('[data-testid="strategy-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="strategy-input"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="llm-provider-select"]')
    ).toBeVisible();
  });

  test("should show progress bar during data fetch", async ({ page }) => {
    // Mock slow API response
    await page.route("**/jquants-api/**", (route) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ access_token: "mock-token" }),
        });
      }, 1000);
    });

    await page.goto("/");

    // Fill form and trigger fetch
    await page
      .locator('[data-testid="jquants-refresh-token-input"]')
      .fill("test-token");
    await page.locator('[data-testid="api-key-save-button"]').click();

    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");

    // Click fetch data button
    await page.locator('[data-testid="fetch-data-button"]').click();

    // Progress bar should appear
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
  });
});
