# Plan 3 — Frontend (Next.js 16 app with SSR search, fare matrix, E2E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/web` from a scaffold into a working utility-first Next.js 16 frontend that calls the Plan 2 backend. Users can search A→B by date, see inline results with prices and service icons, expand cards to reveal a fare matrix, and deep-link to CFR for booking.

**Architecture:** Next.js 16 App Router with one SSR page (`/search`) that fetches from `/api/search` during render, a static landing at `/`, and progressive client-side price loading per fare-matrix cell. Zero global state — URL is the canonical form. Styling via Tailwind v4 `@theme inline` tokens + Inter font loaded server-side. Vitest+@testing-library for components; Playwright with a Hono mock server for E2E so tests never hit the real backend.

**Tech Stack:** Next 16 (App Router, React 19, Turbopack), Tailwind v4, TypeScript strict, Vitest 2.1 + jsdom, @testing-library/react 16+, Playwright 1.48+, Hono 4.10+ (mock server), lucide-react (icons), `@peron/types` (JSON contract).

**Execution note:** seven sections, each a natural checkpoint. Cumulative test count assumes a clean run after each task.

- **Section A — Foundations** (Tasks 1–3): deps, Vitest setup, Tailwind theme + Inter, API client + normalize helpers
- **Section B — Primitives** (Tasks 4–7): Skeleton, CfrLink, ErrorState (6 variants), DatePicker
- **Section C — Form composition** (Tasks 8–9): StationAutocomplete, SearchForm
- **Section D — Results UI** (Tasks 10–12): ItineraryCard (collapsed), FareMatrix (progressive), ResultsList
- **Section E — Routes** (Tasks 13–16): layout upgrade, `/` landing, `/search` SSR, 404 + error boundary
- **Section F — E2E** (Tasks 17–19): Playwright + mock server, 3 golden flows
- **Section G — CI polish** (Task 20): extend `ci.yml` with web unit tests + E2E

---

## File structure

```
apps/web/
├── package.json                                 # + lucide-react, vitest, testing-library, jsdom,
│                                                #   @vitejs/plugin-react, vite-tsconfig-paths,
│                                                #   @playwright/test, hono, @hono/node-server, tsx
├── playwright.config.ts                         # Next dev + mock-server as webServer array
├── vitest.config.ts                             # jsdom env + setupFiles
├── next.config.ts                               # (unchanged)
├── postcss.config.mjs                           # (unchanged)
├── tsconfig.json                                # + vitest/globals + jest-dom types
├── next-env.d.ts                                # (unchanged)
├── .env.example                                 # NEXT_PUBLIC_API_URL, API_URL
├── src/
│   ├── app/
│   │   ├── layout.tsx                           # Inter via next/font; dark-mode class on <html>
│   │   ├── globals.css                          # @theme inline tokens, dark-mode media query
│   │   ├── page.tsx                             # landing: hero + SearchForm (static)
│   │   ├── search/
│   │   │   └── page.tsx                         # SSR: ?from&to&date → POST /api/search → <ResultsList/>
│   │   ├── not-found.tsx                        # 404 w/ link to cfrcalatori.ro
│   │   └── error.tsx                            # error boundary (client) for /search render errors
│   ├── components/
│   │   ├── station-autocomplete.tsx
│   │   ├── date-picker.tsx
│   │   ├── search-form.tsx
│   │   ├── results-list.tsx
│   │   ├── itinerary-card.tsx
│   │   ├── fare-matrix.tsx
│   │   ├── error-state.tsx
│   │   ├── cfr-link.tsx
│   │   └── skeleton.tsx
│   └── lib/
│       ├── api.ts                               # typed fetch wrappers
│       ├── normalize.ts                         # diacritic-insensitive matchers
│       └── fares.ts                             # fare-type labels, serviceKey enumeration
└── test/
    ├── setup.ts                                 # @testing-library/jest-dom/vitest + afterEach cleanup
    ├── unit/
    │   ├── normalize.test.ts
    │   ├── api.test.ts
    │   ├── cfr-link.test.tsx
    │   ├── error-state.test.tsx
    │   ├── date-picker.test.tsx
    │   ├── station-autocomplete.test.tsx
    │   ├── search-form.test.tsx
    │   ├── itinerary-card.test.tsx
    │   ├── fare-matrix.test.tsx
    │   └── results-list.test.tsx
    └── e2e/
        ├── fixtures.ts                          # JSON bodies reused across specs
        ├── mock-server.ts                       # standalone Hono mock on :3002
        ├── home-to-search.spec.ts
        ├── expand-fare-matrix.spec.ts
        └── book-on-cfr.spec.ts

.github/workflows/
└── ci.yml                                       # extend with web unit + e2e steps
```

Existing files we will **replace** (currently scaffolding):
- `apps/web/src/app/page.tsx` (placeholder component)
- `apps/web/src/app/globals.css` (minimal `@theme` block)
- `apps/web/src/app/layout.tsx` (placeholder metadata)

---

# Section A — Foundations

