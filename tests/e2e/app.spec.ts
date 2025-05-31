import { test, expect, Page } from "@playwright/test";

test.describe("Backtest App E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto("/");

    // Wait for the app to load
    await page.waitForLoadState("networkidle");
  });

  test("should load the main page and display key components", async ({
    page,
  }) => {
    // Check for main app elements
    await expect(page.locator("h1")).toContainText("日本株バックテスト");

    // Check for strategy editor
    await expect(page.locator('[data-testid="strategy-editor"]')).toBeVisible();

    // Check for stock selector
    await expect(page.locator('[data-testid="stock-selector"]')).toBeVisible();
  });

  test("should handle strategy input and validation", async ({ page }) => {
    // Find strategy input area
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await expect(strategyInput).toBeVisible();

    // Input a simple strategy
    await strategyInput.fill(
      "5日移動平均が20日移動平均を上回ったら買い、下回ったら売り"
    );

    // Submit strategy
    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Wait for processing
    await page.waitForTimeout(1000);

    // Check if validation passed or error message appears
    const errorMessage = page.locator('[data-testid="error-message"]');
    const successMessage = page.locator('[data-testid="success-message"]');

    const hasError = await errorMessage.isVisible();
    const hasSuccess = await successMessage.isVisible();

    expect(hasError || hasSuccess).toBe(true);
  });

  test("should display progress during backtest execution", async ({
    page,
  }) => {
    // Mock a successful strategy
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill("RSIが30以下で買い、70以上で売り");

    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Check for progress indicator
    const progressBar = page.locator('[data-testid="progress-bar"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 });

    // Progress should be monotonic (increasing)
    let previousProgress = 0;
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(500);
      const progressText = await progressBar.textContent();
      if (progressText) {
        const currentProgress = parseInt(
          progressText.match(/(\d+)%/)?.[1] || "0"
        );
        expect(currentProgress).toBeGreaterThanOrEqual(previousProgress);
        previousProgress = currentProgress;
      }
    }
  });

  test("should render results chart within 5 seconds", async ({ page }) => {
    // Set timeout for chart rendering test
    test.setTimeout(10000);

    // Input a strategy that should work
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill("移動平均クロス戦略");

    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Wait for results chart to appear (should be < 5s per requirements)
    const startTime = Date.now();
    await expect(
      page.locator('[data-testid="equity-curve-chart"]')
    ).toBeVisible({ timeout: 5000 });
    const endTime = Date.now();

    const renderTime = endTime - startTime;
    console.log(`Chart render time: ${renderTime}ms`);
    expect(renderTime).toBeLessThan(5000);
  });

  test("should display backtest metrics correctly", async ({ page }) => {
    // Input strategy and wait for results
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill("RSI戦略");

    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Wait for metrics to appear
    await expect(page.locator('[data-testid="metrics-display"]')).toBeVisible({
      timeout: 10000,
    });

    // Check for key metrics
    const cagrElement = page.locator('[data-testid="metric-cagr"]');
    const maxDdElement = page.locator('[data-testid="metric-maxdd"]');
    const sharpeElement = page.locator('[data-testid="metric-sharpe"]');

    await expect(cagrElement).toBeVisible();
    await expect(maxDdElement).toBeVisible();
    await expect(sharpeElement).toBeVisible();

    // Verify metric formats
    const cagrText = await cagrElement.textContent();
    const maxDdText = await maxDdElement.textContent();
    const sharpeText = await sharpeElement.textContent();

    // CAGR should be displayed as percentage with 2 decimal places
    expect(cagrText).toMatch(/\d+\.\d{2}%/);

    // MaxDD should be displayed as percentage with 2 decimal places (red color)
    expect(maxDdText).toMatch(/\d+\.\d{2}%/);

    // Sharpe should be displayed with 3 decimal places
    expect(sharpeText).toMatch(/\d+\.\d{3}/);
  });

  test("should display trades table with correct format", async ({ page }) => {
    // Input strategy and wait for results
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill("移動平均戦略");

    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Wait for trades table
    await expect(page.locator('[data-testid="trades-table"]')).toBeVisible({
      timeout: 10000,
    });

    // Check table headers
    const table = page.locator('[data-testid="trades-table"]');
    await expect(table.locator("th")).toContainText([
      "銘柄",
      "エントリー日",
      "エグジット日",
      "数量",
      "P&L",
    ]);

    // Check if trades have correct format
    const firstRow = table.locator("tbody tr").first();
    if (await firstRow.isVisible()) {
      // Stock code should be in format XXXX.T
      const stockCode = firstRow.locator("td").first();
      const stockCodeText = await stockCode.textContent();
      expect(stockCodeText).toMatch(/^\d{4}\.T$/);

      // Dates should be in YYYY-MM-DD format
      const entryDate = firstRow.locator("td").nth(1);
      const entryDateText = await entryDate.textContent();
      expect(entryDateText).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("should handle API key setup flow", async ({ page }) => {
    // Check if API key modal appears
    const apiKeyModal = page.locator('[data-testid="api-key-modal"]');
    if (await apiKeyModal.isVisible()) {
      // Test API key input
      const apiKeyInput = page.locator('[data-testid="api-key-input"]');
      await apiKeyInput.fill("test-api-key-12345");

      const saveButton = page.locator('[data-testid="save-api-key"]');
      await saveButton.click();

      // Modal should close
      await expect(apiKeyModal).not.toBeVisible();
    }
  });

  test("should handle stock period selection", async ({ page }) => {
    const stockSelector = page.locator('[data-testid="stock-selector"]');
    await expect(stockSelector).toBeVisible();

    // Select a stock (assuming dropdown exists)
    const stockDropdown = page.locator('[data-testid="stock-dropdown"]');
    if (await stockDropdown.isVisible()) {
      await stockDropdown.click();

      // Select first available option
      const firstOption = page.locator('[data-testid="stock-option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
      }
    }

    // Check period selector
    const periodSelector = page.locator('[data-testid="period-selector"]');
    if (await periodSelector.isVisible()) {
      await periodSelector.click();

      // Select a period
      const periodOption = page
        .locator('[data-testid="period-option"]')
        .first();
      if (await periodOption.isVisible()) {
        await periodOption.click();
      }
    }
  });

  test("should handle errors gracefully", async ({ page }) => {
    // Test with invalid strategy input
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill("無効な戦略入力!!!@#$%");

    const submitButton = page.locator('[data-testid="submit-strategy"]');
    await submitButton.click();

    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 5000,
    });

    // Error message should be user-friendly
    const errorText = await page
      .locator('[data-testid="error-message"]')
      .textContent();
    expect(errorText).toBeTruthy();
    expect(errorText?.length).toBeGreaterThan(0);
  });

  test("should persist user preferences", async ({ page }) => {
    // Make some changes to user preferences
    const apiKeyInput = page.locator('[data-testid="api-key-input"]');
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill("persistent-test-key");

      const saveButton = page.locator('[data-testid="save-api-key"]');
      await saveButton.click();
    }

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Check if preferences are persisted
    // This would depend on implementation details
  });
});
