import type { FareTypeId } from "@peron/types";

export type FareTypeEntry = { id: FareTypeId; labelKey: string };

export const FARE_TYPES: FareTypeEntry[] = [
  { id: "73", labelKey: "adult" },
  { id: "71", labelKey: "adultTrenPlus" },
  { id: "72", labelKey: "child" },
  { id: "50", labelKey: "pupil" },
  { id: "74", labelKey: "student" },
  { id: "53", labelKey: "senior" },
];

export const SERVICE_KEYS = [
  { key: "A&A", label: "Clasa 1" },
  { key: "B&B", label: "Clasa 2" },
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number]["key"];
