import { test, expect } from "@playwright/test";

test("'Continue on CFR' button opens the booking modal with train info and date", async ({
  page,
}) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.locator("button").filter({ hasText: /\d{2}:\d{2}/ }).first();
  await expect(card).toBeVisible();
  await card.click();

  const cfrButton = page.getByRole("button", { name: /Continue on CFR/i }).first();
  await expect(cfrButton).toBeVisible({ timeout: 10_000 });
  await cfrButton.click();

  // Modal should open
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Modal shows the CFR-formatted date so the user knows what to enter
  await expect(dialog.getByText(/21\.05\.2026/)).toBeVisible();

  // Open CFR button is present inside the modal
  const openCfrButton = dialog.getByRole("button", { name: /Open CFR/i });
  await expect(openCfrButton).toBeVisible();
});
