# Direction-C Redesign + i18n + Station Boards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Direction-C visual redesign, EN/RO/DE i18n, and the new per-station live board (`/station/[slug]`) as one cohesive release on top of the production deploy from Plan 4.

**Architecture:** Tailwind v4 token rewrite + `next/font` swap to Space Grotesk + JetBrains Mono. `next-intl@^4` for path-based locale routing (`/`, `/ro/`, `/de/`) with `Accept-Language` auto-detection and `NEXT_LOCALE` cookie persistence. New `/api/board/:slug` Hono route aggregates parallel `searchRaw` calls against a static destination roster, with a 60s in-memory cache and a boot-time warm-up for the top 5 stations.

**Tech Stack:** Next 16 (App Router, standalone build, --webpack flag for Sentry compat), Tailwind v4 (`@theme inline` CSS-first config), next-intl 4, next/font/google (Space Grotesk + JetBrains Mono), Hono (api), tsup (api bundler), Vitest (api unit), Playwright (web e2e).

**Predecessor:** Plan 4 (production deploy at garalagara.com)
**Spec:** `docs/superpowers/specs/2026-04-28-redesign-c-and-i18n-design.md`

**Open assumptions (flag if wrong before executing):**
- The user is OK with German + Romanian translations being DeepL-quality at v1 (flagged in spec).
- Coolify auto-deploy webhook is still NOT wired (per Plan 4 task 17, deferred). Final deploy step is manual click in Coolify.
- The api's session pool currently caps concurrent bootstraps; we don't change those settings — board aggregator's parallelism (5) is bounded enough not to exhaust.

---

## Section A — Foundation (tokens, fonts, smoke)

### Task 1: Install next-intl + replace font dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add next-intl, replace Inter with Space Grotesk + JetBrains Mono via next/font**

```bash
pnpm --filter @peron/web add next-intl@^4.0.0
```

(Both Space Grotesk and JetBrains Mono are loaded via `next/font/google` at runtime — no extra packages needed beyond Next.)

- [ ] **Step 2: Verify install**

```bash
grep -E '"next-intl"' apps/web/package.json
```

Expected: line shows `"next-intl": "^4.0.0"` (or whatever resolves to that range).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add next-intl@^4"
```

---

### Task 2: Swap fonts in the root layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Replace Inter import with Space Grotesk + JetBrains Mono**

Replace the entire `import { Inter } ... const inter = Inter({...})` block with:

```ts
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

