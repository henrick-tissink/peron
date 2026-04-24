import { test, expect } from "@playwright/test";

test("home → search renders at least one result card", async ({ page }) => {
  await page.goto("/");

  const fromInput = page.getByRole("combobox", { name: /from/i });
  await fromInput.fill("Bucu");
  await page.getByRole("option", { name: /București Nord/i }).click();

  const toInput = page.getByRole("combobox", { name: /to/i });
  await toInput.fill("Bras");
  await page.getByRole("option", { name: /Brașov/i }).click();

  await page.getByRole("button", { name: /^search$/i }).click();

  await expect(page).toHaveURL(/\/search\?from=.+&to=.+&date=/);

  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();
  await expect(card.getByText("08:30")).toBeVisible();
  await expect(card.getByText(/41[,.]5/)).toBeVisible();
  await expect(card.getByText(/București Nord/)).toBeVisible();
});
