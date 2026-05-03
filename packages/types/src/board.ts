export type BoardDirection = "departures" | "arrivals";

export type BoardWarning =
  | { kind: "no-data" }
  | { kind: "rate-limited" }
  | { kind: "captcha" };

export type BoardStatus =
  | { kind: "on-time" }
  | { kind: "delayed"; minutes: number }
  | { kind: "cancelled" };

export type BoardEntry = {
  time: string;            // "HH:MM"
  counterpart: { name: string; slug: string }; // destination if departures, origin if arrivals
  via: string[];           // intermediate station names; [] if direct
  train: { category: string; number: string };
  // Full-journey duration. Present only when source supplies it (CFR aggregator);
  // INFOFER's station board lists timetable rows that don't include arrival-at-destination.
  durationMinutes?: number;
  // Real-time status from INFOFER, when available.
  status?: BoardStatus;
  // Platform / track designation, e.g. "5A".
  platform?: string;
  // Train operator, e.g. "CFR Călători", "Regio Călători", "Astra".
  operator?: string;
};

export type BoardResponse = {
  station: { name: string; slug: string };
  direction: BoardDirection;
  entries: BoardEntry[];
  updatedAt: string;       // ISO 8601
  // "infofer": authoritative timetable from mersultrenurilor.infofer.ro (default).
  // "aggregated": fallback synthesis from CFR booking-site route searches when INFOFER is unreachable.
  source: "infofer" | "aggregated";
  warning?: BoardWarning;
};
