import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageSelector } from "../../src/components/language-selector";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string) => k,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

describe("LanguageSelector", () => {
  it("renders all 3 locale buttons with EN active", () => {
    render(<LanguageSelector />);
    expect(screen.getByText("EN")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("RO")).toHaveAttribute("aria-current", "false");
    expect(screen.getByText("DE")).toHaveAttribute("aria-current", "false");
  });
});