## Task 1: Install deps + wire Vitest with jsdom

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/test/setup.ts`
- Modify: `apps/web/tsconfig.json`

- [ ] **Step 1.1: Replace `apps/web/package.json` with:**

```json
{
  "name": "@peron/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@peron/types": "workspace:*",
    "lucide-react": "^0.460.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@hono/node-server": "^1.13.0",
    "@playwright/test": "^1.48.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "hono": "^4.10.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite-tsconfig-paths": "^5.1.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 1.2: Create `apps/web/vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/unit/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "test/e2e/**", ".next/**"],
    css: false,
  },
});
```

- [ ] **Step 1.3: Create `apps/web/test/setup.ts`:**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 1.4: Update `apps/web/tsconfig.json`** — add `types` array to `compilerOptions`. Full replacement:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "verbatimModuleSyntax": false
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "test/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 1.5: Install**

Run: `pnpm install`
Expected: pulls new devDeps. Exits 0.

- [ ] **Step 1.6: Write a smoke test at `apps/web/test/unit/smoke.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("vitest + testing-library harness", () => {
  it("renders a component", () => {
    render(<p>hello</p>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.7: Run tests**

Run: `pnpm --filter @peron/web test`
Expected: PASS — 1 test.

- [ ] **Step 1.8: Delete smoke test**

```bash
rm apps/web/test/unit/smoke.test.tsx
```

- [ ] **Step 1.9: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 1.10: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/test/setup.ts apps/web/tsconfig.json pnpm-lock.yaml
git commit -m "test(web): wire Vitest + testing-library jsdom harness"
```

---

## Task 2: Tailwind theme + Inter font + dark mode + layout upgrade

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

**Rationale:** Peron's design personality is utility-first: zinc neutrals + blue-600 rail accent, Inter body font, monospace numerics for times, dark mode via `prefers-color-scheme` (no toggle). This locks the design tokens before components land so we're not refactoring colors per-component.

- [ ] **Step 2.1: Replace `apps/web/src/app/globals.css` with:**

```css
@import "tailwindcss";

@theme inline {
  /* Brand / rail accent */
  --color-peron-blue: #2563eb;
  --color-peron-blue-hover: #1d4ed8;
  --color-peron-blue-soft: #eff6ff;

  /* Semantic */
  --color-ok: #16a34a;
  --color-warn: #d97706;
  --color-err: #dc2626;

  /* Surfaces & text (light mode defaults; see below for dark overrides) */
  --color-bg: #ffffff;
  --color-bg-subtle: #fafafa;
  --color-bg-muted: #f4f4f5;       /* zinc-100 */
  --color-border: #e4e4e7;         /* zinc-200 */
  --color-text: #18181b;           /* zinc-900 */
  --color-text-muted: #71717a;     /* zinc-500 */
  --color-text-subtle: #a1a1aa;    /* zinc-400 */

  /* Radii */
  --radius-card: 10px;
  --radius-control: 8px;

  /* Font families (Inter injected via next/font/google in layout.tsx) */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  @theme inline {
    --color-bg: #09090b;           /* zinc-950 */
    --color-bg-subtle: #18181b;    /* zinc-900 */
    --color-bg-muted: #27272a;     /* zinc-800 */
    --color-border: #3f3f46;       /* zinc-700 */
    --color-text: #fafafa;         /* zinc-50 */
    --color-text-muted: #a1a1aa;   /* zinc-400 */
    --color-text-subtle: #71717a;  /* zinc-500 */

    --color-peron-blue-soft: #1e3a8a;
  }
}

html {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
}

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Utility for time strings: monospace + tabular */
.num-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2.2: Replace `apps/web/src/app/layout.tsx` with:**

```tsx
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Peron — train search for Romania",
  description:
    "A cleaner, faster, mobile-friendly frontend for Romania's national rail network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2.3: Build the web app to verify theme compiles**

Run: `pnpm --filter @peron/web build`
Expected: build succeeds, `.next/` regenerates. Exits 0.

- [ ] **Step 2.4: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat(web): Tailwind theme (zinc+blue-600), Inter font, dark-mode media query"
```

---

## Task 3: API client (`lib/api.ts`) + `lib/normalize.ts` (TDD)

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/normalize.ts`
- Create: `apps/web/src/lib/fares.ts`
- Create: `apps/web/test/unit/api.test.ts`
- Create: `apps/web/test/unit/normalize.test.ts`

### normalize

- [ ] **Step 3.1: Write `apps/web/test/unit/normalize.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalize, matches } from "../../src/lib/normalize.js";

describe("normalize", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalize("București")).toBe("bucuresti");
    expect(normalize("Brașov")).toBe("brasov");
    expect(normalize("Cluj-Napoca")).toBe("cluj-napoca");
  });

  it("handles Romanian Ș/Ț (comma-below) and Ş/Ţ (cedilla)", () => {
    expect(normalize("Bucureşti")).toBe("bucuresti");
    expect(normalize("Târgovişte")).toBe("targoviste");
  });

  it("handles empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("matches", () => {
  it("prefers startsWith match", () => {
    expect(matches("Brașov", "bra")).toBe(true);
    expect(matches("București Nord", "bras")).toBe(false);
  });

  it("falls back to substring match via 3rd arg", () => {
    expect(matches("București Nord", "Nord", { substring: true })).toBe(true);
  });

  it("is case and diacritic insensitive", () => {
    expect(matches("BRAȘOV", "bras")).toBe(true);
    expect(matches("Brasov", "BRAȘ")).toBe(true);
  });

  it("empty query matches anything", () => {
    expect(matches("anywhere", "")).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run tests → FAIL**

Run: `pnpm --filter @peron/web test normalize`
Expected: FAIL (module missing).

- [ ] **Step 3.3: Create `apps/web/src/lib/normalize.ts`**

```ts
const RO_MAP: Record<string, string> = {
  "Ș": "S", "ș": "s",
  "Ț": "T", "ț": "t",
  "Ş": "S", "ş": "s",
  "Ţ": "T", "ţ": "t",
};

export function normalize(s: string): string {
  if (!s) return "";
  const mapped = s.replace(/[ȘșȚțŞşŢţ]/g, (ch) => RO_MAP[ch] ?? ch);
  return mapped
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function matches(
  candidate: string,
  query: string,
  opts: { substring?: boolean } = {},
): boolean {
  const q = normalize(query);
  if (q.length === 0) return true;
  const c = normalize(candidate);
  return opts.substring ? c.includes(q) : c.startsWith(q);
}
```

- [ ] **Step 3.4: Run tests → PASS** (8 tests)

Run: `pnpm --filter @peron/web test normalize`

### fares

- [ ] **Step 3.5: Create `apps/web/src/lib/fares.ts`** (no test — static data)

```ts
import type { FareTypeId } from "@peron/types";

export type FareTypeEntry = { id: FareTypeId; label: string; labelShort: string };

// Display order matches the spec's user journey (most common first).
export const FARE_TYPES: FareTypeEntry[] = [
  { id: "73", label: "Adult",                labelShort: "Adult" },
  { id: "71", label: "Adult + TrenPlus",     labelShort: "TrenPlus" },
  { id: "72", label: "Copil (6–14 ani)",     labelShort: "Copil" },
  { id: "50", label: "Elev",                 labelShort: "Elev" },
  { id: "74", label: "Student",              labelShort: "Student" },
  { id: "53", label: "Pensionar",            labelShort: "Pensionar" },
];

export const SERVICE_KEYS = [
  { key: "A&A", label: "Clasa 1" },
  { key: "B&B", label: "Clasa 2" },
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number]["key"];
```

### api

- [ ] **Step 3.6: Write `apps/web/test/unit/api.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  fetchStations,
  searchItineraries,
  fetchPrice,
  ApiError,
} from "../../src/lib/api.js";

describe("api client", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://example.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetchStations GETs /api/stations with optional q/limit", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ stations: [], total: 0 }), { status: 200 }),
    );
    await fetchStations({ q: "bucu", limit: 20 });
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://example.test/api/stations?q=bucu&limit=20");
  });

  it("searchItineraries POSTs JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ itineraries: [], warning: null, meta: { parseSuccessRate: 1, latencyMs: 0 } }), { status: 200 }),
    );
    await searchItineraries({ from: "A", to: "B", date: "2026-05-21" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://example.test/api/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ from: "A", to: "B", date: "2026-05-21" });
  });

  it("fetchPrice POSTs and returns parsed body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, amount: 41.5, currency: "RON" }), { status: 200 }),
    );
    const result = await fetchPrice({ transactionString: "tx", fareTypeId: "73", serviceKey: "B&B" });
    expect(result).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("throws ApiError on non-2xx with status and body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(
      searchItineraries({ from: "A", to: "B", date: "2026-05-21" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("ApiError carries the HTTP status for caller inspection", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("gone", { status: 410 }));
    try {
      await fetchPrice({ transactionString: "tx", fareTypeId: "73", serviceKey: "B&B" });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(410);
    }
  });
});
```

- [ ] **Step 3.7: Run tests → FAIL**

Run: `pnpm --filter @peron/web test api`
Expected: FAIL (module missing).

- [ ] **Step 3.8: Create `apps/web/src/lib/api.ts`**

```ts
import type {
  SearchRequest,
  SearchResponse,
  PriceRequest,
  PriceResponse,
  StationSearchResult,
} from "@peron/types";

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function baseUrl(): string {
  // Server-side: API_URL takes precedence (kept private). Client-side: NEXT_PUBLIC_API_URL is inlined.
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`${res.status} ${text || res.statusText}`.trim(), res.status);
  }
  return (await res.json()) as T;
}

export async function fetchStations(
  params: { q?: string; limit?: number } = {},
  init?: RequestInit,
): Promise<StationSearchResult> {
  const url = new URL("/api/stations", baseUrl());
  if (params.q) url.searchParams.set("q", params.q);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url.toString(), { ...init, method: "GET" });
  return jsonOrThrow<StationSearchResult>(res);
}