const display = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});
```

- [ ] **Step 2: Wire both font variables onto `<html>`**

Change `<html lang="ro" className={inter.variable}>` to `<html lang="en" className={\`${display.variable} ${mono.variable}\`}>` (locale changes to en since EN is the default; full i18n routing comes in Section B).

- [ ] **Step 3: Build + visual smoke**

```bash
pnpm --filter @peron/web build
```

Expected: build succeeds. (Don't worry about styling yet — next task rewires the tokens.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "style(web): swap Inter for Space Grotesk + JetBrains Mono"
```

---

### Task 3: Rewrite globals.css with the C aesthetic tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Replace the entire file**

```css
@import "tailwindcss";

@theme inline {
  /* Surfaces */
  --color-bg: #0a0a0a;
  --color-bg-subtle: #0f0f0f;
  --color-bg-elev: #1a1a1a;
  --color-border: #1a1a1a;
  --color-border-strong: #2a2a2a;

  /* Text */
  --color-text: #fafafa;
  --color-text-muted: #a3a3a3;
  --color-text-subtle: #525252;

  /* Accent + status */
  --color-accent: #f59e0b;
  --color-ok: #16a34a;
  --color-err: #dc2626;

  /* Radii */
  --radius-card: 8px;
  --radius-control: 6px;

  /* Fonts (variables set in layout.tsx via next/font) */
  --font-sans: var(--font-display), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, "SF Mono", Menlo, monospace;
}

@layer base {
  html { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); }
  body { background: var(--color-bg); color: var(--color-text); }
  ::selection { background: var(--color-accent); color: var(--color-bg); }
}

/* Live-pulse animation for status dots */
@keyframes pulse-amber {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.pulse { animation: pulse-amber 1.5s ease-in-out infinite; }

/* Reduced-motion respect */
@media (prefers-reduced-motion: reduce) {
  .pulse { animation: none; }
  * { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
```

- [ ] **Step 2: Build + smoke**

```bash
pnpm --filter @peron/web build
```

Expected: build succeeds. Pages render dark with no styling layer regressions yet (existing components still use old Tailwind utility classes — visual breakage is expected and gets fixed page-by-page in Section D).

- [ ] **Step 3: Run dev server, eyeball home page once**

```bash
pnpm --filter @peron/web dev
```

Open `http://localhost:3000`. Expected: home renders dark canvas with white text. Layout is broken (search form looks cramped, etc.) — that's expected. Confirm fonts load (DevTools → Network → fonts tab shows Space Grotesk + JetBrains Mono).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style(web): C-aesthetic design tokens (dark canvas + amber accent)"
```

---

## Section B — i18n infrastructure

### Task 4: Create next-intl routing config

**Files:**
- Create: `apps/web/src/i18n/routing.ts`

- [ ] **Step 1: Create the file**

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ro", "de"] as const,
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/i18n/routing.ts
git commit -m "feat(web): next-intl routing config (en default, ro, de)"
```

---

### Task 5: Create next-intl request config

**Files:**
- Create: `apps/web/src/i18n/request.ts`

- [ ] **Step 1: Create the file**

```ts
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 2: Wire it into `next.config.ts`**

Modify `apps/web/next.config.ts`. At the top after the existing imports:

```ts
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
```

Change the bottom export:

```ts
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: "peron-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/i18n/request.ts apps/web/next.config.ts
git commit -m "feat(web): next-intl request config + plugin wired into next.config"
```

---

### Task 6: Create middleware for locale detection

**Files:**
- Create: `apps/web/middleware.ts` (at the **app root**, not inside src/)

- [ ] **Step 1: Create the file**

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all paths except: api, monitoring (Sentry tunnel), _next, files with extensions
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(web): locale middleware (Accept-Language detection + cookie)"
```

---

### Task 7: Seed translation files

**Files:**
- Create: `apps/web/messages/en.json`
- Create: `apps/web/messages/ro.json`
- Create: `apps/web/messages/de.json`

- [ ] **Step 1: Create `apps/web/messages/en.json`**

```json
{
  "header": {
    "brand": "PERON/RO"
  },
  "footer": {
    "site": "PERON · GARALAGARA.COM",
    "tagline": "Built for CFR Călători"
  },
  "home": {
    "heroTitle": "Find a train.",
    "heroSubtitle": "CFR Călători · live data · book direct",
    "popularLabel": "POPULAR",
    "tickerLabel": "LIVE · BUCUREȘTI NORD · NEXT DEPARTURES"
  },
  "searchForm": {
    "fromLabel": "FROM",
    "fromPlaceholder": "Departure station",
    "toLabel": "TO",
    "toPlaceholder": "Arrival station",
    "dateLabel": "DATE",
    "submit": "Search",
    "swap": "Swap stations"
  },
  "results": {
    "metaLabel": "SEARCH RESULTS",
    "stats": "{count, plural, one {# itinerary} other {# itineraries}} · {latencyMs}ms",
    "direct": "DIRECT",
    "changes": "{count, plural, one {# change} other {# changes}}",
    "details": "Details",
    "hide": "Hide",
    "from": "FROM",
    "noResults": "No itineraries found.",
    "warningCaptcha": "CFR is showing a captcha. Try again in a minute.",
    "warningUnavailable": "CFR is unreachable right now.",
    "warningOurBug": "Something broke on our side. Error ID: {errorId}"
  },
  "fareMatrix": {
    "fareType": "FARE TYPE",
    "class1": "CLASS 1",
    "class2": "CLASS 2",
    "loading": "…",
    "unavailable": "—",
    "bookOnCfr": "Book on CFR →"
  },
  "fares": {
    "adult": "Adult",
    "adultTrenPlus": "Adult + TrenPlus",
    "child": "Child (6–14)",
    "pupil": "Pupil",
    "student": "Student",
    "senior": "Senior"
  },
  "stationBoard": {
    "metaDepartures": "NEXT DEPARTURES",
    "metaArrivals": "NEXT ARRIVALS",
    "tabDepartures": "DEPARTURES",
    "tabArrivals": "ARRIVALS",
    "headTime": "TIME",
    "headDestination": "DESTINATION",
    "headOrigin": "ORIGIN",
    "headTrain": "TRAIN",
    "headDuration": "DURATION",
    "via": "via {stops}",
    "direct": "direct",
    "updatedLabel": "UPDATED",
    "annotation": "SCHEDULED · AGGREGATED FROM CFR · REFRESH EVERY 60s",
    "backToSearch": "← BACK TO SEARCH",
    "noEntries": "No upcoming departures."
  },
  "errors": {
    "title404": "Page not found",
    "code404": "ERR_NOT_FOUND",
    "back": "← BACK TO HOME",
    "title500": "Something went wrong",
    "code500": "ERR_INTERNAL",
    "retry": "Try again"
  },
  "language": {
    "selectorLabel": "Language",
    "en": "English",
    "ro": "Română",
    "de": "Deutsch"
  }
}
```

- [ ] **Step 2: Create `apps/web/messages/ro.json`**

```json
{
  "header": {
    "brand": "PERON/RO"
  },
  "footer": {
    "site": "PERON · GARALAGARA.COM",
    "tagline": "Construit pentru CFR Călători"
  },
  "home": {
    "heroTitle": "Caută un tren.",
    "heroSubtitle": "CFR Călători · date live · rezervă direct",
    "popularLabel": "POPULARE",
    "tickerLabel": "LIVE · BUCUREȘTI NORD · URMĂTOARELE PLECĂRI"
  },
  "searchForm": {
    "fromLabel": "DE LA",
    "fromPlaceholder": "Stație de plecare",
    "toLabel": "LA",
    "toPlaceholder": "Stație de sosire",
    "dateLabel": "DATA",
    "submit": "Caută",
    "swap": "Inversează stațiile"
  },
  "results": {
    "metaLabel": "REZULTATE CĂUTARE",
    "stats": "{count, plural, one {# itinerar} other {# itinerarii}} · {latencyMs}ms",
    "direct": "DIRECT",
    "changes": "{count, plural, one {# schimbare} other {# schimbări}}",
    "details": "Detalii",
    "hide": "Ascunde",
    "from": "DE LA",
    "noResults": "Nu s-au găsit itinerarii.",
    "warningCaptcha": "CFR cere un captcha. Încercați din nou într-un minut.",
    "warningUnavailable": "CFR este indisponibil în acest moment.",
    "warningOurBug": "Ceva s-a stricat pe partea noastră. ID eroare: {errorId}"
  },
  "fareMatrix": {
    "fareType": "TIP TARIF",
    "class1": "CLASA 1",
    "class2": "CLASA 2",
    "loading": "…",
    "unavailable": "—",
    "bookOnCfr": "Rezervă pe CFR →"
  },
  "fares": {
    "adult": "Adult",
    "adultTrenPlus": "Adult + TrenPlus",
    "child": "Copil (6–14)",
    "pupil": "Elev",
    "student": "Student",
    "senior": "Pensionar"
  },
  "stationBoard": {
    "metaDepartures": "URMĂTOARELE PLECĂRI",
    "metaArrivals": "URMĂTOARELE SOSIRI",
    "tabDepartures": "PLECĂRI",
    "tabArrivals": "SOSIRI",
    "headTime": "ORA",
    "headDestination": "DESTINAȚIE",
    "headOrigin": "PROVENIENȚĂ",
    "headTrain": "TREN",
    "headDuration": "DURATĂ",
    "via": "via {stops}",
    "direct": "direct",
    "updatedLabel": "ACTUALIZAT",
    "annotation": "ORAR · AGREGAT DE LA CFR · REÎMPROSPĂTAT LA 60s",
    "backToSearch": "← ÎNAPOI LA CĂUTARE",
    "noEntries": "Nicio plecare programată."
  },
  "errors": {
    "title404": "Pagina nu a fost găsită",
    "code404": "ERR_NOT_FOUND",
    "back": "← ÎNAPOI ACASĂ",
    "title500": "Ceva nu a mers bine",
    "code500": "ERR_INTERNAL",
    "retry": "Încearcă din nou"
  },
  "language": {
    "selectorLabel": "Limbă",
    "en": "English",
    "ro": "Română",
    "de": "Deutsch"
  }
}
```

- [ ] **Step 3: Create `apps/web/messages/de.json`**

```json
{
  "header": {
    "brand": "PERON/RO"
  },
  "footer": {
    "site": "PERON · GARALAGARA.COM",
    "tagline": "Gebaut für CFR Călători"
  },
  "home": {
    "heroTitle": "Finde einen Zug.",
    "heroSubtitle": "CFR Călători · Echtzeitdaten · direkt buchen",
    "popularLabel": "BELIEBT",
    "tickerLabel": "LIVE · BUCUREȘTI NORD · NÄCHSTE ABFAHRTEN"
  },
  "searchForm": {
    "fromLabel": "VON",
    "fromPlaceholder": "Abfahrtsbahnhof",
    "toLabel": "NACH",
    "toPlaceholder": "Zielbahnhof",
    "dateLabel": "DATUM",
    "submit": "Suchen",
    "swap": "Bahnhöfe tauschen"
  },
  "results": {
    "metaLabel": "SUCHERGEBNISSE",
    "stats": "{count, plural, one {# Verbindung} other {# Verbindungen}} · {latencyMs}ms",
    "direct": "DIREKT",
    "changes": "{count, plural, one {# Umstieg} other {# Umstiege}}",
    "details": "Details",
    "hide": "Ausblenden",
    "from": "AB",
    "noResults": "Keine Verbindungen gefunden.",
    "warningCaptcha": "CFR zeigt ein Captcha. Bitte in einer Minute erneut versuchen.",
    "warningUnavailable": "CFR ist gerade nicht erreichbar.",
    "warningOurBug": "Bei uns ist etwas schiefgelaufen. Fehler-ID: {errorId}"
  },
  "fareMatrix": {
    "fareType": "TARIFART",
    "class1": "KLASSE 1",
    "class2": "KLASSE 2",
    "loading": "…",
    "unavailable": "—",
    "bookOnCfr": "Auf CFR buchen →"
  },
  "fares": {
    "adult": "Erwachsener",
    "adultTrenPlus": "Erwachsener + TrenPlus",
    "child": "Kind (6–14)",
    "pupil": "Schüler",
    "student": "Student",
    "senior": "Rentner"
  },
  "stationBoard": {
    "metaDepartures": "NÄCHSTE ABFAHRTEN",
    "metaArrivals": "NÄCHSTE ANKÜNFTE",
    "tabDepartures": "ABFAHRTEN",
    "tabArrivals": "ANKÜNFTE",
    "headTime": "ZEIT",
    "headDestination": "ZIEL",
    "headOrigin": "VON",
    "headTrain": "ZUG",
    "headDuration": "DAUER",
    "via": "über {stops}",
    "direct": "direkt",
    "updatedLabel": "AKTUALISIERT",
    "annotation": "FAHRPLAN · VON CFR AGGREGIERT · ALLE 60s AKTUALISIERT",
    "backToSearch": "← ZURÜCK ZUR SUCHE",
    "noEntries": "Keine Abfahrten geplant."
  },
  "errors": {
    "title404": "Seite nicht gefunden",
    "code404": "ERR_NOT_FOUND",
    "back": "← ZUR STARTSEITE",
    "title500": "Etwas ist schiefgelaufen",
    "code500": "ERR_INTERNAL",
    "retry": "Erneut versuchen"
  },
  "language": {
    "selectorLabel": "Sprache",
    "en": "English",
    "ro": "Română",
    "de": "Deutsch"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(web): seed EN/RO/DE translation files"
```

---

### Task 8: Translation parity test

**Files:**
- Create: `apps/web/test/i18n-parity.test.ts`
- Modify: `apps/web/package.json` — add `vitest` if not present

- [ ] **Step 1: Verify vitest is available**

```bash
grep -E '"vitest"' apps/web/package.json
```

If missing, add: `pnpm --filter @peron/web add -D vitest@^2.1.0`

- [ ] **Step 2: Write the parity test**

```ts
import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import ro from "../messages/ro.json";
import de from "../messages/de.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatKeys(v as Record<string, unknown>, path));
    else out.push(path);
  }
  return out.sort();
}

describe("i18n parity", () => {
  const enKeys = flatKeys(en);
  const roKeys = flatKeys(ro);
  const deKeys = flatKeys(de);

  it("ro has every key en has", () => {
    expect(roKeys).toEqual(enKeys);
  });
  it("de has every key en has", () => {
    expect(deKeys).toEqual(enKeys);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm --filter @peron/web exec vitest run test/i18n-parity.test.ts
```

Expected: PASS. If it fails, fix the locale file with the missing key (do not silence the test).

- [ ] **Step 4: Commit**

```bash
git add apps/web/test/i18n-parity.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(web): i18n parity test (en/ro/de keys must match)"
```

---

### Task 9: Restructure `app/` into `app/[locale]/`

**Files:**
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx` (move from `app/page.tsx`)
- Create: `apps/web/src/app/[locale]/search/page.tsx` (move from `app/search/page.tsx`)
- Modify: `apps/web/src/app/layout.tsx` (becomes minimal HTML scaffold)
- Delete: `apps/web/src/app/page.tsx`, `apps/web/src/app/search/page.tsx`

- [ ] **Step 1: Create the locale-aware layout**

`apps/web/src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing";
import { Header } from "../header";
import { Footer } from "../footer";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 2: Move `app/page.tsx` → `app/[locale]/page.tsx`**

```bash
mv apps/web/src/app/page.tsx apps/web/src/app/[locale]/page.tsx
```

Edit the new file: change the import path for `SearchForm`/`fetchStations` from `"../components/search-form"` / `"../lib/api"` to `"../../components/search-form"` / `"../../lib/api"` (one extra `../`).

- [ ] **Step 3: Move `app/search/page.tsx` → `app/[locale]/search/page.tsx`**

```bash
mkdir -p apps/web/src/app/\[locale\]/search
mv apps/web/src/app/search/page.tsx apps/web/src/app/\[locale\]/search/page.tsx
rmdir apps/web/src/app/search
```

Edit the new file: bump import paths the same way (one extra `../`).

- [ ] **Step 4: Slim down the root layout**

Replace `apps/web/src/app/layout.tsx` with:

```tsx
import "./globals.css";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

const display = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Peron — train search for Romania",
  description: "A cleaner, faster, mobile-friendly frontend for Romania's national rail network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${display.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
```

(Header / Footer / `<main>` move into `[locale]/layout.tsx`.)

- [ ] **Step 5: Build verifies**

```bash
pnpm --filter @peron/web build
```

Expected: build succeeds. If routing fails, check for stray imports of `app/page.tsx` or `app/search/page.tsx`.

- [ ] **Step 6: Smoke in dev**

```bash
pnpm --filter @peron/web dev
```

Open `http://localhost:3000/` (English, no prefix) and `http://localhost:3000/ro/` (Romanian). Both should render. Layout is still ugly — that's fine.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): move pages under [locale]/ routing"
```

---

### Task 10: Wire `useTranslations()` into existing pages (English-only smoke)

**Files:**
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/[locale]/search/page.tsx`

(Other components keep hardcoded strings until Section D restyles them; this task just confirms the i18n plumbing works on top-level pages.)

- [ ] **Step 1: Use translations in homepage**

In `apps/web/src/app/[locale]/page.tsx`, near the top:

```tsx
import { setRequestLocale, getTranslations } from "next-intl/server";

// inside Home(), before the return:
const { locale } = await params;
setRequestLocale(locale);
const t = await getTranslations("home");
```

Update the page signature:

```tsx
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
```

Replace hardcoded strings:
- `<h1>Find a train.</h1>` → `<h1>{t("heroTitle")}</h1>`
- The subtitle paragraph text → `{t("heroSubtitle")}`

- [ ] **Step 2: Same for search page**

In `apps/web/src/app/[locale]/search/page.tsx`, similar pattern. Just enough to verify the `useTranslations`-on-server-components flow works.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @peron/web build && pnpm --filter @peron/web dev
```

Open `/`, `/ro/`, `/de/` — each should show its locale's hero title.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/
git commit -m "feat(web): wire useTranslations() into home + search pages"
```

---

## Section C — Header, Footer, Language Selector

### Task 11: LanguageSelector component

**Files:**
- Create: `apps/web/src/components/language-selector.tsx`
- Create: `apps/web/test/language-selector.test.tsx` (component test, vitest + RTL)

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { routing } from "../i18n/routing";

export function LanguageSelector() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(target: string) {
    if (target === locale) return;
    // Strip current locale prefix if present, then prepend new prefix unless target is default ("as-needed").
    const stripped = pathname.replace(new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`), "") || "/";
    const next = target === routing.defaultLocale ? stripped : `/${target}${stripped === "/" ? "" : stripped}`;
    document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; samesite=lax`;
    router.replace(next);
  }

  return (
    <div
      role="group"
      aria-label={t("selectorLabel")}
      className="inline-flex items-center gap-1 rounded border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[11px] tracking-widest"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          aria-current={l === locale ? "true" : "false"}
          className={
            l === locale
              ? "rounded-sm bg-[var(--color-accent)] px-1.5 py-0.5 text-[var(--color-bg)]"
              : "px-1.5 py-0.5 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Component test (jsdom)**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageSelector } from "../src/components/language-selector";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string) => k,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

describe("LanguageSelector", () => {
  it("renders all 3 locale buttons with EN active", () => {
    render(<LanguageSelector />);
    expect(screen.getByText("EN")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("RO")).toHaveAttribute("aria-current", "false");
    expect(screen.getByText("DE")).toHaveAttribute("aria-current", "false");
  });
});
```

If `@testing-library/react` + `jsdom` aren't installed:

```bash
pnpm --filter @peron/web add -D @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom
```

Add to `apps/web/vitest.config.ts` (create if missing):

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
```

`apps/web/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @peron/web exec vitest run test/language-selector.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/language-selector.tsx apps/web/test/language-selector.test.tsx apps/web/vitest.config.ts apps/web/test/setup.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): LanguageSelector component (en/ro/de pill switcher)"
```

---

### Task 12: Restyle Header

**Files:**
- Modify: `apps/web/src/app/header.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageSelector } from "../components/language-selector";

export function Header() {
  return <HeaderInner />;
}

function HeaderInner() {
  // useTranslations works in server components since next-intl@4
  const t = useTranslations("header");
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-7 py-4 text-xs">
      <Link href="/" className="font-mono font-semibold tracking-widest uppercase">
        PERON<span className="text-[var(--color-accent)]">/</span>RO
      </Link>
      <LanguageSelector />
    </header>
  );
}
```

(Note: `useTranslations` works in server components in next-intl 4. If `Header` is rendered from a server context, it stays server-side. The `LanguageSelector` is "use client".)

- [ ] **Step 2: Build smoke**

```bash
pnpm --filter @peron/web build && pnpm --filter @peron/web dev
```

Open `/`. Expected: dark header with `PERON/RO` brand on the left, language pill on the right.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/header.tsx
git commit -m "style(web): restyle Header (mono brand + lang selector)"
```

---

### Task 13: Restyle Footer

**Files:**
- Modify: `apps/web/src/app/footer.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-7 py-4 font-mono text-[11px] tracking-wider text-[var(--color-text-subtle)] uppercase">
      <span>{t("site")}</span>
      <span>{t("tagline")}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Visual verify, then commit**

```bash
git add apps/web/src/app/footer.tsx
git commit -m "style(web): restyle Footer (mono single-line)"
```

---

## Section D — Restyle pages + components

### Task 14: Restyle Home

**Files:**
- Modify: `apps/web/src/app/[locale]/page.tsx`

- [ ] **Step 1: Replace the rendered JSX**

Keep the data-fetching at the top of the function. Replace the JSX with:

```tsx
return (
  <div className="mx-auto max-w-3xl px-4 py-20 md:py-28">
    <section className="mb-12 text-center">
      <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
        {t("heroTitle").replace(/\.$/, "")}
        <span className="text-[var(--color-accent)]">.</span>
      </h1>
      <p className="mt-5 font-mono text-xs tracking-widest text-[var(--color-text-muted)] uppercase">
        {t("heroSubtitle")}
      </p>
    </section>
    <SearchForm stations={stations} />
    <p className="mt-10 text-center font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
      {t("popularLabel")} ·
      <PopularChip from="Bucuresti-Nord" to="Cluj-Napoca" label="BUC NORD → CLUJ" />
      ·
      <PopularChip from="Bucuresti-Nord" to="Brasov" label="BUC NORD → BRAȘOV" />
      ·
      <PopularChip from="Timisoara-Nord" to="Bucuresti-Nord" label="TIMIȘOARA → BUC NORD" />
    </p>
  </div>
);
```

Add the `PopularChip` helper at the bottom of the file:

```tsx
function PopularChip({ from, to, label }: { from: string; to: string; label: string }) {
  const params = new URLSearchParams({ from, to, date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) });
  return (
    <a
      href={`/search?${params.toString()}`}
      className="mx-1.5 border-b border-dashed border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)]"
    >
      {label}
    </a>
  );
}
```

- [ ] **Step 2: Build smoke + visual**

```bash
pnpm --filter @peron/web dev
```

Open `/`. Expected: black canvas, big "Find a train" headline with amber dot, search form below (still old styling — fixed in Task 15), popular chips below.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\[locale\]/page.tsx
git commit -m "style(web): restyle home (hero + popular chips)"
```

---

### Task 15: Restyle SearchForm

**Files:**
- Modify: `apps/web/src/components/search-form.tsx`

- [ ] **Step 1: Read the existing file to understand its prop shape**

```bash
cat apps/web/src/components/search-form.tsx
```

Key things to preserve: the props (`stations: Station[]`), submit handler that navigates to `/search?from=&to=&date=`, the StationAutocomplete + DatePicker child components.

- [ ] **Step 2: Restyle the layout container**

Replace the form's outer `<form>` element styling with the 4-segment grid:

```tsx
<form
  onSubmit={onSubmit}
  className="grid max-w-2xl mx-auto grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-px overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-border-strong)]"
>
  <SegField label={t("fromLabel")}>
    <StationAutocomplete value={from} onChange={setFrom} stations={stations} placeholder={t("fromPlaceholder")} />
  </SegField>
  <SegField label={t("toLabel")}>
    <StationAutocomplete value={to} onChange={setTo} stations={stations} placeholder={t("toPlaceholder")} />
  </SegField>
  <SegField label={t("dateLabel")}>
    <DatePicker value={date} onChange={setDate} />
  </SegField>
  <button
    type="submit"
    aria-label={t("submit")}
    className="bg-[var(--color-accent)] px-8 font-mono font-semibold text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90"
  >
    →
  </button>
</form>
```

Add a small helper component:

```tsx
function SegField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-elev)] px-4 py-3">
      <div className="font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{label}</div>
      <div className="mt-1 font-mono text-sm text-[var(--color-text)]">{children}</div>
    </div>
  );
}
```

Replace any hardcoded form labels in the existing file with the `t(...)` calls. Add `import { useTranslations } from "next-intl";` and `const t = useTranslations("searchForm");` near the top.

- [ ] **Step 3: Smoke test the search flow**

```bash
pnpm --filter @peron/web dev
```

Type a station, pick a date, submit. Should navigate to `/search?from=...&to=...&date=...`. Layout in dev environment may look broken until Tasks 16-17 restyle the inner components.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/search-form.tsx
git commit -m "style(web): SearchForm 4-segment mono grid layout"
```

---

### Task 16: Restyle StationAutocomplete

**Files:**
- Modify: `apps/web/src/components/station-autocomplete.tsx`

- [ ] **Step 1: Update the dropdown styles**

Read existing file. Find: input element classes, dropdown ul/div classes, list item classes. Replace with:

- Input: `bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none w-full font-mono text-sm`
- Dropdown wrapper: `absolute z-10 mt-2 w-full rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] shadow-lg max-h-64 overflow-y-auto`
- List item base: `px-4 py-2 font-mono text-sm cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]`
- Selected/highlighted item: `bg-[var(--color-accent)]/10 text-[var(--color-accent)]`
- "important" station marker (stations marked `isImportant: true`): add a tiny amber dot before the name

- [ ] **Step 2: Visual verify in dev, then commit**

```bash
git add apps/web/src/components/station-autocomplete.tsx
git commit -m "style(web): StationAutocomplete dark dropdown"
```

---

### Task 17: Restyle DatePicker

**Files:**
- Modify: `apps/web/src/components/date-picker.tsx`

- [ ] **Step 1: Update the date picker styles**

The component renders an input + calendar grid. Apply:

- Input button: `bg-transparent text-[var(--color-text)] font-mono text-sm w-full text-left outline-none`
- Calendar popover: `absolute z-10 mt-2 rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] p-4 shadow-lg`
- Day cells (default): `font-mono text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]`
- Selected day: `bg-[var(--color-accent)] text-[var(--color-bg)]`
- Disabled day (past): `text-[var(--color-text-subtle)] opacity-50 cursor-not-allowed`

- [ ] **Step 2: Format output as the user-visible string in the active locale**

If the current value-display logic uses `toLocaleDateString()`, switch to `useFormatter()` from next-intl:

```tsx
import { useFormatter } from "next-intl";
const format = useFormatter();
const display = format.dateTime(value, { day: "numeric", month: "short", year: "numeric" });
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/date-picker.tsx
git commit -m "style(web): DatePicker dark theme + locale-aware formatting"
```

---

### Task 18: Restyle results page + ItineraryCard → BoardRow

**Files:**
- Modify: `apps/web/src/app/[locale]/search/page.tsx`
- Modify: `apps/web/src/components/results-list.tsx`
- Modify: `apps/web/src/components/itinerary-card.tsx` (rename internally to BoardRow, but keep file name to minimize import churn)

- [ ] **Step 1: Restyle results page header**

In `apps/web/src/app/[locale]/search/page.tsx`, the page renders a header above `<ResultsList>`. Replace its styling:

```tsx
const t = await getTranslations("results");
const format = await getFormatter();
// ...
<div className="border-b border-[var(--color-border)] px-7 py-6">
  <div className="font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
    {t("metaLabel")}
  </div>
  <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
    {fromName}
    <span className="mx-3 text-[var(--color-accent)]">→</span>
    {toName}
  </h1>
  <div className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
    {format.dateTime(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase()}
    {" · "}
    {t("stats", { count: itineraries.length, latencyMs: meta.latencyMs })}
  </div>
</div>
```

- [ ] **Step 2: Convert ItineraryCard to a board row**

Replace the existing card render with a 6-column grid:

```tsx
<button
  type="button"
  onClick={onToggleExpand}
  className={`grid w-full grid-cols-[100px_1fr_100px_80px_110px_24px] items-center gap-5 border-b border-[var(--color-border)] px-7 py-4 text-left transition-colors hover:bg-[var(--color-bg-subtle)] ${expanded ? "bg-[var(--color-bg-subtle)]" : ""}`}
>
  <div className="font-mono text-base">
    <span className="text-[var(--color-accent)]">{itinerary.departure.time}</span>
    <span className="mx-1 text-[var(--color-text-subtle)]">→</span>
    <span className="text-[var(--color-text)]">{itinerary.arrival.time}</span>
  </div>
  <div>
    <div className="font-mono text-sm">
      {itinerary.segments.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-2 text-[var(--color-text-subtle)]">+</span>}
          <span className="text-[var(--color-accent)]">{s.trainCategory}</span>
          <span className="text-[var(--color-text)]"> {s.trainNumber}</span>
        </span>
      ))}
    </div>
    <div className="mt-1 font-mono text-[11px] text-[var(--color-text-subtle)]">
      {itinerary.departure.station} — {itinerary.arrival.station}
    </div>
  </div>
  <div className="text-right font-mono text-sm text-[var(--color-text-muted)]">
    {Math.floor(itinerary.duration.hours)}h {String(itinerary.duration.minutes).padStart(2, "0")}m
  </div>
  <div className="font-mono text-[11px] tracking-widest uppercase text-[var(--color-ok)]">
    {itinerary.transferCount === 0 ? t("direct") : t("changes", { count: itinerary.transferCount })}
  </div>
  <div className="text-right font-mono text-sm">
    {itinerary.priceFrom ? (
      <>
        <span className="text-[var(--color-text)]">{itinerary.priceFrom.amount}</span>
        <span className="ml-1 text-[var(--color-text-subtle)] text-[11px]">{itinerary.priceFrom.currency}</span>
      </>
    ) : (
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">{t("from")}</span>
    )}
  </div>
  <div className={`text-right text-base ${expanded ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"}`}>
    {expanded ? "⌄" : "›"}
  </div>
</button>
```

When expanded, render the existing `<FareMatrix />` underneath in a wrapper:

```tsx
{expanded && (
  <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-7 py-4">
    <FareMatrix transactionString={itinerary.transactionString} />
    <div className="mt-3 flex justify-end">
      <a
        href={itinerary.bookingUrl}
        target="_blank"
        rel="noreferrer"
        className="bg-[var(--color-accent)] px-5 py-2 font-mono text-xs font-semibold tracking-wide text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90"
      >
        {t("..", { /* fareMatrix.bookOnCfr — note: pull from "fareMatrix" namespace */ })}
      </a>
    </div>
  </div>
)}
```

(Practical note: the bookOnCfr key lives in `fareMatrix` namespace; in the JSX use a separate `useTranslations("fareMatrix")` call or compose the namespace.)

- [ ] **Step 3: Smoke**

Run a real search: open `/search?from=Bucuresti-Nord&to=Brasov&date=<tomorrow>`. Should see board rows. Click one to expand. Fare matrix appears underneath (still old styling — fixed next task).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\[locale\]/search/page.tsx apps/web/src/components/results-list.tsx apps/web/src/components/itinerary-card.tsx
git commit -m "style(web): results page board-row layout"
```

---

### Task 19: Restyle FareMatrix

**Files:**
- Modify: `apps/web/src/components/fare-matrix.tsx`

- [ ] **Step 1: Update FARE_TYPES labels to translation keys**

In `apps/web/src/lib/fares.ts`, change each `label`/`labelShort` to a translation key path:

```ts
export const FARE_TYPES: FareTypeEntry[] = [
  { id: "73", labelKey: "adult" },
  { id: "71", labelKey: "adultTrenPlus" },
  { id: "72", labelKey: "child" },
  { id: "50", labelKey: "pupil" },
  { id: "74", labelKey: "student" },
  { id: "53", labelKey: "senior" },
];
```

Update the type definition:

```ts
export type FareTypeEntry = { id: FareTypeId; labelKey: string };
```

- [ ] **Step 2: Restyle the table in fare-matrix.tsx**

```tsx
const t = useTranslations("fareMatrix");
const tFares = useTranslations("fares");
// ...
<table className="w-full font-mono text-xs">
  <thead>
    <tr className="border-b border-[var(--color-border)]">
      <th className="py-2 px-3 text-left text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{t("fareType")}</th>
      {SERVICE_KEYS.map((s) => (
        <th key={s.key} className="py-2 px-3 text-right text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">
          {s.key === "A&A" ? t("class1") : t("class2")}
        </th>
      ))}
    </tr>
  </thead>
  <tbody>
    {FARE_TYPES.map((f) => (
      <tr key={f.id}>
        <td className="py-2 px-3 text-[var(--color-text-muted)]">{tFares(f.labelKey)}</td>
        {SERVICE_KEYS.map((s) => {
          const cell = cells[key(f.id, s.key)];
          if (cell.status === "loading") return <td key={s.key} className="py-2 px-3 text-right text-[var(--color-text-subtle)]">{t("loading")}</td>;
          const r = cell.result;
          if (!r.ok) return <td key={s.key} className="py-2 px-3 text-right text-[var(--color-border-strong)]">{t("unavailable")}</td>;
          return (
            <td key={s.key} className="py-2 px-3 text-right">
              <span className="text-[var(--color-accent)]">{r.amount}</span>{" "}
              <span className="text-[var(--color-text-subtle)]">{r.currency}</span>
            </td>
          );
        })}
      </tr>
    ))}
  </tbody>
</table>
```

- [ ] **Step 3: Smoke (click Details on results)**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/fare-matrix.tsx apps/web/src/lib/fares.ts
git commit -m "style(web): FareMatrix mono table + translation keys"
```

---

### Task 20: Restyle Skeleton, ErrorState, CfrLink

**Files:**
- Modify: `apps/web/src/components/skeleton.tsx`
- Modify: `apps/web/src/components/error-state.tsx`
- Modify: `apps/web/src/components/cfr-link.tsx`

- [ ] **Step 1: Skeleton — dark pulse**

```tsx
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--color-bg-elev)] ${className}`} />;
}
```

- [ ] **Step 2: ErrorState — mono code + amber retry**

Whatever message it shows, wrap with this shell:

```tsx
<div className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
  <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">{code /* e.g. "ERR_..." */}</span>
  <p>{message}</p>
  {onRetry && (
    <button onClick={onRetry} className="mt-2 bg-[var(--color-accent)] px-4 py-2 text-[var(--color-bg)] uppercase text-[10px] tracking-widest">
      {t("retry")}
    </button>
  )}
</div>
```

- [ ] **Step 3: CfrLink — amber CTA**

```tsx
<a
  {...props}
  className="bg-[var(--color-accent)] px-5 py-2 font-mono text-xs font-semibold tracking-wide text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90"
>
  {children}
</a>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/skeleton.tsx apps/web/src/components/error-state.tsx apps/web/src/components/cfr-link.tsx
git commit -m "style(web): Skeleton + ErrorState + CfrLink restyled"
```

---

### Task 21: Restyle error.tsx and not-found.tsx

**Files:**
- Modify: `apps/web/src/app/error.tsx`
- Modify: `apps/web/src/app/not-found.tsx`

- [ ] **Step 1: not-found.tsx**

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-accent)]">{t("code404")}</span>
      <h1 className="font-display text-4xl font-bold">{t("title404")}</h1>
      <Link href="/" className="mt-2 font-mono text-xs tracking-widest text-[var(--color-text-muted)] uppercase hover:text-[var(--color-accent)]">
        {t("back")}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: error.tsx**

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-err)]">{t("code500")}</span>
      <h1 className="font-display text-4xl font-bold">{t("title500")}</h1>
      <button onClick={reset} className="mt-2 bg-[var(--color-accent)] px-5 py-2 font-mono text-xs tracking-widest text-[var(--color-bg)] uppercase">
        {t("retry")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build smoke + commit**

```bash
pnpm --filter @peron/web build
git add apps/web/src/app/error.tsx apps/web/src/app/not-found.tsx
git commit -m "style(web): error + not-found pages restyled"
```

---

## Section E — Backend `/api/board`

### Task 22: BoardEntry + BoardResponse types

**Files:**
- Create: `packages/types/src/board.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create types**

```ts
export type BoardDirection = "departures" | "arrivals";

export type BoardWarning =
  | { kind: "no-data" }
  | { kind: "rate-limited" }
  | { kind: "captcha" };

export type BoardEntry = {
  time: string;            // "HH:MM"
  counterpart: { name: string; slug: string }; // destination if departures, origin if arrivals
  via: string[];           // intermediate station names; [] if direct
  train: { category: string; number: string };
  durationMinutes: number;
};

export type BoardResponse = {
  station: { name: string; slug: string };
  direction: BoardDirection;
  entries: BoardEntry[];
  updatedAt: string;       // ISO 8601
  source: "aggregated";
  warning?: BoardWarning;
};
```

- [ ] **Step 2: Re-export from index**

In `packages/types/src/index.ts`, add:

```ts
export type { BoardDirection, BoardWarning, BoardEntry, BoardResponse } from "./board.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/board.ts packages/types/src/index.ts
git commit -m "feat(types): BoardEntry + BoardResponse shapes"
```

---

### Task 23: Static destination roster

**Files:**
- Create: `apps/api/src/cfr/board-roster.ts`

- [ ] **Step 1: Create the file**

```ts
// Canonical destinations used to aggregate "next departures from X" by running parallel
// /api/search calls. Slugs match toStationSlug() output. Lists are intentionally short
// (10-12 entries) to keep cold-cache aggregation under ~8s.

const ROSTER: Record<string, string[]> = {
  "Bucuresti-Nord": ["Brasov", "Cluj-Napoca", "Constanta", "Iasi", "Timisoara-Nord", "Craiova", "Galati", "Sibiu", "Oradea", "Suceava", "Bacau", "Aeroport-Henri-Coanda"],
  "Brasov": ["Bucuresti-Nord", "Sibiu", "Cluj-Napoca", "Predeal", "Sinaia", "Ploiesti", "Targu-Mures", "Sighisoara"],
  "Cluj-Napoca": ["Bucuresti-Nord", "Brasov", "Oradea", "Sibiu", "Sighisoara", "Dej", "Baia-Mare", "Satu-Mare", "Arad"],
  "Constanta": ["Bucuresti-Nord", "Galati", "Brasov", "Mangalia", "Iasi"],
  "Timisoara-Nord": ["Bucuresti-Nord", "Cluj-Napoca", "Arad", "Craiova", "Resita-Sud", "Oradea"],
  "Iasi": ["Bucuresti-Nord", "Cluj-Napoca", "Suceava", "Bacau", "Constanta", "Galati"],
  "Craiova": ["Bucuresti-Nord", "Timisoara-Nord", "Sibiu", "Brasov", "Cluj-Napoca"],
  "Galati": ["Bucuresti-Nord", "Brasov", "Iasi", "Constanta", "Buzau", "Braila"],
  "Sibiu": ["Bucuresti-Nord", "Brasov", "Cluj-Napoca", "Craiova", "Sighisoara"],
  "Oradea": ["Bucuresti-Nord", "Cluj-Napoca", "Arad", "Timisoara-Nord", "Satu-Mare"],
  "Arad": ["Bucuresti-Nord", "Timisoara-Nord", "Cluj-Napoca", "Oradea"],
  "Suceava": ["Bucuresti-Nord", "Iasi", "Cluj-Napoca", "Bacau"],
  "Bacau": ["Bucuresti-Nord", "Iasi", "Suceava", "Cluj-Napoca", "Brasov"],
  "Ploiesti-Vest": ["Bucuresti-Nord", "Brasov", "Predeal", "Buzau"],
};

const FALLBACK = ["Bucuresti-Nord", "Brasov", "Cluj-Napoca", "Timisoara-Nord", "Iasi", "Constanta"];

export function destinationsFor(slug: string): string[] {
  return ROSTER[slug] ?? FALLBACK;
}

export function rosterStations(): string[] {
  return Object.keys(ROSTER);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/cfr/board-roster.ts
git commit -m "feat(api): destination roster for board aggregator"
```

---

### Task 24: board-aggregator service (TDD)

**Files:**
- Create: `apps/api/src/services/board-aggregator.ts`
- Create: `apps/api/test/services/board-aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateBoard } from "../../src/services/board-aggregator.js";
import type { Itinerary } from "@peron/types";

function fakeItinerary(time: string, dest: string, train: string, durationMin: number, via: string[] = []): Itinerary {
  const cat = train.match(/^[A-Z]+/)?.[0] ?? "R";
  const num = train.match(/\d+/)?.[0] ?? "0";
  return {
    id: `itin-${time}-${dest}`,
    transactionString: "tx",
    sessionId: "sid",
    departure: { time, station: "București Nord" },
    arrival: { time: "12:00", station: dest },
    duration: { hours: Math.floor(durationMin / 60), minutes: durationMin % 60 },
    segments: [{ trainCategory: cat, trainNumber: num, from: "București Nord", to: dest, departTime: time, arriveTime: "12:00", via }],
    transferCount: 0,
    priceFrom: null,
    services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: false },
    trainDetailUrl: "",
    bookingUrl: "",
  } as unknown as Itinerary;
}

