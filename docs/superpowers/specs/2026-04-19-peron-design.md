# Peron — v1 Design

**Date:** 2026-04-19
**Status:** Approved, ready for implementation planning
**Author:** Henrick Tissink (with Claude)

## Mission

Peron is a cleaner, faster, mobile-friendly frontend for searching trains on Romania's national rail network. It replaces `bilete.cfrcalatori.ro/ro-RO/Itineraries` for the search/browse step and links back to CFR's official site for booking.

**v1 goal:** a user can search A→B by date, see all available trains with inline prices and service icons, expand any result for a full fare matrix across passenger types and classes, and deep-link to CFR to complete the purchase.

## Non-goals (v1)

Explicit scope boundaries — these are deferred, not forgotten:

- **No booking.** We never handle payment, 3-D Secure, seat selection, or user identity. "Book on CFR →" deep-links out.
- **No user accounts.** No login, no DB, no saved state beyond localStorage.
- **No price alerts, notifications, or multi-leg planning.** These are Phase B/C work.
- **No international trains.** CFR's "Trafic Internațional" flow uses a different endpoint set and is deferred.
- **No train live-tracker page.** CFR exposes this at `/ro-RO/Tren/{number}` and we reuse its deep-link, but we do not render delay/stop-by-stop detail ourselves in v1.

## Positioning

Public side-project, free, portfolio-grade. Real domain (`peron.app` or similar), real users, moderate ops/legal risk tolerance. Not monetized in v1; revenue questions deferred.

## Personality

Utility-first. Sober, info-dense, fast. Palette: zinc neutrals with a blue-600 rail accent; Inter 14px base; monospace for departure/arrival times; dark mode via `prefers-color-scheme`. Explicitly **not** Tavli-playful — rail is a transactional tool, not a leisure destination.

## Architecture

Two deploys, one shared types package, pnpm monorepo.

```
┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ peron.app (Vercel)  │    │ api.peron.app       │    │ bilete.cfr...    │
│ Next.js 16 frontend │───▶│ Hono on Fly.io      │───▶│ CFR ASP.NET      │
│ SSR + static        │REST│ ~400 LOC proxy      │HTML│ scraped          │
│ no backend state    │    │ + cheerio + pool    │    │                  │
└─────────────────────┘    └──────────┬──────────┘    └──────────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │ in-memory    │
                              │ session pool │
                              │ 1–3 sessions │
                              └──────────────┘
```

**Key properties:**
- Frontend is stateless. Zero database. All session/token state is in the backend's memory.
- Backend maintains a small pool of warm CFR sessions. Refreshes on expiry or `ReCaptchaFailed`.
- One shared TypeScript types package (`@peron/types`) enforces the JSON contract across apps.
- No Redis, no queue, no external store in v1. Saved routes (Phase B) and accounts (Phase C) slot in without rearchitecture.

**Repo layout:**
```
peron/
├── apps/
│   ├── web/           Next.js 16 app → Vercel
│   └── api/           Hono service → Fly.io
├── packages/
│   └── types/         Shared JSON contract
├── pnpm-workspace.yaml
└── README.md
```

## Components

### Backend (`apps/api`)

Hono on Node runtime. Fly.io deploy, `waw` (Warsaw) region — geographically close to CFR to reduce latency and present an IP likelier to be well-regarded by a Romanian service.

Three subsystems:

**1. Session pool.** Pool of up to 3 warm CFR sessions. Each session holds:
- Cookie jar (CfDJ8… ASP.NET Core Data Protection cookie)
- Current `__RequestVerificationToken`
- Current `ConfirmationKey`
- Last-used timestamp
- Consecutive-failure counter

Acquire-release pattern: the pool picks the oldest idle session, marks it busy, caller executes, caller releases. Sessions older than 15 minutes are refreshed in-place (fresh GET to `/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov`, re-extract tokens) before use. Dead sessions (captcha or 5xx) are evicted; the pool re-fills lazily on next demand. Cold-start is lazy — no pre-warming, since bot-like traffic patterns invite detection.

**Serialization model:** each session has a serialized queue (no parallel requests on one cookie jar, to prevent token/transaction-string crosstalk). The pool fans requests across queues. Net throughput = 3× single-session capacity with no shared-state risk.

**Circuit breaker:** if three sessions die with captcha within 60 seconds, the pool enters a 2-minute backoff — returns `captcha` errors without hitting CFR. Prevents retry storms from making the situation worse.

**2. CFR client.** Thin `fetch` wrapper. Methods:
- `search({from, to, date, filters})` → posts to `/ro-RO/Itineraries/GetItineraries`, returns raw HTML
- `price({transactionString, fareTypeId, serviceKey})` → posts to `/api/ro-RO/Itineraries/Price`, returns raw HTML snippet
- `stations()` → GETs landing page, regex-extracts `availableStations` JS array
- `bootstrap()` → GETs a `Rute-trenuri/{from}/{to}` page, harvests cookie + tokens

