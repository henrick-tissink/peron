# Plan 2 — Backend (CFR client, session pool, HTML parser, endpoints)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a working `apps/api` that serves `GET /api/stations`, `POST /api/search`, and `POST /api/price` backed by a pool of warm CFR sessions, a defensive cheerio+Zod HTML parser, rate limits, structured logs, and a nightly live-test workflow.

**Architecture:** Hono v4 app wires three subsystems — (1) a thin CFR `fetch` client that speaks form-encoded ASP.NET; (2) an in-memory session pool of up to 3 warm sessions with per-session serialized queues, age-based refresh (15 min), captcha-eviction, and a 3-in-60s circuit breaker; (3) a cheerio+Zod parser with 6 golden fixtures and drop-invalid behavior. A `transactionString → sessionId` pin map (30 min TTL) routes `/api/price` back to the issuing session. MSW v2 mocks outbound CFR fetches in tests; `*.live.test.ts` files run only when `PERON_LIVE=1`.

**Tech Stack:** Hono 4.10+, cheerio 1.0+, zod 3.23+, pino 9.5+, `hono-rate-limiter` 0.5+, MSW 2.6+, nanoid 5+, Vitest 2.1+, Node 22.

**Execution note:** The plan is organized into six sections. Each section produces a coherent checkpoint — at section boundaries, typecheck/test should be green. Use those as natural review points when executing subagent-driven.

- **Section A — Foundations** (Tasks 1–2): deps, types updates, tsconfig tightening, MSW + live-test harness.
- **Section B — Parser + fixtures** (Tasks 3–7): pure utilities, Zod schemas, golden fixtures, `parseItineraries`.
- **Section C — CFR client** (Tasks 8–11): `bootstrap`, `searchRaw`, `priceRaw`, `fetchStationsPage`.
- **Section D — Session pool + pinning** (Tasks 12–16): Session class, pool with per-session queues, refresh-on-age, circuit breaker, transactionString pin map.
- **Section E — Registry + middleware + endpoints** (Tasks 17–23): station registry, logger, CORS, rate limiter, app refactor, three endpoints.
- **Section F — Polish + live tests** (Tasks 24–25): scaffolding cleanup, `.env.example`, nightly GitHub Action.

---

## File structure

```
apps/api/
├── .env.example                            # CFR_BASE_URL, PERON_WEB_ORIGIN, LOG_LEVEL, PORT
├── package.json                            # + zod, cheerio, pino, msw, nanoid, hono-rate-limiter
├── tsconfig.json                           # unchanged
├── tsconfig.build.json                     # unchanged
├── vitest.config.ts                        # + setupFiles, live gating via PERON_LIVE
├── src/
│   ├── index.ts                            # entry: serve(app)
│   ├── app.ts                              # Hono app wiring + middleware + routes
│   ├── cfr/
│   │   ├── client.ts                       # bootstrap, searchRaw, priceRaw, fetchStationsPage
│   │   ├── slug.ts                         # toStationSlug
│   │   ├── errors.ts                       # CaptchaError, UpstreamError, TokenExpiredError
│   │   └── form.ts                         # URL-encoded form body builder
│   ├── parser/
│   │   ├── itinerary.ts                    # parseItineraries, parseOne
│   │   ├── duration.ts                     # parseDuration
│   │   ├── selectors.ts                    # tryText helper
│   │   ├── schemas.ts                      # Zod ItinerarySchema, PriceSchema
│   │   ├── price.ts                        # parsePriceSnippet
│   │   └── stations.ts                     # extractAvailableStations (regex over landing page)
│   ├── pool/
│   │   ├── session.ts                      # Session class + state machine
│   │   ├── queue.ts                        # per-session serialized queue
│   │   ├── pool.ts                         # SessionPool
│   │   └── breaker.ts                      # CircuitBreaker
│   ├── stations/
│   │   └── registry.ts                     # in-memory station list cache
│   ├── pins.ts                             # transactionString → sessionId map (30min TTL)
│   ├── middleware/
│   │   ├── cors.ts
│   │   ├── rate-limit.ts
│   │   └── logger.ts
│   └── routes/
│       ├── stations.ts                     # GET /api/stations
│       ├── search.ts                       # POST /api/search
│       └── price.ts                        # POST /api/price
└── test/
    ├── setup.ts                            # MSW setupServer
    ├── fixtures/
    │   ├── direct-bucuresti-brasov.html
    │   ├── with-transfer-bucuresti-sibiu.html
    │   ├── sleeper-bucuresti-cluj.html
    │   ├── international-timisoara-budapest.html
    │   ├── no-results-remote-pair.html
    │   ├── captcha-response.txt
    │   ├── bootstrap-rute-trenuri.html
    │   ├── stations-landing.html
    │   └── price-snippet.html
    ├── health.test.ts                      # (existing, cleaned up in Task 24)
    ├── parser/
    │   ├── slug.test.ts
    │   ├── duration.test.ts
    │   ├── selectors.test.ts
    │   └── itinerary.test.ts
    ├── cfr/
    │   └── client.test.ts
    ├── pool/
    │   ├── session.test.ts
    │   ├── pool.test.ts
    │   └── breaker.test.ts
    ├── pins.test.ts
    ├── stations/
    │   └── registry.test.ts
    ├── routes/
    │   ├── stations.test.ts
    │   ├── search.test.ts
    │   └── price.test.ts
    └── live/
        └── cfr.live.test.ts
scripts/
└── capture-fixtures.ts                      # run against real CFR to refresh fixtures

packages/types/src/
├── station.ts                               # + StationQuery, StationSearchResult
└── index.ts                                 # re-export new types

.github/workflows/
└── live.yml                                 # nightly @live test workflow
```

---

# Section A — Foundations

## Task 1: Install runtime + dev deps; tighten tsconfig; extend @peron/types

**Files:**
- Modify: `apps/api/package.json`
- Modify: `tsconfig.base.json`
- Create: `packages/types/src/stations-query.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1.1: Add api deps — edit `apps/api/package.json`**

Full file:
```json
{
  "name": "@peron/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@peron/types": "workspace:*",
    "cheerio": "^1.0.0",
    "hono": "^4.10.8",
    "hono-rate-limiter": "^0.5.3",
    "nanoid": "^5.0.9",
    "pino": "^9.5.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "msw": "^2.6.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 1.2: Enable `exactOptionalPropertyTypes` in `tsconfig.base.json`**

Full file:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

Why: the Itinerary shape is optional-field-heavy (`platform?`, `warning: X | null`). `exactOptionalPropertyTypes` catches `foo: undefined` being passed where the field was meant to be absent — prevents subtle bugs when we start building Zod-validated objects.

- [ ] **Step 1.3: Create `packages/types/src/stations-query.ts`**

```ts
import type { Station } from "./station.js";

export type StationQuery = {
  q: string;
  limit?: number;
};

export type StationSearchResult = {
  stations: Station[];
  total: number;
};
```

- [ ] **Step 1.4: Update `packages/types/src/index.ts`**

```ts
export type { Station } from "./station.js";
export type {
  Itinerary,
  TrainSegment,
  Services,
  PriceFrom,
} from "./itinerary.js";
export type { SearchRequest, SearchResponse } from "./search.js";
export type { PriceRequest, PriceResponse, FareTypeId } from "./price.js";
export type { SearchError } from "./error.js";
export type { StationQuery, StationSearchResult } from "./stations-query.js";
```

- [ ] **Step 1.5: Install deps**

Run: `pnpm install`
Expected: installs cheerio, zod, pino, msw, nanoid, hono-rate-limiter. Exits 0.

- [ ] **Step 1.6: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: PASS across types, api, web. Exits 0. (If `exactOptionalPropertyTypes` flags an existing file, fix inline — likely in `apps/api/src/index.ts` where `platform?` lives nowhere yet, so no hits expected.)

- [ ] **Step 1.7: Commit**

```bash
git add apps/api/package.json tsconfig.base.json packages/types/ pnpm-lock.yaml
git commit -m "chore(api): add parser/pool deps + exactOptionalPropertyTypes + stations-query types"
```

---

## Task 2: MSW + live-test harness (test setup file, vitest config)

**Files:**
- Create: `apps/api/test/setup.ts`
- Modify: `apps/api/vitest.config.ts`
- Create: `apps/api/test/msw-smoke.test.ts` (temporary sanity test, deleted at end of task)

- [ ] **Step 2.1: Create `apps/api/test/setup.ts`**

```ts
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
```

Why `onUnhandledRequest: 'error'`: any test that makes an outbound fetch without registering a mock should fail loudly — prevents accidental hits to real CFR during `pnpm test`.

- [ ] **Step 2.2: Update `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

const live = process.env.PERON_LIVE === "1";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: live
      ? ["test/**/*.test.ts", "test/**/*.live.test.ts"]
      : ["test/**/*.test.ts"],
    exclude: live ? [] : ["test/**/*.live.test.ts"],
  },
});
```

Why: vitest's default glob matches `*.live.test.ts` too, so `exclude` is the actual gate. Setting both `include` and `exclude` makes the intent explicit and defends against future vitest defaults changing.

- [ ] **Step 2.3: Write a smoke test at `apps/api/test/msw-smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup.js";

describe("MSW harness", () => {
  it("intercepts outbound fetch from inside a test", async () => {
    server.use(
      http.get("https://example.test/ping", () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    const res = await fetch("https://example.test/ping");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("fails loudly on unhandled outbound fetch", async () => {
    await expect(fetch("https://not-mocked.test/")).rejects.toThrow();
  });
});
```

- [ ] **Step 2.4: Run tests**

Run: `pnpm --filter @peron/api test`
Expected: PASS — all 4 tests (2 existing health + 2 new smoke). If the first smoke test fails with a "cannot find msw" error, re-run `pnpm install`.

- [ ] **Step 2.5: Delete the smoke test**

```bash
rm apps/api/test/msw-smoke.test.ts
```

Smoke test has served its purpose — confirmed MSW is wired. Parser tests will exercise the harness properly from here on.

- [ ] **Step 2.6: Re-run tests to confirm clean state**

Run: `pnpm --filter @peron/api test`
Expected: PASS — 2 tests (health + stations-sample only). Exits 0.

- [ ] **Step 2.7: Commit**

```bash
git add apps/api/test/setup.ts apps/api/vitest.config.ts
git commit -m "test(api): wire MSW harness + live-test gating via PERON_LIVE"
```

---

# Section B — Parser + fixtures

## Task 3: Parser utilities — slug, duration, tryText (TDD)

**Files:**
- Create: `apps/api/src/parser/duration.ts`
- Create: `apps/api/src/parser/selectors.ts`
- Create: `apps/api/src/cfr/slug.ts`
- Create: `apps/api/test/parser/duration.test.ts`
- Create: `apps/api/test/parser/selectors.test.ts`
- Create: `apps/api/test/parser/slug.test.ts`

### Duration

- [ ] **Step 3.1: Write failing tests at `apps/api/test/parser/duration.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseDuration } from "../../src/parser/duration.js";

describe("parseDuration", () => {
  it("parses '2h 30m'", () => {
    expect(parseDuration("2h 30m")).toEqual({ hours: 2, minutes: 30 });
  });

  it("parses '2h' (no minutes)", () => {
    expect(parseDuration("2h")).toEqual({ hours: 2, minutes: 0 });
  });

  it("parses '45m' only", () => {
    expect(parseDuration("45m")).toEqual({ hours: 0, minutes: 45 });
  });

  it("parses '2:30' colon format", () => {
    expect(parseDuration("2:30")).toEqual({ hours: 2, minutes: 30 });
  });

  it("parses Romanian '2 h 30 min' with spaces", () => {
    expect(parseDuration("2 h 30 min")).toEqual({ hours: 2, minutes: 30 });
  });

  it("returns zeros on unknown format", () => {
    expect(parseDuration("something weird")).toEqual({ hours: 0, minutes: 0 });
  });

  it("returns zeros on empty string", () => {
    expect(parseDuration("")).toEqual({ hours: 0, minutes: 0 });
  });

  it("normalizes minutes > 59 from minutes-only input", () => {
    expect(parseDuration("125m")).toEqual({ hours: 2, minutes: 5 });
  });
});
```

- [ ] **Step 3.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test duration`
Expected: FAIL — cannot resolve `../../src/parser/duration.js`.

- [ ] **Step 3.3: Implement `apps/api/src/parser/duration.ts`**

```ts
export type Duration = { hours: number; minutes: number };

export function parseDuration(input: string): Duration {
  if (!input) return { hours: 0, minutes: 0 };
  const s = input.trim().toLowerCase();

  const hm = s.match(/(\d+)\s*h\s*(?:(\d+)\s*min?)?/);
  if (hm && hm[1]) {
    return {
      hours: parseInt(hm[1], 10),
      minutes: hm[2] ? parseInt(hm[2], 10) : 0,
    };
  }

  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon && colon[1] && colon[2]) {
    return { hours: parseInt(colon[1], 10), minutes: parseInt(colon[2], 10) };
  }

  const mOnly = s.match(/^(\d+)\s*min?$/);
  if (mOnly && mOnly[1]) {
    const t = parseInt(mOnly[1], 10);
    return { hours: Math.floor(t / 60), minutes: t % 60 };
  }

  return { hours: 0, minutes: 0 };
}
```

- [ ] **Step 3.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test duration`
Expected: PASS — 8 tests. Exits 0.

### tryText selector helper

- [ ] **Step 3.5: Write failing tests at `apps/api/test/parser/selectors.test.ts`**

```ts
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
```

- [ ] **Step 3.6: Run tests, verify fail**

Run: `pnpm --filter @peron/api test selectors`
Expected: FAIL — cannot resolve selectors module.

- [ ] **Step 3.7: Implement `apps/api/src/parser/selectors.ts`**

```ts
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export function tryText(
  _$: CheerioAPI,
  $root: Cheerio<AnyNode>,
  selectors: string[],
  fallback = "",
): string {
  for (const sel of selectors) {
    const txt = $root.find(sel).first().text().trim();
    if (txt.length > 0) return txt;
  }
  return fallback;
}
```

Note: `$` is intentionally unused (prefixed `_`) — callers pass it for consistency with a possible future variant that works on document-root selectors.

- [ ] **Step 3.8: Run tests, verify pass**

Run: `pnpm --filter @peron/api test selectors`
Expected: PASS — 5 tests. Exits 0.

### toStationSlug

