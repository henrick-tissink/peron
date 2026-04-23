import { describe, it, expect } from "vitest";
import { parsePriceSnippet } from "../../src/parser/price.js";

describe("parsePriceSnippet", () => {
  it("extracts '41,5 lei' as 41.5", () => {
    const html = `<span class="price">41,5 lei</span>`;
    expect(parsePriceSnippet(html)).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("extracts '125,00 lei' as 125.00", () => {
    const html = `<div>Pret: <strong>125,00 lei</strong></div>`;
    expect(parsePriceSnippet(html)).toEqual({ ok: true, amount: 125, currency: "RON" });
  });

  it("handles dot decimal '41.5 lei'", () => {
    const html = `<span>41.5 lei</span>`;
    expect(parsePriceSnippet(html)).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("returns ok:false with reason 'unavailable' when no price found", () => {
    expect(parsePriceSnippet("<span>no price</span>")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns ok:false with reason 'expired' when body indicates expired transaction", () => {
    const html = `<div class="error">Tranzactia a expirat</div>`;
    expect(parsePriceSnippet(html)).toEqual({ ok: false, reason: "expired" });
  });

  it("returns ok:false on captcha", () => {
    expect(parsePriceSnippet("ReCaptchaFailed")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
