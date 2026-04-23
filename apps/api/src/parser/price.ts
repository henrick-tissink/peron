import type { PriceResponse } from "@peron/types";

export function parsePriceSnippet(html: string): PriceResponse {
  if (!html) return { ok: false, reason: "unavailable" };
  const trimmed = html.trim();
  if (trimmed === "ReCaptchaFailed" || trimmed.includes("ReCaptchaFailed")) {
    return { ok: false, reason: "unavailable" };
  }
  if (/expir/i.test(trimmed)) {
    return { ok: false, reason: "expired" };
  }
  const m = trimmed.match(/(\d+(?:[.,]\d+)?)\s*lei/i);
  if (!m || !m[1]) return { ok: false, reason: "unavailable" };
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "unavailable" };
  return { ok: true, amount: n, currency: "RON" };
}
