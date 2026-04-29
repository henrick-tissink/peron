import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Station } from "@peron/types";
import { SearchForm } from "../../src/components/search-form.js";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
];

describe("SearchForm", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("renders From, To, Date controls + a submit button", () => {
    render(<SearchForm stations={stations} />);
    expect(screen.getByRole("combobox", { name: /from/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /to/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/departure date/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("submit navigates to /search with query params", async () => {
    const user = userEvent.setup();
    render(
      <SearchForm
        stations={stations}
        defaultFrom="București Nord"
        defaultTo="Brașov"
        defaultDate="2026-05-21"
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(push).toHaveBeenCalledWith(
      "/search?from=Bucure%C8%99ti+Nord&to=Bra%C8%99ov&date=2026-05-21",
    );
  });

  it("submit is disabled until From + To + Date are set", () => {
    render(<SearchForm stations={stations} />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("does not submit when From === To", async () => {
    const user = userEvent.setup();
    render(
      <SearchForm
        stations={stations}
        defaultFrom="Brașov"
        defaultTo="Brașov"
        defaultDate="2026-05-21"
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(push).not.toHaveBeenCalled();
  });
});