Handles: ASCII transliteration of diacritics for URL paths ("București Nord" → "Bucuresti-Nord"), `application/x-www-form-urlencoded` body encoding, HTML-entity decoding via cheerio's `.text()`, typed error bubbling (`CaptchaError`, `TokenExpiredError`, `UpstreamError`).

**3. HTML parser.** Cheerio-based. Parses the ~2MB results fragment into a typed array of `Itinerary` objects:

```ts
type Itinerary = {
  id: string                      // "itinerary-0" — stable within a session
  transactionString: string       // opaque, required for price + booking
  sessionId: string               // which session issued this — for price routing
  departure: { time: string; station: string; platform?: string }
  arrival:   { time: string; station: string; platform?: string }
  duration:  { hours: number; minutes: number }
  segments:  Array<{
    trainCategory: string         // "R" | "RE" | "IR" | "IRN" | "IC" etc. — kept as string so new categories don't break the parser
    trainNumber: string
    from: string
    to: string
    departTime: string
    arriveTime: string
  }>
  transferCount: number
  priceFrom:  { amount: number; currency: "RON"; fareType: "Adult"; class: "2" } | null
  services:   {
    bikeCar: boolean
    barRestaurant: boolean
    sleeper: boolean
    couchette: boolean
    onlineBuying: boolean
  }
  trainDetailUrl: string          // CFR's /ro-RO/Tren/{number} URL
  bookingUrl:     string          // CFR Rute-trenuri URL with date param
}
```

**Defensive parsing principles (non-negotiable):**
1. Every selector has a fallback chain. Primary selector fails → try secondary → regex fallback over raw HTML. Itineraries use `li[id^="li-itinerary-"]` primary.
2. Zod validates each itinerary. Invalid itineraries are dropped (logged, not thrown) so one malformed train doesn't poison the whole search.
3. Golden fixtures. Six saved HTML responses in `apps/api/test/fixtures/`:
   - `direct-bucuresti-brasov.html` (baseline, multiple direct IR and R trains)
   - `with-transfer-bucuresti-sibiu.html` (transfer at Brașov)
   - `sleeper-bucuresti-cluj.html` (IR 1753 with sleeper + couchette)
   - `international-timisoara-budapest.html` (international train, different card shape)
   - `no-results-remote-pair.html` (empty state, no itineraries detected)
   - `captcha-response.txt` (literal "ReCaptchaFailed" body)
   Parser tests must pass all six. Any parser change requires running the fixture suite.
4. Parser emits `meta.parseSuccessRate = parsed / detected`. Logged per search; alerted if <0.9.

**Station list bootstrap.** On first `/stations` request (or first search if station-name normalization is needed), backend fetches the CFR landing page, regex-extracts the `availableStations` JS array literal, `JSON.parse`s it, and caches in memory. 1719 entries. No automatic refresh — invalidated only by backend redeploy. Changes to Romania's station list happen perhaps once a year; an occasional manual redeploy is fine.

**Rate limit.** Hono rate-limit middleware: 50 req / 5 min per IP on `/api/search`, 100 / 5 min on `/api/price`. Purpose: prevent Peron from being used as a DDoS weapon against CFR, not to stop abuse of Peron itself.

**Transaction-string pinning.** Each `transactionString` returned from a search is tagged with the originating `sessionId`. The `/api/price` handler uses this to route Price requests back to the same session that issued the transactionString (otherwise CFR rejects as expired). Map lives in memory; entries expire after 30 minutes. On Fly.io machine restart, in-flight fare matrices return 410 Gone — frontend handles cleanly.

### Frontend (`apps/web`)

Next.js 16 (app router), TypeScript, Tailwind CSS v4. Matches the Tavli stack at `/Users/henricktissink/Sauce/masaro/`.

**Routes:**
- `/` — landing + search form. Static, fast. Prefetches station list via `/api/stations`.
- `/search` — results page, SSR'd from `?from=X&to=Y&date=YYYY-MM-DD`. Server component calls `/api/search` during render, so first paint has real data. URL is the canonical shareable form.
- `/404`, `/_error` — friendly error pages with a link to cfrcalatori.ro.

**Components (9):**
- `StationAutocomplete` — controlled input, client-side fuzzy match using the same normalization logic CFR uses (startsWith-match first on diacritic-normalized ASCII, then substring fallback). ~30 LOC, zero deps.
- `DatePicker` — native `<input type="date">`, Tailwind-styled. `min=today`, default `tomorrow`.
- `SearchForm` — composes the above, plus submit + swap-stations button.
- `ResultsList` — list of `ItineraryCard`s.
- `ItineraryCard` — collapsed shows time/station/duration/train-name/priceFrom + service icons. Click → expands.
- `FareMatrix` — 6 fare types × N classes. Lazy-fetches prices via parallel `POST /api/price` per cell; renders cells progressively as they arrive.
- `ErrorState` — 6 variants (see Error Handling below); picks the right copy and recovery action from a discriminated union.
- `CfrLink` — styled "Book on CFR →" external link with consistent visual treatment.
- `Skeleton` — loading placeholders.