describe("aggregateBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00Z")); // 13:00 Bucharest
  });

  it("calls search per destination, sorts by time, dedupes by (time, train number)", async () => {
    const search = vi.fn(async (from: string, to: string) => {
      if (to === "Brasov") return [fakeItinerary("14:25", "Brașov", "IR1735", 152)];
      if (to === "Cluj-Napoca") return [
        fakeItinerary("14:25", "Brașov", "IR1735", 152), // duplicate via Brasov-Cluj train
        fakeItinerary("14:48", "Cluj-Napoca", "IR1733", 432),
      ];
      return [];
    });
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov", "Cluj-Napoca"] });
    expect(result.entries.map((e) => `${e.time}/${e.train.category}${e.train.number}`)).toEqual([
      "14:25/IR1735",
      "14:48/IR1733",
    ]);
    expect(result.station.slug).toBe("Bucuresti-Nord");
    expect(result.direction).toBe("departures");
  });

  it("filters out itineraries that have already departed", async () => {
    const search = vi.fn(async () => [
      fakeItinerary("09:00", "Brașov", "IR111", 90), // past
      fakeItinerary("15:30", "Brașov", "IR222", 90), // future
    ]);
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov"] });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].time).toBe("15:30");
  });

  it("returns warning kind=no-data when all searches are empty", async () => {
    const search = vi.fn(async () => []);
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov"] });
    expect(result.entries).toHaveLength(0);
    expect(result.warning?.kind).toBe("no-data");
  });

  it("for arrivals direction, runs searches as (other -> this) and sets counterpart=origin", async () => {
    const search = vi.fn(async (from: string, to: string) => {
      expect(to).toBe("Bucuresti-Nord");
      return [fakeItinerary("13:30", "Bucuresti-Nord", "IR3000", 90)];
    });
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "arrivals", search, destinations: ["Brasov"] });
    expect(result.entries[0].counterpart.slug).toBe("Brasov");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @peron/api exec vitest run test/services/board-aggregator.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement the aggregator**

