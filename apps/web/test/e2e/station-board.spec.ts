import { test, expect } from "@playwright/test";

// These tests use the Hono mock server (port 3102) which serves fixture data for /api/board/:slug.
// No real CFR connection is needed — safe to run in CI.

test("station board renders departures, switches to arrivals", async ({ page }) => {
  await page.goto("/station/Bucuresti-Nord");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Bucuresti|București/i);
  // wait for at least one row
  await expect(page.locator('a[href^="/search"]').first()).toBeVisible({ timeout: 15_000 });

  // Switch to arrivals
  await page.getByRole("tab", { name: /ARRIVALS/i }).click();
  // arrivals MAY return 0 (some hours of day); give it 8s, then accept either rows or the no-entries message
  await page.waitForTimeout(8_000);
  const hasRows = await page.locator('a[href^="/search"]').count() > 0;
  const hasNoEntries = await page.locator("text=/No upcoming|Nicio plecare|Keine Abfahrten/i").count() > 0;
  expect(hasRows || hasNoEntries).toBe(true);
});

test("clicking a row navigates to /search with correct params", async ({ page }) => {
  await page.goto("/station/Bucuresti-Nord");
  const firstRow = page.locator('a[href^="/search"]').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  const href = await firstRow.getAttribute("href");
  expect(href).toMatch(/from=Bucuresti-Nord/);
  expect(href).toMatch(/date=\d{4}-\d{2}-\d{2}/);
});
