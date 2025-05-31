import { test, expect } from "@playwright/test";

test.describe("Performance and Rendering Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route("**/jquants-api/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "mock-token" }),
      });
    });

    // Mock stock data response
    await page.route("**/daily_quotes/**", (route) => {
      // Generate mock data for performance testing
      const mockData = [];
      const startDate = new Date('2020-01-01');
      for (let i = 0; i < 1000; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        mockData.push({
          Date: date.toISOString().split('T')[0],
          Close: 100 + Math.sin(i * 0.1) * 10 + Math.random() * 5,
          Open: 99 + Math.sin(i * 0.1) * 10 + Math.random() * 5,
          High: 102 + Math.sin(i * 0.1) * 10 + Math.random() * 5,
          Low: 98 + Math.sin(i * 0.1) * 10 + Math.random() * 5,
          Volume: 1000000 + Math.random() * 500000
        });
      }
      
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ daily_quotes: mockData }),
      });
    });

    await page.goto("/");
    
    // Setup application state
    await page.locator('[data-testid="jquants-refresh-token-input"]').fill("test-token");
    await page.locator('[data-testid="api-key-save-button"]').click();
  });

  test("should render graph within 5 seconds", async ({ page }) => {
    const startTime = Date.now();
    
    // Fill form with test data
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    // Input strategy
    const strategyInput = page.locator('[data-testid="strategy-input"]');
    await strategyInput.fill(`
      {
        "type": "function_call",
        "name": "MA",
        "args": [
          {"type": "identifier", "value": "close"},
          {"type": "number", "value": 20}
        ]
      }
    `);

    // Start backtest
    await page.locator('[data-testid="run-backtest-button"]').click();

    // Wait for graph to appear
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible();
    
    const endTime = Date.now();
    const renderTime = endTime - startTime;
    
    // Verify graph renders within 5 seconds
    expect(renderTime).toBeLessThan(5000);
    
    // Verify graph contains data
    const chartCanvas = page.locator('[data-testid="backtest-chart"] canvas');
    await expect(chartCanvas).toBeVisible();
  });

  test("should show progress monitoring during backtest execution", async ({ page }) => {
    // Fill form
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    // Input strategy
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "function_call",
        "name": "RSI",
        "args": [
          {"type": "identifier", "value": "close"},
          {"type": "number", "value": 14}
        ]
      }
    `);

    // Start backtest
    await page.locator('[data-testid="run-backtest-button"]').click();

    // Progress indicators should be visible
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-text"]')).toBeVisible();
    
    // Check progress updates
    const progressText = page.locator('[data-testid="progress-text"]');
    
    // Should show initial processing state
    await expect(progressText).toContainText(/処理中|Processing|Loading/);
    
    // Wait for completion
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible({ timeout: 10000 });
    
    // Progress should complete
    await expect(progressText).toContainText(/完了|Complete|Finished/);
  });

  test("should handle large datasets efficiently", async ({ page }) => {
    // Fill form with large date range
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2010-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    // Complex strategy
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "binary_op",
        "operator": "AND",
        "left": {
          "type": "comparison",
          "operator": ">",
          "left": {
            "type": "function_call",
            "name": "RSI",
            "args": [
              {"type": "identifier", "value": "close"},
              {"type": "number", "value": 14}
            ]
          },
          "right": {"type": "number", "value": 70}
        },
        "right": {
          "type": "comparison",
          "operator": ">",
          "left": {
            "type": "function_call",
            "name": "MA",
            "args": [
              {"type": "identifier", "value": "close"},
              {"type": "number", "value": 20}
            ]
          },
          "right": {
            "type": "function_call",
            "name": "MA",
            "args": [
              {"type": "identifier", "value": "close"},
              {"type": "number", "value": 50}
            ]
          }
        }
      }
    `);

    const startTime = Date.now();
    
    // Execute backtest
    await page.locator('[data-testid="run-backtest-button"]').click();
    
    // Should complete without timeout
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible({ timeout: 15000 });
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Should complete within reasonable time for large dataset
    expect(executionTime).toBeLessThan(15000); // 15 seconds for large dataset
    
    // Chart should be responsive
    const chart = page.locator('[data-testid="backtest-chart"]');
    await expect(chart).toBeVisible();
    
    // Should be able to interact with chart
    await chart.hover();
    // Check if tooltip or interaction works
    await expect(chart).toBeVisible();
  });

  test("should maintain responsive UI during processing", async ({ page }) => {
    // Start a backtest
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "function_call",
        "name": "ATR",
        "args": [{"type": "number", "value": 14}]
      }
    `);

    await page.locator('[data-testid="run-backtest-button"]').click();

    // UI should remain responsive during processing
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    
    // Should be able to interact with other UI elements
    const settingsButton = page.locator('[data-testid="settings-button"]');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
      await page.locator('[data-testid="settings-close-button"]').click();
    }
    
    // Should be able to cancel processing
    const cancelButton = page.locator('[data-testid="cancel-button"]');
    if (await cancelButton.isVisible()) {
      // Cancel button should be clickable
      await expect(cancelButton).toBeEnabled();
    }
  });

  test("should display performance metrics", async ({ page }) => {
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "function_call",
        "name": "MA",
        "args": [
          {"type": "identifier", "value": "close"},
          {"type": "number", "value": 20}
        ]
      }
    `);

    await page.locator('[data-testid="run-backtest-button"]').click();
    
    // Wait for completion
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible();
    
    // Performance metrics should be displayed
    await expect(page.locator('[data-testid="performance-metrics"]')).toBeVisible();
    
    // Check for key metrics
    await expect(page.locator('[data-testid="total-return"]')).toBeVisible();
    await expect(page.locator('[data-testid="sharpe-ratio"]')).toBeVisible();
    await expect(page.locator('[data-testid="max-drawdown"]')).toBeVisible();
    await expect(page.locator('[data-testid="win-rate"]')).toBeVisible();
    
    // Metrics should contain numerical values
    const totalReturn = await page.locator('[data-testid="total-return"]').textContent();
    expect(totalReturn).toMatch(/[\d.-]+%/);
  });

  test("should handle memory efficiently with large datasets", async ({ page }) => {
    // Monitor memory usage (if possible in browser context)
    const startMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2010-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "function_call",
        "name": "MA",
        "args": [
          {"type": "identifier", "value": "close"},
          {"type": "number", "value": 200}
        ]
      }
    `);

    await page.locator('[data-testid="run-backtest-button"]').click();
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible();
    
    const endMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Memory usage should be reasonable (less than 100MB increase)
    const memoryIncrease = endMemory - startMemory;
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB
    
    // Page should remain responsive
    await page.locator('[data-testid="backtest-chart"]').hover();
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible();
  });

  test("should provide accurate error feedback for invalid strategies", async ({ page }) => {
    await page.locator('[data-testid="stock-code-input"]').fill("7203.T");
    await page.locator('[data-testid="start-date-input"]').fill("2020-01-01");
    await page.locator('[data-testid="end-date-input"]').fill("2023-12-31");
    
    // Invalid strategy JSON
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "invalid_function",
        "name": "UNKNOWN_INDICATOR"
      }
    `);

    await page.locator('[data-testid="run-backtest-button"]').click();
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    
    // Error should be descriptive
    const errorText = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorText).toMatch(/invalid|unknown|error/i);
    
    // Should be able to recover from error
    await page.locator('[data-testid="strategy-input"]').fill(`
      {
        "type": "function_call",
        "name": "MA",
        "args": [
          {"type": "identifier", "value": "close"},
          {"type": "number", "value": 20}
        ]
      }
    `);
    
    await page.locator('[data-testid="run-backtest-button"]').click();
    await expect(page.locator('[data-testid="backtest-chart"]')).toBeVisible();
  });
});
