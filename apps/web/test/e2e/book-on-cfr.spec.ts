import { test, expect } from "@playwright/test";

test("'Book on CFR' link points to the itinerary's bookingUrl and opens in a new tab", async ({
  page,
}) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.locator("button").filter({ hasText: /\d{2}:\d{2}/ }).first();
  await expect(card).toBeVisible();
  await card.click();

  const cfrLink = page.getByRole("link", { name: /Book on CFR/i }).first();
  await expect(cfrLink).toBeVisible({ timeout: 10_000 });
  await expect(cfrLink).toHaveAttribute("target", "_blank");
  await expect(cfrLink).toHaveAttribute(
    "href",
    /bilete\.cfrcalatori\.ro\/ro-RO\/Rute-trenuri\/Bucuresti-Nord\/Brasov/,
  );
});