- [ ] **Step 3.9: Write failing tests at `apps/api/test/parser/slug.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { toStationSlug } from "../../src/cfr/slug.js";

describe("toStationSlug", () => {
  it("transliterates ă/î/â to a/i/a", () => {
    expect(toStationSlug("Brașov")).toBe("Brasov");
    expect(toStationSlug("Câmpulung")).toBe("Campulung");
    expect(toStationSlug("Bistrița")).toBe("Bistrita");
  });

  it("transliterates Ș/Ț with comma-below", () => {
    expect(toStationSlug("București Nord")).toBe("Bucuresti-Nord");
    expect(toStationSlug("Târgoviște")).toBe("Targoviste");
  });

  it("transliterates Ş/Ţ with cedilla (legacy encoding)", () => {
    // Legacy CFR data sometimes uses cedilla variants
    expect(toStationSlug("Bucureşti Nord")).toBe("Bucuresti-Nord");
  });

  it("replaces spaces with single hyphens", () => {
    expect(toStationSlug("Cluj Napoca")).toBe("Cluj-Napoca");
    expect(toStationSlug("  Cluj   Napoca  ")).toBe("Cluj-Napoca");
  });

  it("collapses multiple hyphens", () => {
    expect(toStationSlug("Cluj--Napoca")).toBe("Cluj-Napoca");
  });

  it("preserves existing hyphens", () => {
    expect(toStationSlug("Cluj-Napoca")).toBe("Cluj-Napoca");
  });

  it("strips non-alphanumeric punctuation (keeps hyphen)", () => {
    expect(toStationSlug("Piatra Neamț.")).toBe("Piatra-Neamt");
    expect(toStationSlug("Sf. Gheorghe")).toBe("Sf-Gheorghe");
  });

  it("returns empty string on empty input", () => {
    expect(toStationSlug("")).toBe("");
  });
});
```

- [ ] **Step 3.10: Run tests, verify fail**

Run: `pnpm --filter @peron/api test slug`
Expected: FAIL — cannot resolve slug module.

- [ ] **Step 3.11: Implement `apps/api/src/cfr/slug.ts`**

```ts
const RO_MAP: Record<string, string> = {
  "Ș": "S", "ș": "s",
  "Ț": "T", "ț": "t",
  "Ş": "S", "ş": "s",
  "Ţ": "T", "ţ": "t",
};

export function toStationSlug(name: string): string {
  if (!name) return "";
  const mapped = name.replace(/[ȘșȚțŞşŢţ]/g, (ch) => RO_MAP[ch] ?? ch);
  const stripped = mapped.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return stripped
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
```

Why the explicit RO_MAP: `Ș` (U+0218, comma-below) and `Ş` (U+015E, cedilla) aren't caught by `NFD + \p{Diacritic}` on all Node versions — and CFR data mixes both encodings historically. Explicit mapping is the only reliable path.

- [ ] **Step 3.12: Run tests, verify pass**

Run: `pnpm --filter @peron/api test slug`
Expected: PASS — 8 tests. Exits 0.

- [ ] **Step 3.13: Commit**

```bash
git add apps/api/src/parser/duration.ts apps/api/src/parser/selectors.ts apps/api/src/cfr/slug.ts apps/api/test/parser/
git commit -m "feat(api): parser utilities — parseDuration, tryText, toStationSlug"
```

---

## Task 4: Zod schemas for Itinerary and Price

**Files:**
- Create: `apps/api/src/parser/schemas.ts`
- Create: `apps/api/test/parser/schemas.test.ts`

- [ ] **Step 4.1: Write failing tests at `apps/api/test/parser/schemas.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ItinerarySchema, PriceSnippetSchema } from "../../src/parser/schemas.js";

const validItinerary = {
  id: "itinerary-0",
  transactionString: "opaque-token-xyz",
  sessionId: "sess-abc",
  departure: { time: "08:30", station: "București Nord" },
  arrival: { time: "11:00", station: "Brașov" },
  duration: { hours: 2, minutes: 30 },
  segments: [
    {
      trainCategory: "IR",
      trainNumber: "1741",
      from: "București Nord",
      to: "Brașov",
      departTime: "08:30",
      arriveTime: "11:00",
    },
  ],
  transferCount: 0,
  priceFrom: {
    amount: 41.5,
    currency: "RON" as const,
    fareType: "Adult" as const,
    class: "2" as const,
  },
  services: {
    bikeCar: false,
    barRestaurant: true,
    sleeper: false,
    couchette: false,
    onlineBuying: true,
  },
  trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
  bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=20.04.2026",
};

describe("ItinerarySchema", () => {
  it("accepts a valid itinerary", () => {
    const result = ItinerarySchema.safeParse(validItinerary);
    expect(result.success).toBe(true);
  });

  it("accepts null priceFrom", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, priceFrom: null });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields (forward-compat)", () => {
    const withExtra = { ...validItinerary, newCfrField: "whatever" };
    const result = ItinerarySchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("newCfrField" in result.data).toBe(false);
    }
  });

  it("rejects missing id", () => {
    const { id: _id, ...bad } = validItinerary;
    const result = ItinerarySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty segments array", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, segments: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = ItinerarySchema.safeParse({
      ...validItinerary,
      departure: { ...validItinerary.departure, time: "not-a-time" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative transferCount", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, transferCount: -1 });
    expect(result.success).toBe(false);
  });
});

describe("PriceSnippetSchema", () => {
  it("accepts a well-formed price payload", () => {
    const result = PriceSnippetSchema.safeParse({ amount: 41.5, currency: "RON" });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive amount", () => {
    expect(PriceSnippetSchema.safeParse({ amount: 0, currency: "RON" }).success).toBe(false);
    expect(PriceSnippetSchema.safeParse({ amount: -1, currency: "RON" }).success).toBe(false);
  });

  it("rejects currency other than RON", () => {
    expect(PriceSnippetSchema.safeParse({ amount: 41.5, currency: "EUR" }).success).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test schemas`
Expected: FAIL — cannot resolve schemas module.

- [ ] **Step 4.3: Implement `apps/api/src/parser/schemas.ts`**

```ts
import { z } from "zod";

const TimeSchema = z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM format");

const StationStopSchema = z.object({
  time: TimeSchema,
  station: z.string().min(1),
  platform: z.string().optional(),
});

const SegmentSchema = z.object({
  trainCategory: z.string().min(1),
  trainNumber: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  departTime: TimeSchema,
  arriveTime: TimeSchema,
});

const ServicesSchema = z.object({
  bikeCar: z.boolean(),
  barRestaurant: z.boolean(),
  sleeper: z.boolean(),
  couchette: z.boolean(),
  onlineBuying: z.boolean(),
});

const PriceFromSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal("RON"),
  fareType: z.literal("Adult"),
  class: z.enum(["1", "2"]),
});

export const ItinerarySchema = z.object({
  id: z.string().regex(/^itinerary-\d+$/),
  transactionString: z.string().min(1),
  sessionId: z.string().min(1),
  departure: StationStopSchema,
  arrival: StationStopSchema,
  duration: z.object({
    hours: z.number().int().min(0),
    minutes: z.number().int().min(0).max(59),
  }),
  segments: z.array(SegmentSchema).min(1),
  transferCount: z.number().int().min(0),
  priceFrom: PriceFromSchema.nullable(),
  services: ServicesSchema,
  trainDetailUrl: z.string().url(),
  bookingUrl: z.string().url(),
});

export const PriceSnippetSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal("RON"),
});

export type ItineraryParsed = z.infer<typeof ItinerarySchema>;
export type PriceSnippetParsed = z.infer<typeof PriceSnippetSchema>;
```

Why `.strip()` (default, no call needed): CFR may add fields; `.strict()` would reject otherwise-valid cards on any new attribute. Forward-compat wins.

- [ ] **Step 4.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test schemas`
Expected: PASS — 10 tests. Exits 0.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/parser/schemas.ts apps/api/test/parser/schemas.test.ts
git commit -m "feat(api): Zod schemas for Itinerary + price snippet"
```

---

## Task 5: Capture golden HTML fixtures

**Files:**
- Create: `apps/api/scripts/capture-fixtures.ts`
- Create: `apps/api/test/fixtures/direct-bucuresti-brasov.html`
- Create: `apps/api/test/fixtures/with-transfer-bucuresti-sibiu.html`
- Create: `apps/api/test/fixtures/sleeper-bucuresti-cluj.html`
- Create: `apps/api/test/fixtures/international-timisoara-budapest.html`
- Create: `apps/api/test/fixtures/no-results-remote-pair.html`
- Create: `apps/api/test/fixtures/captcha-response.txt`
- Create: `apps/api/test/fixtures/bootstrap-rute-trenuri.html`
- Create: `apps/api/test/fixtures/stations-landing.html`
- Create: `apps/api/test/fixtures/price-snippet.html`

**Context:** Fixtures are the ground truth for the parser. They're captured from real CFR once, committed to the repo, and replayed via MSW in every test run. The capture script lives inside `apps/api/` so `tsx` resolves from `apps/api/node_modules/.bin`. The capture script is rerun whenever CFR's HTML drifts (usually once a quarter). Target dates for search queries are 30 days out so the fixtures stay internally consistent.

- [ ] **Step 5.1: Create `apps/api/scripts/capture-fixtures.ts`**

```ts
/**
 * Capture golden HTML fixtures from real CFR.
 * Run: pnpm --filter @peron/api exec tsx scripts/capture-fixtures.ts
 * Rerun quarterly or when parser tests fail against live CFR.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../test/fixtures");
const BASE = "https://bilete.cfrcalatori.ro";

// Target date: 30 days out — far enough ahead that results are stable and don't sell out mid-capture
const target = new Date();
target.setDate(target.getDate() + 30);
const dd = String(target.getDate()).padStart(2, "0");
const mm = String(target.getMonth() + 1).padStart(2, "0");
const yyyy = target.getFullYear();
const formDate = `${dd}.${mm}.${yyyy} 00:00:00`;

type Pair = { from: string; to: string; file: string };
const PAIRS: Pair[] = [
  { from: "Bucuresti-Nord", to: "Brasov",             file: "direct-bucuresti-brasov.html" },
  { from: "Bucuresti-Nord", to: "Sibiu",              file: "with-transfer-bucuresti-sibiu.html" },
  { from: "Bucuresti-Nord", to: "Cluj-Napoca",        file: "sleeper-bucuresti-cluj.html" },
  { from: "Timisoara-Nord", to: "Budapesta-Keleti",   file: "international-timisoara-budapest.html" },
  { from: "Halmeu",         to: "Carei",              file: "no-results-remote-pair.html" },
];

async function bootstrap(from: string, to: string) {
  const url = `${BASE}/ro-RO/Rute-trenuri/${from}/${to}`;
  const res = await fetch(url, { redirect: "manual" });
  const html = await res.text();
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(/,(?=\s*[A-Za-z])/).map((c) => c.split(";")[0]!.trim()).join("; ");
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const keyMatch = html.match(/name="ConfirmationKey"[^>]*value="([^"]+)"/);
  if (!tokenMatch || !keyMatch) throw new Error(`bootstrap failed for ${from}→${to}: tokens not found`);
  return { html, cookie, token: tokenMatch[1]!, confirmationKey: keyMatch[1]! };
}

async function search(pair: Pair) {
  const { html: bootHtml, cookie, token, confirmationKey } = await bootstrap(pair.from, pair.to);

  // Save the bootstrap HTML once (reused across fixtures)
  await writeFile(resolve(OUT, "bootstrap-rute-trenuri.html"), bootHtml);

  const body = new URLSearchParams({
    DepartureStationName: pair.from.replace(/-/g, " "),
    ArrivalStationName: pair.to.replace(/-/g, " "),
    DepartureDate: formDate,
    ConfirmationKey: confirmationKey,
    __RequestVerificationToken: token,
    PassengerCount: "1",
    IsInternational: "false",
  });

  const res = await fetch(`${BASE}/ro-RO/Itineraries/GetItineraries`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": cookie,
      "x-requested-with": "XMLHttpRequest",
    },
    body,
  });
  const html = await res.text();
  await writeFile(resolve(OUT, pair.file), html);
  console.log(`✓ ${pair.file} (${html.length} bytes)`);
}

async function stationsLanding() {
  const res = await fetch(`${BASE}/ro-RO`);
  const html = await res.text();
  await writeFile(resolve(OUT, "stations-landing.html"), html);
  console.log(`✓ stations-landing.html (${html.length} bytes)`);
}

async function captchaStub() {
  await writeFile(resolve(OUT, "captcha-response.txt"), "ReCaptchaFailed");
  console.log("✓ captcha-response.txt (synthetic)");
}

async function priceSnippetStub() {
  // Real price capture requires a live TransactionString from a search. Synthesize a minimal
  // representative snippet; overwrite with real capture when we build a live price capture step.
  const stub = `<span class="price">41,5 lei</span>`;
  await writeFile(resolve(OUT, "price-snippet.html"), stub);
  console.log("✓ price-snippet.html (synthetic stub)");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await stationsLanding();
  for (const pair of PAIRS) {
    await search(pair);
    await new Promise((r) => setTimeout(r, 2500)); // gentle rate limit: 1 search per 2.5s
  }
  await captchaStub();
  await priceSnippetStub();
  console.log("\nAll fixtures captured.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5.2: Run the capture script**

Run: `pnpm --filter @peron/api exec tsx scripts/capture-fixtures.ts`
Expected: each fixture file written to `apps/api/test/fixtures/`. Console prints `✓ <filename> (<bytes>)` for each. If any pair throws "tokens not found" or "ReCaptchaFailed" appears in output, wait 5 minutes and retry; if persistent, manually capture from a browser DevTools network panel and paste.

**Fallback when live CFR is unreachable or captcha-flagged:** write the synthetic fixtures below so the plan can continue. The parser has fallback behavior for each case (Task 7 handles empty bodies as `parser-failure`, missing itineraries as `no-results`, `ReCaptchaFailed` text as `captcha`). Re-run the capture script once CFR cooperates to replace these.

```bash
# direct / transfer / sleeper / international: minimal empty-results shell (parser returns no-results)
for f in direct-bucuresti-brasov with-transfer-bucuresti-sibiu sleeper-bucuresti-cluj international-timisoara-budapest; do
  cat > "apps/api/test/fixtures/$f.html" <<'HTML'
<html><body><ul id="itineraries-list"></ul></body></html>
HTML
done

cat > apps/api/test/fixtures/no-results-remote-pair.html <<'HTML'
<html><body><div class="no-results">Nu s-au gasit trenuri pe acest traseu.</div></body></html>
HTML

echo -n "ReCaptchaFailed" > apps/api/test/fixtures/captcha-response.txt

cat > apps/api/test/fixtures/bootstrap-rute-trenuri.html <<'HTML'
<html><body>
<input name="__RequestVerificationToken" value="synthetic-token" />
<input name="ConfirmationKey" value="synthetic-key" />
</body></html>
HTML

cat > apps/api/test/fixtures/stations-landing.html <<'HTML'
<html><script>
var availableStations = [
  { "name": "București Nord", "isImportant": true },
  { "name": "Brașov", "isImportant": true },
  { "name": "Cluj-Napoca", "isImportant": true },
  { "name": "Sinaia", "isImportant": false }
];
</script></html>
HTML

