export type BoardDirection = "departures" | "arrivals";

export type BoardWarning =
  | { kind: "no-data" }
  | { kind: "rate-limited" }
  | { kind: "captcha" };

export type BoardEntry = {
  time: string;            // "HH:MM"
  counterpart: { name: string; slug: string }; // destination if departures, origin if arrivals
  via: string[];           // intermediate station names; [] if direct
  train: { category: string; number: string };
  durationMinutes: number;
};

export type BoardResponse = {
  station: { name: string; slug: string };
  direction: BoardDirection;
  entries: BoardEntry[];
  updatedAt: string;       // ISO 8601
  source: "aggregated";
  warning?: BoardWarning;
};
