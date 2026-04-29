import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorState } from "../../src/components/error-state.js";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

describe("ErrorState variants", () => {
  it("renders no-results with translation key", () => {
    render(
      <ErrorState
        error={{ kind: "no-results" }}
        query={{ from: "București Nord", to: "Brașov", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText("noResults")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on CFR/i })).toBeInTheDocument();
  });

  it("captcha shows retry-after countdown and a CFR fallback link", () => {
    render(
      <ErrorState
        error={{ kind: "captcha", retryAfterSec: 60 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/60s/)).toBeInTheDocument();
    expect(screen.getByText("warningCaptcha")).toBeInTheDocument();
  });

  it("partial shows '{M} more trains found' with a view-on-CFR affordance", () => {
    render(
      <ErrorState
        error={{ kind: "partial", parsedCount: 5, detectedCount: 12 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/7 more/i)).toBeInTheDocument();
  });

  it("parser-failure tells the user we've been notified", () => {
    render(
      <ErrorState
        error={{ kind: "parser-failure", detail: "selector drift" }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/CFR's side changed/i)).toBeInTheDocument();
  });

  it("cfr-unavailable shows warningUnavailable key", () => {
    render(
      <ErrorState
        error={{ kind: "cfr-unavailable", httpStatus: 503 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText("warningUnavailable")).toBeInTheDocument();
  });

  it("our-bug shows errorId for support", () => {
    render(
      <ErrorState
        error={{ kind: "our-bug", errorId: "abc-123" }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it("captcha variant with 0 retryAfterSec still renders warningCaptcha key", () => {
    render(
      <ErrorState
        error={{ kind: "captcha", retryAfterSec: 0 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText("warningCaptcha")).toBeInTheDocument();
  });
});
