import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { StationRegistry } from "../../src/stations/registry.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

const SAMPLE_LANDING = `
<html>
<script>
  var availableStations = [
    { "name": "București Nord", "isImportant": true },
    { "name": "Brașov", "isImportant": true },
    { "name": "Sinaia", "isImportant": false }
  ];
</script>
</html>
`;

describe("StationRegistry", () => {
  beforeEach(() => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse(SAMPLE_LANDING, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
  });

  it("fetches and caches the station list on first call", async () => {
    const r = new StationRegistry();
    const first = await r.getAll();
    expect(first).toHaveLength(3);
    const second = await r.getAll();
    expect(second).toBe(first);
  });

  it("exposes size", async () => {
    const r = new StationRegistry();
    await r.getAll();
    expect(r.size).toBe(3);
  });

  it("returns empty list if landing has no availableStations", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse("<html>nothing</html>", { status: 200 }),
      ),
    );
    const r = new StationRegistry();
    const stations = await r.getAll();
    expect(stations).toEqual([]);
  });

  it("invalidate() forces refetch", async () => {
    const r = new StationRegistry();
    const first = await r.getAll();
    r.invalidate();
    const second = await r.getAll();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(3);
  });
});