echo '<span class="price">41,5 lei</span>' > apps/api/test/fixtures/price-snippet.html
```

With synthetic fixtures in place, parser tests that assert "N+ itineraries parsed" from real fixtures (Task 7) will fail. Mark those tests `it.skip` with a `TODO: recapture fixture` comment until real CFR is back. The structural tests (no-results, captcha, empty body, partial-parse synthetic) still pass against this fallback.

- [ ] **Step 5.3: Verify fixtures exist and are non-trivial**

Run:
```bash
ls -la apps/api/test/fixtures/ | awk '{print $5, $9}'
```
Expected: all 9 files present. `direct-bucuresti-brasov.html`, `with-transfer-*.html`, `sleeper-*.html` should be 100KB+ each. `no-results-*.html` will be smaller. `captcha-response.txt` is 15 bytes.

- [ ] **Step 5.4: Smoke check — confirm primary selector appears**

Run:
```bash
grep -c 'id="li-itinerary-' apps/api/test/fixtures/direct-bucuresti-brasov.html
```
Expected: non-zero count (at least 3 — multiple direct trains Buc→Brașov). If zero, the fixture's HTML structure has drifted or the capture landed on a non-results page — recapture or hand-edit.

- [ ] **Step 5.5: Commit fixtures and capture script**

```bash
git add scripts/capture-fixtures.ts apps/api/test/fixtures/
git commit -m "test(api): golden HTML fixtures + capture-fixtures script"
```

---

## Task 6: Parser — parseOne (single itinerary card)

**Files:**
- Create: `apps/api/src/parser/itinerary.ts` (partial — just `parseOne` + imports)
- Create: `apps/api/test/parser/itinerary.test.ts` (partial — just parseOne tests)

**Context:** `parseOne` extracts one itinerary card from a cheerio-loaded DOM. It uses `tryText`, `parseDuration`, and the Zod schema. Task 7 adds the page-level `parseItineraries` that iterates cards and collects meta. Splitting them keeps card-extraction testable in isolation.

- [ ] **Step 6.1: Write a focused failing test at `apps/api/test/parser/itinerary.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { parseOne } from "../../src/parser/itinerary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");

describe("parseOne (single card)", () => {
  it("extracts a complete itinerary from direct-bucuresti-brasov fixture", async () => {
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    const $ = cheerio.load(html);
    const $cards = $('li[id^="li-itinerary-"]');
    expect($cards.length).toBeGreaterThan(0);

    const first = $cards.first();
    const raw = parseOne($, first, "test-session-id", 0);

    expect(raw).toMatchObject({
      id: "itinerary-0",
      sessionId: "test-session-id",
      segments: expect.arrayContaining([
        expect.objectContaining({
          trainNumber: expect.stringMatching(/^\d+$/),
          from: expect.any(String),
          to: expect.any(String),
        }),
      ]),
    });
    expect(raw.transactionString.length).toBeGreaterThan(0);
    expect(raw.departure.time).toMatch(/^\d{1,2}:\d{2}$/);
    expect(raw.arrival.time).toMatch(/^\d{1,2}:\d{2}$/);
    expect(raw.duration.hours).toBeGreaterThanOrEqual(0);
    expect(raw.transferCount).toBe(0);
    expect(raw.services).toMatchObject({
      bikeCar: expect.any(Boolean),
      barRestaurant: expect.any(Boolean),
      sleeper: expect.any(Boolean),
      couchette: expect.any(Boolean),
      onlineBuying: expect.any(Boolean),
    });
    expect(raw.trainDetailUrl).toMatch(/^https:\/\/bilete\.cfrcalatori\.ro\//);
    expect(raw.bookingUrl).toMatch(/^https:\/\/bilete\.cfrcalatori\.ro\//);
  });
});
```

- [ ] **Step 6.2: Run test, verify fail**

Run: `pnpm --filter @peron/api test parser/itinerary`
Expected: FAIL — cannot resolve itinerary module.

- [ ] **Step 6.3: Implement `apps/api/src/parser/itinerary.ts`**

```ts
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { tryText } from "./selectors.js";
import { parseDuration } from "./duration.js";
import { toStationSlug } from "../cfr/slug.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

type RawItinerary = {
  id: string;
  transactionString: string;
  sessionId: string;
  departure: { time: string; station: string; platform?: string };
  arrival: { time: string; station: string; platform?: string };
  duration: { hours: number; minutes: number };
  segments: Array<{
    trainCategory: string;
    trainNumber: string;
    from: string;
    to: string;
    departTime: string;
    arriveTime: string;
  }>;
  transferCount: number;
  priceFrom:
    | { amount: number; currency: "RON"; fareType: "Adult"; class: "1" | "2" }
    | null;
  services: {
    bikeCar: boolean;
    barRestaurant: boolean;
    sleeper: boolean;
    couchette: boolean;
    onlineBuying: boolean;
  };
  trainDetailUrl: string;
  bookingUrl: string;
};

function parseTimeAttr(raw: string): string {
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

function parsePriceText(raw: string): number | null {
  // CFR format: "41,5 lei" or "125,00 lei"
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*lei/i);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasSvcIcon($card: Cheerio<AnyNode>, keyword: string): boolean {
  return (
    $card.find(`[class*="${keyword}" i]`).length > 0 ||
    $card.find(`img[alt*="${keyword}" i]`).length > 0 ||
    $card.find(`[title*="${keyword}" i]`).length > 0
  );
}

export function parseOne(
  $: CheerioAPI,
  el: Cheerio<AnyNode>,
  sessionId: string,
  index: number,
): RawItinerary {
  // Transaction string: primary is a hidden input; fallback to a data-* attribute on the card
  const txFromInput = el.find('input[name*="TransactionString" i]').first().attr("value") ?? "";
  const txFromData = el.attr("data-transaction-string") ?? "";
  const transactionString = txFromInput || txFromData;

  const departTimeRaw = tryText($, el, [
    ".departure-time",
    "[class*='depart' i] [class*='time' i]",
    "time.depart",
  ]);
  const arriveTimeRaw = tryText($, el, [
    ".arrival-time",
    "[class*='arriv' i] [class*='time' i]",
    "time.arrive",
  ]);
  const departStation = tryText($, el, [
    ".departure-station",
    "[class*='depart' i] [class*='station' i]",
  ]);
  const arriveStation = tryText($, el, [
    ".arrival-station",
    "[class*='arriv' i] [class*='station' i]",
  ]);
  const durationRaw = tryText($, el, [
    ".duration",
    "[class*='duration' i]",
    "[class*='travel-time' i]",
  ]);
  const priceRaw = tryText($, el, [
    ".price",
    "[class*='price' i]",
    "[class*='tarif' i]",
  ]);

  const segments = el.find('[class*="segment" i], li[class*="train" i]').toArray().map((seg) => {
    const $seg = $(seg);
    return {
      trainCategory: tryText($, $seg, ["[class*='category' i]", "[class*='rang' i]"]),
      trainNumber: tryText($, $seg, ["[class*='number' i]", "[class*='numar' i]"]).replace(/\D/g, ""),
      from: tryText($, $seg, ["[class*='from' i]", "[class*='plecare' i]"]),
      to: tryText($, $seg, ["[class*='to' i]", "[class*='sosire' i]"]),
      departTime: parseTimeAttr(tryText($, $seg, ["[class*='depart' i] [class*='time' i]"])),
      arriveTime: parseTimeAttr(tryText($, $seg, ["[class*='arriv' i] [class*='time' i]"])),
    };
  });

  const priceAmount = parsePriceText(priceRaw);

  return {
    id: `itinerary-${index}`,
    transactionString,
    sessionId,
    departure: { time: parseTimeAttr(departTimeRaw), station: departStation },
    arrival: { time: parseTimeAttr(arriveTimeRaw), station: arriveStation },
    duration: parseDuration(durationRaw),
    segments: segments.length > 0 ? segments : [{
      trainCategory: tryText($, el, ["[class*='category' i]"]),
      trainNumber: tryText($, el, ["[class*='number' i]"]).replace(/\D/g, ""),
      from: departStation,
      to: arriveStation,
      departTime: parseTimeAttr(departTimeRaw),
      arriveTime: parseTimeAttr(arriveTimeRaw),
    }],
    transferCount: Math.max(0, segments.length - 1),
    priceFrom: priceAmount !== null
      ? { amount: priceAmount, currency: "RON", fareType: "Adult", class: "2" }
      : null,
    services: {
      bikeCar: hasSvcIcon(el, "bike") || hasSvcIcon(el, "bicicl"),
      barRestaurant: hasSvcIcon(el, "restaur") || hasSvcIcon(el, "bar"),
      sleeper: hasSvcIcon(el, "sleeper") || hasSvcIcon(el, "vagon-dormit"),
      couchette: hasSvcIcon(el, "couchette") || hasSvcIcon(el, "cuset"),
      onlineBuying: hasSvcIcon(el, "online") || hasSvcIcon(el, "buy"),
    },
    trainDetailUrl: segments[0]?.trainNumber
      ? `${CFR_BASE}/ro-RO/Tren/${segments[0].trainNumber}`
      : CFR_BASE,
    bookingUrl: `${CFR_BASE}/ro-RO/Rute-trenuri/${toStationSlug(departStation)}/${toStationSlug(arriveStation)}`,
  };
}
```

Note: selector choices are educated guesses — they will need to be refined against real fixtures in Step 6.4. This is expected; `tryText` fallback chains are exactly the defense for CFR drift.

- [ ] **Step 6.4: Write an exploratory debug test to surface real selectors**

Real CFR class names aren't known at plan-write time — `parseOne`'s selectors are educated guesses with fallback chains. Before iterating blind, dump the first card's HTML so you can read the real attributes. Add this temporary test at the bottom of `apps/api/test/parser/itinerary.test.ts`:

```ts
describe.skip("debug — dump first card HTML for selector exploration", () => {
  it("prints first itinerary card", async () => {
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    const $ = cheerio.load(html);
    const first = $('li[id^="li-itinerary-"]').first();
    console.log("--- first card HTML ---");
    console.log($.html(first));
    console.log("--- first card class names ---");
    first.find("*").each((_i, el) => {
      const c = $(el).attr("class");
      if (c) console.log(c);
    });
  });
});
```

To run: temporarily remove `.skip` and run `pnpm --filter @peron/api test parser/itinerary --reporter=verbose`. Inspect the output for real class names matching departure/arrival/duration/price/service patterns. Re-add `.skip` before committing. Do not commit the `console.log` output.

- [ ] **Step 6.5: Run the main parseOne test; iterate selectors against the real fixture**

Run: `pnpm --filter @peron/api test parser/itinerary`
Expected on first run: likely **partial pass** — shape checks pass for fields whose selectors matched, fail for others. Iterate: use the debug dump from Step 6.4 as ground truth, update the selector arrays in `parseOne`, rerun. Each pass narrows the gap. Target: test passes with `parseOne` returning all fields populated from the fixture.

- [ ] **Step 6.6: Commit once green**

```bash
git add apps/api/src/parser/itinerary.ts apps/api/test/parser/itinerary.test.ts
git commit -m "feat(api): parser parseOne — single itinerary card extraction"
```

---

## Task 7: Parser — parseItineraries (full page, all 6 fixtures)

**Files:**
- Modify: `apps/api/src/parser/itinerary.ts` (add `parseItineraries`)
- Modify: `apps/api/test/parser/itinerary.test.ts` (add page-level tests across all fixtures)

- [ ] **Step 7.1: Extend `apps/api/test/parser/itinerary.test.ts` with page-level tests**

Add below the existing `parseOne` describe block:

```ts
import { parseItineraries } from "../../src/parser/itinerary.js";

async function loadFixture(name: string): Promise<string> {
  return readFile(resolve(FIX, name), "utf8");
}

describe("parseItineraries", () => {
  it("direct-bucuresti-brasov: parses multiple itineraries with high success rate", async () => {
    const html = await loadFixture("direct-bucuresti-brasov.html");
    const result = parseItineraries(html, "sess-direct");
    expect(result.itineraries.length).toBeGreaterThan(0);
    expect(result.warning).toBeNull();
    expect(result.meta.parseSuccessRate).toBeGreaterThanOrEqual(0.9);
    expect(result.meta.detectedCount).toBeGreaterThan(0);
    // All transferCount === 0 for direct trains
    for (const it of result.itineraries) {
      expect(it.transferCount).toBe(0);
    }
  });

  it("with-transfer-bucuresti-sibiu: includes at least one multi-segment itinerary", async () => {
    const html = await loadFixture("with-transfer-bucuresti-sibiu.html");
    const result = parseItineraries(html, "sess-transfer");
    expect(result.itineraries.length).toBeGreaterThan(0);
    const withTransfer = result.itineraries.filter((it) => it.transferCount >= 1);
    expect(withTransfer.length).toBeGreaterThan(0);
  });

  it("sleeper-bucuresti-cluj: detects sleeper or couchette service on at least one train", async () => {
    const html = await loadFixture("sleeper-bucuresti-cluj.html");
    const result = parseItineraries(html, "sess-sleeper");
    expect(result.itineraries.length).toBeGreaterThan(0);
    const nightTrains = result.itineraries.filter(
      (it) => it.services.sleeper || it.services.couchette,
    );
    expect(nightTrains.length).toBeGreaterThan(0);
  });

  it("international-timisoara-budapest: parses without throwing (shape may differ)", async () => {
    const html = await loadFixture("international-timisoara-budapest.html");
    const result = parseItineraries(html, "sess-intl");
    // International often uses a different card shape — don't assert count,
    // but do assert no unexpected crash and success rate is sensible
    expect(result.meta).toBeDefined();
    expect(result.meta.parseSuccessRate).toBeGreaterThanOrEqual(0);
    expect(result.meta.parseSuccessRate).toBeLessThanOrEqual(1);
  });

  it("no-results-remote-pair: returns empty list + no-results warning", async () => {
    const html = await loadFixture("no-results-remote-pair.html");
    const result = parseItineraries(html, "sess-empty");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning).toEqual({ kind: "no-results" });
    expect(result.meta.detectedCount).toBe(0);
  });

  it("captcha-response: returns captcha warning, no itineraries", async () => {
    const html = await loadFixture("captcha-response.txt");
    const result = parseItineraries(html, "sess-captcha");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning?.kind).toBe("captcha");
    if (result.warning?.kind === "captcha") {
      expect(result.warning.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("empty body: returns our-bug warning", async () => {
    const result = parseItineraries("", "sess-empty");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning?.kind).toBe("parser-failure");
  });

  it("partial parse: emits partial warning when some cards fail Zod", async () => {
    // Synthesize a body with one valid-looking card and one broken one.
    // Broken card is missing the id prefix so the Zod regex will reject.
    const synthetic = `
      <ul id="itineraries-list">
        <li id="li-itinerary-0">
          <span class="departure-time">08:30</span>
          <span class="arrival-time">11:00</span>
          <span class="departure-station">București Nord</span>
          <span class="arrival-station">Brașov</span>
          <span class="duration">2h 30m</span>
          <span class="price">41,5 lei</span>
          <input name="TransactionString" value="tx1" />
          <div class="segment">
            <span class="category">IR</span>
            <span class="number">1741</span>
            <span class="from">București Nord</span>
            <span class="to">Brașov</span>
          </div>
        </li>
        <li id="li-itinerary-1">
          <!-- missing all required fields; Zod should reject -->
        </li>
      </ul>
    `;
    const result = parseItineraries(synthetic, "sess-partial");
    expect(result.itineraries.length).toBeLessThan(result.meta.detectedCount);
    expect(result.meta.parseSuccessRate).toBeGreaterThan(0);
    expect(result.meta.parseSuccessRate).toBeLessThan(1);
    expect(result.warning?.kind).toBe("partial");
  });
});
```

- [ ] **Step 7.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test parser/itinerary`
Expected: FAIL — `parseItineraries` not exported.

- [ ] **Step 7.3: Extend `apps/api/src/parser/itinerary.ts` with `parseItineraries`**

Add to the top of the file (after existing imports):
```ts
import * as cheerio from "cheerio";
import type { SearchError } from "@peron/types";
import { ItinerarySchema } from "./schemas.js";
```

Add to the bottom of the file:
```ts
const PRIMARY_SELECTOR = 'li[id^="li-itinerary-"]';
const FALLBACK_SELECTORS = [
  "li.itinerary",
  "div[class*='itinerary' i]",
  "[data-itinerary]",
];

export type ParseResult = {
  itineraries: RawItinerary[];
  warning: SearchError | null;
  meta: { parseSuccessRate: number; detectedCount: number };
};

export function parseItineraries(html: string, sessionId: string): ParseResult {
  if (!html || html.trim().length === 0) {
    return {
      itineraries: [],
      warning: { kind: "parser-failure", detail: "empty response body" },
      meta: { parseSuccessRate: 0, detectedCount: 0 },
    };
  }

  if (html.trim() === "ReCaptchaFailed" || html.includes("ReCaptchaFailed")) {
    return {
      itineraries: [],
      warning: { kind: "captcha", retryAfterSec: 60 },
      meta: { parseSuccessRate: 0, detectedCount: 0 },
    };
  }

  const $ = cheerio.load(html);

  let $items = $(PRIMARY_SELECTOR);
  if ($items.length === 0) {
    for (const sel of FALLBACK_SELECTORS) {
      const found = $(sel);
      if (found.length > 0) {
        $items = found;
        break;
      }
    }
  }

  const detectedCount = $items.length;

  if (detectedCount === 0) {
    // Regex last-ditch: count id="li-itinerary-N" in raw HTML (in case cheerio choked)
    const regexHits = html.match(/id="li-itinerary-\d+"/g) ?? [];
    if (regexHits.length === 0) {
      return {
        itineraries: [],
        warning: { kind: "no-results" },
        meta: { parseSuccessRate: 1, detectedCount: 0 },
      };
    }
    // Cheerio failed but regex says there were hits — structural breakage
    return {
      itineraries: [],
      warning: {
        kind: "parser-failure",
        detail: `regex detected ${regexHits.length} itineraries but cheerio selectors failed`,
      },
      meta: { parseSuccessRate: 0, detectedCount: regexHits.length },
    };
  }

  const parsed: RawItinerary[] = [];
  const errors: string[] = [];

  $items.each((idx, el) => {
    try {
      const raw = parseOne($, $(el), sessionId, idx);
      const result = ItinerarySchema.safeParse(raw);
      if (result.success) {
        parsed.push(raw);
      } else {
        errors.push(
          `itinerary-${idx}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        );
      }
    } catch (err) {
      errors.push(`itinerary-${idx}: ${(err as Error).message}`);
    }
  });

  const parseSuccessRate = parsed.length / detectedCount;

  let warning: SearchError | null = null;
  if (parsed.length === 0 && detectedCount > 0) {
    warning = {
      kind: "parser-failure",
      detail: `all ${detectedCount} itineraries failed validation: ${errors.slice(0, 3).join(" | ")}`,
    };
  } else if (parsed.length < detectedCount) {
    warning = {
      kind: "partial",
      parsedCount: parsed.length,
      detectedCount,
    };
  }

  return {
    itineraries: parsed,
    warning,
    meta: { parseSuccessRate, detectedCount },
  };
}
```

- [ ] **Step 7.4: Run tests, iterate on selectors until green**

Run: `pnpm --filter @peron/api test parser/itinerary`
Expected: initial run likely shows 3–5 of 8 tests failing because selectors don't yet match the real fixtures. Iterate: open the failing fixture, find the actual DOM structure for the failing field, widen the selector chain in `parseOne`. Repeat until all 8 tests pass.

**Known iteration tolerance:** parser tests against real fixtures are naturally brittle on the first pass. The cost of getting selectors exactly right now is lower than doing it in production. Budget 30–60 minutes of selector iteration here. The fallback chains in `tryText` make subsequent CFR changes survivable.

- [ ] **Step 7.5: Typecheck**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS. Exits 0.

- [ ] **Step 7.6: Commit**

```bash
git add apps/api/src/parser/itinerary.ts apps/api/test/parser/itinerary.test.ts
git commit -m "feat(api): parser parseItineraries — full page parse across 6 fixtures"
```

**Section B checkpoint:** `pnpm --filter @peron/api test` should show ~30 tests passing across duration, selectors, slug, schemas, and itinerary. Parser is production-ready: drops invalid cards, emits meta, distinguishes captcha vs no-results vs parser-failure vs partial.

---

# Section C — CFR client

## Task 8: CFR client — error types + form builder + bootstrap

**Files:**
- Create: `apps/api/src/cfr/errors.ts`
- Create: `apps/api/src/cfr/form.ts`
- Create: `apps/api/src/cfr/client.ts` (partial — just `bootstrap`)
- Create: `apps/api/test/cfr/client.test.ts` (partial — bootstrap tests)

- [ ] **Step 8.1: Create `apps/api/src/cfr/errors.ts`**

```ts
export class CaptchaError extends Error {
  override readonly name = "CaptchaError";
}