export async function searchItineraries(
  body: SearchRequest,
  init?: RequestInit,
): Promise<SearchResponse> {
  const res = await fetch(`${baseUrl()}/api/search`, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<SearchResponse>(res);
}

export async function fetchPrice(
  body: PriceRequest,
  init?: RequestInit,
): Promise<PriceResponse> {
  const res = await fetch(`${baseUrl()}/api/price`, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<PriceResponse>(res);
}
```

- [ ] **Step 3.9: Run tests → PASS** (5 api tests + 8 normalize tests = 13 total)

Run: `pnpm --filter @peron/web test`
Expected: PASS.

- [ ] **Step 3.10: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 3.11: Commit**

```bash
git add apps/web/src/lib/ apps/web/test/unit/api.test.ts apps/web/test/unit/normalize.test.ts
git commit -m "feat(web): lib — typed API client, diacritic-insensitive matcher, fare tables"
```

---

# Section B — Primitives

## Task 4: Skeleton component

**Files:**
- Create: `apps/web/src/components/skeleton.tsx`

No test — purely presentational shimmer. Exercised indirectly by ItineraryCard and FareMatrix tests.

- [ ] **Step 4.1: Create `apps/web/src/components/skeleton.tsx`**

```tsx
export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse rounded-[4px] bg-[var(--color-bg-muted)] ${className}`}
      style={style}
    />
  );
}
```

- [ ] **Step 4.2: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add apps/web/src/components/skeleton.tsx
git commit -m "feat(web): Skeleton loading placeholder"
```

---

## Task 5: CfrLink component (TDD)

**Files:**
- Create: `apps/web/src/components/cfr-link.tsx`
- Create: `apps/web/test/unit/cfr-link.test.tsx`

- [ ] **Step 5.1: Write `apps/web/test/unit/cfr-link.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CfrLink } from "../../src/components/cfr-link.js";

describe("CfrLink", () => {
  it("renders an external link to cfrcalatori.ro with rel=noopener", () => {
    render(<CfrLink href="https://bilete.cfrcalatori.ro/ro-RO/Tren/1741" label="View on CFR" />);
    const a = screen.getByRole("link", { name: /View on CFR/i });
    expect(a).toHaveAttribute("href", "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(a.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("defaults label to 'Open on CFR ↗'", () => {
    render(<CfrLink href="https://x" />);
    expect(screen.getByRole("link", { name: /Open on CFR/i })).toBeInTheDocument();
  });

  it("rejects non-CFR hrefs by rendering nothing", () => {
    const { container } = render(<CfrLink href="https://evil.example/" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts cfrcalatori.ro without bilete.* subdomain", () => {
    render(<CfrLink href="https://cfrcalatori.ro/whatever" />);
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Run → FAIL**

Run: `pnpm --filter @peron/web test cfr-link`

- [ ] **Step 5.3: Create `apps/web/src/components/cfr-link.tsx`**

```tsx
const CFR_HOSTS = new Set(["bilete.cfrcalatori.ro", "cfrcalatori.ro", "www.cfrcalatori.ro"]);

function isCfrHref(href: string): boolean {
  try {
    const u = new URL(href);
    return CFR_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function CfrLink({
  href,
  label = "Open on CFR ↗",
  className = "",
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  if (!isCfrHref(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-medium text-[var(--color-peron-blue)] hover:underline ${className}`}
    >
      {label}
    </a>
  );
}
```

- [ ] **Step 5.4: Run → PASS** (4 tests)

Run: `pnpm --filter @peron/web test cfr-link`

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src/components/cfr-link.tsx apps/web/test/unit/cfr-link.test.tsx
git commit -m "feat(web): CfrLink — safely rejects non-CFR hrefs"
```

---

## Task 6: ErrorState component (6 variants, table-driven tests)

**Files:**
- Create: `apps/web/src/components/error-state.tsx`
- Create: `apps/web/test/unit/error-state.test.tsx`

**Spec recap** — `SearchError` is a discriminated union on `kind`: `captcha` | `no-results` | `partial` | `parser-failure` | `cfr-unavailable` | `our-bug`. Each kind gets its own copy + recovery affordance.

- [ ] **Step 6.1: Write `apps/web/test/unit/error-state.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorState } from "../../src/components/error-state.js";

describe("ErrorState variants", () => {
  it("renders no-results with a nearby-dates hint", () => {
    render(
      <ErrorState
        error={{ kind: "no-results" }}
        query={{ from: "București Nord", to: "Brașov", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/No trains between/i)).toBeInTheDocument();
    expect(screen.getByText(/București Nord/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on CFR/i })).toBeInTheDocument();
  });

  it("captcha shows retry-after countdown and a CFR fallback link", () => {
    render(
      <ErrorState
        error={{ kind: "captcha", retryAfterSec: 60 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/60s/)).toBeInTheDocument();
    expect(screen.getByText(/automated searches/i)).toBeInTheDocument();
  });

  it("partial shows '{M} more trains found' with a view-on-CFR affordance", () => {
    render(
      <ErrorState
        error={{ kind: "partial", parsedCount: 5, detectedCount: 12 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    // 12 - 5 = 7 missing
    expect(screen.getByText(/7 more/i)).toBeInTheDocument();
  });

  it("parser-failure tells the user we've been notified", () => {
    render(
      <ErrorState
        error={{ kind: "parser-failure", detail: "selector drift" }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/CFR's side changed/i)).toBeInTheDocument();
  });

  it("cfr-unavailable tells the user CFR seems down", () => {
    render(
      <ErrorState
        error={{ kind: "cfr-unavailable", httpStatus: 503 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/CFR's booking system seems to be down/i)).toBeInTheDocument();
  });

  it("our-bug shows errorId for support", () => {
    render(
      <ErrorState
        error={{ kind: "our-bug", errorId: "abc-123" }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it("captcha variant with 0 retryAfterSec still renders fallback", () => {
    render(
      <ErrorState
        error={{ kind: "captcha", retryAfterSec: 0 }}
        query={{ from: "A", to: "B", date: "2026-05-21" }}
      />,
    );
    expect(screen.getByText(/automated searches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: Run → FAIL**

Run: `pnpm --filter @peron/web test error-state`

- [ ] **Step 6.3: Create `apps/web/src/components/error-state.tsx`**

```tsx
import type { SearchError } from "@peron/types";
import { CfrLink } from "./cfr-link.js";

export type ErrorQuery = { from: string; to: string; date: string };

function cfrSearchUrl(q: ErrorQuery): string {
  const [y, m, d] = q.date.split("-");
  return `https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/${encodeURIComponent(q.from)}/${encodeURIComponent(q.to)}?DepartureDate=${d}.${m}.${y}`;
}

export function ErrorState({
  error,
  query,
}: {
  error: SearchError;
  query: ErrorQuery;
}) {
  const cfrUrl = cfrSearchUrl(query);

  switch (error.kind) {
    case "no-results":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">
            No trains between <strong>{query.from}</strong> and <strong>{query.to}</strong> on {query.date}.
          </p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "captcha":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-peron-blue-soft)] p-6 text-center">
          <p className="text-base">
            CFR is temporarily blocking automated searches.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Try again in {error.retryAfterSec}s, or search directly on CFR.
          </p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "partial": {
      const missing = error.detectedCount - error.parsedCount;
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4 text-sm">
          <p>
            {missing} more trains found — <CfrLink href={cfrUrl} label="view all on CFR ↗" />
          </p>
        </section>
      );
    }

    case "parser-failure":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">
            Something on CFR's side changed and we can't read the response right now.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">We've been notified.</p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="Search on CFR ↗" />
          </div>
        </section>
      );

    case "cfr-unavailable":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">CFR's booking system seems to be down.</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            HTTP {error.httpStatus} — check @CFRCalatori on Twitter for updates.
          </p>
        </section>
      );

    case "our-bug":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">Something broke on our side.</p>
          <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
            Error ID: {error.errorId}
          </p>
        </section>
      );
  }
}
```

- [ ] **Step 6.4: Run → PASS** (7 tests)

Run: `pnpm --filter @peron/web test error-state`

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/src/components/error-state.tsx apps/web/test/unit/error-state.test.tsx
git commit -m "feat(web): ErrorState — 6 variants of the SearchError union"
```

---

## Task 7: DatePicker component (TDD)

**Files:**
- Create: `apps/web/src/components/date-picker.tsx`
- Create: `apps/web/test/unit/date-picker.test.tsx`

- [ ] **Step 7.1: Write `apps/web/test/unit/date-picker.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePicker } from "../../src/components/date-picker.js";

describe("DatePicker", () => {
  it("renders a native date input with name + value", () => {
    render(<DatePicker name="date" value="2026-05-21" onChange={() => {}} />);
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.name).toBe("date");
    expect(input.value).toBe("2026-05-21");
  });

  it("calls onChange with ISO date string", () => {
    const onChange = vi.fn();
    render(<DatePicker name="date" value="2026-05-21" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/departure date/i), {
      target: { value: "2026-05-22" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-05-22");
  });

  it("sets min attribute to today by default", () => {
    render(<DatePicker name="date" value="2026-05-21" onChange={() => {}} />);
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    const today = new Date().toISOString().slice(0, 10);
    expect(input.min).toBe(today);
  });

  it("accepts a custom min", () => {
    render(
      <DatePicker name="date" value="2026-05-21" min="2026-05-01" onChange={() => {}} />,
    );
    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    expect(input.min).toBe("2026-05-01");
  });
});
```

- [ ] **Step 7.2: Run → FAIL**

Run: `pnpm --filter @peron/web test date-picker`

- [ ] **Step 7.3: Create `apps/web/src/components/date-picker.tsx`**

```tsx
"use client";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DatePicker({
  name,
  value,
  min,
  onChange,
  label = "Departure date",
}: {
  name: string;
  value: string;
  min?: string;
  onChange: (iso: string) => void;
  label?: string;
}) {
  const minEffective = min ?? todayIso();
  const labelId = `${name}-label`;
  return (
    <div className="flex flex-col gap-1">
      <label
        id={labelId}
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        value={value}
        min={minEffective}
        onChange={(e) => onChange(e.target.value)}
        aria-labelledby={labelId}
        className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-peron-blue)]"
      />
    </div>
  );
}

export function defaultDatePickerValue(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}
```

