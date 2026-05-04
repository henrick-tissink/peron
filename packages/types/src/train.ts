import type { BoardStatus } from "./board.js";

export type TrainStop = {
  station: { name: string; slug: string };
  km: number | null;            // distance from origin in km, null when not reported
  platform?: string;            // "linia 3"
  arrival?: { scheduled: string; status?: BoardStatus };  // not present at origin
  departure?: { scheduled: string; status?: BoardStatus }; // not present at terminus
};

export type TrainPosition = {
  // Slugs of the two stations the train is currently between, in order of travel.
  betweenSlug: { from: string; to: string };
  // "HH:MM" — when the railway last reported the train's position.
  reportedAt: string;
  // Most-recent overall delay (matches the per-stop status of the next-due stop).
  delayMinutes?: number;
};

export type TrainResponse = {
  number: string;                       // running number, e.g. "1622"
  category: string;                     // "IR", "IC", "R-E", …
  date: string;                         // ISO YYYY-MM-DD that this view is for
  origin: string;                       // first stop name
  terminus: string;                     // last stop name
  stops: TrainStop[];
  position?: TrainPosition;             // null when train hasn't started or has finished
  updatedAt: string;                    // ISO 8601
  source: "infofer";
};