export class UpstreamError extends Error {
  override readonly name = "UpstreamError";
  constructor(message: string, readonly httpStatus: number) {
    super(message);
  }
}

export class TokenExpiredError extends Error {
  override readonly name = "TokenExpiredError";
}

export class BootstrapError extends Error {
  override readonly name = "BootstrapError";
  constructor(message: string, readonly detail: string) {
    super(message);
  }
}
```

- [ ] **Step 8.2: Create `apps/api/src/cfr/form.ts`**

```ts
export function toFormBody(fields: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    params.append(k, v);
  }
  return params;
}
```

- [ ] **Step 8.3: Write failing tests at `apps/api/test/cfr/client.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { bootstrap } from "../../src/cfr/client.js";
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
```

- [ ] **Step 8.4: Run tests, verify fail**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: FAIL — client module does not exist.

- [ ] **Step 8.5: Implement `apps/api/src/cfr/client.ts`** (bootstrap only for now)

```ts
import { toStationSlug } from "./slug.js";
import { BootstrapError, CaptchaError } from "./errors.js";

const CFR_BASE = process.env.CFR_BASE_URL ?? "https://bilete.cfrcalatori.ro";

export type BootstrapResult = {
  cookie: string;
  confirmationKey: string;
  requestVerificationToken: string;
};

function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return "";
  // set-cookie can have multiple cookies comma-joined; split only on commas preceded by cookie-name-like patterns
  return setCookieHeader
    .split(/,(?=\s*[A-Za-z_][A-Za-z0-9_.-]*=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter((c) => c.length > 0)
    .join("; ");
}

export async function bootstrap(from: string, to: string): Promise<BootstrapResult> {
  const fromSlug = toStationSlug(from);
  const toSlug = toStationSlug(to);
  const url = `${CFR_BASE}/ro-RO/Rute-trenuri/${fromSlug}/${toSlug}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "accept": "text/html,application/xhtml+xml" },
    redirect: "manual",
  });

  const body = await res.text();
  if (body.trim() === "ReCaptchaFailed" || body.includes("ReCaptchaFailed")) {
    throw new CaptchaError("bootstrap hit captcha");
  }

  const tokenMatch = body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  const keyMatch = body.match(/name="ConfirmationKey"[^>]*value="([^"]+)"/);

  if (!tokenMatch?.[1] || !keyMatch?.[1]) {
    throw new BootstrapError(
      "tokens not found in Rute-trenuri page",
      `url=${url} tokenMatch=${!!tokenMatch} keyMatch=${!!keyMatch}`,
    );
  }

  const cookie = extractCookie(res.headers.get("set-cookie"));

  return {
    cookie,
    confirmationKey: keyMatch[1],
    requestVerificationToken: tokenMatch[1],
  };
}
```

- [ ] **Step 8.6: Run tests, verify pass**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: PASS — 4 tests. Exits 0.

If the first test fails because the fixture has no `__RequestVerificationToken` input (fixture was captured from a page that doesn't expose it), add a minimal inline check and capture a fresh bootstrap fixture from a proper search route.

- [ ] **Step 8.7: Commit**

```bash
git add apps/api/src/cfr/ apps/api/test/cfr/
git commit -m "feat(api): CFR client bootstrap + error types"
```

---

## Task 9: CFR client — searchRaw

**Files:**
- Modify: `apps/api/src/cfr/client.ts` (add `searchRaw`)
- Modify: `apps/api/test/cfr/client.test.ts` (add `searchRaw` tests)

- [ ] **Step 9.1: Extend `apps/api/test/cfr/client.test.ts`** — append after existing describe blocks:

```ts
import { searchRaw, type CfrSession } from "../../src/cfr/client.js";

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
```

- [ ] **Step 9.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: FAIL — `searchRaw` and `CfrSession` not exported.

- [ ] **Step 9.3: Extend `apps/api/src/cfr/client.ts`** — add imports and new exports:

```ts
import { UpstreamError } from "./errors.js";
import { toFormBody } from "./form.js";
```

Add at the bottom of the file:
```ts
export type CfrSession = {
  cookie: string;
  confirmationKey: string;
  requestVerificationToken: string;
};

export type SearchParams = {
  from: string;
  to: string;
  date: string; // ISO YYYY-MM-DD
};

function toCfrDate(iso: string): string {
  // ISO "2026-05-21" → "21.05.2026 00:00:00"
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) throw new Error(`invalid ISO date: ${iso}`);
  return `${d}.${m}.${y} 00:00:00`;
}

export async function searchRaw(
  session: CfrSession,
  params: SearchParams,
): Promise<string> {
  const body = toFormBody({
    DepartureStationName: params.from.replace(/[ȘșŞş]/g, "s").replace(/[ȚțŢţ]/g, "t").normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    ArrivalStationName: params.to.replace(/[ȘșŞş]/g, "s").replace(/[ȚțŢţ]/g, "t").normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    DepartureDate: toCfrDate(params.date),
    ConfirmationKey: session.confirmationKey,
    __RequestVerificationToken: session.requestVerificationToken,
    PassengerCount: "1",
    IsInternational: "false",
  });

  const res = await fetch(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": session.cookie,
      "x-requested-with": "XMLHttpRequest",
      "accept": "text/html,application/xhtml+xml",
    },
    body,
  });

  if (res.status >= 500) {
    throw new UpstreamError(`GetItineraries returned ${res.status}`, res.status);
  }

  const html = await res.text();
  if (html.trim() === "ReCaptchaFailed" || html.includes("ReCaptchaFailed")) {
    throw new CaptchaError("search hit captcha");
  }

  if (res.status >= 400) {
    throw new UpstreamError(`GetItineraries returned ${res.status}`, res.status);
  }

  return html;
}
```

- [ ] **Step 9.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: PASS — 7 tests (4 bootstrap + 3 search). Exits 0.

- [ ] **Step 9.5: Commit**

```bash
git add apps/api/src/cfr/client.ts apps/api/test/cfr/client.test.ts
git commit -m "feat(api): CFR client searchRaw — form-encoded GetItineraries"
```

---

## Task 10: CFR client — priceRaw + parsePriceSnippet

**Files:**
- Modify: `apps/api/src/cfr/client.ts` (add `priceRaw`)
- Create: `apps/api/src/parser/price.ts`
- Modify: `apps/api/test/cfr/client.test.ts`
- Create: `apps/api/test/parser/price.test.ts`

- [ ] **Step 10.1: Write failing parser tests at `apps/api/test/parser/price.test.ts`**

```ts
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
```

- [ ] **Step 10.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test parser/price`
Expected: FAIL — price module does not exist.

- [ ] **Step 10.3: Implement `apps/api/src/parser/price.ts`**

```ts
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
```

- [ ] **Step 10.4: Run parser tests, verify pass**

Run: `pnpm --filter @peron/api test parser/price`
Expected: PASS — 6 tests. Exits 0.

- [ ] **Step 10.5: Extend `apps/api/test/cfr/client.test.ts` with `priceRaw` tests**

```ts
import { priceRaw, type PriceRawParams } from "../../src/cfr/client.js";

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
```

- [ ] **Step 10.6: Run tests, verify fail**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: FAIL — `priceRaw` not exported.

- [ ] **Step 10.7: Extend `apps/api/src/cfr/client.ts`** — add at the bottom:

```ts
export type PriceRawParams = {
  transactionString: string;
  fareTypeId: string;
  serviceKey: string;
};

export async function priceRaw(
  session: CfrSession,
  params: PriceRawParams,
): Promise<string> {
  const body = toFormBody({
    TransactionString: params.transactionString,
    TicketFareTypeId: params.fareTypeId,
    "TrainServiceKeys[0]": params.serviceKey,
    __RequestVerificationToken: session.requestVerificationToken,
  });

  const res = await fetch(`${CFR_BASE}/api/ro-RO/Itineraries/Price`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": session.cookie,
      "x-requested-with": "XMLHttpRequest",
    },
    body,
  });

  if (res.status >= 500) {
    throw new UpstreamError(`Price returned ${res.status}`, res.status);
  }

  const html = await res.text();
  if (html.trim() === "ReCaptchaFailed") {
    throw new CaptchaError("price hit captcha");
  }
  if (res.status >= 400) {
    throw new UpstreamError(`Price returned ${res.status}`, res.status);
  }
  return html;
}
```

- [ ] **Step 10.8: Run tests, verify pass**

Run: `pnpm --filter @peron/api test cfr/client`
Expected: PASS — 9 tests (4 bootstrap + 3 search + 2 price). Exits 0.

- [ ] **Step 10.9: Commit**

```bash
git add apps/api/src/cfr/client.ts apps/api/src/parser/price.ts apps/api/test/cfr/client.test.ts apps/api/test/parser/price.test.ts
git commit -m "feat(api): priceRaw + parsePriceSnippet for fare matrix"
```

---

## Task 11: CFR client — fetchStationsPage + extractAvailableStations

**Files:**
- Modify: `apps/api/src/cfr/client.ts` (add `fetchStationsPage`)
- Create: `apps/api/src/parser/stations.ts`
- Create: `apps/api/test/parser/stations-extract.test.ts`
- Modify: `apps/api/test/cfr/client.test.ts`

- [ ] **Step 11.1: Write failing tests at `apps/api/test/parser/stations-extract.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAvailableStations } from "../../src/parser/stations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");