- [ ] **Step 7.4: Run → PASS** (4 tests)

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/src/components/date-picker.tsx apps/web/test/unit/date-picker.test.tsx
git commit -m "feat(web): DatePicker — native date input, min=today, ISO value"
```

**Section B checkpoint:** 4 primitives ready. ~25 total web tests (13 lib + 4 cfr-link + 7 error-state + 4 date-picker — minus a few if I miscounted). Typecheck green. No runtime behavior yet — Section C wires them into the search form.

---

# Section C — Form composition

## Task 8: StationAutocomplete (TDD)

**Files:**
- Create: `apps/web/src/components/station-autocomplete.tsx`
- Create: `apps/web/test/unit/station-autocomplete.test.tsx`

**Behavior:** Controlled input with a client-side fuzzy match over a pre-loaded station array. Keyboard-navigable (↑/↓/Enter/Esc). Visible list appears on focus if input is non-empty. Uses `matches()` from `lib/normalize.ts` — startsWith first, substring fallback via the `substring: true` opt.

- [ ] **Step 8.1: Write `apps/web/test/unit/station-autocomplete.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Station } from "@peron/types";
import { StationAutocomplete } from "../../src/components/station-autocomplete.js";

const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
  { name: "Sinaia", isImportant: false },
  { name: "Predeal", isImportant: false },
];

function Harness(
  overrides: Partial<{ value: string; onChange: (v: string) => void }> = {},
) {
  const onChange = overrides.onChange ?? (() => {});
  return (
    <StationAutocomplete
      name="from"
      label="From"
      stations={stations}
      value={overrides.value ?? ""}
      onChange={onChange}
    />
  );
}

