import type { FareTypeId } from "@peron/types";

export type FareTypeEntry = { id: FareTypeId; label: string; labelShort: string };

export const FARE_TYPES: FareTypeEntry[] = [
  { id: "73", label: "Adult",                labelShort: "Adult" },
  { id: "71", label: "Adult + TrenPlus",     labelShort: "TrenPlus" },
  { id: "72", label: "Copil (6–14 ani)",     labelShort: "Copil" },
  { id: "50", label: "Elev",                 labelShort: "Elev" },
  { id: "74", label: "Student",              labelShort: "Student" },
  { id: "53", label: "Pensionar",            labelShort: "Pensionar" },
];

export const SERVICE_KEYS = [
  { key: "A&A", label: "Clasa 1" },
  { key: "B&B", label: "Clasa 2" },
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number]["key"];