describe("extractAvailableStations", () => {
  it("parses availableStations array from landing page", async () => {
    const html = await readFile(resolve(FIX, "stations-landing.html"), "utf8");
    const stations = extractAvailableStations(html);
    expect(stations.length).toBeGreaterThan(1000);
    const bucuresti = stations.find((s) => s.name.toLowerCase().includes("bucuresti"));
    expect(bucuresti).toBeDefined();
    for (const s of stations.slice(0, 10)) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.isImportant).toBe("boolean");
    }
  });

  it("handles inline JSON variations (pretty/compact)", () => {
    const html = `<script>
      var availableStations = [
        { "name": "A", "isImportant": true },
        { "name": "B", "isImportant": false }
      ];
    </script>`;
    const stations = extractAvailableStations(html);
    expect(stations).toEqual([
      { name: "A", isImportant: true },
      { name: "B", isImportant: false },
    ]);
  });

  it("returns empty array when array not found", () => {
    expect(extractAvailableStations("<html>nothing</html>")).toEqual([]);
  });

  it("returns empty array on malformed JSON", () => {
    const html = `<script>var availableStations = [{ "name": }];</script>`;
    expect(extractAvailableStations(html)).toEqual([]);
  });
});
```

- [ ] **Step 11.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test parser/stations-extract`
Expected: FAIL — module not found.

- [ ] **Step 11.3: Implement `apps/api/src/parser/stations.ts`**

```ts
import type { Station } from "@peron/types";

const ARRAY_RX = /availableStations\s*=\s*(\[[\s\S]*?\]);?/;

export function extractAvailableStations(html: string): Station[] {
  const match = html.match(ARRAY_RX);
  if (!match || !match[1]) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const valid: Station[] = [];
  for (const entry of parsed) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { name?: unknown }).name === "string" &&
      typeof (entry as { isImportant?: unknown }).isImportant === "boolean"
    ) {
      const e = entry as { name: string; isImportant: boolean };
      valid.push({ name: e.name, isImportant: e.isImportant });
    }
  }
  return valid;
}
```

- [ ] **Step 11.4: Run parser tests, verify pass**

Run: `pnpm --filter @peron/api test parser/stations-extract`
Expected: PASS — 4 tests. Exits 0.

- [ ] **Step 11.5: Extend `apps/api/test/cfr/client.test.ts` with `fetchStationsPage` test**

```ts
import { fetchStationsPage } from "../../src/cfr/client.js";

describe("fetchStationsPage", () => {
  it("fetches the landing page HTML", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse("<html>landing</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const html = await fetchStationsPage();
    expect(html).toContain("landing");
  });

  it("throws UpstreamError on non-2xx", async () => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse("gone", { status: 503 }),
      ),
    );
    const { UpstreamError } = await import("../../src/cfr/errors.js");
    await expect(fetchStationsPage()).rejects.toBeInstanceOf(UpstreamError);
  });
});
```

- [ ] **Step 11.6: Add `fetchStationsPage` to `apps/api/src/cfr/client.ts`** — append:

```ts
export async function fetchStationsPage(): Promise<string> {
  const res = await fetch(`${CFR_BASE}/ro-RO`, {
    method: "GET",
    headers: { "accept": "text/html" },
  });
  if (!res.ok) {
    throw new UpstreamError(`stations landing returned ${res.status}`, res.status);
  }
  return res.text();
}
```

- [ ] **Step 11.7: Run tests, verify pass**

Run: `pnpm --filter @peron/api test`
Expected: PASS — all parser, schema, client tests (~45 total). Exits 0.

- [ ] **Step 11.8: Typecheck**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS.

- [ ] **Step 11.9: Commit**

```bash
git add apps/api/src/cfr/client.ts apps/api/src/parser/stations.ts apps/api/test/cfr/client.test.ts apps/api/test/parser/stations-extract.test.ts
git commit -m "feat(api): fetchStationsPage + extractAvailableStations"
```

**Section C checkpoint:** All four CFR client methods are implemented with MSW-mocked tests. Parser tests cover 6 golden fixtures. No session management yet — client is stateless; the pool (Section D) will own sessions and call these methods.

---

# Section D — Session pool + pinning

## Task 12: Session class + per-session serialized queue

**Files:**
- Create: `apps/api/src/pool/queue.ts`
- Create: `apps/api/src/pool/session.ts`
- Create: `apps/api/test/pool/session.test.ts`

- [ ] **Step 12.1: Write failing tests at `apps/api/test/pool/session.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SerializedQueue } from "../../src/pool/queue.js";

describe("SerializedQueue", () => {
  it("runs tasks in submission order and never in parallel", async () => {
    const q = new SerializedQueue();
    const log: string[] = [];

    const results = await Promise.all([
      q.run(async () => { log.push("a-start"); await new Promise((r) => setTimeout(r, 20)); log.push("a-end"); return "A"; }),
      q.run(async () => { log.push("b-start"); await new Promise((r) => setTimeout(r, 10)); log.push("b-end"); return "B"; }),
      q.run(async () => { log.push("c-start"); return "C"; }),
    ]);

    expect(results).toEqual(["A", "B", "C"]);
    expect(log).toEqual(["a-start", "a-end", "b-start", "b-end", "c-start"]);
  });

  it("propagates errors to the submitter, continues queue", async () => {
    const q = new SerializedQueue();
    const p1 = q.run(async () => { throw new Error("boom"); });
    const p2 = q.run(async () => "ok");
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
  });
});
```

- [ ] **Step 12.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pool/session`
Expected: FAIL — queue module missing.

- [ ] **Step 12.3: Implement `apps/api/src/pool/queue.ts`**

```ts
export class SerializedQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn(), () => fn());
    // Keep the chain alive but swallow to avoid unhandled rejections breaking the tail.
    this.tail = next.catch(() => undefined);
    return next;
  }
}
```

- [ ] **Step 12.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pool/session`
Expected: PASS — 2 tests. Exits 0.

- [ ] **Step 12.5: Add Session-class tests** — append to `apps/api/test/pool/session.test.ts`:

```ts
import { Session } from "../../src/pool/session.js";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

function mockBootstrap(token = "tok", key = "ck") {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="${token}" /><input name="ConfirmationKey" value="${key}" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("Session", () => {
  it("starts in state 'fresh' after bootstrap", async () => {
    mockBootstrap();
    const s = new Session("id-1");
    await s.warm("Bucuresti-Nord", "Brasov");
    expect(s.state).toBe("fresh");
    expect(s.id).toBe("id-1");
  });

  it("tracks age so the pool can refresh stale sessions", async () => {
    mockBootstrap();
    const s = new Session("id-2");
    await s.warm("A", "B");
    const now = Date.now();
    expect(s.lastWarmedAt).toBeLessThanOrEqual(now);
    expect(s.lastWarmedAt).toBeGreaterThan(now - 1000);
  });

  it("marks itself dead after 'kill()' is called", async () => {
    mockBootstrap();
    const s = new Session("id-3");
    await s.warm("A", "B");
    s.kill("captcha");
    expect(s.state).toBe("dead");
    expect(s.deathReason).toBe("captcha");
  });

  it("serializes two concurrent run() calls via its queue", async () => {
    mockBootstrap();
    const s = new Session("id-4");
    await s.warm("A", "B");
    const log: string[] = [];
    await Promise.all([
      s.run(async () => { log.push("1-start"); await new Promise((r) => setTimeout(r, 10)); log.push("1-end"); }),
      s.run(async () => { log.push("2-start"); log.push("2-end"); }),
    ]);
    expect(log).toEqual(["1-start", "1-end", "2-start", "2-end"]);
  });
});
```

- [ ] **Step 12.6: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pool/session`
Expected: FAIL — Session class not found.

- [ ] **Step 12.7: Implement `apps/api/src/pool/session.ts`**

```ts
import { bootstrap, type CfrSession } from "../cfr/client.js";
import { SerializedQueue } from "./queue.js";

export type SessionState = "cold" | "fresh" | "busy" | "dead";
export type DeathReason = "captcha" | "upstream" | "bootstrap-failed" | "age-expired-soft";

export class Session {
  readonly id: string;
  readonly queue = new SerializedQueue();
  state: SessionState = "cold";
  lastWarmedAt = 0;
  deathReason: DeathReason | null = null;
  private creds: CfrSession | null = null;

  constructor(id: string) {
    this.id = id;
  }

  get creds_(): CfrSession {
    if (!this.creds) throw new Error(`Session ${this.id} not warmed`);
    return this.creds;
  }

  async warm(from: string, to: string): Promise<void> {
    try {
      this.creds = await bootstrap(from, to);
      this.state = "fresh";
      this.lastWarmedAt = Date.now();
      this.deathReason = null;
    } catch (err) {
      this.kill("bootstrap-failed");
      throw err;
    }
  }

  kill(reason: DeathReason): void {
    this.state = "dead";
    this.deathReason = reason;
    this.creds = null;
  }

  run<T>(fn: (creds: CfrSession) => Promise<T>): Promise<T> {
    return this.queue.run(() => {
      const c = this.creds_;
      this.state = "busy";
      return fn(c).finally(() => {
        if (this.state === "busy") this.state = "fresh";
      });
    });
  }
}
```

- [ ] **Step 12.8: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pool/session`
Expected: PASS — 6 tests. Exits 0.

- [ ] **Step 12.9: Commit**

```bash
git add apps/api/src/pool/ apps/api/test/pool/session.test.ts
git commit -m "feat(api): Session class with per-session serialized queue"
```

---

## Task 13: SessionPool — acquire/release + fan-out

**Files:**
- Create: `apps/api/src/pool/pool.ts`
- Create: `apps/api/test/pool/pool.test.ts`

- [ ] **Step 13.1: Write failing tests at `apps/api/test/pool/pool.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { SessionPool } from "../../src/pool/pool.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

function mockBootstrap() {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="ck" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("SessionPool", () => {
  beforeEach(() => mockBootstrap());

  it("lazily spawns sessions up to maxSize on demand", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    await pool.withSession(async () => {});
    expect(pool.size).toBe(1);
  });

  it("reuses an existing fresh session for subsequent requests", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const ids = new Set<string>();
    await pool.withSession(async (s) => { ids.add(s.id); });
    await pool.withSession(async (s) => { ids.add(s.id); });
    expect(ids.size).toBe(1);
  });

  it("fans concurrent requests across multiple sessions up to maxSize", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const sessionIds = new Set<string>();

    await Promise.all(
      [0, 1, 2].map(() =>
        pool.withSession(async (s) => {
          sessionIds.add(s.id);
          await new Promise((r) => setTimeout(r, 30));
        }),
      ),
    );

    expect(sessionIds.size).toBeGreaterThan(1);
    expect(pool.size).toBeLessThanOrEqual(3);
  });

  it("finds a session by id (for transactionString pinning)", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    let id = "";
    await pool.withSession(async (s) => { id = s.id; });
    const found = pool.getById(id);
    expect(found?.id).toBe(id);
  });

  it("getById returns undefined for unknown id", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    expect(pool.getById("nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 13.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pool/pool`
Expected: FAIL — pool module missing.

- [ ] **Step 13.3: Implement `apps/api/src/pool/pool.ts`**

```ts
import { nanoid } from "nanoid";
import { Session } from "./session.js";

export type PoolConfig = {
  maxSize: number;
  warmFrom?: string;
  warmTo?: string;
};

const DEFAULT_WARM_FROM = "Bucuresti-Nord";
const DEFAULT_WARM_TO = "Brasov";

export class SessionPool {
  readonly maxSize: number;
  private readonly warmFrom: string;
  private readonly warmTo: string;
  private readonly sessions = new Map<string, Session>();

  constructor(cfg: PoolConfig) {
    this.maxSize = cfg.maxSize;
    this.warmFrom = cfg.warmFrom ?? DEFAULT_WARM_FROM;
    this.warmTo = cfg.warmTo ?? DEFAULT_WARM_TO;
  }

  get size(): number {
    return this.sessions.size;
  }

  getById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  private async spawn(): Promise<Session> {
    const s = new Session(nanoid(10));
    await s.warm(this.warmFrom, this.warmTo);
    this.sessions.set(s.id, s);
    return s;
  }

  private evict(id: string): void {
    this.sessions.delete(id);
  }

  /**
   * Acquire a session, run fn, release.
   * - If an idle fresh session has a free queue → use it.
   * - Else if pool not full → spawn a new session.
   * - Else → pick the least-busy existing session (shortest queue) and enqueue.
   */
  async withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    const alive = [...this.sessions.values()].filter((s) => s.state !== "dead");

    let session: Session | undefined = alive.find((s) => s.state === "fresh");

    if (!session && this.sessions.size < this.maxSize) {
      session = await this.spawn();
    }

    if (!session) {
      session = alive[0]!;
    }

    try {
      return await session.run((_creds) => fn(session!));
    } catch (err) {
      if (err instanceof Error && err.name === "CaptchaError") {
        session.kill("captcha");
        this.evict(session.id);
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.evict(session.id);
      }
      throw err;
    }
  }
}
```

- [ ] **Step 13.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pool/pool`
Expected: PASS — 5 tests. Exits 0.

- [ ] **Step 13.5: Commit**

```bash
git add apps/api/src/pool/pool.ts apps/api/test/pool/pool.test.ts
git commit -m "feat(api): SessionPool with acquire/release + fan-out"
```

---

## Task 14: SessionPool — refresh-on-age (15 min TTL)

**Files:**
- Modify: `apps/api/src/pool/session.ts` (add `isStale` helper)
- Modify: `apps/api/src/pool/pool.ts` (refresh before use)
- Modify: `apps/api/test/pool/pool.test.ts` (add staleness tests)

- [ ] **Step 14.1: Add tests to `apps/api/test/pool/pool.test.ts`** — append:

```ts
describe("SessionPool — age-based refresh", () => {
  beforeEach(() => mockBootstrap());

  it("refreshes a session older than the TTL before reuse", async () => {
    const pool = new SessionPool({ maxSize: 1, staleAfterMs: 50 });
    let firstWarmAt = 0;
    await pool.withSession(async (s) => { firstWarmAt = s.lastWarmedAt; });
    await new Promise((r) => setTimeout(r, 60));
    await pool.withSession(async (s) => {
      expect(s.lastWarmedAt).toBeGreaterThan(firstWarmAt);
    });
  });

  it("does not refresh a session younger than TTL", async () => {
    const pool = new SessionPool({ maxSize: 1, staleAfterMs: 10_000 });
    let firstWarmAt = 0;
    await pool.withSession(async (s) => { firstWarmAt = s.lastWarmedAt; });
    await pool.withSession(async (s) => {
      expect(s.lastWarmedAt).toBe(firstWarmAt);
    });
  });
});
```

- [ ] **Step 14.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pool/pool`
Expected: FAIL — `staleAfterMs` config not recognized.

