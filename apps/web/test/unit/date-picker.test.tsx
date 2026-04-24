import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePicker } from "../../src/components/date-picker.js";

describe("DatePicker", () => {
  it("renders a native date input with name + value", () => {
    render(<DatePicker name="date" value="2026-05-21" onChange={() => {}} />);
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.name).toBe("date");
    expect(input.value).toBe("2026-05-21");
  });

  it("calls onChange with ISO date string", () => {
    const onChange = vi.fn();
    render(<DatePicker name="date" value="2026-05-21" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/departure date/i), {
      target: { value: "2026-05-22" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-05-22");
  });

  it("sets min attribute to today by default", () => {
    render(<DatePicker name="date" value="2026-05-21" onChange={() => {}} />);
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    const today = new Date().toISOString().slice(0, 10);
    expect(input.min).toBe(today);
  });

  it("accepts a custom min", () => {
    render(
      <DatePicker name="date" value="2026-05-21" min="2026-05-01" onChange={() => {}} />,
    );
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    expect(input.min).toBe("2026-05-01");
  });
});
