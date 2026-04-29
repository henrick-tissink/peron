import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SplitFlap } from "../../src/components/split-flap";

afterEach(() => cleanup());

describe("SplitFlap", () => {
  it("renders a container with the value as aria-label", () => {
    render(<SplitFlap value="14:25" />);
    const el = screen.getByLabelText("14:25");
    expect(el).toBeInTheDocument();
  });

  it("with prefers-reduced-motion, snaps to value without animation", () => {
    // Mock matchMedia to return reduced-motion = true
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);

    render(<SplitFlap value="HELLO" />);
    const container = screen.getByLabelText("HELLO");
    // Wait for useEffect to run (synchronously in test env after render)
    expect(container.children.length).toBe(5);

    window.matchMedia = original;
  });
});
