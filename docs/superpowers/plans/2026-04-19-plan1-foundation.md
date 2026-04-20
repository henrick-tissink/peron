# Plan 1 — Foundation (Monorepo, Shared Types, CI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a pnpm monorepo with a shared `@peron/types` package and scaffolded `apps/api` + `apps/web`. End state: `pnpm typecheck` and `pnpm test` pass across the workspace, a stub Hono `/health` endpoint responds 200, Next.js homepage renders a placeholder.

**Architecture:** pnpm workspace with three packages: shared types (no runtime deps), Hono backend (Node runtime), Next.js 16 frontend. TypeScript strict across all three. Vitest for tests where it matters (foundation test: one health-endpoint integration test on the API). GitHub Actions runs typecheck + tests on PR.

**Tech Stack:** pnpm 9+, Node 22, TypeScript 5.x strict, Hono 4.x, Next.js 16 app router, React 19, Tailwind v4, Vitest 2.x.

---

## File structure

```
peron/
├── .github/workflows/ci.yml           # Typecheck + test on PR
├── .gitignore                         # node_modules, .next, dist
├── .editorconfig                      # 2-space indent across the tree
├── .nvmrc                             # node 22
├── README.md                          # What Peron is + dev commands
├── pnpm-workspace.yaml                # Workspace packages
├── package.json                       # Root workspace scripts
├── tsconfig.base.json                 # Strict TS config inherited by all
├── packages/
│   └── types/
│       ├── package.json               # @peron/types, no deps
│       ├── tsconfig.json              # Extends base
│       └── src/
│           ├── index.ts               # Barrel export
│           ├── itinerary.ts           # Itinerary, Segment, Services
│           ├── station.ts             # Station
│           ├── search.ts              # SearchRequest, SearchResponse
│           ├── price.ts               # PriceRequest, PriceResponse
│           └── error.ts               # SearchError discriminated union
└── apps/
    ├── api/
    │   ├── package.json               # hono, @peron/types, vitest
    │   ├── tsconfig.json              # Extends base
    │   ├── vitest.config.ts           # Node env
    │   ├── src/
    │   │   └── index.ts               # Hono app, GET /health
    │   └── test/
    │       └── health.test.ts         # Integration test on /health
    └── web/
        ├── package.json               # next, react, tailwindcss v4, @peron/types
        ├── tsconfig.json              # Extends base
        ├── next.config.ts             # Default Next 16 config
        ├── postcss.config.mjs         # Tailwind v4 plugin
        └── src/
            └── app/
                ├── layout.tsx         # Root layout
                ├── page.tsx           # Stub homepage using Station from @peron/types
                └── globals.css        # Tailwind v4 @import + @theme
```

---

## Task 1: Initialize pnpm workspace root

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `README.md`

- [ ] **Step 1.1: Create `.nvmrc`**

```
22
```

- [ ] **Step 1.2: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 1.3: Create `.gitignore`**

```
node_modules/
.pnpm-store/
.next/
dist/
build/
.turbo/
coverage/
.DS_Store
*.log
.env
.env.local
.env.*.local
.vercel
.fly/
.output/
```

- [ ] **Step 1.4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 1.5: Create root `package.json`**

```json
{
  "name": "peron",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "dev:api": "pnpm --filter @peron/api dev",
    "dev:web": "pnpm --filter @peron/web dev"
  }
}
```

- [ ] **Step 1.6: Create `tsconfig.base.json`**

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

- [ ] **Step 1.7: Create `README.md`**

````markdown
# Peron

A cleaner frontend for searching Romanian trains on CFR Călători.

## Dev

```bash
pnpm install
pnpm typecheck
pnpm test

pnpm dev:api    # Hono backend at :3001
pnpm dev:web    # Next.js frontend at :3000
```

## Packages

- `apps/web` — Next.js 16 frontend (Vercel deploy target)
- `apps/api` — Hono backend + CFR proxy (Fly.io deploy target)
- `packages/types` — Shared JSON contract

See `docs/superpowers/specs/` for design docs.
````

- [ ] **Step 1.8: Run pnpm install**

Run: `pnpm install`
Expected: creates `pnpm-lock.yaml` + empty `node_modules/`. Exits 0. No errors.

- [ ] **Step 1.9: Commit workspace init**

```bash
git add .nvmrc .editorconfig .gitignore pnpm-workspace.yaml package.json tsconfig.base.json README.md pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace"
```

---

## Task 2: Create @peron/types package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/itinerary.ts`
- Create: `packages/types/src/station.ts`
- Create: `packages/types/src/search.ts`
- Create: `packages/types/src/price.ts`
- Create: `packages/types/src/error.ts`
- Create: `packages/types/src/index.ts`

- [ ] **Step 2.1: Create `packages/types/package.json`**

