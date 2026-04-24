import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CfrLink } from "../../src/components/cfr-link.js";

describe("CfrLink", () => {
  it("renders an external link to cfrcalatori.ro with rel=noopener", () => {
    render(<CfrLink href="https://bilete.cfrcalatori.ro/ro-RO/Tren/1741" label="View on CFR" />);
    const a = screen.getByRole("link", { name: /View on CFR/i });
    expect(a).toHaveAttribute("href", "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(a.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("defaults label to 'Open on CFR ↗'", () => {
    render(<CfrLink href="https://cfrcalatori.ro/" />);
    expect(screen.getByRole("link", { name: /Open on CFR/i })).toBeInTheDocument();
  });

  it("rejects non-CFR hrefs by rendering nothing", () => {
    const { container } = render(<CfrLink href="https://evil.example/" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts cfrcalatori.ro without bilete.* subdomain", () => {
    render(<CfrLink href="https://cfrcalatori.ro/whatever" />);
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});