`apps/api/src/services/board-aggregator.ts`:

```ts
import type { Itinerary, BoardEntry, BoardResponse, BoardDirection } from "@peron/types";

export type SearchFn = (from: string, to: string) => Promise<Itinerary[]>;

export type AggregateInput = {
  slug: string;
  direction: BoardDirection;
  destinations: string[];
  search: SearchFn;
  now?: Date;
  concurrency?: number;
};

function nowMinutes(now: Date): number {
  // Bucharest is UTC+2 (winter) / UTC+3 (summer). Use Intl to derive HH:MM in Europe/Bucharest.
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = fmt.format(now).split(":").map(Number);
  return hh * 60 + mm;
}

function timeToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ȘșŞş]/g, "s")
    .replace(/[ȚțŢţ]/g, "t")
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function aggregateBoard(input: AggregateInput): Promise<BoardResponse> {
  const now = input.now ?? new Date();
  const nowMin = nowMinutes(now);
  const concurrency = input.concurrency ?? 5;

  const results = await pmap(input.destinations, concurrency, async (other) => {
    const [from, to] = input.direction === "departures" ? [input.slug, other] : [other, input.slug];
    return { other, itineraries: await input.search(from, to) };
  });

  const entries: BoardEntry[] = [];
  const seen = new Set<string>();
  for (const { other, itineraries } of results) {
    for (const it of itineraries) {
      const time = input.direction === "departures" ? it.departure.time : it.arrival.time;
      if (!time) continue;
      if (timeToMinutes(time) < nowMin) continue; // already passed
      const seg0 = it.segments[0];
      if (!seg0) continue;
      const key = `${time}/${seg0.trainCategory}${seg0.trainNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Build via list from segment intermediate stops if available; else from segment chain.
      const via: string[] = it.segments.length > 1
        ? it.segments.slice(0, -1).map((s) => s.to).filter(Boolean)
        : [];

      entries.push({
        time,
        counterpart: { name: other.replace(/-/g, " "), slug: slugify(other) },
        via,
        train: { category: seg0.trainCategory, number: seg0.trainNumber },
        durationMinutes: it.duration.hours * 60 + it.duration.minutes,
      });
    }
  }

  entries.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return {
    station: { name: input.slug.replace(/-/g, " "), slug: input.slug },
    direction: input.direction,
    entries,
    updatedAt: now.toISOString(),
    source: "aggregated",
    ...(entries.length === 0 ? { warning: { kind: "no-data" as const } } : {}),
  };
}
```

- [ ] **Step 4: Run tests — pass**

```bash
pnpm --filter @peron/api exec vitest run test/services/board-aggregator.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/board-aggregator.ts apps/api/test/services/board-aggregator.test.ts
git commit -m "feat(api): board-aggregator service (parallel + dedup + sort + filter)"
```

---

### Task 25: `/api/board/:slug` route

**Files:**
- Create: `apps/api/src/routes/board.ts`
- Modify: `apps/api/src/app.ts` (register the route)

- [ ] **Step 1: Create the route**

```ts
import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import type { BoardResponse, BoardDirection } from "@peron/types";
import type { AppEnv } from "../app.js";
import { aggregateBoard } from "../services/board-aggregator.js";
import { destinationsFor } from "../cfr/board-roster.js";