- [ ] **Step 14.3: Extend `apps/api/src/pool/session.ts`** — add a method to the Session class:

```ts
  isStale(now: number, thresholdMs: number): boolean {
    return now - this.lastWarmedAt > thresholdMs;
  }

  async refresh(from: string, to: string): Promise<void> {
    await this.warm(from, to);
  }
```

(Add both methods before the closing `}` of the Session class.)

- [ ] **Step 14.4: Update `apps/api/src/pool/pool.ts`** — extend `PoolConfig` and `withSession`:

```ts
export type PoolConfig = {
  maxSize: number;
  warmFrom?: string;
  warmTo?: string;
  staleAfterMs?: number;
};

const DEFAULT_STALE_MS = 15 * 60 * 1000; // 15 minutes
```

Add the field and default in the constructor:
```ts
  private readonly staleAfterMs: number;

  constructor(cfg: PoolConfig) {
    this.maxSize = cfg.maxSize;
    this.warmFrom = cfg.warmFrom ?? DEFAULT_WARM_FROM;
    this.warmTo = cfg.warmTo ?? DEFAULT_WARM_TO;
    this.staleAfterMs = cfg.staleAfterMs ?? DEFAULT_STALE_MS;
  }
```

Update `withSession` to refresh before run — replace its body:
```ts
  async withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    const alive = [...this.sessions.values()].filter((s) => s.state !== "dead");
    let session: Session | undefined = alive.find((s) => s.state === "fresh");

    if (!session && this.sessions.size < this.maxSize) {
      session = await this.spawn();
    }

    if (!session) {
      session = alive[0]!;
    }

    if (session.isStale(Date.now(), this.staleAfterMs)) {
      await session.refresh(this.warmFrom, this.warmTo);
    }

    try {
      return await session.run(() => fn(session!));
    } catch (err) {
      if (err instanceof Error && err.name === "CaptchaError") {
        session.kill("captcha");
        this.evict(session.id);
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.evict(session.id);
      }
      throw err;
    }
  }
```

- [ ] **Step 14.5: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pool/pool`
Expected: PASS — 7 tests (5 prior + 2 new). Exits 0.

- [ ] **Step 14.6: Commit**

```bash
git add apps/api/src/pool/session.ts apps/api/src/pool/pool.ts apps/api/test/pool/pool.test.ts
git commit -m "feat(api): SessionPool refreshes sessions older than TTL (default 15min)"
```

---

## Task 15: Circuit breaker — 3 captchas in 60s → 2min backoff

**Files:**
- Create: `apps/api/src/pool/breaker.ts`
- Create: `apps/api/test/pool/breaker.test.ts`
- Modify: `apps/api/src/pool/pool.ts` (integrate breaker)
- Modify: `apps/api/test/pool/pool.test.ts` (integration tests)

- [ ] **Step 15.1: Write failing tests at `apps/api/test/pool/breaker.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../../src/pool/breaker.js";

describe("CircuitBreaker", () => {
  it("starts closed (allows traffic)", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    expect(b.isOpen(0)).toBe(false);
  });

  it("opens after `threshold` failures within the window", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.isOpen(21_000)).toBe(true);
  });

  it("stays closed if failures are spread beyond the window", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(30_000);
    b.record(61_000);
    expect(b.isOpen(61_001)).toBe(false);
  });

  it("auto-closes after cooldown expires", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.isOpen(21_000)).toBe(true);
    expect(b.isOpen(141_000)).toBe(false);
  });

  it("reports retryAfterSec while open", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.retryAfterSec(21_000)).toBeGreaterThan(0);
    expect(b.retryAfterSec(21_000)).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 15.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pool/breaker`
Expected: FAIL — breaker module missing.

- [ ] **Step 15.3: Implement `apps/api/src/pool/breaker.ts`**

```ts
export type BreakerConfig = {
  threshold: number;
  windowMs: number;
  cooldownMs: number;
};

export class CircuitBreaker {
  private events: number[] = [];
  private openedAt: number | null = null;

  constructor(private readonly cfg: BreakerConfig) {}

  record(now: number): void {
    this.events.push(now);
    // Only retain events inside the window
    const cutoff = now - this.cfg.windowMs;
    this.events = this.events.filter((t) => t >= cutoff);
    if (this.events.length >= this.cfg.threshold && this.openedAt === null) {
      this.openedAt = now;
    }
  }

  isOpen(now: number): boolean {
    if (this.openedAt === null) return false;
    if (now - this.openedAt >= this.cfg.cooldownMs) {
      this.openedAt = null;
      this.events = [];
      return false;
    }
    return true;
  }

  retryAfterSec(now: number): number {
    if (this.openedAt === null) return 0;
    const remaining = this.cfg.cooldownMs - (now - this.openedAt);
    return Math.max(1, Math.ceil(remaining / 1000));
  }
}
```

- [ ] **Step 15.4: Run breaker tests, verify pass**

Run: `pnpm --filter @peron/api test pool/breaker`
Expected: PASS — 5 tests. Exits 0.

- [ ] **Step 15.5: Add integration tests to `apps/api/test/pool/pool.test.ts`** — append:

```ts
import { CaptchaError } from "../../src/cfr/errors.js";

describe("SessionPool — circuit breaker", () => {
  it("rejects with CaptchaError when breaker is open, without touching CFR", async () => {
    mockBootstrap();
    const pool = new SessionPool({
      maxSize: 3,
      breaker: { threshold: 3, windowMs: 60_000, cooldownMs: 120_000 },
    });

    // Force 3 captcha failures to trip the breaker.
    server.use(
      http.post("https://bilete.cfrcalatori.ro/ro-RO/Itineraries/GetItineraries", () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );

    // Trip the breaker via 3 failed calls
    for (let i = 0; i < 3; i++) {
      try {
        await pool.withSession(async (s) => {
          const { searchRaw } = await import("../../src/cfr/client.js");
          await searchRaw(s["creds_"], { from: "A", to: "B", date: "2026-05-21" });
        });
      } catch {}
    }

    await expect(
      pool.withSession(async () => "should-not-run"),
    ).rejects.toBeInstanceOf(CaptchaError);
  });
});
```

- [ ] **Step 15.6: Update `apps/api/src/pool/pool.ts`** — add breaker wiring. Change imports and constructor:

Add to imports at top:
```ts
import { CircuitBreaker, type BreakerConfig } from "./breaker.js";
import { CaptchaError } from "../cfr/errors.js";
```

Extend `PoolConfig`:
```ts
export type PoolConfig = {
  maxSize: number;
  warmFrom?: string;
  warmTo?: string;
  staleAfterMs?: number;
  breaker?: BreakerConfig;
};
```

Add breaker field + construction:
```ts
  private readonly breaker: CircuitBreaker;

  constructor(cfg: PoolConfig) {
    this.maxSize = cfg.maxSize;
    this.warmFrom = cfg.warmFrom ?? DEFAULT_WARM_FROM;
    this.warmTo = cfg.warmTo ?? DEFAULT_WARM_TO;
    this.staleAfterMs = cfg.staleAfterMs ?? DEFAULT_STALE_MS;
    this.breaker = new CircuitBreaker(
      cfg.breaker ?? { threshold: 3, windowMs: 60_000, cooldownMs: 120_000 },
    );
  }
```

Replace `withSession` to check/record breaker:
```ts
  async withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.breaker.isOpen(now)) {
      throw new CaptchaError(
        `pool breaker open; retry in ${this.breaker.retryAfterSec(now)}s`,
      );
    }

    const alive = [...this.sessions.values()].filter((s) => s.state !== "dead");
    let session: Session | undefined = alive.find((s) => s.state === "fresh");

    if (!session && this.sessions.size < this.maxSize) {
      session = await this.spawn();
    }
    if (!session) session = alive[0]!;

    if (session.isStale(Date.now(), this.staleAfterMs)) {
      await session.refresh(this.warmFrom, this.warmTo);
    }

    try {
      return await session.run(() => fn(session!));
    } catch (err) {
      if (err instanceof CaptchaError) {
        session.kill("captcha");
        this.evict(session.id);
        this.breaker.record(Date.now());
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.evict(session.id);
      }
      throw err;
    }
  }

  /**
   * Route a call to a specific existing session (used by /api/price to hit the session
   * that issued the original transactionString). Applies the same breaker + captcha + upstream
   * bookkeeping as `withSession` — never bypass this for session-pinned work.
   */
  async withPinnedSession<T>(
    sessionId: string,
    fn: (s: Session) => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    if (this.breaker.isOpen(now)) {
      throw new CaptchaError(
        `pool breaker open; retry in ${this.breaker.retryAfterSec(now)}s`,
      );
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.state === "dead") {
      throw new UpstreamError(`pinned session ${sessionId} unavailable`, 410);
    }
    try {
      return await session.run(() => fn(session));
    } catch (err) {
      if (err instanceof CaptchaError) {
        session.kill("captcha");
        this.evict(session.id);
        this.breaker.record(Date.now());
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.evict(session.id);
      }
      throw err;
    }
  }

  /** Test helper: expose breaker state for assertions. */
  get breakerOpen(): boolean {
    return this.breaker.isOpen(Date.now());
  }
```

Note: `withPinnedSession` also needs `UpstreamError` in scope — add it to the imports at the top of `pool.ts` alongside `CaptchaError`:

```ts
import { CaptchaError, UpstreamError } from "../cfr/errors.js";
```

- [ ] **Step 15.7: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pool/`
Expected: PASS — all pool tests green. Exits 0.

- [ ] **Step 15.8: Commit**

```bash
git add apps/api/src/pool/ apps/api/test/pool/
git commit -m "feat(api): circuit breaker — 3 captchas/60s → 2min pool backoff"
```

---

## Task 16: Transaction-string pin map (30 min TTL)

**Files:**
- Create: `apps/api/src/pins.ts`
- Create: `apps/api/test/pins.test.ts`

- [ ] **Step 16.1: Write failing tests at `apps/api/test/pins.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PinMap } from "../src/pins.js";

describe("PinMap", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it("stores and retrieves a pin", () => {
    const m = new PinMap({ ttlMs: 30 * 60 * 1000 });
    m.set("tx-1", "sess-a");
    expect(m.get("tx-1")).toBe("sess-a");
  });

  it("returns undefined after TTL expires", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(1_500);
    expect(m.get("tx-1")).toBeUndefined();
  });

  it("refreshes TTL on re-set", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(500);
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(800);
    expect(m.get("tx-1")).toBe("sess-a");
  });

  it("supports bulk registration from an array", () => {
    const m = new PinMap({ ttlMs: 60_000 });
    m.setMany("sess-a", ["tx-1", "tx-2", "tx-3"]);
    expect(m.get("tx-1")).toBe("sess-a");
    expect(m.get("tx-3")).toBe("sess-a");
  });

  it("sweeps expired entries lazily (does not grow unboundedly)", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.setMany("s", Array.from({ length: 50 }, (_, i) => `t-${i}`));
    vi.advanceTimersByTime(1_500);
    // Trigger sweep by reading / setting
    m.set("t-new", "s");
    expect(m.size).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 16.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test pins`
Expected: FAIL — pins module missing.

- [ ] **Step 16.3: Implement `apps/api/src/pins.ts`**

```ts
export type PinMapConfig = { ttlMs: number };

type Entry = { sessionId: string; expiresAt: number };

export class PinMap {
  private readonly ttlMs: number;
  private readonly map = new Map<string, Entry>();

  constructor(cfg: PinMapConfig) {
    this.ttlMs = cfg.ttlMs;
  }

  get size(): number {
    return this.map.size;
  }

  set(transactionString: string, sessionId: string): void {
    this.map.set(transactionString, {
      sessionId,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.sweep();
  }

  setMany(sessionId: string, transactionStrings: string[]): void {
    const expiresAt = Date.now() + this.ttlMs;
    for (const tx of transactionStrings) {
      this.map.set(tx, { sessionId, expiresAt });
    }
    this.sweep();
  }

  get(transactionString: string): string | undefined {
    const entry = this.map.get(transactionString);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(transactionString);
      return undefined;
    }
    return entry.sessionId;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [tx, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(tx);
    }
  }
}
```

- [ ] **Step 16.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test pins`
Expected: PASS — 5 tests. Exits 0.

- [ ] **Step 16.5: Commit**

```bash
git add apps/api/src/pins.ts apps/api/test/pins.test.ts
git commit -m "feat(api): PinMap for transactionString → sessionId routing"
```

**Section D checkpoint:** Session infrastructure complete. Pool spawns up to 3 warm sessions, each with a serialized queue; sessions auto-refresh after 15 min; captcha trips the breaker after 3 hits in 60 s (2 min cooldown); `transactionString` pins route `/api/price` back to the issuing session.

---

# Section E — Registry + middleware + endpoints

## Task 17: Station registry — in-memory cache

**Files:**
- Create: `apps/api/src/stations/registry.ts`
- Create: `apps/api/test/stations/registry.test.ts`

- [ ] **Step 17.1: Write failing tests at `apps/api/test/stations/registry.test.ts`**

```ts
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
    expect(second).toBe(first); // same array reference — cached
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
```

- [ ] **Step 17.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test stations/registry`
Expected: FAIL — module missing.

- [ ] **Step 17.3: Implement `apps/api/src/stations/registry.ts`**

```ts
import type { Station } from "@peron/types";
import { fetchStationsPage } from "../cfr/client.js";
import { extractAvailableStations } from "../parser/stations.js";

export class StationRegistry {
  private cached: Station[] | null = null;
  private inflight: Promise<Station[]> | null = null;

  get size(): number {
    return this.cached?.length ?? 0;
  }

  async getAll(): Promise<Station[]> {
    if (this.cached) return this.cached;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const html = await fetchStationsPage();
      const stations = extractAvailableStations(html);
      this.cached = stations;
      this.inflight = null;
      return stations;
    })();

    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
    this.inflight = null;
  }
}
```

- [ ] **Step 17.4: Run tests, verify pass**

Run: `pnpm --filter @peron/api test stations/registry`
Expected: PASS — 4 tests. Exits 0.

- [ ] **Step 17.5: Commit**

```bash
git add apps/api/src/stations/ apps/api/test/stations/
git commit -m "feat(api): StationRegistry — in-memory station list cache"
```

---

## Task 18: Middleware — logger (pino) + CORS

**Files:**
- Create: `apps/api/src/middleware/logger.ts`
- Create: `apps/api/src/middleware/cors.ts`

