import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { bootstrap, searchRaw, priceRaw, type CfrSession, type PriceRawParams } from "../../src/cfr/client.js";
import { BootstrapError, CaptchaError } from "../../src/cfr/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");
const CFR_BASE = "https://bilete.cfrcalatori.ro";

describe("bootstrap", () => {
  it("extracts cookie + tokens from a well-formed Rute-trenuri page", async () => {
    const html = await readFile(resolve(FIX, "bootstrap-rute-trenuri.html"), "utf8");
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "set-cookie": ".AspNetCore.Session=CfDJ8example; path=/; httponly",
          },
        }),
      ),
    );

    const result = await bootstrap("Bucuresti-Nord", "Brasov");
    expect(result.cookie).toContain(".AspNetCore.Session=");
    expect(result.confirmationKey.length).toBeGreaterThan(0);
    expect(result.requestVerificationToken.length).toBeGreaterThan(0);
  });

  it("throws BootstrapError when tokens missing from page", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse("<html><body>no tokens here</body></html>", {
          status: 200,
          headers: { "content-type": "text/html", "set-cookie": "sess=abc" },
        }),
      ),
    );

    await expect(bootstrap("Bucuresti-Nord", "Brasov")).rejects.toBeInstanceOf(BootstrapError);
  });

  it("throws CaptchaError when response body is ReCaptchaFailed", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );

    await expect(bootstrap("Bucuresti-Nord", "Brasov")).rejects.toBeInstanceOf(CaptchaError);
  });

  it("transliterates station names in the URL path", async () => {
    let capturedPath = "";
    server.use(
      http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, ({ params }) => {
        capturedPath = `${params["from"]}/${params["to"]}`;
        return new HttpResponse(
          `<html><input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="key" /></html>`,
          { status: 200, headers: { "set-cookie": "s=1" } },
        );
      }),
    );

    await bootstrap("București Nord", "Brașov");
    expect(capturedPath).toBe("Bucuresti-Nord/Brasov");
  });
});

describe("searchRaw", () => {
  const session: CfrSession = {
    cookie: "s=cookieval",
    confirmationKey: "conf-key",
    requestVerificationToken: "tok-val",
  };

  it("POSTs form-encoded body to GetItineraries with session cookie + tokens", async () => {
    let capturedCookie = "";
    let capturedBody = "";
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, async ({ request }) => {
        capturedCookie = request.headers.get("cookie") ?? "";
        capturedBody = await request.text();
        return new HttpResponse("<ul><li id='li-itinerary-0'></li></ul>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );

    const html = await searchRaw(session, {
      from: "București Nord",
      to: "Brașov",
      date: "2026-05-21",
    });

    expect(html).toContain("li-itinerary-0");
    expect(capturedCookie).toContain("s=cookieval");
    expect(capturedBody).toContain("DepartureStationName=Bucuresti+Nord");
    expect(capturedBody).toContain("ArrivalStationName=Brasov");
    expect(capturedBody).toContain("DepartureDate=21.05.2026");
    expect(capturedBody).toContain("ConfirmationKey=conf-key");
    expect(capturedBody).toContain("__RequestVerificationToken=tok-val");
  });

  it("throws CaptchaError when body is ReCaptchaFailed", async () => {
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );

    await expect(
      searchRaw(session, { from: "A", to: "B", date: "2026-05-21" }),
    ).rejects.toBeInstanceOf(CaptchaError);
  });

  it("throws UpstreamError on 5xx", async () => {
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse("internal", { status: 502 }),
      ),
    );

    const { UpstreamError } = await import("../../src/cfr/errors.js");
    await expect(
      searchRaw(session, { from: "A", to: "B", date: "2026-05-21" }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("priceRaw", () => {
  const session: CfrSession = {
    cookie: "s=ck",
    confirmationKey: "ck",
    requestVerificationToken: "tok",
  };

  const params: PriceRawParams = {
    transactionString: "opaque-tx",
    fareTypeId: "73",
    serviceKey: "A&A",
  };

  it("POSTs form-encoded body to api/ro-RO/Itineraries/Price", async () => {
    let capturedBody = "";
    server.use(
      http.post(`${CFR_BASE}/api/ro-RO/Itineraries/Price`, async ({ request }) => {
        capturedBody = await request.text();
        return new HttpResponse(`<span class="price">41,5 lei</span>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );

    const html = await priceRaw(session, params);
    expect(html).toContain("41,5 lei");
    expect(capturedBody).toContain("TransactionString=opaque-tx");
    expect(capturedBody).toContain("TicketFareTypeId=73");
    expect(decodeURIComponent(capturedBody)).toContain("TrainServiceKeys[0]=A&A");
  });

  it("throws UpstreamError on 5xx", async () => {
    server.use(
      http.post(`${CFR_BASE}/api/ro-RO/Itineraries/Price`, () =>
        new HttpResponse("down", { status: 503 }),
      ),
    );
    const { UpstreamError } = await import("../../src/cfr/errors.js");
    await expect(priceRaw(session, params)).rejects.toBeInstanceOf(UpstreamError);
  });
});
