"use client";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DatePicker({
  name,
  value,
  min,
  onChange,
  label = "Departure date",
}: {
  name: string;
  value: string;
  min?: string;
  onChange: (iso: string) => void;
  label?: string;
}) {
  const minEffective = min ?? todayIso();
  const labelId = `${name}-label`;
  return (
    <div className="flex flex-col gap-1">
      <label
        id={labelId}
        htmlFor={name}
        className="sr-only"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        value={value}
        min={minEffective}
        onChange={(e) => onChange(e.target.value)}
        aria-labelledby={labelId}
        className="bg-transparent text-[var(--color-text)] font-mono text-sm w-full text-left outline-none"
      />
    </div>
  );
}

export function defaultDatePickerValue(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}