type CacheEntry = { value: BoardResponse; expiresAt: number };
const CACHE_TTL_MS = 60_000;

export function boardRoute() {
  const r = new Hono<AppEnv>();
  const cache = new Map<string, CacheEntry>();

  r.get("/:slug", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");
    const slug = c.req.param("slug");
    const direction: BoardDirection = c.req.query("direction") === "arrivals" ? "arrivals" : "departures";
    const cacheKey = `${slug}:${direction}`;
    const now = Date.now();

    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return c.json(hit.value);
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const value = await aggregateBoard({
        slug,
        direction,
        destinations: destinationsFor(slug),
        search: async (from, to) => {
          const result = await deps.searchService.search({ from, to, date: today });
          return result.itineraries;
        },
      });
      cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
      log.info({ msg: "board.ok", slug, direction, entries: value.entries.length });
      return c.json(value);
    } catch (err) {
      log.error({ msg: "board.error", slug, err: (err as Error).message });
      Sentry.captureException(err, { tags: { route: "board", slug } });
      return c.json(
        {
          station: { name: slug, slug },
          direction,
          entries: [],
          updatedAt: new Date().toISOString(),
          source: "aggregated" as const,
          warning: { kind: "rate-limited" as const },
        } satisfies BoardResponse,
        500,
      );
    }
  });

  return r;
}
```

- [ ] **Step 2: Register on the app**

In `apps/api/src/app.ts`, locate where other routes are mounted (e.g., `app.route("/api/search", searchRoute());`) and add:

```ts
import { boardRoute } from "./routes/board.js";
// ...
app.route("/api/board", boardRoute());
```

(The existing dependency-injection setup should already expose `searchService` via `deps`. If `deps.searchService.search()` doesn't exist with this exact signature, adapt the call to match — e.g., extract a callable wrapper around the existing search route's logic. Read `app.ts` first to confirm.)

- [ ] **Step 3: Smoke-test locally**

```bash
pnpm --filter @peron/api build && node apps/api/dist/index.js &
sleep 2
curl -s "http://localhost:3001/api/board/Bucuresti-Nord?direction=departures" | python3 -m json.tool | head -30
kill %1
```

Expected: JSON BoardResponse, ≥1 entries (CFR live).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/board.ts apps/api/src/app.ts
git commit -m "feat(api): /api/board/:slug route with 60s in-memory cache"
```

