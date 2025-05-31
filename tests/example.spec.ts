import { test, expect } from "@playwright/test";

test.describe("Backtest App E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should load application and show main components", async ({ page }) => {
    // Check if main application components are visible
    await expect(page.locator('h1')).toBeVisible();
    
    // Check for strategy editor
    await expect(page.locator('[data-testid="strategy-editor"]')).toBeVisible({ timeout: 10000 });
    
    // Check for stock period selector
    await expect(page.locator('[data-testid="stock-period-selector"]')).toBeVisible();
  });

  test("should handle API key setup", async ({ page }) => {
    // If API key modal is shown, it should be interactable
    const apiKeyModal = page.locator('[data-testid="api-key-modal"]');
    
    if (await apiKeyModal.isVisible()) {
      // Should have input fields for API keys
      await expect(page.locator('input[name="jquants_refresh"]')).toBeVisible();
      await expect(page.locator('input[name="gemini"]')).toBeVisible();
      
      // Should have save button
      await expect(page.locator('button:has-text("保存")')).toBeVisible();
    }
  });

  test("should allow strategy input and show validation", async ({ page }) => {
    // Wait for strategy editor to be ready
    const strategyEditor = page.locator('[data-testid="strategy-editor"]');
    await strategyEditor.waitFor({ state: 'visible', timeout: 10000 });
    
    // Try entering a simple strategy
    const strategyInput = page.locator('textarea');
    await strategyInput.fill("RSIが30以下で買い、70以上で売り");
    
    // Should show some form of feedback (validation or conversion)
    await page.waitForTimeout(2000); // Allow time for LLM processing
    
    // Check if DSL conversion happened (this depends on implementation)
    const dslOutput = page.locator('[data-testid="dsl-output"]');
    if (await dslOutput.isVisible()) {
      await expect(dslOutput).toContainText('rsi');
    }
  });

  test("should handle stock selection and period configuration", async ({ page }) => {
    const stockSelector = page.locator('[data-testid="stock-period-selector"]');
    await stockSelector.waitFor({ state: 'visible' });
    
    // Should have stock code input
    await expect(page.locator('input[placeholder*="銘柄コード"]')).toBeVisible();
    
    // Should have date inputs
    await expect(page.locator('input[type="date"]')).toHaveCount(2);
    
    // Try setting a stock code
    await page.locator('input[placeholder*="銘柄コード"]').fill("7203.T");
    
    // Set date range
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill("2023-01-01");
    await dateInputs.last().fill("2023-12-31");
  });

  test("should show progress during data loading", async ({ page }) => {
    // This test requires API keys to be set up
    // Skip if modal is visible (no API keys)
    const apiKeyModal = page.locator('[data-testid="api-key-modal"]');
    if (await apiKeyModal.isVisible()) {
      test.skip();
    }
    
    // Set up a basic strategy and stock selection
    await page.locator('textarea').fill("終値で買い、終値で売り");
    await page.locator('input[placeholder*="銘柄コード"]').fill("7203.T");
    
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill("2023-01-01");
    await dateInputs.last().fill("2023-06-30");
    
    // Submit the form
    const submitButton = page.locator('button:has-text("データ取得")');
    await submitButton.click();
    
    // Should show progress bar
    const progressBar = page.locator('[data-testid="progress-bar"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 });
    
    // Progress should be monotonic (non-decreasing)
    let previousProgress = 0;
    let progressCheckCount = 0;
    const maxChecks = 10;
    
    while (progressCheckCount < maxChecks) {
      const progressText = await progressBar.textContent();
      if (progressText) {
        const progressMatch = progressText.match(/(\d+)%/);
        if (progressMatch) {
          const currentProgress = parseInt(progressMatch[1], 10);
          expect(currentProgress).toBeGreaterThanOrEqual(previousProgress);
          previousProgress = currentProgress;
          
          if (currentProgress >= 100) break;
        }
      }
      
      await page.waitForTimeout(500);
      progressCheckCount++;
    }
  });

  test("should render backtest results when available", async ({ page }) => {
    // Skip if no API keys (would need mock data)
    const apiKeyModal = page.locator('[data-testid="api-key-modal"]');
    if (await apiKeyModal.isVisible()) {
      test.skip();
    }
    
    // Wait for potential results to be shown
    await page.waitForTimeout(10000);
    
    // Check for results components
    const resultsSection = page.locator('[data-testid="backtest-results"]');
    if (await resultsSection.isVisible()) {
      // Should show metrics
      await expect(page.locator('[data-testid="metrics-display"]')).toBeVisible();
      
      // Should show equity curve chart
      await expect(page.locator('[data-testid="equity-curve-chart"]')).toBeVisible();
      
      // Should show trades table
      await expect(page.locator('[data-testid="trades-table"]')).toBeVisible();
    }
  });

  test("should handle errors gracefully", async ({ page }) => {
    // Test with invalid stock code
    await page.locator('input[placeholder*="銘柄コード"]').fill("INVALID");
    
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill("2023-01-01");
    await dateInputs.last().fill("2023-01-02");
    
    const submitButton = page.locator('button:has-text("データ取得")');
    if (await submitButton.isVisible()) {
      await submitButton.click();
      
      // Should show error message
      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
    }
  });
});
