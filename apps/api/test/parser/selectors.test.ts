import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { tryText } from "../../src/parser/selectors.js";

describe("tryText", () => {
  const html = `
    <div class="card">
      <span class="title">Hello</span>
      <span class="subtitle">   World  </span>
      <span class="empty"></span>
    </div>
  `;

  it("returns text from the first matching selector", () => {
    const $ = cheerio.load(html);
    const $card = $(".card");
    expect(tryText($, $card, [".title"])).toBe("Hello");
  });

  it("falls through to the next selector when the first returns empty", () => {
    const $ = cheerio.load(html);
    const $card = $(".card");
    expect(tryText($, $card, [".empty", ".subtitle"])).toBe("World");
  });

  it("trims whitespace", () => {
    const $ = cheerio.load(html);
    const $card = $(".card");
    expect(tryText($, $card, [".subtitle"])).toBe("World");
  });

  it("returns fallback when no selector matches", () => {
    const $ = cheerio.load(html);
    const $card = $(".card");
    expect(tryText($, $card, [".nope", ".nada"], "default")).toBe("default");
  });

  it("returns empty string when no selector matches and no fallback given", () => {
    const $ = cheerio.load(html);
    const $card = $(".card");
    expect(tryText($, $card, [".nope"])).toBe("");
  });
});