---

### Task 26: Boot-time warm-up + live integration test

**Files:**
- Modify: `apps/api/src/index.ts` (or wherever the server is started)
- Create: `apps/api/test/integration/board.live.test.ts`

- [ ] **Step 1: Add the warm-up**

In `apps/api/src/index.ts`, after `serve(...)` returns, schedule a one-shot warm-up:

```ts
import { rosterStations } from "./cfr/board-roster.js";
// ... after serve(...)

if (process.env.NODE_ENV === "production") {
  setTimeout(async () => {
    const top = rosterStations().slice(0, 5); // first 5 in roster definition order are the highest-traffic stations
    for (const slug of top) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/board/${slug}?direction=departures`);
      } catch { /* warm-up best-effort, ignore */ }
    }
  }, 30_000); // 30s after boot
}
```

- [ ] **Step 2: Write the live integration test (gated)**

```ts
import { describe, it, expect } from "vitest";

const LIVE = process.env.PERON_LIVE === "1";

describe.runIf(LIVE)("/api/board live", () => {
  it("returns ≥1 entry for Bucuresti-Nord departures", async () => {
    const res = await fetch("http://localhost:3001/api/board/Bucuresti-Nord?direction=departures");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].time).toMatch(/^\d{2}:\d{2}$/);
  }, 30_000);
});
```

- [ ] **Step 3: Run with PERON_LIVE=1 against a running api**

```bash
PERON_LIVE=1 pnpm --filter @peron/api exec vitest run test/integration/board.live.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts apps/api/test/integration/board.live.test.ts
git commit -m "feat(api): board warm-up on boot + live integration test"
```

---

## Section F — Station board page

### Task 27: Clock + BoardRow components

**Files:**
- Create: `apps/web/src/components/clock.tsx`
- Create: `apps/web/src/components/board-row.tsx`

- [ ] **Step 1: Clock component**

```tsx
"use client";