describe("StationAutocomplete", () => {
  it("renders a combobox input with label", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: /from/i });
    expect(input).toBeInTheDocument();
  });

  it("filters options by startsWith after typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /from/i });
    await user.type(input, "bras");
    // Parent is responsible for re-rendering with new value; simulate that by re-rendering
    render(<Harness value="bras" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("Brașov");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).not.toContain(
      "București Nord",
    );
  });

  it("falls back to substring when no startsWith hits", () => {
    render(<Harness value="napoca" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain(
      "Cluj-Napoca",
    );
  });

  it("is diacritic-insensitive (Bucuresti matches București)", () => {
    render(<Harness value="bucuresti" />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain(
      "București Nord",
    );
  });

  it("clicking an option calls onChange with the station name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="sin" onChange={onChange} />);
    await user.click(screen.getByRole("option", { name: /Sinaia/ }));
    expect(onChange).toHaveBeenCalledWith("Sinaia");
  });

  it("shows nothing when input is empty", () => {
    render(<Harness value="" />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("caps suggestions at 8 by default", () => {
    const many: Station[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Station ${i}`,
      isImportant: false,
    }));
    render(
      <StationAutocomplete
        name="from"
        label="From"
        stations={many}
        value="station"
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });

  it("ArrowDown + Enter selects the first match", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="bras" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /from/i });
    input.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("Brașov");
  });

  it("Escape clears the dropdown without changing value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness value="bras" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: /from/i });
    input.focus();
    await user.keyboard("{Escape}");
    // After Escape, the listbox should no longer expose options
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.2: Run → FAIL**

Run: `pnpm --filter @peron/web test station-autocomplete`

- [ ] **Step 8.3: Create `apps/web/src/components/station-autocomplete.tsx`**

```tsx
"use client";

import { useId, useMemo, useState } from "react";
import type { Station } from "@peron/types";
import { matches } from "../lib/normalize.js";

const MAX_SUGGESTIONS = 8;

function suggest(stations: Station[], query: string, limit: number): Station[] {
  if (!query.trim()) return [];
  const prefix: Station[] = [];
  const substr: Station[] = [];
  for (const s of stations) {
    if (matches(s.name, query)) {
      prefix.push(s);
    } else if (matches(s.name, query, { substring: true })) {
      substr.push(s);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...substr].slice(0, limit);
}

export function StationAutocomplete({
  name,
  label,
  value,
  onChange,
  stations,
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  stations: Station[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const listboxId = useId();
  const labelId = `${name}-label`;

  const suggestions = useMemo(
    () => suggest(stations, value, MAX_SUGGESTIONS),
    [stations, value],
  );

  const showList = open && suggestions.length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (showList && suggestions[activeIdx]) {
        e.preventDefault();
        onChange(suggestions[activeIdx].name);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label
        id={labelId}
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        role="combobox"
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={showList}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-peron-blue)]"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.name);
                setOpen(false);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIdx
                  ? "bg-[var(--color-peron-blue-soft)] text-[var(--color-peron-blue)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8.4: Run → PASS** (8 tests)

Run: `pnpm --filter @peron/web test station-autocomplete`

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/src/components/station-autocomplete.tsx apps/web/test/unit/station-autocomplete.test.tsx
git commit -m "feat(web): StationAutocomplete — diacritic-insensitive + keyboard nav"
```

---

## Task 9: SearchForm (TDD)

**Files:**
- Create: `apps/web/src/components/search-form.tsx`
- Create: `apps/web/test/unit/search-form.test.tsx`

**Behavior:** Composes 2 × StationAutocomplete + DatePicker + swap button + submit button. Submit navigates to `/search?from=X&to=Y&date=Z` via `router.push` (Next's useRouter). Swap swaps the From/To values.

- [ ] **Step 9.1: Write `apps/web/test/unit/search-form.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Station } from "@peron/types";
import { SearchForm } from "../../src/components/search-form.js";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
];

describe("SearchForm", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("renders From, To, Date controls + a submit button", () => {
    render(<SearchForm stations={stations} />);
    expect(screen.getByRole("combobox", { name: /from/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /to/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/departure date/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("submit navigates to /search with query params", async () => {
    const user = userEvent.setup();
    render(
      <SearchForm
        stations={stations}
        defaultFrom="București Nord"
        defaultTo="Brașov"
        defaultDate="2026-05-21"
      />,
    );
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(push).toHaveBeenCalledWith(
      "/search?from=Bucure%C8%99ti+Nord&to=Bra%C8%99ov&date=2026-05-21",
    );
  });

  it("submit is disabled until From + To + Date are set", () => {
    render(<SearchForm stations={stations} />);
    expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
  });

  it("swap button swaps From and To", async () => {
    const user = userEvent.setup();
    render(
      <SearchForm
        stations={stations}
        defaultFrom="București Nord"
        defaultTo="Brașov"
        defaultDate="2026-05-21"
      />,
    );
    await user.click(screen.getByRole("button", { name: /swap/i }));
    expect((screen.getByRole("combobox", { name: /from/i }) as HTMLInputElement).value).toBe("Brașov");
    expect((screen.getByRole("combobox", { name: /to/i }) as HTMLInputElement).value).toBe("București Nord");
  });

  it("does not submit when From === To", async () => {
    const user = userEvent.setup();
    render(
      <SearchForm
        stations={stations}
        defaultFrom="Brașov"
        defaultTo="Brașov"
        defaultDate="2026-05-21"
      />,
    );
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.2: Run → FAIL**

Run: `pnpm --filter @peron/web test search-form`

- [ ] **Step 9.3: Create `apps/web/src/components/search-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Station } from "@peron/types";
import { ArrowLeftRight } from "lucide-react";
import { StationAutocomplete } from "./station-autocomplete.js";
import { DatePicker, defaultDatePickerValue } from "./date-picker.js";

export function SearchForm({
  stations,
  defaultFrom = "",
  defaultTo = "",
  defaultDate,
}: {
  stations: Station[];
  defaultFrom?: string;
  defaultTo?: string;
  defaultDate?: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [date, setDate] = useState(defaultDate ?? defaultDatePickerValue());

  const canSubmit = from.trim() !== "" && to.trim() !== "" && from !== to && /^\d{4}-\d{2}-\d{2}$/.test(date);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const params = new URLSearchParams({ from, to, date });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_auto]"
    >
      <StationAutocomplete
        name="from"
        label="From"
        stations={stations}
        value={from}
        onChange={setFrom}
        placeholder="Departure station"
      />
      <button
        type="button"
        aria-label="swap"
        onClick={() => {
          const newFrom = to;
          const newTo = from;
          setFrom(newFrom);
          setTo(newTo);
        }}
        className="hidden self-end rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-[var(--color-text-muted)] hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)] md:block"
      >
        <ArrowLeftRight size={16} aria-hidden="true" />
      </button>
      <StationAutocomplete
        name="to"
        label="To"
        stations={stations}
        value={to}
        onChange={setTo}
        placeholder="Arrival station"
      />
      <DatePicker name="date" value={date} onChange={setDate} />
      <button
        type="submit"
        disabled={!canSubmit}
        className="self-end rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 9.4: Run → PASS** (5 tests)

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/src/components/search-form.tsx apps/web/test/unit/search-form.test.tsx
git commit -m "feat(web): SearchForm — composes autocompletes + date + swap + submit"
```

**Section C checkpoint:** form fully assembled, no layout yet. 5 tests per component make ~38 total web tests.

---

# Section D — Results UI

## Task 10: ItineraryCard (collapsed + expand toggle)

**Files:**
- Create: `apps/web/src/components/itinerary-card.tsx`
- Create: `apps/web/test/unit/itinerary-card.test.tsx`

**Behavior:** Collapsed card shows:
- Departure time (monospace, `.num-time` class) + station
- Arrival time + station
- Duration chip ("2h 30m")
- Train category + number
- Transfer count indicator ("Direct" or "1 transfer")
- Service icons (bike, bar, sleeper, couchette)
- `priceFrom` if present (else "—")
- "Details" button toggles expanded state → renders FareMatrix (children slot)
- "Book on CFR ↗" link via CfrLink

- [ ] **Step 10.1: Write `apps/web/test/unit/itinerary-card.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Itinerary } from "@peron/types";
import { ItineraryCard } from "../../src/components/itinerary-card.js";

const direct: Itinerary = {
  id: "itinerary-0",
  transactionString: "tx-direct",
  sessionId: "s-1",
  departure: { time: "08:30", station: "București Nord" },
  arrival: { time: "11:00", station: "Brașov" },
  duration: { hours: 2, minutes: 30 },
  segments: [
    { trainCategory: "IR", trainNumber: "1741", from: "București Nord", to: "Brașov", departTime: "08:30", arriveTime: "11:00" },
  ],
  transferCount: 0,
  priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
  services: { bikeCar: true, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
  trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
  bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=21.05.2026",
};

describe("ItineraryCard", () => {
  it("renders departure + arrival + duration + train", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText("08:30")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText(/București Nord/)).toBeInTheDocument();
    expect(screen.getByText(/Brașov/)).toBeInTheDocument();
    expect(screen.getByText(/2h 30m/)).toBeInTheDocument();
    expect(screen.getByText(/IR 1741/)).toBeInTheDocument();
  });

  it("shows priceFrom when present", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText(/41[.,]5/)).toBeInTheDocument();
    expect(screen.getByText(/lei/i)).toBeInTheDocument();
  });

  it("shows em-dash when priceFrom is null", () => {
    render(<ItineraryCard itinerary={{ ...direct, priceFrom: null }} />);
    expect(screen.getByTestId("price-from")).toHaveTextContent("—");
  });

  it("renders 'Direct' label when transferCount is 0", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText(/Direct/i)).toBeInTheDocument();
  });

  it("renders '{n} transfer' label when transferCount > 0", () => {
    render(<ItineraryCard itinerary={{ ...direct, transferCount: 2 }} />);
    expect(screen.getByText(/2 transfer/i)).toBeInTheDocument();
  });

  it("clicking Details expands the card and reveals children", async () => {
    const user = userEvent.setup();
    render(
      <ItineraryCard itinerary={direct}>
        <div data-testid="expanded-content">fare matrix placeholder</div>
      </ItineraryCard>,
    );
    expect(screen.queryByTestId("expanded-content")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByTestId("expanded-content")).toBeInTheDocument();
  });

  it("renders service icons for present services", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByLabelText(/bike/i)).toBeInTheDocument();
  });

  it("renders 'Book on CFR' link pointing to the itinerary's bookingUrl", () => {
    render(<ItineraryCard itinerary={direct} />);
    const link = screen.getByRole("link", { name: /Book on CFR/i });
    expect(link).toHaveAttribute("href", direct.bookingUrl);
  });
});
```

- [ ] **Step 10.2: Run → FAIL**

Run: `pnpm --filter @peron/web test itinerary-card`

- [ ] **Step 10.3: Create `apps/web/src/components/itinerary-card.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import type { Itinerary } from "@peron/types";
import { Bike, UtensilsCrossed, Moon, Bed } from "lucide-react";
import { CfrLink } from "./cfr-link.js";

function transferLabel(n: number): string {
  if (n === 0) return "Direct";
  return `${n} transfer${n === 1 ? "" : "s"}`;
}

function formatDuration(d: { hours: number; minutes: number }): string {
  if (d.hours === 0) return `${d.minutes}m`;
  if (d.minutes === 0) return `${d.hours}h`;
  return `${d.hours}h ${d.minutes}m`;
}

function formatPrice(p: Itinerary["priceFrom"]): string {
  if (!p) return "—";
  const cleaned = Number.isInteger(p.amount) ? `${p.amount}` : p.amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned.replace(".", ",")} lei`;
}

export function ItineraryCard({
  itinerary,
  children,
}: {
  itinerary: Itinerary;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstSeg = itinerary.segments[0]!;

  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="num-time text-base">{itinerary.departure.time}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{itinerary.departure.station}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">{formatDuration(itinerary.duration)}</span>
          <span className="h-px w-24 bg-[var(--color-border)]" aria-hidden="true" />
          <span className="text-xs text-[var(--color-text-muted)]">{transferLabel(itinerary.transferCount)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="num-time text-base">{itinerary.arrival.time}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{itinerary.arrival.station}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>
            {firstSeg.trainCategory} {firstSeg.trainNumber}
          </span>
          <ServiceIcons services={itinerary.services} />
        </div>
        <div className="flex items-center gap-3">
          <span data-testid="price-from" className="num-time text-sm">
            {formatPrice(itinerary.priceFrom)}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 py-1 text-xs hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)]"
          >
            {expanded ? "Hide" : "Details"}
          </button>
          <CfrLink href={itinerary.bookingUrl} label="Book on CFR ↗" />
        </div>
      </div>

      {expanded && <div className="mt-4 border-t border-[var(--color-border)] pt-4">{children}</div>}
    </article>
  );
}

function ServiceIcons({ services }: { services: Itinerary["services"] }) {
  return (
    <span className="flex items-center gap-2">
      {services.bikeCar && <Bike size={14} aria-label="bike car" />}
      {services.barRestaurant && <UtensilsCrossed size={14} aria-label="bar / restaurant" />}
      {services.sleeper && <Bed size={14} aria-label="sleeper car" />}
      {services.couchette && <Moon size={14} aria-label="couchette" />}
    </span>
  );
}
```

- [ ] **Step 10.4: Run → PASS** (8 tests)

- [ ] **Step 10.5: Commit**

```bash
git add apps/web/src/components/itinerary-card.tsx apps/web/test/unit/itinerary-card.test.tsx
git commit -m "feat(web): ItineraryCard — collapsed + expand-to-children"
```

---

## Task 11: FareMatrix (TDD, progressive fetch)

**Files:**
- Create: `apps/web/src/components/fare-matrix.tsx`
- Create: `apps/web/test/unit/fare-matrix.test.tsx`

**Behavior:** Renders a 6 × 2 grid (FARE_TYPES × SERVICE_KEYS). On mount, fires 12 parallel `fetchPrice` calls via `lib/api.ts`. Each cell is in one of three states: loading (Skeleton), success (amount + currency), error (em-dash + tooltip). Cells render progressively as promises resolve.

- [ ] **Step 11.1: Write `apps/web/test/unit/fare-matrix.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FareMatrix } from "../../src/components/fare-matrix.js";

vi.mock("../../src/lib/api.js", () => ({
  fetchPrice: vi.fn(),
}));

import { fetchPrice } from "../../src/lib/api.js";

describe("FareMatrix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders 12 loading cells on mount, then fills them as promises resolve", async () => {
    vi.mocked(fetchPrice).mockResolvedValue({ ok: true, amount: 41.5, currency: "RON" });

    render(<FareMatrix transactionString="tx-1" />);

    // Grid has header row + 6 fare rows, 12 price cells total
    expect(screen.getAllByRole("cell").length).toBeGreaterThanOrEqual(12);

    await waitFor(() => {
      expect(screen.getAllByText(/41[,.]5/).length).toBeGreaterThanOrEqual(12);
    });

    expect(vi.mocked(fetchPrice)).toHaveBeenCalledTimes(12);
  });

  it("renders em-dash in cells that resolve with ok:false", async () => {
    vi.mocked(fetchPrice).mockResolvedValue({ ok: false, reason: "unavailable" });

    render(<FareMatrix transactionString="tx-2" />);

    await waitFor(() => {
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(12);
    });
  });

  it("handles mixed ok/not-ok per cell independently", async () => {
    vi.mocked(fetchPrice).mockImplementation(async ({ fareTypeId }) =>
      fareTypeId === "73"
        ? { ok: true, amount: 50, currency: "RON" }
        : { ok: false, reason: "unavailable" },
    );

    render(<FareMatrix transactionString="tx-3" />);

    await waitFor(() => {
      expect(screen.getAllByText(/50/).length).toBe(2); // Adult × 2 classes
      expect(screen.getAllByText("—").length).toBe(10); // remaining 5 fare types × 2
    });
  });
});
```

- [ ] **Step 11.2: Run → FAIL**

Run: `pnpm --filter @peron/web test fare-matrix`

- [ ] **Step 11.3: Create `apps/web/src/components/fare-matrix.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { FareTypeId, PriceResponse } from "@peron/types";
import { FARE_TYPES, SERVICE_KEYS, type ServiceKey } from "../lib/fares.js";
import { fetchPrice } from "../lib/api.js";
import { Skeleton } from "./skeleton.js";

type CellKey = `${FareTypeId}:${ServiceKey}`;
type CellState =
  | { status: "loading" }
  | { status: "done"; result: PriceResponse };

function key(f: FareTypeId, s: ServiceKey): CellKey {
  return `${f}:${s}`;
}

function formatCell(r: PriceResponse): string {
  if (!r.ok) return "—";
  const n = r.amount;
  const cleaned = Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned.replace(".", ",")} lei`;
}

export function FareMatrix({ transactionString }: { transactionString: string }) {
  const [cells, setCells] = useState<Record<CellKey, CellState>>(() => {
    const init: Record<CellKey, CellState> = {};
    for (const f of FARE_TYPES) for (const s of SERVICE_KEYS) init[key(f.id, s.key)] = { status: "loading" };
    return init;
  });

  useEffect(() => {
    let cancelled = false;

    for (const f of FARE_TYPES) {
      for (const s of SERVICE_KEYS) {
        fetchPrice({ transactionString, fareTypeId: f.id, serviceKey: s.key }).then(
          (result) => {
            if (cancelled) return;
            setCells((prev) => ({ ...prev, [key(f.id, s.key)]: { status: "done", result } }));
          },
          () => {
            if (cancelled) return;
            setCells((prev) => ({
              ...prev,
              [key(f.id, s.key)]: { status: "done", result: { ok: false, reason: "unavailable" } },
            }));
          },
        );
      }
    }

    return () => {
      cancelled = true;
    };
  }, [transactionString]);

  return (
    <table role="table" className="w-full text-sm">
      <thead>
        <tr>
          <th scope="col" className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Fare
          </th>
          {SERVICE_KEYS.map((s) => (
            <th
              key={s.key}
              scope="col"
              className="pl-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {FARE_TYPES.map((f) => (
          <tr key={f.id}>
            <th scope="row" className="py-2 text-left text-sm font-normal">
              {f.label}
            </th>
            {SERVICE_KEYS.map((s) => {
              const cell = cells[key(f.id, s.key)]!;
              return (
                <td key={s.key} role="cell" className="num-time py-2 pl-4">
                  {cell.status === "loading" ? (
                    <Skeleton width={48} height={16} />
                  ) : (
                    formatCell(cell.result)
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 11.4: Run → PASS** (3 tests)

- [ ] **Step 11.5: Commit**

```bash
git add apps/web/src/components/fare-matrix.tsx apps/web/test/unit/fare-matrix.test.tsx
git commit -m "feat(web): FareMatrix — 6×2 progressive price fill"
```

---

## Task 12: ResultsList (TDD)

**Files:**
- Create: `apps/web/src/components/results-list.tsx`
- Create: `apps/web/test/unit/results-list.test.tsx`

**Behavior:** Maps `itineraries[]` to `<ItineraryCard>` components with `<FareMatrix>` as expanded child. If `warning` is present (partial/captcha/etc.) AND itineraries is non-empty, show the warning banner above the list. If itineraries is empty, parent should render ErrorState directly (ResultsList renders nothing useful in that case).

- [ ] **Step 12.1: Write `apps/web/test/unit/results-list.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SearchResponse } from "@peron/types";
import { ResultsList } from "../../src/components/results-list.js";

const twoTrains: SearchResponse = {
  itineraries: [
    {
      id: "itinerary-0",
      transactionString: "tx-a",
      sessionId: "s-1",
      departure: { time: "08:30", station: "București Nord" },
      arrival: { time: "11:00", station: "Brașov" },
      duration: { hours: 2, minutes: 30 },
      segments: [{ trainCategory: "IR", trainNumber: "1741", from: "A", to: "B", departTime: "08:30", arriveTime: "11:00" }],
      transferCount: 0,
      priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
      services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/x",
    },
    {
      id: "itinerary-1",
      transactionString: "tx-b",
      sessionId: "s-1",
      departure: { time: "10:00", station: "București Nord" },
      arrival: { time: "13:00", station: "Brașov" },
      duration: { hours: 3, minutes: 0 },
      segments: [{ trainCategory: "R", trainNumber: "3021", from: "A", to: "B", departTime: "10:00", arriveTime: "13:00" }],
      transferCount: 0,
      priceFrom: null,
      services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/3021",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/y",
    },
  ],
  warning: null,
  meta: { parseSuccessRate: 1, latencyMs: 120 },
};

describe("ResultsList", () => {
  it("renders one card per itinerary", () => {
    render(<ResultsList data={twoTrains} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("shows a partial-results banner above the list when warning.kind === partial", () => {
    const withWarning: SearchResponse = {
      ...twoTrains,
      warning: { kind: "partial", parsedCount: 2, detectedCount: 5 },
    };
    render(<ResultsList data={withWarning} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.getByText(/3 more/i)).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("does not show a banner for non-partial warnings (they're full-page replacements)", () => {
    const captcha: SearchResponse = {
      ...twoTrains,
      warning: { kind: "captcha", retryAfterSec: 60 },
    };
    render(<ResultsList data={captcha} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.queryByText(/automated searches/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 12.2: Run → FAIL**

- [ ] **Step 12.3: Create `apps/web/src/components/results-list.tsx`**

```tsx
"use client";

import type { SearchResponse } from "@peron/types";
import { ItineraryCard } from "./itinerary-card.js";
import { FareMatrix } from "./fare-matrix.js";
import { ErrorState, type ErrorQuery } from "./error-state.js";

export function ResultsList({
  data,
  query,
}: {
  data: SearchResponse;
  query: ErrorQuery;
}) {
  return (
    <div className="flex flex-col gap-3">
      {data.warning?.kind === "partial" && <ErrorState error={data.warning} query={query} />}
      {data.itineraries.map((it) => (
        <ItineraryCard key={it.id} itinerary={it}>
          <FareMatrix transactionString={it.transactionString} />
        </ItineraryCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 12.4: Run → PASS** (3 tests)

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/src/components/results-list.tsx apps/web/test/unit/results-list.test.tsx
git commit -m "feat(web): ResultsList — itinerary cards + partial-warning banner"
```

**Section D checkpoint:** ~52 total web tests. All client-only components testable in isolation. Next section wires them into Next routes.

---

# Section E — Routes

## Task 13: Layout upgrade — header + footer + env var wiring

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/header.tsx`
- Create: `apps/web/src/app/footer.tsx`
- Create: `apps/web/.env.example`

- [ ] **Step 13.1: Create `apps/web/src/app/header.tsx`**

```tsx
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Peron
        </Link>
        <span className="text-xs text-[var(--color-text-muted)]">
          Train search for Romania
        </span>
      </div>
    </header>
  );
}
```

- [ ] **Step 13.2: Create `apps/web/src/app/footer.tsx`**

```tsx
export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-[var(--color-text-muted)]">
        <p>
          Peron is an unofficial frontend for{" "}
          <a
            href="https://bilete.cfrcalatori.ro"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--color-peron-blue)]"
          >
            bilete.cfrcalatori.ro
          </a>
          . Booking happens on CFR.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 13.3: Replace `apps/web/src/app/layout.tsx` with:**

```tsx
import "./globals.css";
import { Inter } from "next/font/google";
import { Header } from "./header.js";
import { Footer } from "./footer.js";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Peron — train search for Romania",
  description:
    "A cleaner, faster, mobile-friendly frontend for Romania's national rail network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 13.4: Create `apps/web/.env.example`**

```
# URL of the Peron backend API. Used both server-side (SSR fetches) and client-side (FareMatrix).
# Dev default (same host, port 3001): http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# Optional server-side override (takes precedence over NEXT_PUBLIC_API_URL in Node SSR).
# Leave unset in most cases.
# API_URL=
```

- [ ] **Step 13.5: Build to verify**

Run: `pnpm --filter @peron/web build`
Expected: build succeeds.

- [ ] **Step 13.6: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/header.tsx apps/web/src/app/footer.tsx apps/web/.env.example
git commit -m "feat(web): layout with header + footer + .env.example"
```

---

## Task 14: `/` landing page with SearchForm

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Behavior:** Server component that fetches the station list (no q, capped at 500 for client-side filter), then renders a hero + SearchForm with those stations. If the API is unreachable, render the form with an empty station array — the form still works for direct URL entry (autocomplete just shows nothing).

- [ ] **Step 14.1: Replace `apps/web/src/app/page.tsx` with:**

```tsx
import type { Station } from "@peron/types";
import { fetchStations } from "../lib/api.js";
import { SearchForm } from "../components/search-form.js";

async function loadStations(): Promise<Station[]> {
  try {
    const result = await fetchStations({ limit: 500 });
    return result.stations;
  } catch {
    return [];
  }
}

export default async function Home() {
  const stations = await loadStations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <section className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Find a train.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Search Romania's national rail network. Book on CFR.
        </p>
      </section>
      <SearchForm stations={stations} />
    </div>
  );
}
```

- [ ] **Step 14.2: Build to verify**

Run: `pnpm --filter @peron/web build`
Expected: build succeeds. The page prerenders with an empty station list (because API isn't available during build); at runtime it fetches.

**Note:** If Next 16's default `cache: 'no-store'` is active, the page will fetch fresh on each request. If you see that stations are empty in production even with a working API, check that `fetchStations` uses `fetch` with default cache semantics — no manual `force-cache` is needed.

- [ ] **Step 14.3: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 14.4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): / landing page — hero + SearchForm with preloaded stations"
```

---

## Task 15: `/search` SSR page

**Files:**
- Create: `apps/web/src/app/search/page.tsx`

**Behavior:** Server component reads `?from&to&date` from `searchParams`, calls `searchItineraries`, renders either `ResultsList` + FareMatrix children OR `ErrorState` if `data.itineraries` is empty AND `data.warning` indicates a terminal kind. Partial warnings render as inline banners (handled by ResultsList). Any thrown ApiError from the fetch gets caught and mapped to `kind: "cfr-unavailable"` ErrorState.

- [ ] **Step 15.1: Create `apps/web/src/app/search/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import { searchItineraries, ApiError } from "../../lib/api.js";
import { ResultsList } from "../../components/results-list.js";
import { ErrorState } from "../../components/error-state.js";

const QuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") flat[k] = v;
  }

  const parsed = QuerySchema.safeParse(flat);
  if (!parsed.success) notFound();

  const query = parsed.data;

  let data: SearchResponse;
  try {
    data = await searchItineraries(query, { cache: "no-store" });
  } catch (err) {
    const httpStatus = err instanceof ApiError ? err.status : 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <HeaderQuery query={query} />
        <ErrorState error={{ kind: "cfr-unavailable", httpStatus }} query={query} />
      </div>
    );
  }

  const hasResults = data.itineraries.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <HeaderQuery query={query} />
      {!hasResults && data.warning ? (
        <ErrorState error={data.warning} query={query} />
      ) : !hasResults ? (
        <ErrorState error={{ kind: "no-results" }} query={query} />
      ) : (
        <ResultsList data={data} query={query} />
      )}
    </div>
  );
}

function HeaderQuery({ query }: { query: { from: string; to: string; date: string } }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold tracking-tight">
        {query.from} → {query.to}
      </h1>
      <p className="text-xs text-[var(--color-text-muted)]">{query.date}</p>
    </div>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = typeof params["from"] === "string" ? params["from"] : "";
  const to = typeof params["to"] === "string" ? params["to"] : "";
  return {
    title: from && to ? `${from} → ${to} · Peron` : "Search · Peron",
  };
}
```

- [ ] **Step 15.2: Install zod in apps/web (if it's not already a dep — api.ts doesn't require it, but this page does)**

Check `apps/web/package.json` dependencies. If `zod` is missing, add:
```json
"zod": "^3.23.8"
```
to `"dependencies"` and run `pnpm install`.

(Zod is already in apps/api's deps; apps/web didn't use it in Task 1. It's cheap — add and install.)

- [ ] **Step 15.3: Build**

Run: `pnpm --filter @peron/web build`
Expected: build succeeds. `/search` is a dynamic route (depends on searchParams + external fetch).

- [ ] **Step 15.4: Typecheck**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS.

- [ ] **Step 15.5: Commit**

```bash
git add apps/web/src/app/search/page.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): /search SSR page with ErrorState mapping"
```

---

## Task 16: 404 + error boundary

**Files:**
- Create: `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/error.tsx`

- [ ] **Step 16.1: Create `apps/web/src/app/not-found.tsx`**

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        The route you requested doesn't exist.
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <Link
          href="/"
          className="rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)]"
        >
          Back to search
        </Link>
        <a
          href="https://bilete.cfrcalatori.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)]"
        >
          cfrcalatori.ro ↗
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 16.2: Create `apps/web/src/app/error.tsx`**

```tsx
"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something broke.</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 16.3: Build**

Run: `pnpm --filter @peron/web build`
Expected: build succeeds.

- [ ] **Step 16.4: Commit**

```bash
git add apps/web/src/app/not-found.tsx apps/web/src/app/error.tsx
git commit -m "feat(web): 404 + error boundary pages"
```

**Section E checkpoint:** full site renders. `pnpm dev:api` + `pnpm dev:web` should let you search end-to-end via browser.

---

# Section F — E2E (Playwright + mock backend)

## Task 17: Playwright config + mock server + fixtures

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/test/e2e/mock-server.ts`
- Create: `apps/web/test/e2e/fixtures.ts`

- [ ] **Step 17.1: Create `apps/web/test/e2e/fixtures.ts`**

```ts
import type { Station, SearchResponse, PriceResponse } from "@peron/types";

export const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
  { name: "Sinaia", isImportant: false },
  { name: "Predeal", isImportant: false },
];

export const searchResponse: SearchResponse = {
  itineraries: [
    {
      id: "itinerary-0",
      transactionString: "tx-mock-0",
      sessionId: "sess-mock",
      departure: { time: "08:30", station: "București Nord" },
      arrival: { time: "11:00", station: "Brașov" },
      duration: { hours: 2, minutes: 30 },
      segments: [
        { trainCategory: "IR", trainNumber: "1741", from: "București Nord", to: "Brașov", departTime: "08:30", arriveTime: "11:00" },
      ],
      transferCount: 0,
      priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
      services: { bikeCar: true, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=21.05.2026",
    },
  ],
  warning: null,
  meta: { parseSuccessRate: 1, latencyMs: 120 },
};

export const priceResponse: PriceResponse = {
  ok: true,
  amount: 41.5,
  currency: "RON",
};
```

- [ ] **Step 17.2: Create `apps/web/test/e2e/mock-server.ts`**

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { stations, searchResponse, priceResponse } from "./fixtures.js";

const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.get("/api/stations", (c) => {
  const q = c.req.query("q")?.toLowerCase() ?? "";
  const limitStr = c.req.query("limit");
  const limit = limitStr ? Math.max(1, Math.min(500, Number(limitStr))) : stations.length;
  const filtered = q
    ? stations.filter((s) => s.name.toLowerCase().includes(q))
    : stations;
  return c.json({ stations: filtered.slice(0, limit), total: filtered.length });
});

app.post("/api/search", async (c) => {
  await c.req.json(); // consume body
  return c.json(searchResponse);
});

app.post("/api/price", async (c) => {
  await c.req.json();
  return c.json(priceResponse);
});

const port = Number(process.env.MOCK_PORT ?? 3002);
serve({ fetch: app.fetch, port }, ({ port }) => {
  // eslint-disable-next-line no-console
  console.log(`[peron-web mock] listening on :${port}`);
});
```

- [ ] **Step 17.3: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3100;
const MOCK_PORT = 3102;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false, // one browser, sequential — deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "tsx test/e2e/mock-server.ts",
      url: `http://localhost:${MOCK_PORT}/health`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      // `next dev` in Turbopack mode; swap to build+start for CI if flakiness requires it.
      command: `next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${MOCK_PORT}`,
        API_URL: `http://localhost:${MOCK_PORT}`,
      },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

Ports 3100/3102 avoid collision with `pnpm dev:web` (3000) and `pnpm dev:api` (3001) during manual dev.

- [ ] **Step 17.4: Install Playwright browsers**

Run: `pnpm --filter @peron/web exec playwright install chromium`
Expected: downloads chromium.

- [ ] **Step 17.5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/test/e2e/
git commit -m "test(web): Playwright config + Hono mock server + fixtures"
```

---

## Task 18: E2E — home-to-search flow

**Files:**
- Create: `apps/web/test/e2e/home-to-search.spec.ts`

- [ ] **Step 18.1: Create `apps/web/test/e2e/home-to-search.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("home → search renders at least one result card", async ({ page }) => {
  await page.goto("/");

  const fromInput = page.getByRole("combobox", { name: /from/i });
  await fromInput.fill("Bucu");
  await page.getByRole("option", { name: /București Nord/i }).click();

  const toInput = page.getByRole("combobox", { name: /to/i });
  await toInput.fill("Bras");
  await page.getByRole("option", { name: /Brașov/i }).click();

  // Date field starts at tomorrow by default — no need to touch it.

  await page.getByRole("button", { name: /^search$/i }).click();

  // URL reflects the query
  await expect(page).toHaveURL(/\/search\?from=.+&to=.+&date=/);

  // SSR fetches from the mock server and renders a card.
  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();
  await expect(card.getByText("08:30")).toBeVisible();
  await expect(card.getByText(/41[,.]5/)).toBeVisible();
  await expect(card.getByText(/București Nord/)).toBeVisible();
});
```

- [ ] **Step 18.2: Run**

Run: `pnpm --filter @peron/web test:e2e home-to-search`
Expected: PASS.

If the test fails with "baseURL unreachable", the webServer didn't start in time — re-run or bump the timeout.

- [ ] **Step 18.3: Commit**

```bash
git add apps/web/test/e2e/home-to-search.spec.ts
git commit -m "test(web): e2e — home → search golden flow"
```

---

## Task 19: E2E — expand card + "Book on CFR" link

**Files:**
- Create: `apps/web/test/e2e/expand-fare-matrix.spec.ts`
- Create: `apps/web/test/e2e/book-on-cfr.spec.ts`

- [ ] **Step 19.1: Create `apps/web/test/e2e/expand-fare-matrix.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("clicking Details loads a 6×2 fare matrix with prices", async ({ page }) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: /details/i }).click();

  const table = card.getByRole("table");
  await expect(table).toBeVisible();

  // 12 cells (6 fares × 2 classes), all eventually show "41,5 lei" per the mock.
  const priceCells = table.getByText(/41[,.]5 lei/);
  await expect(priceCells).toHaveCount(12);
});
```

- [ ] **Step 19.2: Create `apps/web/test/e2e/book-on-cfr.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("'Book on CFR' link points to the itinerary's bookingUrl and opens in a new tab", async ({
  page,
}) => {
  await page.goto("/search?from=Bucuresti+Nord&to=Brasov&date=2026-05-21");

  const card = page.getByRole("article").first();
  const cfrLink = card.getByRole("link", { name: /Book on CFR/i });
  await expect(cfrLink).toBeVisible();
  await expect(cfrLink).toHaveAttribute("target", "_blank");
  await expect(cfrLink).toHaveAttribute(
    "href",
    /bilete\.cfrcalatori\.ro\/ro-RO\/Rute-trenuri\/Bucuresti-Nord\/Brasov/,
  );
});
```

- [ ] **Step 19.3: Run all E2E**

Run: `pnpm --filter @peron/web test:e2e`
Expected: PASS — 3 tests total (home-to-search + expand-fare-matrix + book-on-cfr).

- [ ] **Step 19.4: Commit**

```bash
git add apps/web/test/e2e/expand-fare-matrix.spec.ts apps/web/test/e2e/book-on-cfr.spec.ts
git commit -m "test(web): e2e — expand fare matrix + book-on-CFR link"
```

**Section F checkpoint:** Playwright covers the three spec-defined E2E flows.

---

# Section G — CI polish

## Task 20: Extend CI with web unit + E2E

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 20.1: Replace `.github/workflows/ci.yml` with:**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  unit:
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

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build web
        run: pnpm --filter @peron/web build

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: unit
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm --filter @peron/web exec playwright install --with-deps chromium

      - name: Run E2E
        run: pnpm --filter @peron/web test:e2e
        env:
          CI: "1"

      - name: Upload Playwright traces
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: apps/web/test-results/
          retention-days: 7
```

Why split `unit` and `e2e` jobs: Playwright installs ~180MB of browsers; we want PR feedback on typecheck+unit-tests fast, and defer E2E to a dependent job.

- [ ] **Step 20.2: Dry-run CI commands locally**

Run:
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter @peron/web build
pnpm --filter @peron/web test:e2e
```
Expected: all five commands exit 0.

- [ ] **Step 20.3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: split unit (typecheck + tests + build) from e2e (Playwright)"
```

**Section G complete.**

---

## Done criteria

After all 20 tasks land:

- [ ] `pnpm typecheck` passes across types, api, web.
- [ ] `pnpm test` passes — ~55 web tests added (lib + 7 components + routes coverage), ~104 api tests from Plan 2 unchanged.
- [ ] `pnpm --filter @peron/web test:e2e` passes against the Hono mock server — 3 specs.
- [ ] `pnpm --filter @peron/web build` produces a valid `.next/` bundle.
- [ ] `pnpm dev:api && pnpm dev:web` manually: browse to `http://localhost:3000`, search Buc→Bra for a date 1–30 days out, see real CFR itineraries; click Details, see fare matrix fill progressively; click Book on CFR, land on CFR's search page.
- [ ] `apps/web/.env.example` documents `NEXT_PUBLIC_API_URL` and `API_URL`.
- [ ] `.github/workflows/ci.yml` runs unit + e2e on PRs.
- [ ] Git log shows ~20 clean commits, one per task.

After this plan lands, **Plan 4 (deploy)** can begin: Dockerfile + fly.toml for `apps/api` (Warsaw region), Vercel config for `apps/web`, domain DNS, Sentry on both apps, Upptime uptime monitor, post-deploy canary live check.

---

## Operational notes for implementer

1. **Tailwind v4 theme scope.** Changes to `globals.css` `@theme inline { ... }` affect the entire app; adding a color token there makes it available as `var(--color-peron-blue)` and as a `text-peron-blue`/`bg-peron-blue` utility. Reach for `var(--*)` inside component styles (Tavli pattern); avoid hardcoded hex.

2. **Next 16 `fetch` defaults.** `cache: 'no-store'` is the default in Next 16 for all `fetch` calls in Server Components (unlike Next 13/14). We pass `{ cache: 'no-store' }` explicitly in `/search/page.tsx` as a belt-and-suspenders guard and to be explicit about intent. The `/` landing page could cache stations briefly (`{ next: { revalidate: 3600 } }`), but cheap to re-fetch; skipping cache for simplicity.

3. **`useRouter` mock in Vitest.** SearchForm tests use `vi.mock("next/navigation", ...)` to stub `router.push`. This is the standard @testing-library pattern for Next routing — no routing provider required.

4. **Server component + `searchParams` is a Promise in Next 16.** `async function Page({ searchParams }: { searchParams: Promise<...> })` — do NOT treat as a plain object. The plan's `/search/page.tsx` awaits it.

5. **`lucide-react` icons.** Tree-shakeable by default (ESM named imports). Keep import list short; our cards use 4 icons.

6. **`zod` in apps/web.** Added in Task 15 for server-side searchParams validation. It's already in `@peron/types` transitively via dev consumption, but the web app now imports z directly — explicit dep.

7. **Playwright dev-mode vs build-mode.** E2E runs against `next dev` for fast iteration. If CI flakiness ever surfaces (Turbopack first-request slowness), swap the `command` in `playwright.config.ts` to `next build && next start -p ${WEB_PORT}` and bump timeout. But keep env vars — Next public env is inlined at build time, so `next build` must run with `NEXT_PUBLIC_API_URL` already set.

8. **Diacritics throughout.** The Romanian `Ș/Ț` comma-below encoding (U+0218/U+021A) vs. `Ş/Ţ` cedilla (U+015E/U+0162) mismatch bit us in Plan 2; the `normalize()` helper handles both. Every place that compares station names in the frontend must go through `normalize()` or `matches()` — never `.toLowerCase().includes()` directly.

9. **Partial-results behavior.** When `data.warning.kind === "partial"` AND there ARE itineraries, we show the banner inside ResultsList. When `data.itineraries.length === 0` with any warning, the route page renders ErrorState full-width. This split is intentional.

10. **Section E manual sanity check.** After Task 16 lands, do a manual smoke: `pnpm dev:api` + `pnpm dev:web`, browse to `/`, pick stations + date, see results. This will catch CORS misconfig, Inter-font-load failures, or API URL mismatches that E2E won't surface because the mock server always replies 200.
