export type SearchError =
  | { kind: "captcha"; retryAfterSec: number }
  | { kind: "no-results" }
  | { kind: "partial"; parsedCount: number; detectedCount: number }
  | { kind: "parser-failure"; detail: string }
  | { kind: "cfr-unavailable"; httpStatus: number }
  | { kind: "our-bug"; errorId: string };