import { useEffect, useState } from "react";

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function Clock() {
  const [t, setT] = useState(() => fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setT(fmt(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm text-[var(--color-accent)]">{t}</span>;
}
```

- [ ] **Step 2: BoardRow component**

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardDirection } from "@peron/types";

export function BoardRow({ entry, stationSlug, direction }: { entry: BoardEntry; stationSlug: string; direction: BoardDirection }) {
  const t = useTranslations("stationBoard");
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams(
    direction === "departures"
      ? { from: stationSlug, to: entry.counterpart.slug, date: today }
      : { from: entry.counterpart.slug, to: stationSlug, date: today },
  );
  const hours = Math.floor(entry.durationMinutes / 60);
  const minutes = entry.durationMinutes % 60;

  return (
    <Link
      href={`/search?${params.toString()}`}
      className="grid grid-cols-[90px_1fr_100px_100px] items-center gap-5 border-b border-[var(--color-border)] px-7 py-5 transition-colors hover:bg-[var(--color-bg-subtle)]"
    >
      <div className="font-mono text-2xl font-medium text-[var(--color-accent)]">{entry.time}</div>
      <div className="font-mono text-sm">
        <div className="text-[var(--color-text)]">{entry.counterpart.name}</div>
        <div className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
          {entry.via.length === 0 ? t("direct") : t("via", { stops: entry.via.join(" · ") })}
        </div>
      </div>
      <div className="text-right font-mono text-sm">
        <span className="text-[var(--color-accent)] font-semibold">{entry.train.category}</span>{" "}
        <span className="text-[var(--color-text-muted)]">{entry.train.number}</span>
      </div>
      <div className="text-right font-mono text-sm text-[var(--color-text-muted)]">
        {hours}h {String(minutes).padStart(2, "0")}m
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/clock.tsx apps/web/src/components/board-row.tsx
git commit -m "feat(web): Clock + BoardRow components"
```

---

### Task 28: Station board page

**Files:**
- Create: `apps/web/src/app/[locale]/station/[slug]/page.tsx`
- Create: `apps/web/src/app/[locale]/station/[slug]/board.tsx` (client component for tabs + auto-refresh)
- Create: `apps/web/src/lib/api-board.ts`

- [ ] **Step 1: Client helper**

`apps/web/src/lib/api-board.ts`:

```ts
import type { BoardResponse, BoardDirection } from "@peron/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchBoard(slug: string, direction: BoardDirection): Promise<BoardResponse> {
  const res = await fetch(`${API}/api/board/${slug}?direction=${direction}`);
  if (!res.ok) throw new Error(`board returned ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Server-component page (initial render with departures)**

```tsx
import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchBoard } from "../../../../lib/api-board";
import { BoardClient } from "./board";

export default async function StationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("stationBoard");

  const initial = await fetchBoard(slug, "departures").catch(() => null);
  const stationName = initial?.station.name ?? slug.replace(/-/g, " ");

  return (
    <div>
      <BoardClient
        slug={slug}
        stationName={stationName}
        initialDepartures={initial}
        labels={{
          metaDepartures: t("metaDepartures"),
          metaArrivals: t("metaArrivals"),
          tabDepartures: t("tabDepartures"),
          tabArrivals: t("tabArrivals"),
          headTime: t("headTime"),
          headDestination: t("headDestination"),
          headOrigin: t("headOrigin"),
          headTrain: t("headTrain"),
          headDuration: t("headDuration"),
          updatedLabel: t("updatedLabel"),
          annotation: t("annotation"),
          backToSearch: t("backToSearch"),
          noEntries: t("noEntries"),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Client tab + auto-refresh component**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BoardResponse, BoardDirection } from "@peron/types";
import { fetchBoard } from "../../../../lib/api-board";
import { BoardRow } from "../../../../components/board-row";
import { Clock } from "../../../../components/clock";

type Labels = {
  metaDepartures: string; metaArrivals: string;
  tabDepartures: string; tabArrivals: string;
  headTime: string; headDestination: string; headOrigin: string; headTrain: string; headDuration: string;
  updatedLabel: string; annotation: string; backToSearch: string; noEntries: string;
};

export function BoardClient({
  slug, stationName, initialDepartures, labels,
}: {
  slug: string; stationName: string; initialDepartures: BoardResponse | null; labels: Labels;
}) {
  const [direction, setDirection] = useState<BoardDirection>("departures");
  const [data, setData] = useState<BoardResponse | null>(initialDepartures);
  const [loading, setLoading] = useState(false);

  // Refetch on direction change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBoard(slug, direction)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [direction, slug]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetchBoard(slug, direction).then(setData).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [direction, slug]);

  const meta = direction === "departures" ? labels.metaDepartures : labels.metaArrivals;
  const counterpartHead = direction === "departures" ? labels.headDestination : labels.headOrigin;

  return (
    <>
      <div className="flex items-end justify-between gap-4 border-b border-[var(--color-border)] px-7 py-8 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-[var(--color-accent)] uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
            {meta}
          </div>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-tight md:text-6xl">{stationName}</h1>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{labels.updatedLabel}</div>
          <div className="mt-1"><Clock /></div>
        </div>
      </div>

      <div className="flex border-b border-[var(--color-border)] px-7">
        {(["departures", "arrivals"] as BoardDirection[]).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={`-mb-px px-6 py-3.5 font-mono text-xs tracking-widest uppercase border-b-2 ${
              direction === d
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-subtle)]"
            }`}
          >
            {d === "departures" ? labels.tabDepartures : labels.tabArrivals}
            {data && direction === d ? <span className="ml-2 text-[var(--color-text-subtle)]">{data.entries.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[90px_1fr_100px_100px] gap-5 border-b border-[var(--color-border)] px-7 py-3 font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">
        <span>{labels.headTime}</span>
        <span>{counterpartHead}</span>
        <span className="text-right">{labels.headTrain}</span>
        <span className="text-right">{labels.headDuration}</span>
      </div>

      {loading && !data ? null : data && data.entries.length === 0 ? (
        <div className="px-7 py-12 text-center font-mono text-sm text-[var(--color-text-muted)]">{labels.noEntries}</div>
      ) : (
        data?.entries.map((e, i) => <BoardRow key={`${e.time}-${e.train.number}-${i}`} entry={e} stationSlug={slug} direction={direction} />)
      )}

      <div className="px-7 pt-4 pb-1 font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{labels.annotation}</div>
      <footer className="flex justify-between border-t border-[var(--color-border)] px-7 py-4 font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
        <span>PERON · GARALAGARA.COM</span>
        <Link href="/" className="hover:text-[var(--color-accent)]">{labels.backToSearch}</Link>
      </footer>
    </>
  );
}
```

- [ ] **Step 4: Smoke (dev server)**

Open `http://localhost:3000/station/Bucuresti-Nord` (English). Should render the station board with at least 1 entry. Click tabs — re-fetches arrivals.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-board.ts apps/web/src/app/\[locale\]/station/
git commit -m "feat(web): /station/[slug] board page (departures + arrivals tabs + auto-refresh)"
```

---

### Task 29: Station board e2e test

**Files:**
- Create: `apps/web/test/station-board.spec.ts` (Playwright)

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";

test("station board renders departures, switches to arrivals", async ({ page }) => {
  await page.goto("/station/Bucuresti-Nord");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Bucuresti|București/i);
  // wait for at least one row
  await expect(page.locator("a").filter({ hasText: /\d{2}:\d{2}/ }).first()).toBeVisible({ timeout: 15_000 });

  // Switch to arrivals
  await page.getByRole("button", { name: /ARRIVALS/i }).click();
  await expect(page.locator("a").filter({ hasText: /\d{2}:\d{2}/ }).first()).toBeVisible({ timeout: 15_000 });
});

test("clicking a row navigates to /search with correct params", async ({ page }) => {
  await page.goto("/station/Bucuresti-Nord");
  const firstRow = page.locator('a[href^="/search"]').first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  const href = await firstRow.getAttribute("href");
  expect(href).toMatch(/from=Bucuresti-Nord/);
  expect(href).toMatch(/date=\d{4}-\d{2}-\d{2}/);
});
```

- [ ] **Step 2: Run (against the existing Playwright config — needs api running)**

```bash
pnpm --filter @peron/web exec playwright test test/station-board.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/station-board.spec.ts
git commit -m "test(web): e2e for station board page"
```

---

## Section G — Live ticker on home

### Task 30: LiveTicker component + wire on home

**Files:**
- Create: `apps/web/src/components/live-ticker.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`

- [ ] **Step 1: LiveTicker component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardResponse } from "@peron/types";
import { fetchBoard } from "../lib/api-board";

