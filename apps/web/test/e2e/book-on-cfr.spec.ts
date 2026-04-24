import { test, expect } from "@playwright/test";

test("'Book on CFR' link points to the itinerary's bookingUrl and opens in a new tab", async ({
  page,
}) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.getByRole("article").first();
  const cfrLink = card.getByRole("link", { name: /Book on CFR/i });
  await expect(cfrLink).toBeVisible();
  await expect(cfrLink).toHaveAttribute("target", "_blank");
  await expect(cfrLink).toHaveAttribute(
    "href",
    /bilete\.cfrcalatori\.ro\/ro-RO\/Rute-trenuri\/Bucuresti-Nord\/Brasov/,
  );
});