```json
{
  "name": "@peron/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "echo 'no runtime tests for types package; typecheck covers it'"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2.2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2.3: Create `packages/types/src/station.ts`**

```ts
export type Station = {
  name: string;
  isImportant: boolean;
};
```

- [ ] **Step 2.4: Create `packages/types/src/itinerary.ts`**

```ts
export type TrainSegment = {
  trainCategory: string;
  trainNumber: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
};

export type Services = {
  bikeCar: boolean;
  barRestaurant: boolean;
  sleeper: boolean;
  couchette: boolean;
  onlineBuying: boolean;
};

export type PriceFrom = {
  amount: number;
  currency: "RON";
  fareType: "Adult";
  class: "1" | "2";
};

export type Itinerary = {
  id: string;
  transactionString: string;
  sessionId: string;
  departure: { time: string; station: string; platform?: string };
  arrival: { time: string; station: string; platform?: string };
  duration: { hours: number; minutes: number };
  segments: TrainSegment[];
  transferCount: number;
  priceFrom: PriceFrom | null;
  services: Services;
  trainDetailUrl: string;
  bookingUrl: string;
};
```

- [ ] **Step 2.5: Create `packages/types/src/search.ts`**

```ts
import type { Itinerary } from "./itinerary.js";
import type { SearchError } from "./error.js";

export type SearchRequest = {
  from: string;
  to: string;
  date: string;
};

export type SearchResponse = {
  itineraries: Itinerary[];
  warning: SearchError | null;
  meta: {
    parseSuccessRate: number;
    latencyMs: number;
  };
};
```

Note: `.js` extensions in imports (not `.ts`) — this is the Node ESM convention that works correctly with `moduleResolution: Bundler` and `verbatimModuleSyntax: true` without requiring `allowImportingTsExtensions`.

- [ ] **Step 2.6: Create `packages/types/src/price.ts`**

```ts
export type FareTypeId = "73" | "71" | "72" | "50" | "74" | "53";
// 73=Adult, 71=Adult+TrenPlus, 72=Copil, 50=Elev, 74=Student, 53=Pensionar

export type PriceRequest = {
  transactionString: string;
  fareTypeId: FareTypeId;
  serviceKey: string;
};

export type PriceResponse =
  | { ok: true; amount: number; currency: "RON" }
  | { ok: false; reason: "unavailable" | "expired" };
```

- [ ] **Step 2.7: Create `packages/types/src/error.ts`**

```ts
export type SearchError =
  | { kind: "captcha"; retryAfterSec: number }
  | { kind: "no-results" }
  | { kind: "partial"; parsedCount: number; detectedCount: number }
  | { kind: "parser-failure"; detail: string }
  | { kind: "cfr-unavailable"; httpStatus: number }
  | { kind: "our-bug"; errorId: string };
```

- [ ] **Step 2.8: Create `packages/types/src/index.ts`**

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
```

- [ ] **Step 2.9: Install types deps**

Run: `pnpm install`
Expected: adds typescript 5.6+ to packages/types/. Exits 0.

- [ ] **Step 2.10: Typecheck types package**

Run: `pnpm --filter @peron/types typecheck`
Expected: PASS (no errors). Exits 0.

- [ ] **Step 2.11: Commit types package**

```bash
git add packages/types/ pnpm-lock.yaml
git commit -m "feat: add @peron/types shared contract package"
```

---

## Task 3: Scaffold apps/api with stub Hono health endpoint (TDD)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/test/health.test.ts`
- Create: `apps/api/src/index.ts`

- [ ] **Step 3.1: Create `apps/api/package.json`**

```json
{
  "name": "@peron/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@peron/types": "workspace:*",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3.2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Note: `rootDir` is `.` not `src` — `include` covers both `src/` and `test/`, so TS needs a rootDir that encompasses both. Setting `rootDir: "src"` causes `error TS6059: File '…/test/health.test.ts' is not under 'rootDir'`.

- [ ] **Step 3.3: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 3.4: Write the failing test at `apps/api/test/health.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";