- [ ] **Step 18.1: Create `apps/api/src/middleware/logger.ts`**

```ts
import { createMiddleware } from "hono/factory";
import { pino } from "pino";
import { randomUUID } from "node:crypto";

const baseLogger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type PeronLogger = ReturnType<typeof baseLogger.child>;

export const requestLogger = createMiddleware(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const child = baseLogger.child({ requestId });
  c.set("requestId", requestId);
  c.set("log", child);
  c.header("x-request-id", requestId);

  const start = performance.now();
  try {
    await next();
  } finally {
    const latencyMs = Math.round(performance.now() - start);
    child.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs,
    });
  }
});

export { baseLogger };
```

Note: we **don't** use `declare module "hono"` augmentation here because sub-apps below pass an explicit `<AppEnv>` generic to `new Hono<AppEnv>()` that overrides `ContextVariableMap`. Instead, `log` and `requestId` live in the shared `AppEnv` type defined in `src/app.ts` (Task 20). `try/finally` ensures we still log on handler throws.

- [ ] **Step 18.2: Create `apps/api/src/middleware/cors.ts`**

```ts
import { cors } from "hono/cors";

const PROD_ORIGIN = process.env.PERON_WEB_ORIGIN ?? "https://peron.app";
const DEV_ORIGIN = "http://localhost:3000";
const ALLOWED = new Set([PROD_ORIGIN, DEV_ORIGIN]);

export const corsMiddleware = cors({
  origin: (origin) => (ALLOWED.has(origin) ? origin : null),
  allowMethods: ["GET", "POST"],
  credentials: false,
  maxAge: 600,
});
```

Returning `null` on mismatch rejects the preflight — the browser will refuse the request rather than seeing a confusing `Access-Control-Allow-Origin: https://peron.app` header on a request from some other origin.

- [ ] **Step 18.3: Typecheck**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS — types resolve, including the `declare module "hono"` augmentation.

- [ ] **Step 18.4: Commit**

```bash
git add apps/api/src/middleware/logger.ts apps/api/src/middleware/cors.ts
git commit -m "feat(api): pino request logger + CORS middleware"
```

---

## Task 19: Middleware — rate limiter (per-route, shared store reset hook)

**Files:**
- Create: `apps/api/src/middleware/rate-limit.ts`

- [ ] **Step 19.1: Create `apps/api/src/middleware/rate-limit.ts`**

```ts
import { rateLimiter, MemoryStore } from "hono-rate-limiter";
import type { Context } from "hono";

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

const WINDOW_MS = 5 * 60 * 1000;

export const searchStore = new MemoryStore();
export const priceStore = new MemoryStore();

export const searchRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 50,
  standardHeaders: "draft-7",
  store: searchStore,
  keyGenerator: clientIp,
  handler: (c, _next, options) => {
    const info = c.get("rateLimit") as { resetTime?: Date } | undefined;
    const retryAfterSec = info?.resetTime
      ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(WINDOW_MS / 1000);
    c.status(options.statusCode as 429);
    return c.json({ kind: "rate-limited" as const, retryAfterSec });
  },
});

export const priceRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: "draft-7",
  store: priceStore,
  keyGenerator: clientIp,
  handler: (c, _next, options) => {
    const info = c.get("rateLimit") as { resetTime?: Date } | undefined;
    const retryAfterSec = info?.resetTime
      ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(WINDOW_MS / 1000);
    c.status(options.statusCode as 429);
    return c.json({ kind: "rate-limited" as const, retryAfterSec });
  },
});

export function resetRateLimits(): void {
  searchStore.resetAll?.();
  priceStore.resetAll?.();
}
```

Why `resetRateLimits`: tests that hit `/api/search` or `/api/price` many times would accumulate rate-limit state across tests in the shared `MemoryStore`. `beforeEach` in the route tests calls this.

- [ ] **Step 19.2: Typecheck**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS. (If `hono-rate-limiter` types for `resetAll` look off, wrap the call with `as any` or use `?.()` optional-call — some versions don't declare the method on the public type.)

- [ ] **Step 19.3: Commit**

```bash
git add apps/api/src/middleware/rate-limit.ts
git commit -m "feat(api): rate-limit middleware (50/5min search, 100/5min price)"
```

---

## Task 20: App refactor — split src/index.ts into src/app.ts + entry

**Files:**
- Create: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts` (reduce to entry point only)
- Modify: `apps/api/test/health.test.ts` (import from `app.js`)

**Why this task:** subsequent tasks (stations/search/price endpoints) register routes on the app. Keeping the app definition in `app.ts` separates wiring from the process entry point, and keeps `import { app } from "../src/app.js"` stable for tests.

- [ ] **Step 20.1: Create `apps/api/src/app.ts`**

```ts
import { Hono } from "hono";
import { requestLogger, type PeronLogger } from "./middleware/logger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { SessionPool } from "./pool/pool.js";
import { PinMap } from "./pins.js";
import { StationRegistry } from "./stations/registry.js";

export type AppDeps = {
  pool: SessionPool;
  pins: PinMap;
  stations: StationRegistry;
};

// Shared across app and all sub-routers so context typing stays consistent.
// Do NOT use `declare module "hono"` augmentation — the explicit generic here
// overrides ContextVariableMap, so we must include every Variables key explicitly.
export type AppEnv = {
  Variables: {
    deps: AppDeps;
    log: PeronLogger;
    requestId: string;
  };
};

export function makeApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", corsMiddleware);
  app.use("*", requestLogger);
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      pool: { size: deps.pool.size, breakerOpen: deps.pool.breakerOpen },
      stations: { cached: deps.stations.size },
    }),
  );

  // SCAFFOLDING: to be removed in Task 24
  app.get("/stations/sample", (c) =>
    c.json({ name: "București Nord", isImportant: true }),
  );

  return app;
}

// Default app used by tests and dev: build fresh deps.
export const app = makeApp({
  pool: new SessionPool({ maxSize: 3 }),
  pins: new PinMap({ ttlMs: 30 * 60 * 1000 }),
  stations: new StationRegistry(),
});
```

Notes:
- `app.ts` exports both `makeApp` (dependency injection for tests) and `app` (default singleton used by the entry point). Tests that need isolated state per describe can call `makeApp(...)`; simple tests can use the default `app`.
- The health endpoint now includes pool + stations state — cheap, lets us monitor from uptime pings.

- [ ] **Step 20.2: Replace `apps/api/src/index.ts` with entry-point only**

```ts
import { serve } from "@hono/node-server";
import { pathToFileURL } from "node:url";
import { app } from "./app.js";

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT) || 3001;
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}

export { app };
```

- [ ] **Step 20.3: Update `apps/api/test/health.test.ts`** — update the import path:

```ts
import { describe, it, expect } from "vitest";
import type { Station } from "@peron/types";
import { app } from "../src/app.js";

describe("GET /health", () => {
  it("responds 200 with status + pool state", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; pool: unknown };
    expect(body.status).toBe("ok");
    expect(body.pool).toBeDefined();
  });
});

describe("GET /stations/sample", () => {
  it("returns a typed Station from @peron/types", async () => {
    const res = await app.request("/stations/sample");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Station;
    expect(body.name).toBe("București Nord");
    expect(body.isImportant).toBe(true);
  });
});
```

- [ ] **Step 20.4: Run full test suite**

Run: `pnpm --filter @peron/api test`
Expected: PASS — all tests green, health test now asserts on new response shape.

- [ ] **Step 20.5: Typecheck + local dev smoke**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS.

Run: `pnpm dev:api` in a separate terminal (optional sanity — Ctrl+C after curl); then `curl localhost:3001/health`.
Expected: JSON `{"status":"ok","pool":{"size":0,"breakerOpen":false},"stations":{"cached":0}}`.

- [ ] **Step 20.6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/index.ts apps/api/test/health.test.ts
git commit -m "refactor(api): split app.ts from entry; enrich /health with pool + stations"
```

---

## Task 21: GET /api/stations endpoint

**Files:**
- Create: `apps/api/src/routes/stations.ts`
- Modify: `apps/api/src/app.ts` (mount route)
- Create: `apps/api/test/routes/stations.test.ts`

- [ ] **Step 21.1: Write failing test at `apps/api/test/routes/stations.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

const LANDING = `<html><script>var availableStations = [
  { "name": "București Nord", "isImportant": true },
  { "name": "Brașov", "isImportant": true }
];</script></html>`;

function buildApp() {
  return makeApp({
    pool: new SessionPool({ maxSize: 3 }),
    pins: new PinMap({ ttlMs: 60_000 }),
    stations: new StationRegistry(),
  });
}

describe("GET /api/stations", () => {
  beforeEach(() => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse(LANDING, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
  });

  it("returns the full cached station list", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: unknown[]; total: number };
    expect(body.total).toBe(2);
    expect(body.stations).toHaveLength(2);
  });

  it("filters by ?q= substring (case/diacritic-insensitive)", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations?q=bras");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: { name: string }[] };
    expect(body.stations.map((s) => s.name)).toContain("Brașov");
    expect(body.stations.map((s) => s.name)).not.toContain("București Nord");
  });

  it("respects ?limit= cap", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations?limit=1");
    const body = (await res.json()) as { stations: unknown[] };
    expect(body.stations).toHaveLength(1);
  });
});
```

- [ ] **Step 21.2: Run test, verify fail**

Run: `pnpm --filter @peron/api test routes/stations`
Expected: FAIL — route returns 404.

- [ ] **Step 21.3: Create `apps/api/src/routes/stations.ts`**

```ts
import { Hono } from "hono";
import type { Station, StationSearchResult } from "@peron/types";
import type { AppEnv } from "../app.js";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ȘșŞş]/g, "s")
    .replace(/[ȚțŢţ]/g, "t")
    .toLowerCase();
}

export function stationsRoute() {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const { stations } = c.get("deps");
    const all = await stations.getAll();

    const q = c.req.query("q")?.trim() ?? "";
    const limitStr = c.req.query("limit");
    const limit = limitStr ? Math.max(1, Math.min(500, Number(limitStr))) : all.length;

    let filtered: Station[] = all;
    if (q) {
      const nq = normalize(q);
      filtered = all.filter((s) => normalize(s.name).includes(nq));
    }

    const result: StationSearchResult = {
      stations: filtered.slice(0, limit),
      total: filtered.length,
    };
    return c.json(result);
  });

  return r;
}
```

- [ ] **Step 21.4: Mount route in `apps/api/src/app.ts`** — add import and mount line:

Add to imports:
```ts
import { stationsRoute } from "./routes/stations.js";
```

Inside `makeApp`, before the closing `return app;`:
```ts
  app.route("/api/stations", stationsRoute());
```

- [ ] **Step 21.5: Run tests, verify pass**

Run: `pnpm --filter @peron/api test routes/stations`
Expected: PASS — 3 tests. Exits 0.

- [ ] **Step 21.6: Commit**

```bash
git add apps/api/src/routes/stations.ts apps/api/src/app.ts apps/api/test/routes/stations.test.ts
git commit -m "feat(api): GET /api/stations with q + limit"
```

---

## Task 22: POST /api/search endpoint

**Files:**
- Create: `apps/api/src/routes/search.ts`
- Modify: `apps/api/src/app.ts` (mount route + rate limiter)
- Create: `apps/api/test/routes/search.test.ts`

- [ ] **Step 22.1: Write failing tests at `apps/api/test/routes/search.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";
import { resetRateLimits } from "../../src/middleware/rate-limit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");
const CFR_BASE = "https://bilete.cfrcalatori.ro";

function buildApp() {
  return makeApp({
    pool: new SessionPool({ maxSize: 3 }),
    pins: new PinMap({ ttlMs: 60_000 }),
    stations: new StationRegistry(),
  });
}

function mockBootstrap() {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="ck" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("POST /api/search", () => {
  beforeEach(() => resetRateLimits());

  it("returns parsed itineraries for a valid request", async () => {
    mockBootstrap();
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse(html, { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );

    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "Bucuresti Nord", to: "Brasov", date: "2026-05-21" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { itineraries: unknown[]; meta: { parseSuccessRate: number } };
    expect(body.itineraries.length).toBeGreaterThan(0);
    expect(body.meta.parseSuccessRate).toBeGreaterThanOrEqual(0.9);
  });

  it("registers transactionString pins for each parsed itinerary", async () => {
    mockBootstrap();
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse(html, { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );

    const pool = new SessionPool({ maxSize: 3 });
    const pins = new PinMap({ ttlMs: 60_000 });
    const app = makeApp({ pool, pins, stations: new StationRegistry() });

    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "Bucuresti Nord", to: "Brasov", date: "2026-05-21" }),
    });
    const body = (await res.json()) as { itineraries: Array<{ transactionString: string; sessionId: string }> };
    const first = body.itineraries[0]!;
    expect(pins.get(first.transactionString)).toBe(first.sessionId);
  });

  it("returns 400 on missing fields", async () => {
    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "A" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns captcha warning when backend trips breaker", async () => {
    mockBootstrap();
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );
    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "A", to: "B", date: "2026-05-21" }),
    });
    const body = (await res.json()) as { warning: { kind: string; retryAfterSec?: number } };
    expect(body.warning.kind).toBe("captcha");
  });
});
```

- [ ] **Step 22.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test routes/search`
Expected: FAIL — route returns 404.

- [ ] **Step 22.3: Create `apps/api/src/routes/search.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { searchRateLimit } from "../middleware/rate-limit.js";
import { searchRaw } from "../cfr/client.js";
import { parseItineraries } from "../parser/itinerary.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";

const SearchBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function searchRoute() {
  const r = new Hono<AppEnv>();

  r.use("/", searchRateLimit);

  r.post("/", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");

    const rawBody = await c.req.json().catch(() => null);
    const parsed = SearchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          itineraries: [],
          warning: {
            kind: "our-bug" as const,
            errorId: "invalid-request",
          },
          meta: { parseSuccessRate: 0, latencyMs: 0 },
        } satisfies SearchResponse,
        400,
      );
    }

    const start = Date.now();

    try {
      const result = await deps.pool.withSession(async (session) => {
        const creds = (session as unknown as { creds_: {
          cookie: string;
          confirmationKey: string;
          requestVerificationToken: string;
        } }).creds_;
        const html = await searchRaw(creds, parsed.data);
        return { html, sessionId: session.id };
      });

      const parseResult = parseItineraries(result.html, result.sessionId);

      // Pin every transactionString → sessionId so /api/price can route back.
      const txs = parseResult.itineraries.map((it) => it.transactionString).filter(Boolean);
      deps.pins.setMany(result.sessionId, txs);

      log.info({
        msg: "search.ok",
        detectedCount: parseResult.meta.detectedCount,
        parseSuccessRate: parseResult.meta.parseSuccessRate,
      });

      const response: SearchResponse = {
        itineraries: parseResult.itineraries,
        warning: parseResult.warning,
        meta: {
          parseSuccessRate: parseResult.meta.parseSuccessRate,
          latencyMs: Date.now() - start,
        },
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof CaptchaError) {
        const response: SearchResponse = {
          itineraries: [],
          warning: { kind: "captcha", retryAfterSec: 60 },
          meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
        };
        return c.json(response, 200);
      }
      if (err instanceof UpstreamError) {
        const response: SearchResponse = {
          itineraries: [],
          warning: { kind: "cfr-unavailable", httpStatus: err.httpStatus },
          meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
        };
        return c.json(response, 200);
      }
      const errorId = crypto.randomUUID();
      log.error({ msg: "search.error", errorId, err: (err as Error).message });
      const response: SearchResponse = {
        itineraries: [],
        warning: { kind: "our-bug", errorId },
        meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
      };
      return c.json(response, 500);
    }
  });

  return r;
}
```

- [ ] **Step 22.4: Mount in `apps/api/src/app.ts`** — add import and mount:

Add import:
```ts
import { searchRoute } from "./routes/search.js";
```

Inside `makeApp`, after stations mount:
```ts
  app.route("/api/search", searchRoute());