export function LiveTicker() {
  const t = useTranslations("home");
  const [data, setData] = useState<BoardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() { fetchBoard("Bucuresti-Nord", "departures").then((r) => !cancelled && setData(r)).catch(() => {}); }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const top3 = (data?.entries ?? []).slice(0, 3);

  return (
    <div className="border-y border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-7 py-3.5">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
        {t("tickerLabel")}
      </div>
      {top3.length === 0 ? (
        <div className="font-mono text-xs text-[var(--color-text-subtle)]">…</div>
      ) : (
        top3.map((e, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_100px] gap-4 py-1 font-mono text-[13px]">
            <span className="text-[var(--color-accent)]">{e.time}</span>
            <span>→ {e.counterpart.name}</span>
            <span className="text-[var(--color-text-muted)]">{e.train.category}-{e.train.number}</span>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire on home above the hero**

In `apps/web/src/app/[locale]/page.tsx`, before the existing `<section className="mb-12 text-center">`, add:

```tsx
import { LiveTicker } from "../../components/live-ticker";
// ...
<LiveTicker />
```

- [ ] **Step 3: Smoke**

Open `/`. Should see the ticker strip with 3 amber departure times above the hero.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/live-ticker.tsx apps/web/src/app/\[locale\]/page.tsx
git commit -m "feat(web): live ticker on homepage"
```

---

## Section H — Polish + ship

### Task 31: Mobile responsive + a11y polish

**Files:**
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/src/app/[locale]/search/page.tsx`
- Modify: `apps/web/src/app/[locale]/station/[slug]/board.tsx`
- Modify: `apps/web/src/components/search-form.tsx`

- [ ] **Step 1: Stack search form vertically on mobile**

In `search-form.tsx`'s grid container className, the existing `grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto]` already handles this. Verify by resizing browser to 375px — fields should stack.

- [ ] **Step 2: Stack board row gracefully on mobile**

In the board row 4-col grids (results page + station board + ticker), add a 2-row layout for ≤640px:

In `board-row.tsx`:

```tsx
className="grid grid-cols-[80px_1fr_70px] sm:grid-cols-[90px_1fr_100px_100px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-4 sm:px-7 py-4 sm:py-5 transition-colors hover:bg-[var(--color-bg-subtle)]"
```

Hide the duration cell on mobile (or merge into the destination cell).

- [ ] **Step 3: Tab role + aria on language selector and tab buttons**

`language-selector.tsx` already has `role="group"` and `aria-current`. Tab buttons in `board.tsx` should add `role="tab"` and `aria-selected={direction === d}`.

- [ ] **Step 4: Build + verify mobile**

```bash
pnpm --filter @peron/web build && pnpm --filter @peron/web dev
```

DevTools → mobile emulation (iPhone 13). Check home, results, station board, lang selector, error pages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/ apps/web/src/components/
git commit -m "style(web): mobile responsive + a11y polish"
```

---

### Task 32: Run full test suite + canary smoke

**Files:** none

- [ ] **Step 1: Run web unit tests**

```bash
pnpm --filter @peron/web exec vitest run
```

Expected: all pass (i18n parity, language selector).

- [ ] **Step 2: Run api unit tests**

```bash
pnpm --filter @peron/api exec vitest run
```

Expected: all pass including board-aggregator tests.

- [ ] **Step 3: Run Playwright e2e against dev (api + web both running)**

In one terminal: `pnpm dev:api`. In another: `pnpm dev:web`. In a third:

```bash
pnpm --filter @peron/web exec playwright test
```

Expected: existing search e2e + new station-board e2e all pass.

- [ ] **Step 4: Type-check the whole repo**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit (no code changes if everything passes)**

If anything failed, fix it inline and commit per the issue. If clean, no commit.

---

### Task 33: Deploy to production

**Files:** none (deploy is push + Coolify UI)

- [ ] **Step 1: Push everything**

```bash
git push origin main
```

- [ ] **Step 2: In Coolify, redeploy peron-api** (so the new `/api/board` endpoint is live)

Go to Coolify dashboard → peron-api service → Redeploy. Wait for green health.

- [ ] **Step 3: In Coolify, redeploy peron-web** (so all the visual changes + i18n + station board page are live)

Same flow for peron-web. Wait for green health.

- [ ] **Step 4: Verify production**

```bash
# Existing canary still passes (search + price unchanged)
./scripts/canary.sh https://api.garalagara.com https://garalagara.com

# New endpoint works
curl -s "https://api.garalagara.com/api/board/Bucuresti-Nord?direction=departures" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('entries:', len(d['entries']))
print('first:', d['entries'][0] if d['entries'] else None)
"

# Web pages render in all locales
for path in "" "ro/" "de/" "station/Bucuresti-Nord" "ro/station/Bucuresti-Nord"; do
  STATUS=$(curl -sIo /dev/null -w "%{http_code}" "https://garalagara.com/$path")
  printf "  /%-40s -> HTTP %s\n" "$path" "$STATUS"
done
```

Expected: canary OK, board has ≥1 entry, all 5 path checks return 200.

- [ ] **Step 5: Browser walkthrough (manual)**

Open `https://garalagara.com/` in a browser:
- Live ticker shows real Bucuresti Nord departures
- Search Bucuresti-Nord → Brasov for tomorrow → results render as board rows
- Click "Details" on a row → fare matrix populates with real prices
- Click "Book on CFR" → opens cfrcalatori.ro
- Click language switcher to RO → URL becomes `/ro/...`, all UI text in Romanian
- Switch to DE → URL becomes `/de/...`, all UI text in German (cookie persists across visits)
- Open `/station/Bucuresti-Nord` → board renders, click row → navigates to `/search?from=Bucuresti-Nord&...`

- [ ] **Step 6: Final commit (if any runbook updates needed)**

If you discover anything during deploy verification that should land in the runbook, append + commit:

```bash
git add docs/runbook.md
git commit -m "docs: post-redesign deploy notes"
git push origin main
```

- [ ] **Step 7: Done** — Plan complete. Production is live with C aesthetic, EN/RO/DE, and station boards.

---

## Self-review checklist

Before declaring "implementation plan complete":

- [ ] Every spec section maps to ≥1 task
- [ ] No "TBD" / "TODO" / "implement later" in any step
- [ ] Every code step has the actual code
- [ ] Type names consistent across tasks (`BoardEntry`, `BoardResponse`, `BoardDirection`, `aggregateBoard`, `fetchBoard`, `LanguageSelector`, `LiveTicker`, `Clock`, `BoardRow`, `BoardClient`)
- [ ] Each task ends with a commit
- [ ] Test code shown for every TDD task
- [ ] Specific commands with expected output for verification steps

---

## Decomposition note (if needed during execution)

If executing this plan in subagent-driven fashion, sections are natural decomposition boundaries:
- A (3 tasks) — foundation, must finish before B
- B (5 tasks) — i18n, must finish before C
- C (3 tasks) — header/footer/lang
- D (8 tasks) — page + component restyles, mostly parallelizable after C
- E (5 tasks) — backend, independent of D, can run in parallel with D
- F (3 tasks) — depends on E (board endpoint) AND D's BoardRow + Clock
- G (1 task) — depends on E (board endpoint)
- H (3 tasks) — polish, deploy, verify
