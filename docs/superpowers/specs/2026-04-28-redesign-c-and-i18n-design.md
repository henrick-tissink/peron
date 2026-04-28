# Peron — Direction C redesign + i18n + station board

**Status:** Approved 2026-04-28
**Predecessor:** Plan 4 (production deploy at garalagara.com complete)
**Successor:** Implementation plan to be written by the writing-plans skill

---

## Goal

Three concurrent product changes shipped as one cohesive release:

1. **Visual redesign** of every existing page from the current Linear/Vercel aesthetic to **Direction C — Departure Board**: black canvas, amber split-flap accents, monospace data, Space Grotesk + JetBrains Mono. Honest "this is unmistakably about trains" identity, suitable as a portfolio piece.
2. **Internationalization** to English (default), Romanian, German via path-based routing (`/`, `/ro/`, `/de/`).
3. **New feature: per-station live board** at `/station/[slug]` (and `/[locale]/station/[slug]`) showing the next ~20 scheduled departures and arrivals for that station, aggregated from real CFR search data.

This is a single coherent feature release; one spec, one implementation plan, one deploy.

---

## Design system

### Color tokens

Dark canvas is primary. (No light mode in v1 — see "Out of scope".)

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#0a0a0a` | page canvas |
| `--color-bg-subtle` | `#0f0f0f` | row hover, expanded section |
| `--color-bg-elev` | `#1a1a1a` | input background, board rows on hover |
| `--color-border` | `#1a1a1a` / `#2a2a2a` | section dividers / outlines |
| `--color-text` | `#fafafa` | primary text |
| `--color-text-muted` | `#a3a3a3` | secondary text |
| `--color-text-subtle` | `#525252` | tertiary text, labels, "via" lines |
| `--color-accent` | `#f59e0b` | amber — split-flap signature; times, active state, CTAs, live pulse |
| `--color-ok` | `#16a34a` | green — reserved for confirmations only (limited use; we don't have live status) |
| `--color-err` | `#dc2626` | red — reserved for error states |

Replaces all the existing `--color-peron-blue*` and zinc-based tokens in `apps/web/src/app/globals.css`. Existing tokens are removed, not aliased.

### Typography

Two faces only, both via `next/font/google` (already-used pattern in `app/layout.tsx`):

- **Space Grotesk** — display + body. Weights 400, 500, 600, 700. CSS variable `--font-display`.
- **JetBrains Mono** — all tabular and technical content (times, train numbers, durations, prices, station codes, footer text, labels). Weights 400, 500, 700. CSS variable `--font-mono`.

Inter is removed.

Type scale (Tailwind v4 `@theme inline`):

| Use | Size / weight |
|---|---|
| Hero (h1 home) | 76px / 700 / -0.045em |
| Page title (h1 station) | 56px / 700 / -0.04em |
| Results route (h1 search) | 32px / 700 / -0.02em |
| Section heading | 18-22px / 600 |
| Body | 14-15px / 400-500 |
| Labels (uppercase) | 10-11px / 500 / 0.15em letter-spacing |
| Times on board | 22-26px / 500 mono / amber |
| Train numbers | 13px / 500 mono / amber prefix |

### Animation

Keep it subtle. No full split-flap flip animations.

- **`pulse`** keyframe (1.5s ease-in-out infinite, opacity 1.0 ↔ 0.4) on the live indicator dot in `header` ticker and station-board page header.
- **Row expand** on results page: 200ms cubic-bezier height transition; chevron rotates 90° to point down.
- **Hover state** on board rows: `background: var(--color-bg-subtle)` with 150ms transition.
- **Clock**: ticking display, value updated every 60s (matches data refresh cadence; no per-second visual tick).
- **No** scroll-triggered animations, no parallax, no full-page transitions.

### Spacing / radii

- Card / canvas radius: 8px (used sparingly — most surfaces are flush)
- Button / input radius: 4-6px (square-leaning; matches industrial feel)
- Section padding: 28px horizontal / 24-32px vertical
- Grid gap on board rows: 18px
- Almost everything else uses Tailwind's default scale

---

## Pages

### `/` (home)

Restyle, no structural change. Components:

- **Header**: `PERON/RO` mono brand left (amber slash), language selector pill right (`[EN] RO DE`)
- **Live ticker** (NEW component `live-ticker.tsx`, top strip): rotating 3-row board of next departures from București Nord (the implicit default station). Calls `GET /api/board/bucuresti-nord?direction=departures&limit=3`. Refreshes every 60s. Header label "LIVE · BUCUREȘTI NORD · NEXT DEPARTURES" with pulse dot. Each row links to the matching search.
- **Hero**: `<h1>` "Find a train." (translated), 76px Space Grotesk weight 700, amber dot accent on the period.
- **Search form**: 4-segment mono grid (FROM / TO / DATE / submit-arrow). Each segment has a tiny uppercase label and the typed value below. `station-autocomplete.tsx` and `date-picker.tsx` restyled to match.
- **Popular routes**: 3-5 chip-style links with dashed amber underline ("BUC NORD → CLUJ", etc.). Hardcoded constant for v1.
- **Footer**: minimal mono, 1 line each side.

### `/search?from=...&to=...&date=...` (results)

Restyle, no structural change. Each itinerary renders as a board ROW (not a card):

- Columns: `times (from→to)` / `train` / `duration` / `direct/changes` / `price` / chevron
- Times in 22px mono, departure in amber, arrival in white
- Click row → expands inline with **fare matrix** (6 fare types × 2 classes) as a mono table, amber price values, tinted unavailable cells
- Inside the expansion: amber "BOOK ON CFR →" CTA in the bottom-right
- Hover: subtle background change

Header section above the rows: small uppercase "SEARCH RESULTS" meta, 32px route headline with amber arrow, then the date/itineraries-count/parseRate stats line in mono.

### `/station/[slug]` (NEW)

Per-station board page. Two tabs: **Departures** | **Arrivals**.

- Page header: live pulse + uppercase "NEXT DEPARTURES" / "NEXT ARRIVALS" label, station name as 56px h1, "UPDATED HH:MM" clock right-aligned, station description sub-line (e.g., "Romania's largest rail hub · CFR Călători") — pulled from a small static catalog for major stations.
- Tabs: amber active underline; tab counts in muted gray.
- Board (4 columns): `TIME` (26px amber mono) / `DESTINATION` (with `via …` sub-line in muted) / `TRAIN` (e.g., `IR 1735` with amber category prefix) / `DURATION`.
- Click row → navigates to `/search?from={current_station}&to={destination}&date={today}` (or `&date={today+1}` if all today's departures are past).
- Auto-refresh every 60s via SWR or simple `setInterval`.
- Footer with "← BACK TO SEARCH" link.

**Discoverability:**
- Click the station name in the homepage live ticker → `/station/bucuresti-nord`
- Small board icon next to the From input in the search form → station picker → board page
- Station names in itinerary cards become subtle links to that station's board

### `/error`, `/not-found`

Restyle to match. Mono error code (e.g., `404` in amber, `ERR_NOT_FOUND` mono label), helpful copy in active locale, "← BACK TO HOME" link.

---

## Internationalization

### Library

**`next-intl`** (`^4.0.0`) — chosen for native Next 16 App Router support, Server Component compatibility, type-safe message keys, locale-aware routing middleware. (Alternative `react-intl` requires more wiring and lacks first-class App Router routing helpers.)

### URL structure

Path-based with `localePrefix: 'as-needed'`:

| Locale | URL pattern |
|---|---|
| English (default) | `/`, `/search`, `/station/[slug]` |
| Romanian | `/ro/`, `/ro/search`, `/ro/station/[slug]` |
| German | `/de/`, `/de/search`, `/de/station/[slug]` |

### Detection

Standard next-intl middleware:

1. On first visit to a non-prefixed URL, the middleware checks `Accept-Language`. If RO or DE, redirect (302) to the prefixed equivalent.
2. After the user manually picks a language via the selector, set a `NEXT_LOCALE` cookie that overrides Accept-Language detection on subsequent visits.
3. Bots / crawlers (UA contains `bot`, `crawler`, `spider`) bypass auto-redirect — they crawl every locale URL as authored.

### Translation files

`apps/web/messages/{en,ro,de}.json`. Single flat namespace per page or component for v1 (e.g., `home.heroTitle`, `searchForm.fromLabel`, `stationBoard.departuresTab`). Refactor to nested namespaces only if a single file exceeds ~300 keys.

### Translation scope

| In scope | Out of scope |
|---|---|
| All user-visible UI chrome (labels, buttons, headings, errors, hints) | Station names (proper nouns) |
| Fare type names: Adult/Adult/Erwachsener; Pensionar/Senior/Rentner; Copil/Child/Kind; Elev/Pupil/Schüler; Student/Student/Student; "Adult + TrenPlus" stays | Train numbers + categories (R/IR/IC) |
| Class labels: Clasa 1 / Class 1 / Klasse 1 | CFR brand name |
| Date formatting via `Intl.DateTimeFormat(locale)` (29 Apr 2026 / 29 apr. 2026 / 29. Apr. 2026) | Romanian-only ConfirmationKey/__RequestVerificationToken values |
| Time formatting (24h universal) | Train detail URLs (CFR booking always in `ro-RO`) |

The fare-type labels currently live in `apps/web/src/lib/fares.ts` as static `FareTypeEntry[]`. After this work, the labels there become message keys (`fares.adult`, `fares.pensioner`, etc.) resolved via `useTranslations()`.

---

## Backend changes

### New endpoint: `GET /api/board/:slug`

Query params:
- `direction`: `"departures"` (default) | `"arrivals"`
- `limit`: integer 1-30, default 20

Response shape (in `packages/types/src/`):

```ts
type BoardEntry = {
  time: string;           // "HH:MM"
  counterpart: { name: string; slug: string };  // destination if departures, origin if arrivals
  via: string[];          // intermediate stop names, may be []
  train: { category: string; number: string };  // "IR" + "1735"
  durationMinutes: number;
};

type BoardResponse = {
  station: { name: string; slug: string };
  direction: "departures" | "arrivals";
  entries: BoardEntry[];
  updatedAt: string;      // ISO 8601
  source: "aggregated";   // future: "live" if CFR exposes one
  warning?: { kind: "no-data" | "rate-limited" | "captcha" };
};
```

### Aggregation strategy

CFR has no per-station departures endpoint (verified by recon — `bilete.cfrcalatori.ro` and `mersultrenurilor.infofer.ro` are both purely route-pair-based, no platform/delay data exposed anywhere). So we aggregate from search:

1. **Destination roster.** A static catalog `apps/api/src/cfr/board-roster.ts` mapping station slugs to their typical-destination lists. For the top ~25 stations (Bucharest Nord, Brașov, Cluj-Napoca, Constanța, Timișoara Nord, Iași, Craiova, Galați, Sibiu, Oradea, Arad, Suceava, Bacău, Ploiești, Predeal, Sinaia, Buzău, Pitești, Târgu Mureș, Satu Mare, Baia Mare, Brăila, Focșani, Tulcea, Reșița), curated 8-15 destinations each. For other stations, a default roster of the major hubs.
2. **Parallel scrape.** Run `searchRaw` for `(station, destination, today)` for each entry in the roster. Bound concurrency to 5. Each call ~1-2s; full sweep ~5-8s on cold cache.
3. **Aggregate.** For each destination, take the next-departing-after-now itinerary. Filter out past times. Sort all entries by departure time ascending. Dedupe by `(time, train number)` to handle trains that show up under multiple destination searches (a Bucuresti→Cluj train passes Brașov, so a Brașov-roster search and a Cluj-roster search both find it).
4. **Cache** the result per `(slug, direction, date)` for 60 seconds in-memory. After 60s, next request triggers a fresh aggregation; the stale value is returned with `Cache-Control: stale-while-revalidate=60` so the client gets instant response while a refresh runs.
5. **Pool integration.** Reuses existing `apps/api/src/cfr/client.ts` `bootstrap` + `searchRaw` + the session pool. Pool size and rate-limit settings unchanged.

### Arrivals

Symmetric to departures but with origin/destination flipped: `searchRaw(otherStation, thisStation, today)` with the same roster. Inverts which itinerary field is shown.

### Sentry

Wrap the route handler in the same `Sentry.captureException` pattern used in `routes/search.ts:94`. Add `route: "board"` tag.

### CORS

The existing `PERON_WEB_ORIGIN` allow-list automatically covers `https://garalagara.com`; the new endpoint inherits.

---

## Components

### New files

| File | Purpose |
|---|---|
| `apps/web/src/components/language-selector.tsx` | Pill-style EN/RO/DE button. Calls `next-intl`'s `useRouter().replace(pathname, { locale: nextLocale })`. |
| `apps/web/src/components/live-ticker.tsx` | Top-strip 3-row rotating ticker on home. SWR-backed against `/api/board`. |
| `apps/web/src/components/board-row.tsx` | Reusable departure/arrival row used by both station board and live ticker. |
| `apps/web/src/components/clock.tsx` | Displays a "HH:MM" clock that ticks every 60s. |
| `apps/web/src/app/[locale]/station/[slug]/page.tsx` | Station board page (Server Component, fetches initial data; client component handles tab swap + auto-refresh). |
| `apps/web/src/lib/api-board.ts` | Client helper for `/api/board/:slug`. |
| `apps/web/src/i18n/routing.ts` | next-intl routing config (locales, defaultLocale, pathnames). |
| `apps/web/src/i18n/request.ts` | next-intl request config (loads message file for current locale). |
| `apps/web/messages/en.json` / `ro.json` / `de.json` | Translation files. |
| `apps/web/middleware.ts` | next-intl middleware (locale detection + cookie). |
| `apps/api/src/routes/board.ts` | The new `/api/board/:slug` route. |
| `apps/api/src/cfr/board-roster.ts` | Static destination catalog. |
| `apps/api/src/services/board-aggregator.ts` | Aggregation logic (parallel scrape + dedup + cache). |
| `packages/types/src/board.ts` | `BoardResponse`, `BoardEntry`. |

### Restyled / refactored

| File | Changes |
|---|---|
| `apps/web/src/app/globals.css` | New token set, font variables, dark-only canvas. |
| `apps/web/src/app/layout.tsx` | Move into `apps/web/src/app/[locale]/layout.tsx`; load Space Grotesk + JetBrains Mono via next/font; provide next-intl `NextIntlClientProvider`. Root `app/layout.tsx` becomes a minimal HTML scaffold. |
| `apps/web/src/app/page.tsx` | Becomes `apps/web/src/app/[locale]/page.tsx`; restyled hero + ticker + form + popular chips. |
| `apps/web/src/app/search/page.tsx` | Becomes `apps/web/src/app/[locale]/search/page.tsx`; restyled. |
| `apps/web/src/app/header.tsx` | C aesthetic: mono brand + language selector. |
| `apps/web/src/app/footer.tsx` | C aesthetic: mono single-line. |
| `apps/web/src/app/error.tsx`, `not-found.tsx` | Restyled. |
| `apps/web/src/components/search-form.tsx` | 4-segment mono grid layout. |
| `apps/web/src/components/results-list.tsx` | Renders `<board-row>` instead of `<itinerary-card>`. |
| `apps/web/src/components/itinerary-card.tsx` | Replaced or refactored as expanded-row content (fare matrix container). |
| `apps/web/src/components/fare-matrix.tsx` | Mono table style. |
| `apps/web/src/components/station-autocomplete.tsx` | Dark dropdown, mono entries, amber selection. |
| `apps/web/src/components/date-picker.tsx` | Dark theme. |
| `apps/web/src/components/error-state.tsx`, `skeleton.tsx`, `cfr-link.tsx` | Restyled. |
| `apps/web/src/lib/fares.ts` | `FARE_TYPES` labels become message keys. |

---

## Implementation order

A suggested sequence to keep each step independently shippable / testable. The implementation plan will refine this.

1. **Tokens + fonts** — globals.css rewrite, font variables wired, Inter removed.
2. **i18n infrastructure** — install next-intl, set up middleware + routing config, restructure `app/` into `app/[locale]/`, port existing pages with translation keys (English only initially), verify build.
3. **Header + footer + nav** — language selector, brand, lang detection round-trip.
4. **Restyle home + search-form + results + fare-matrix** — page-by-page in C aesthetic.
5. **Backend** — `BoardResponse` types, `board-roster.ts` catalog, new `apps/api/src/services/` directory with `board-aggregator.ts`, `routes/board.ts`, register on app, smoke-test against prod CFR. Add a 30-second post-boot warm-up that pre-aggregates the top 5 stations so the first user request is warm.
6. **Station board page** — `/station/[slug]` page + `board-row` component + live tab swap.
7. **Live ticker on home** — wire to `/api/board`.
8. **RO + DE translation files** — full strings, native-speaker review eventually but DeepL-quality acceptable for v1.
9. **Polish** — auto-refresh, hover states, animations, mobile responsive (≤640px stacks vertically), keyboard nav on language selector, prefers-reduced-motion respect.
10. **Deploy** — push to main, redeploy api + web in Coolify, run canary, update production baseline if changed.

---

## Testing approach

- **API unit tests**: `board-aggregator.ts` covered with vitest, mocking the CFR client via the existing dependency-injection pattern in `app.ts`. Verify dedup-by-(time, train number), filtering of past times, sort-by-time, empty-roster fallback, and cache TTL behavior.
- **API integration test (live)**: a `PERON_LIVE=1`-gated test that actually scrapes CFR for `/api/board/bucuresti-nord` and asserts ≥1 entry — same pattern as the existing live-search test.
- **Web e2e (Playwright)**: extend `apps/web/test/` with: language-switch round-trip (EN → RO → cookie persistence verified), `/station/bucuresti-nord` smoke (page renders, tab swap works, click-to-search works), and a Romanian-locale search flow.
- **Translation parity test**: a CI-time JSON-shape test asserting `en.json`, `ro.json`, `de.json` have the exact same key set. Catches missed translations.
- **No new visual regression / screenshot tests** for v1; rely on Playwright's structural assertions.

## Out of scope

- **Light mode** — dark-only for v1. C aesthetic is distinctly dark; light mode would dilute. Add later if requested.
- **Real-time platforms / delays** — CFR doesn't expose, recon confirmed.
- **Booking flow** — still external (CFR's site).
- **More languages** beyond EN/RO/DE — French, Hungarian, etc. deferred.
- **Saved/favorite routes**, **search history**, **personalization** — deferred.
- **Push notifications**, **train tracking** — deferred.
- **A11y audit** — basic ARIA on interactive elements only; full audit deferred.
- **Native-speaker translation review** — DeepL-quality acceptable for v1; flag for review post-launch.
- **Per-locale SEO** (hreflang tags, locale sitemaps) — basic implementation only; SEO refinement deferred.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `/api/board/:slug` first-call latency 5-8s | 60s in-memory cache + stale-while-revalidate; warm-up the top 5 stations on api boot via a startup job |
| Aggregation puts ~10× search load on CFR per cold board fetch | Bound concurrency to 5, cap roster sizes at 15 destinations per station, monitor CFR error rate in Sentry; back off if `cfr-unavailable` rate climbs |
| next-intl + Next 16 compatibility | Pin `next-intl@^4.0`; smoke-test build before merging; have a rollback plan that reverts the `app/[locale]/` move |
| Roster goes stale (CFR drops a route) | Aggregator already filters to "next-departing-after-now"; if a destination has zero results, it's silently dropped from the board with no error |
| German / Romanian translations have errors | Mark as v1; add a footer "report a translation issue" link wired to GitHub Issues; commit to native-speaker review before v1.1 |
| CFR adds platform/delay data later (or we discover an API) | The `BoardResponse` already has `source: "aggregated"` discriminator; future `"live"` source can add platform/status fields without breaking shape |
| Sentry instrumentation regression on the new route | Mirror the pattern from `routes/search.ts:94` exactly; verify a deliberate 500 lands in Sentry post-deploy |

---

## Acceptance criteria

For the implementation plan and final QA:

- [ ] `https://garalagara.com/` renders the C-aesthetic homepage with live ticker, search form, language selector
- [ ] Search flow works in all three locales (EN/RO/DE), URLs prefixed appropriately
- [ ] First visit from a German `Accept-Language` browser → auto-redirects to `/de/`
- [ ] Manual language switch sets `NEXT_LOCALE` cookie and persists across visits
- [ ] Fare matrix prices render correctly in all locales
- [ ] `/station/bucuresti-nord` renders the board page; tab swap works; auto-refresh works; click-to-search works
- [ ] `/api/board/bucuresti-nord` returns ≥10 entries, latencyMs <8s cold, <100ms warm (cached)
- [ ] Mobile (≤640px): all pages usable, no horizontal scroll, language selector accessible
- [ ] Canary script (`./scripts/canary.sh`) passes (existing baseline preserved)
- [ ] Lighthouse performance ≥90 on home and results (mobile)
- [ ] Sentry captures errors from new `/api/board` and `/station` routes
- [ ] No regressions: existing /api/search and /api/price still pass parseSuccessRate ≥0.95

---

## Open questions

None at spec time. All five conceptual decisions (URL structure, default locale, translation scope, animation level, board data source) were resolved during brainstorming.