**Styling.** Zinc neutrals + blue-600 rail accent. Inter 14px base, tight line-height, monospace numerics (`tabular-nums` Tailwind class) for times. Dark mode via `prefers-color-scheme`. No decorative images; Lucide React for icons.

### Shared (`packages/types`)

Single file: `packages/types/index.ts`. Exports `Itinerary`, `Station`, `SearchRequest`, `SearchResponse`, `PriceRequest`, `PriceResponse`, `SearchError` (discriminated union). Imported by both `apps/web` and `apps/api`. Any breaking change requires both apps to redeploy in lockstep.

## Data flow

### Flow 1: search request (cold backend)

1. User submits search form → browser navigates to `/search?from=Bucuresti-Nord&to=Brasov&date=2026-04-20`.
2. Next.js server component calls `POST /api/search` with `{from, to, date}`.
3. Backend: pool empty → `bootstrap()` (GET Rute-trenuri page, harvest tokens). Spawns session S1.
4. Backend: `search()` on S1 (POST GetItineraries). Returns ~2MB HTML.
5. Backend: cheerio parse → JSON array. Zod validates. Drops any that fail. Emits `parseSuccessRate` log line.
6. Backend: releases S1 to pool. Returns `SearchResponse` JSON.
7. Next.js SSRs the results list into HTML. Browser receives first paint.

End-to-end latency: ~2–3s cold, ~1–1.5s warm.

### Flow 2: fare matrix expand

1. User clicks details on card 3. Card holds `transactionString` and `sessionId`.
2. Browser issues 12 parallel `POST /api/price` requests (6 fare types × 2 classes).
3. Backend: routes each to session S1 (the pinned session). Queued on S1's serial queue.
4. Backend: each call hits CFR `/api/ro-RO/Itineraries/Price`, returns a small HTML snippet.
5. Backend: extracts `{amount, currency}`, responds.
6. Browser: renders each cell progressively as its response arrives (~200ms–3s).

### Flow 3: deep-link to CFR

Pure `<a href="...">` — no JS, no form post, no proxying. Format:
```
https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/{asciiFrom}/{asciiTo}?DepartureDate={DD.MM.YYYY}
```

User lands on CFR's own search-results page, re-picks their train, clicks Cumpără. Tradeoff: one redundant click on CFR (can't pass our `transactionString` since it's session-bound to our backend). This is the only reliable option.

### Flow 4: station list bootstrap

First request to `/api/stations`: backend fetches CFR landing page, regex-extracts the `availableStations` literal, caches in memory forever (until redeploy). Frontend fetches once on mount, caches in localStorage with version key `peron.stations.v1`. Version bumps on backend redeploy invalidate the cache.

### Session lifecycle state machine

```
          spawn
            │
            ▼
       ┌─ FRESH ──────────┐
       │                  │
       │  acquire()       │
       ▼                  │
     BUSY                 │
       │ success          │
       ├──────────────────┤
       │ captcha          │ age > 15min
       ▼                  ▼
     DEAD              REFRESH
       │                  │
       │ evict            │ GET Rute-trenuri
       ▼                  │ extract tokens
    (gone)                ▼
                       FRESH
```

Circuit breaker: if three DEAD transitions within 60 seconds → backoff mode for 2 minutes (all requests return `captcha` without hitting CFR).

## Error handling

Backend returns a discriminated union:

```ts
type SearchError =
  | { kind: "captcha",          retryAfterSec: number }
  | { kind: "no-results" }
  | { kind: "partial",          parsedCount: number, detectedCount: number }
  | { kind: "parser-failure",   detail: string }
  | { kind: "cfr-unavailable",  httpStatus: number }
  | { kind: "our-bug",          errorId: string }
```

Frontend UX per kind:

| Kind | User sees | Recovery |
|---|---|---|
| `no-results` | "No trains between {X} and {Y} on {date}." + day-before / day-after buttons + CFR link | Nearby-date buttons |
| `partial` | Render parsed itineraries + muted banner: "{M} more trains found — view all on cfrcalatori.ro ↗" | Banner link to CFR |
| `captcha` | "CFR is temporarily blocking automated searches. Try again in a minute, or search directly on cfrcalatori.ro ↗" + countdown | Retry button (enabled after `retryAfterSec`) |
| `parser-failure` | "Something on CFR's side changed and we can't read the response right now. We've been notified." + CFR link | Link out only |
| `cfr-unavailable` | "CFR's booking system seems to be down." + @CFRCalatori Twitter | Retry button |
| `our-bug` | "Something broke on our side. Error ID: {id}." + mail link | Refresh |

