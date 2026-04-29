import { test, expect } from "@playwright/test";

test("clicking Details loads a 6×2 fare matrix with prices", async ({ page }) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.locator("button").filter({ hasText: /\d{2}:\d{2}/ }).first();
  await expect(card).toBeVisible();

  await card.click();

  const table = page.getByRole("table");
  await expect(table).toBeVisible({ timeout: 10_000 });

  const priceCells = page.getByRole("cell").filter({ hasText: /41[,.]5/ });
  await expect(priceCells).toHaveCount(12, { timeout: 10_000 });
});
