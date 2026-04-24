import { test, expect } from "@playwright/test";

test("clicking Details loads a 6×2 fare matrix with prices", async ({ page }) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: /Details/i }).click();

  const table = card.getByRole("table");
  await expect(table).toBeVisible();

  const priceCells = table.getByText(/41[,.]5 lei/);
  await expect(priceCells).toHaveCount(12);
});