**Tone:** calm, no apology spam, always an out. No `alert()`, no toasts, no modals. Error state replaces the results region; search form stays intact for in-place retry.

**Partial-result case** is interesting: the SearchResponse includes both `itineraries: [...]` and `warning: { kind: "partial", ... }`. Render both.

## Testing

### Backend
- **Parser tests** (`apps/api/src/parser/*.test.ts`): six golden fixtures. Assert itinerary count, first/last shape. 95%+ line coverage target. Run every commit.
- **Session pool tests**: MSW mocks. Cover acquire/release, refresh-on-age, evict-on-captcha, backoff entry/exit, concurrent requests, dead-session replacement.
- **CFR client tests**: MSW mocks. ASCII normalization, form encoding, header set, retry-once-on-expired-token.
- **Live integration test** (`*.live.ts`, tagged `@live`): hits real CFR. Runs nightly via GitHub Action + manually pre-deploy. Never on regular CI. Early-warning for parser drift, not a merge blocker.

### Frontend
- **Component tests** (Vitest + Testing Library): StationAutocomplete matcher logic, SearchForm validation, ItineraryCard render states, FareMatrix progressive fill, ErrorState variants.
- **E2E** (Playwright, headless): three flows — (a) home → search Buc→Bra → ≥1 card renders, (b) expand card → fare matrix populates, (c) click "Book on CFR" → correct external URL. Backend mocked by MSW — never hits live CFR in E2E.

### Deploy sanity
- Post-deploy canary: backend runs one live Buc→Bra search for tomorrow. Fail → halt rollout via Fly.io release check.
- Weekly GitHub Action runs `@live` parser tests. Failure auto-opens an issue.

### Explicitly out of scope (v1)
Load testing, chaos testing, formal WCAG audit. Basic accessibility (semantic HTML, keyboard-navigable form, Tailwind defaults) is in; audit is deferred.

## Observability

- Structured logs on backend for every CFR request: endpoint, session ID, latency, status, parse success rate (where relevant), error kind (where relevant).
- Sentry free tier on both apps for uncaught errors.
- Upptime (GitHub-Actions-based free uptime) pinging `api.peron.app/health`.
- Weekly manual review: are any error-kind counters spiking? `parser-failure` spike → CFR changed HTML, fix parser. `captcha` spike → IP reputation declining, consider rotating Fly IPv4.

## Security

- Backend exposes only read endpoints. No auth, no write paths.
- Rate-limit per IP (50 req/5min on search, 100/5min on price) — to protect CFR from Peron, not to protect Peron from users.
- CORS on backend: `peron.app` origin only in production, `localhost:*` in development.
- No secrets in frontend. Backend env vars: only CFR base URL (configurable for staging).
- If popular: add Cloudflare in front of backend for DDoS protection. Out of scope for v1 unless needed.

## Phased roadmap (for context, not v1)

**Phase B — trip utility (post-launch, ~1 week each):**
- Saved routes (localStorage)
- Recent-searches dropdown (localStorage)
- Train live-tracker page at `/train/{number}` (reuses backend, new frontend route)
- Day-of-week recurring search ("every Friday, Buc→Sibiu")

**Phase C — product ambition (post-traction, each 1–3 weeks):**
- Accounts (Supabase)
- Price alerts (cron + email)
- Push notifications for delays / schedule changes
- Multi-leg planning
- International trains (different endpoint surface; effectively a second backend module)

None require rearchitecting v1. This is why the Option-2 split (stateless frontend, in-memory backend) matters: new features slot into either side without touching the other.

## Known tradeoffs & risks

1. **Pool size of 3** is a guess. Will tune on real traffic.
2. **Deep-link to CFR uses route URL, not TransactionString.** One extra click on CFR vs. a seamless handoff. Accepted — TransactionString is session-bound to our backend.
3. **No caching.** Every search hits CFR fresh. Could add a 60s cache per (from, to, date) later if we see repeated searches.
4. **reCAPTCHA is the #1 operational risk.** If Fly.io's IP for our backend gets flagged, search fails until we rotate. Mitigation: Warsaw region (better geo-rep), dedicated IPv4 ($2/mo) as a Plan B, eventual residential VPS if the game gets serious.
5. **Parser drift.** CFR redeploys will break us occasionally. Golden fixtures + weekly live test + parseSuccessRate alert are the defenses. Fix-forward is a 30-minute redeploy of the api service.
6. **Legal.** CFR's ToS likely forbids scraping. For a small free side-project linking out for booking, risk is low. If Peron gets traction, formal ToS review before any monetization.

## Open questions

None blocking implementation. Domain registration (`peron.app` vs `peron.ro`) can be decided at deploy time.
