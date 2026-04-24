import { describe, it, expect, beforeAll } from "vitest";
import { http, passthrough } from "msw";
import { server } from "../setup.js";

const LIVE = process.env.PERON_LIVE === "1";
const CFR_BASE = "https://bilete.cfrcalatori.ro";

// Allow real outbound traffic in live tests.
beforeAll(() => {
  server.use(http.all(`${CFR_BASE}/*`, () => passthrough()));
});

describe.runIf(LIVE)("@live — CFR parser end-to-end", () => {
  it("can bootstrap a session", async () => {
    const { bootstrap } = await import("../../src/cfr/client.js");
    const result = await bootstrap("Bucuresti-Nord", "Brasov");
    expect(result.cookie.length).toBeGreaterThan(0);
    expect(result.confirmationKey.length).toBeGreaterThan(0);
    expect(result.requestVerificationToken.length).toBeGreaterThan(0);
  }, 30_000);

  it("can fetch a search result and parse at least one itinerary", async () => {
    const { bootstrap, searchRaw } = await import("../../src/cfr/client.js");
    const { parseItineraries } = await import("../../src/parser/itinerary.js");

    const session = await bootstrap("Bucuresti-Nord", "Brasov");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 30);
    const iso = tomorrow.toISOString().slice(0, 10);

    const html = await searchRaw(session, {
      from: "București Nord",
      to: "Brașov",
      date: iso,
    });
    const result = parseItineraries(html, "live");
    expect(result.itineraries.length).toBeGreaterThan(0);
    expect(result.meta.parseSuccessRate).toBeGreaterThanOrEqual(0.8);
  }, 30_000);

  it("can fetch the stations landing page and extract >1000 stations", async () => {
    const { fetchStationsPage } = await import("../../src/cfr/client.js");
    const { extractAvailableStations } = await import("../../src/parser/stations.js");
    const html = await fetchStationsPage();
    const stations = extractAvailableStations(html);
    expect(stations.length).toBeGreaterThan(1000);
  }, 30_000);
});