describe("GET /health", () => {
  it("responds 200 with { status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3.5: Install api deps**

Run: `pnpm install`
Expected: installs hono, @hono/node-server, tsx, vitest, @types/node. Exits 0.

- [ ] **Step 3.6: Run the failing test**

Run: `pnpm --filter @peron/api test`
Expected: FAIL — cannot resolve `../src/index.ts` (file does not exist).

- [ ] **Step 3.7: Write minimal implementation at `apps/api/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}
```

- [ ] **Step 3.8: Run the test, verify it passes**

Run: `pnpm --filter @peron/api test`
Expected: PASS. One test, one assertion.

- [ ] **Step 3.9: Typecheck the api**

Run: `pnpm --filter @peron/api typecheck`
Expected: PASS. Exits 0.

- [ ] **Step 3.10: Commit api scaffold**

```bash
git add apps/api/ pnpm-lock.yaml
git commit -m "feat(api): scaffold Hono app with /health endpoint"
```

---

## Task 4: Scaffold apps/web with Next.js 16 + Tailwind v4

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/next-env.d.ts` (auto-generated by Next but commit the stub)

- [ ] **Step 4.1: Create `apps/web/package.json`**

```json
{
  "name": "@peron/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "echo 'web tests live in Plan 3'"
  },
  "dependencies": {
    "@peron/types": "workspace:*",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4.2: Create `apps/web/tsconfig.json`**

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
    "verbatimModuleSyntax": false
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4.3: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@peron/types"],
};

export default nextConfig;
```

- [ ] **Step 4.4: Create `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 4.5: Create `apps/web/src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-peron-blue: #2563eb;
}

html {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4.6: Create `apps/web/src/app/layout.tsx`**

```tsx
import "./globals.css";

export const metadata = {
  title: "Peron",
  description: "A cleaner frontend for Romanian train search",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4.7: Create `apps/web/src/app/page.tsx`**

```tsx
import type { Station } from "@peron/types";

const placeholder: Station = { name: "București Nord", isImportant: true };

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">Peron</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Foundation scaffold. Example station from the types package:{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
          {placeholder.name}
        </code>
      </p>
    </main>
  );
}
```

- [ ] **Step 4.8: Create `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4.9: Install web deps**

Run: `pnpm install`
Expected: installs next, react, react-dom, tailwindcss@4, @tailwindcss/postcss. Exits 0.

- [ ] **Step 4.10: Typecheck the web app**

Run: `pnpm --filter @peron/web typecheck`
Expected: PASS. Exits 0.

- [ ] **Step 4.11: Build the web app to confirm everything wires**

Run: `pnpm --filter @peron/web build`
Expected: PASS. Next emits a `.next/` directory. Output mentions `/` route is prerendered. Exits 0.

- [ ] **Step 4.12: Commit web scaffold**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js 16 app with Tailwind v4"
```

---

## Task 5: Verify cross-package imports work end-to-end

**Files:**
- Modify: `apps/api/src/index.ts` (add a typed response using @peron/types)
- Modify: `apps/api/test/health.test.ts` (assert the typed response)

- [ ] **Step 5.1: Write the failing test — update `apps/api/test/health.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { Station } from "@peron/types";
import { app } from "../src/index.js";

describe("GET /health", () => {
  it("responds 200 with { status: 'ok' }", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
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

- [ ] **Step 5.2: Run the test, verify it fails**

Run: `pnpm --filter @peron/api test`
Expected: FAIL on the second test — 404 on `/stations/sample` (route not defined yet). First test still passes.

- [ ] **Step 5.3: Update `apps/api/src/index.ts` with the typed route**

```ts
import { serve } from "@hono/node-server";
import type { Station } from "@peron/types";
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/stations/sample", (c) => {
  const sample: Station = { name: "București Nord", isImportant: true };
  return c.json(sample);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on :${port}`);
}
```

- [ ] **Step 5.4: Run the tests, verify both pass**

Run: `pnpm --filter @peron/api test`
Expected: PASS, 2 tests, 3 assertions.

- [ ] **Step 5.5: Typecheck everything from the root**

Run: `pnpm typecheck`
Expected: PASS for all three packages (types, api, web). Exits 0.

- [ ] **Step 5.6: Commit cross-package wiring**

```bash
git add apps/api/src/index.ts apps/api/test/health.test.ts
git commit -m "feat(api): verify @peron/types import with sample station route"
```

---

## Task 6: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 6.1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
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
```

- [ ] **Step 6.2: Lint the workflow file (local syntax check)**

Run: `node -e "require('yaml')" 2>/dev/null || echo 'skipping yaml lint (no yaml module); rely on GH to validate on push'`
Expected: either silent pass or the skip message. Non-blocking.

- [ ] **Step 6.3: Dry-run the CI commands locally to verify they'll pass in CI**

Run:
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter @peron/web build
```
Expected: all four commands exit 0.

- [ ] **Step 6.4: Commit CI workflow**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (typecheck + test + build)"
```

---

## Done criteria

After all tasks complete:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (2 tests in apps/api)
- [ ] `pnpm --filter @peron/web build` produces a `.next/` directory with at least one prerendered route
- [ ] `pnpm dev:api` starts Hono on :3001, `curl localhost:3001/health` returns `{"status":"ok"}`
- [ ] `pnpm dev:web` starts Next on :3000, browser shows the placeholder page with the station name from `@peron/types`
- [ ] Git log shows 6 clean commits, one per task
- [ ] `.github/workflows/ci.yml` exists and matches the commands above

After this plan lands, **Plan 2 (backend implementation)** can begin: CFR client, session pool, HTML parser with golden fixtures, `/api/search`, `/api/price`, `/api/stations`, rate limits.
