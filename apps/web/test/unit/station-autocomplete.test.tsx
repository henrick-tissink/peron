import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Station } from "@peron/types";
import { StationAutocomplete } from "../../src/components/station-autocomplete.js";

const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
  { name: "Sinaia", isImportant: false },
  { name: "Predeal", isImportant: false },
];

function Harness(
  overrides: Partial<{ value: string; onChange: (v: string) => void }> = {},
) {
  const onChange = overrides.onChange ?? (() => {});
  return (
    <StationAutocomplete
      name="from"
      label="From"
      stations={stations}
      value={overrides.value ?? ""}
      onChange={onChange}
    />
  );
}

describe("StationAutocomplete", () => {
  it("renders a combobox input with label", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /from/i });
    expect(input).toBeInTheDocument();
  });

  it("filters options by startsWith after typing", async () => {
    render(<Harness value="bras" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("Brașov");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).not.toContain(
      "București Nord",
    );
  });

  it("falls back to substring when no startsWith hits", () => {
    render(<Harness value="napoca" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain(
      "Cluj-Napoca",
    );
  });

  it("is diacritic-insensitive (Bucuresti matches București)", () => {
    render(<Harness value="bucuresti" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain(
      "București Nord",
    );
  });

  it("clicking an option calls onChange with the station name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="sin" onChange={onChange} />);
    await user.click(screen.getByRole("option", { name: /Sinaia/ }));
    expect(onChange).toHaveBeenCalledWith("Sinaia");
  });

  it("shows nothing when input is empty", () => {
    render(<Harness value="" />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("caps suggestions at 8 by default", () => {
    const many: Station[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Station ${i}`,
      isImportant: false,
    }));
    render(
      <StationAutocomplete
        name="from"
        label="From"
        stations={many}
        value="station"
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });

  it("ArrowDown + Enter selects the first match", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="bras" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /from/i });
    input.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("Brașov");
  });

  it("Escape clears the dropdown without changing value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="bras" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /from/i });
    input.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