```

- [ ] **Step 22.5: Run tests, verify pass**

Run: `pnpm --filter @peron/api test routes/search`
Expected: PASS — 4 tests. Exits 0.

- [ ] **Step 22.6: Commit**

```bash
git add apps/api/src/routes/search.ts apps/api/src/app.ts apps/api/test/routes/search.test.ts
git commit -m "feat(api): POST /api/search with pool + parser + error mapping + rate limit"
```

---

## Task 23: POST /api/price endpoint

**Files:**
- Create: `apps/api/src/routes/price.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/routes/price.test.ts`

- [ ] **Step 23.1: Write failing tests at `apps/api/test/routes/price.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";
import { resetRateLimits } from "../../src/middleware/rate-limit.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

function mockBootstrap() {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="ck" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("POST /api/price", () => {
  beforeEach(() => resetRateLimits());

  it("returns price for a valid transactionString routed to its pinned session", async () => {
    mockBootstrap();
    server.use(
      http.post(`${CFR_BASE}/api/ro-RO/Itineraries/Price`, () =>
        new HttpResponse(`<span class="price">41,5 lei</span>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const pool = new SessionPool({ maxSize: 3 });
    const pins = new PinMap({ ttlMs: 60_000 });
    const app = makeApp({ pool, pins, stations: new StationRegistry() });

    // Warm a session and pin a fake transactionString to it.
    let sessionId = "";
    await pool.withSession(async (s) => { sessionId = s.id; });
    pins.set("tx-abc", sessionId);

    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionString: "tx-abc",
        fareTypeId: "73",
        serviceKey: "B&B",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; amount: number; currency: "RON" };
    expect(body).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("returns 410 Gone when transactionString has no pin (session restarted)", async () => {
    const app = makeApp({
      pool: new SessionPool({ maxSize: 3 }),
      pins: new PinMap({ ttlMs: 60_000 }),
      stations: new StationRegistry(),
    });
    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionString: "unknown-tx",
        fareTypeId: "73",
        serviceKey: "B&B",
      }),
    });
    expect(res.status).toBe(410);
  });

  it("returns 400 on malformed body", async () => {
    const app = makeApp({
      pool: new SessionPool({ maxSize: 3 }),
      pins: new PinMap({ ttlMs: 60_000 }),
      stations: new StationRegistry(),
    });
    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionString: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 23.2: Run tests, verify fail**

Run: `pnpm --filter @peron/api test routes/price`
Expected: FAIL — route returns 404.

- [ ] **Step 23.3: Create `apps/api/src/routes/price.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { PriceResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { priceRateLimit } from "../middleware/rate-limit.js";
import { priceRaw } from "../cfr/client.js";
import { parsePriceSnippet } from "../parser/price.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";

const PriceBodySchema = z.object({
  transactionString: z.string().min(1),
  fareTypeId: z.enum(["73", "71", "72", "50", "74", "53"]),
  serviceKey: z.string().min(1),
});

export function priceRoute() {
  const r = new Hono<AppEnv>();

  r.use("/", priceRateLimit);

  r.post("/", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");

    const rawBody = await c.req.json().catch(() => null);
    const parsed = PriceBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse, 400);
    }

    const sessionId = deps.pins.get(parsed.data.transactionString);
    if (!sessionId) {
      return c.json({ ok: false, reason: "expired" } satisfies PriceResponse, 410);
    }

    try {
      // Route through withPinnedSession so the breaker records captchas here too.
      // Raw session.run() would bypass the breaker and let a captcha storm from
      // /api/price silently chew through sessions.
      const html = await deps.pool.withPinnedSession(sessionId, async (session) => {
        const creds = (session as unknown as { creds_: {
          cookie: string;
          confirmationKey: string;
          requestVerificationToken: string;
        } }).creds_;
        return priceRaw(creds, parsed.data);
      });
      const result = parsePriceSnippet(html);
      log.info({
        msg: "price.ok",
        ok: result.ok,
        amount: result.ok ? result.amount : undefined,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof CaptchaError) {
        return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse);
      }
      if (err instanceof UpstreamError) {
        // 410 from withPinnedSession = pinned session was evicted or never existed.
        if (err.httpStatus === 410) {
          return c.json({ ok: false, reason: "expired" } satisfies PriceResponse, 410);
        }
        return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse);
      }
      log.error({ msg: "price.error", err: (err as Error).message });
      return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse, 500);
    }
  });

  return r;
}
```

- [ ] **Step 23.4: Mount in `apps/api/src/app.ts`** — add import and mount:

Add:
```ts
import { priceRoute } from "./routes/price.js";
```

Inside `makeApp`, after search mount:
```ts
  app.route("/api/price", priceRoute());
```

- [ ] **Step 23.5: Run tests, verify pass**

Run: `pnpm --filter @peron/api test routes/price`
Expected: PASS — 3 tests. Exits 0.

- [ ] **Step 23.6: Full test sweep + typecheck**

Run: `pnpm --filter @peron/api test && pnpm --filter @peron/api typecheck`
Expected: PASS across all ~60 tests, typecheck clean. Exits 0.

- [ ] **Step 23.7: Commit**

```bash
git add apps/api/src/routes/price.ts apps/api/src/app.ts apps/api/test/routes/price.test.ts
git commit -m "feat(api): POST /api/price with session pinning + rate limit"
```

**Section E checkpoint:** all three endpoints live. Search wires pool + parser + pins; price routes back to the pinned session and degrades cleanly to 410 on pin miss. Rate limits active. Structured JSON logs via pino. CORS allows dev + prod origin.

---

# Section F — Polish + live tests

## Task 24: Scaffolding cleanup + health test tightening + .env.example

**Files:**
- Modify: `apps/api/src/app.ts` (remove `/stations/sample`)
- Modify: `apps/api/test/health.test.ts` (drop `/stations/sample` test, Zod-parse the response)
- Create: `apps/api/.env.example`

- [ ] **Step 24.1: Remove `/stations/sample` route from `apps/api/src/app.ts`**

Delete this block from `makeApp`:
```ts
  // SCAFFOLDING: to be removed in Task 24
  app.get("/stations/sample", (c) =>
    c.json({ name: "București Nord", isImportant: true }),
  );
```

- [ ] **Step 24.2: Tighten `apps/api/test/health.test.ts`**

Replace the entire file with:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";

const HealthSchema = z.object({
  status: z.literal("ok"),
  pool: z.object({
    size: z.number().int().min(0),
    breakerOpen: z.boolean(),
  }),
  stations: z.object({
    cached: z.number().int().min(0),
  }),
});

describe("GET /health", () => {
  it("responds 200 with a well-formed health payload", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = HealthSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
```

The `as Station` cast is gone; we now Zod-parse the response shape. Also removes the now-obsolete `/stations/sample` test.

- [ ] **Step 24.3: Create `apps/api/.env.example`**

```
# CFR upstream base URL. Override only for staging/mirror testing.
CFR_BASE_URL=https://bilete.cfrcalatori.ro

# Allowed CORS origin in production. Dev always allows http://localhost:3000 in addition.
PERON_WEB_ORIGIN=https://peron.app

# pino log level: trace | debug | info | warn | error | fatal
LOG_LEVEL=info

# HTTP port for the Hono server.
PORT=3001

# Gate for live CFR integration tests. Unset in CI for PR builds; set to 1 in the nightly workflow.
# PERON_LIVE=1
```

- [ ] **Step 24.4: Run tests, typecheck**

Run: `pnpm --filter @peron/api test && pnpm --filter @peron/api typecheck`
Expected: PASS. Health test now uses Zod; route removal is clean.

- [ ] **Step 24.5: Commit**

```bash
git add apps/api/src/app.ts apps/api/test/health.test.ts apps/api/.env.example
git commit -m "chore(api): remove /stations/sample scaffold, Zod-parse health response, add .env.example"
```

---

## Task 25: Nightly @live GitHub Action

**Files:**
- Create: `apps/api/test/live/cfr.live.test.ts`
- Create: `.github/workflows/live.yml`

- [ ] **Step 25.1: Create `apps/api/test/live/cfr.live.test.ts`**

```ts
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
```

- [ ] **Step 25.2: Create `.github/workflows/live.yml`**

```yaml
name: Nightly live CFR check

on:
  schedule:
    # 03:17 UTC every day — off-peak for CFR, quiet for the IP.
    - cron: "17 3 * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: write

concurrency:
  group: live-${{ github.workflow }}
  cancel-in-progress: false

jobs:
  live:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Run live tests
        id: live
        env:
          PERON_LIVE: "1"
        run: pnpm --filter @peron/api test -- --reporter=verbose

      - name: Open issue on failure
        if: failure() && github.event_name == 'schedule'
        uses: actions/github-script@v7
        with:
          script: |
            const title = `Nightly live CFR check failed — ${new Date().toISOString().slice(0,10)}`;
            const body = [
              `The nightly \`@live\` workflow against real CFR failed.`,
              ``,
              `Likely causes (in order of probability):`,
              `1. CFR changed their HTML structure → parser needs a selector update.`,
              `2. CFR changed their form fields or endpoint paths → client needs an update.`,
              `3. Our Fly.io egress IP got flagged by CFR's captcha → consider rotating IPv4.`,
              ``,
              `See workflow run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            ].join("\n");

            const { data: existing } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: "open",
              labels: "live-failure",
            });
            if (existing.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existing[0].number,
                body,
              });
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title,
                body,
                labels: ["live-failure"],
              });
            }
```

Why `concurrency: cancel-in-progress: false`: if two nightly runs ever overlap, we don't want to cancel one — a failure signal is valuable; just let both finish.

Why the comment-on-existing-issue pattern: avoids spamming issues when the parser has been broken for days. Maintainer closes the issue when the fix merges.

- [ ] **Step 25.3: Dry-run the live test locally (optional, network-dependent)**

Run: `PERON_LIVE=1 pnpm --filter @peron/api test -- test/live`
Expected: either PASS (if CFR is up and IP isn't flagged) or an informative failure. Do not block merge on this.

- [ ] **Step 25.4: Verify default `pnpm test` still excludes live files**

Run: `pnpm --filter @peron/api test`
Expected: PASS — `*.live.test.ts` remains excluded (set via `vitest.config.ts`).

- [ ] **Step 25.5: Commit**

```bash
git add apps/api/test/live/ .github/workflows/live.yml
git commit -m "ci(api): nightly @live CFR check with auto-opened failure issue"
```

**Section F complete.**

---

## Done criteria

After all 25 tasks land:

- [ ] `pnpm typecheck` passes across workspace (types, api, web).
- [ ] `pnpm test` passes — ~60 tests across parser, client, pool, breaker, pins, registry, routes, health.
- [ ] `PERON_LIVE=1 pnpm --filter @peron/api test` runs the `*.live.test.ts` suite (green when CFR cooperates).
- [ ] `pnpm dev:api` serves on port 3001; `curl localhost:3001/health` returns `{"status":"ok","pool":{…},"stations":{…}}`.
- [ ] `curl -X POST -H 'content-type: application/json' -d '{"from":"Bucuresti Nord","to":"Brasov","date":"2026-05-21"}' localhost:3001/api/search` returns a JSON array of itineraries.
- [ ] `.github/workflows/live.yml` schedules nightly @live runs at 03:17 UTC and opens an issue on failure.
- [ ] `apps/api/.env.example` documents all envvars.
- [ ] Git log shows ~25 clean commits with descriptive subjects, one per task.
- [ ] No `SCAFFOLDING:` grep hits in `apps/api/src/`.

After this plan lands, **Plan 3 (frontend)** can begin: StationAutocomplete, DatePicker, SearchForm, ResultsList, ItineraryCard (collapsed + expanded), FareMatrix with progressive fill, ErrorState variants, /search SSR page, and E2E tests via Playwright + MSW.

**Plan 4 (deploy)** covers: Dockerfile + fly.toml (Warsaw region), Vercel config for apps/web, post-deploy canary, domain wiring, Sentry, Upptime uptime monitor.

---

## Operational notes for implementer

1. **Selector iteration budget (Tasks 6–7):** first parser passes against real fixtures are iterative. Open the fixture in a browser, inspect the DOM, widen selector chains in `tryText` calls. Each fallback selector you add is insurance against future CFR drift.

2. **MSW + rate limiter sharing (`resetRateLimits()`):** the `MemoryStore` is module-level and persists across tests in the same process. Always call `resetRateLimits()` in `beforeEach` of any route test that might cross the limit.

3. **Circuit breaker gotcha:** once tripped, it stays tripped for the cooldown. Tests that trip it and then expect normal behavior must either construct a fresh `SessionPool` or wait out the cooldown. Stick to fresh pools per describe block for test isolation.

4. **`creds_` leak (Task 22):** the search route grabs `session.creds_` via a cast. That's slightly ugly — the cleaner alternative is adding `session.searchViaRaw(...)` methods on `Session` that encapsulate `creds_`. If it offends you, refactor in a follow-up; the current form is explicit about the boundary.

5. **Diacritic handling in `searchRaw`:** the inline normalization in `apps/api/src/cfr/client.ts` is a micro-repeat of `toStationSlug` sans space→hyphen. If drift becomes a concern, extract to a shared `toCfrFormValue` helper.

6. **`parseOne` selectors will be wrong on first write:** that's expected. The test `extracts a complete itinerary from direct-bucuresti-brasov fixture` will fail and the fix is to open the fixture HTML and refine selectors. Treat this as a 30–60 minute budgeted iteration — don't rush past it.

7. **Live tests and captcha:** if `cfr.live.test.ts` starts failing with captcha errors in CI, it likely means GitHub Actions runners' egress IPs are being throttled. Options: swap to Fly.io scheduled machines for the live check, or rotate the IPv4 our backend uses. Out of scope for this plan.
