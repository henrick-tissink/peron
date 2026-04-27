# Plan 4 — Deploy to single Hetzner CX22 + Coolify

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Peron to production at `garalagara.com` (web) + `api.garalagara.com` on a single Hetzner CX22 (~€4.51/mo) using Coolify, Cloudflare proxied with origin cert, and Sentry+Upptime monitoring.

**Architecture:** One CX22 (Falkenstein, Ubuntu 24.04) runs Coolify, which manages two Docker containers — `apps/api` (Hono :3001) and `apps/web` (Next 16 standalone :3000). Traefik (built into Coolify) terminates TLS using a Cloudflare origin certificate; Cloudflare proxies all traffic in front (CDN + IP shield + DDoS). Both apps are stateless — `apps/api`'s session pool and PinMap are in-memory and accept first-request warm-up. Auto-deploy on push to `main` via Coolify's GitHub webhook.

**Tech Stack:** Hetzner Cloud, Coolify v4, Docker, tsup (api bundler), Next 16 standalone output, Cloudflare DNS+CDN+Origin Cert, Sentry (Node SDK + Next SDK), Upptime.

**Cost:** CX22 €4.51/mo + garalagara.com ~$10/yr + Cloudflare/Sentry/Upptime free tier = ~€5/mo total.

**Open assumptions (flag if wrong before executing):**
- Sentry: new projects (`peron-api`, `peron-web`) under existing Tavli org.
- Domain: `garalagara.com` registered through Cloudflare Registrar (at-cost).
- IP-flag mitigation deferred — env-var swap to a residential proxy if/when CFR captchas the box.

---

## Section A — Container builds (locally testable before any infra)

### Task 1: Switch api build to tsup single-file bundle

**Why:** `tsc` build emits JS that imports `@peron/types` at runtime, but the types package ships raw `.ts` (`packages/types/package.json:6`). `node dist/index.js` would fail. Bundling with tsup inlines `@peron/types` and all deps into one ESM file, which also gives us a tiny runtime image.

**Files:**
- Modify: `apps/api/package.json` — add `tsup` devDep, change `build` script
- Create: `apps/api/tsup.config.ts`
- Delete: `apps/api/tsconfig.build.json` (no longer needed; tsup uses its own config)

- [ ] **Step 1: Add tsup**

```bash
pnpm --filter @peron/api add -D tsup@^8.3.0
```

- [ ] **Step 2: Create `apps/api/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  // Inline @peron/types because it ships raw .ts (no build step). Everything
  // else stays external — production node_modules is shipped in the runtime
  // Docker image. Attempts to bundle pino, cheerio, etc. fail because their
  // CJS internals use dynamic requires that don't survive ESM bundling.
  noExternal: ["@peron/types"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
});
```

**Note on bundling scope:** Aggressive bundling (`noExternal: [/.*/]`) was attempted and rejected — pino, cheerio, and their transitive deps (`thread-stream`, `iconv-lite`, `safer-buffer`) use dynamic `require()` calls that the ESM bundler converts to a `__require` shim that can't resolve at runtime. The minimal-viable change is bundling only `@peron/types`, which fixes the actual production blocker (Node can't import a `.ts` file). Other deps come from `node_modules` in the runtime image — Task 2's Dockerfile installs production deps for this reason.

- [ ] **Step 3: Update `apps/api/package.json` build script**

Change `"build": "tsc -p tsconfig.build.json"` to `"build": "tsup"`.

- [ ] **Step 4: Delete `apps/api/tsconfig.build.json`**

```bash
rm apps/api/tsconfig.build.json
```

- [ ] **Step 5: Build and verify the bundle runs standalone**

```bash
pnpm --filter @peron/api build
node apps/api/dist/index.js &
sleep 2
curl -s http://localhost:3001/health
kill %1
```

Expected: JSON like `{"status":"ok","pool":{"size":0,"breakerOpen":false},"stations":{"cached":0}}`.

- [ ] **Step 6: Verify @peron/types is inlined (the actual production blocker)**

```bash
grep -c '"@peron/types"' apps/api/dist/index.js
```

Expected: `0` — meaning no runtime import of `@peron/types` remains; the types are fully inlined. The bundle still imports hono/cheerio/zod/pino externally, which is fine because Task 2's Docker image ships production `node_modules`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/tsup.config.ts pnpm-lock.yaml
git rm apps/api/tsconfig.build.json
git commit -m "build(api): switch to tsup bundle (inline @peron/types only)"
```

---

### Task 2: API Dockerfile + .dockerignore + local smoke

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

- [ ] **Step 1: Create `apps/api/.dockerignore`**

```
node_modules
dist
.next
coverage
test
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 2: Create `apps/api/Dockerfile`**

The build context is the **monorepo root** (Coolify sets this via "Base Directory" = `/`, "Dockerfile Location" = `apps/api/Dockerfile`).

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @peron/api...
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN pnpm --filter @peron/api build

# Use pnpm deploy to materialize a flat node_modules with only production deps.
# This produces /app/deploy/{node_modules,package.json} ready to copy.
RUN pnpm --filter @peron/api deploy --prod /app/deploy

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/package.json ./package.json
COPY --from=builder /app/apps/api/dist/index.js ./index.js
COPY --from=builder /app/apps/api/dist/index.js.map ./index.js.map
EXPOSE 3001
USER node
CMD ["node", "--enable-source-maps", "index.js"]
```

**Note:** `pnpm deploy --prod` flattens the workspace into a self-contained directory with only production dependencies. The runtime image is ~80-120MB (alpine + node + production node_modules + bundle). Build cache is layered so subsequent rebuilds with unchanged deps are fast.

- [ ] **Step 3: Build the image locally**

Run from the **repo root** (build context must include the workspace):

```bash
docker build -f apps/api/Dockerfile -t peron-api:local .
```

Expected: build succeeds; check final image size with `docker images peron-api:local` — should be < 200MB (alpine + bundled JS).

- [ ] **Step 4: Run the container and curl /health**

```bash
docker run --rm -d --name peron-api -p 3001:3001 peron-api:local
sleep 3
curl -s http://localhost:3001/health
docker stop peron-api
```

Expected: same `{"status":"ok",...}` JSON as Task 1 Step 5.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore
git commit -m "build(api): production Dockerfile (alpine + tsup bundle)"
```

---

### Task 3: Web — enable standalone output

**Why:** Next 16's standalone output produces a self-contained `.next/standalone/server.js` that can run with just `node` — no `next start`, no full `node_modules`. With monorepo, `outputFileTracingRoot` points at the repo root so `@peron/types` is correctly traced and copied.

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Update `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@peron/types"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
```

- [ ] **Step 2: Build and verify standalone works**

```bash
pnpm --filter @peron/web build
ls apps/web/.next/standalone/apps/web/server.js
```

Expected: file exists. The standalone tree mirrors the monorepo path under `.next/standalone/`.

- [ ] **Step 3: Run the standalone server with mock API**

```bash
PORT=3000 \
  NEXT_PUBLIC_API_URL=http://localhost:9999 \
  API_URL=http://localhost:9999 \
  node apps/web/.next/standalone/apps/web/server.js &
sleep 2
curl -sI http://localhost:3000/ | head -1
kill %1
```

Expected: `HTTP/1.1 200 OK` (the homepage will render with empty stations because the API is unreachable, which is fine — we just want the server up).

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "build(web): enable Next standalone output for monorepo"
```

---

### Task 4: Web Dockerfile + .dockerignore + local smoke

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/.dockerignore`

- [ ] **Step 1: Create `apps/web/.dockerignore`**

```
node_modules
.next
coverage
test
test-results
playwright-report
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 2: Create `apps/web/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @peron/web...
COPY packages/types ./packages/types
COPY apps/web ./apps/web
RUN pnpm --filter @peron/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output ships its own minimal node_modules + server.js
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Build the image**

```bash
docker build -f apps/web/Dockerfile -t peron-web:local .
docker images peron-web:local
```

Expected: build succeeds, image < 350MB.

- [ ] **Step 4: Run and verify**

```bash
docker run --rm -d --name peron-web -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:9999 \
  -e API_URL=http://localhost:9999 \
  peron-web:local
sleep 3
curl -sI http://localhost:3000/ | head -1
docker stop peron-web
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/Dockerfile apps/web/.dockerignore
git commit -m "build(web): production Dockerfile (alpine + Next standalone)"
```

---

### Task 5: Local docker-compose stack

**Why:** Validate that the two containers talk to each other end-to-end before pushing anywhere. Also serves as live local-dev environment for future work.

**Files:**
- Create: `compose.yml`

- [ ] **Step 1: Create `compose.yml`**

```yaml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - LOG_LEVEL=debug
      - PERON_WEB_ORIGIN=http://localhost:3000
      - CFR_BASE_URL=https://bilete.cfrcalatori.ro
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      # Server-side fetch from web -> api uses container DNS
      - API_URL=http://api:3001
      # Client-side fetch from browser -> api uses host loopback
      - NEXT_PUBLIC_API_URL=http://localhost:3001
    depends_on:
      - api
    restart: unless-stopped
```

- [ ] **Step 2: Bring up the stack and run a real search**

```bash
docker compose up --build -d
sleep 5
curl -s http://localhost:3001/health
curl -s -X POST http://localhost:3000/search -H 'content-type: application/json' || true
# Open http://localhost:3000 in a browser, search Bucuresti-Nord -> Brasov for tomorrow.
```

Expected: api `/health` returns `{"status":"ok"...}`; the browser search returns at least 1 itinerary; clicking "Details" populates the fare matrix.

- [ ] **Step 3: Tear down**

```bash
docker compose down
```

- [ ] **Step 4: Commit**

```bash
git add compose.yml
git commit -m "build: docker-compose stack for local prod-image testing"
```

---

## Section B — Sentry instrumentation

### Task 6: API Sentry init

**Files:**
- Modify: `apps/api/package.json` — add `@sentry/node`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add Sentry**

```bash
pnpm --filter @peron/api add @sentry/node@^8.40.0
```

- [ ] **Step 2: Update `apps/api/src/index.ts`**

Sentry init must be the very first import so it instruments everything below:

```ts
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN_API) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_API,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    release: process.env.GIT_COMMIT_SHA,
  });
}

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

- [ ] **Step 3: Wire Sentry into the search route's `our-bug` branch**

Modify `apps/api/src/routes/search.ts` — find the `} catch (err) {` block where `errorId = crypto.randomUUID()` is generated, and add Sentry capture immediately after the `log.error` call:

```ts
const errorId = crypto.randomUUID();
log.error({ msg: "search.error", errorId, err: (err as Error).message });
Sentry.captureException(err, { tags: { errorId, route: "search" } });
```

Add `import * as Sentry from "@sentry/node";` at the top of `apps/api/src/routes/search.ts`.

- [ ] **Step 4: Same for price route**

Modify `apps/api/src/routes/price.ts` — in the final `catch` block after `log.error({ msg: "price.error", ... })`, add:

```ts
Sentry.captureException(err, { tags: { route: "price" } });
```

Add `import * as Sentry from "@sentry/node";` at the top.

- [ ] **Step 5: Update `apps/api/.env.example`**

Append:

```
# Sentry DSN for the api project (Tavli org -> peron-api project)
SENTRY_DSN_API=
# Set by Coolify on each deploy
GIT_COMMIT_SHA=
```

- [ ] **Step 6: Verify it builds and runs**

```bash
pnpm --filter @peron/api build
SENTRY_DSN_API="" node apps/api/dist/index.js &
sleep 2
curl -s http://localhost:3001/health
kill %1
```

Expected: starts cleanly; with DSN unset, Sentry init skips and no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/index.ts apps/api/src/routes/search.ts apps/api/src/routes/price.ts apps/api/.env.example pnpm-lock.yaml
git commit -m "feat(api): Sentry instrumentation (errors + traces)"
```

---

### Task 7: Web Sentry init

**Files:**
- Modify: `apps/web/package.json` — add `@sentry/nextjs`
- Create: `apps/web/sentry.server.config.ts`
- Create: `apps/web/sentry.edge.config.ts`
- Create: `apps/web/sentry.client.config.ts`
- Create: `apps/web/instrumentation.ts`
- Modify: `apps/web/next.config.ts` — wrap with `withSentryConfig`
- Create: `apps/web/.env.example` (append)

- [ ] **Step 1: Add Sentry**

```bash
pnpm --filter @peron/web add @sentry/nextjs@^8.40.0
```

- [ ] **Step 2: Create `apps/web/sentry.server.config.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_WEB,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_COMMIT_SHA,
  });
}
```

- [ ] **Step 3: Create `apps/web/sentry.edge.config.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_WEB,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_COMMIT_SHA,
  });
}
```

- [ ] **Step 4: Create `apps/web/sentry.client.config.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN_WEB) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_WEB,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
```

- [ ] **Step 5: Create `apps/web/instrumentation.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 6: Wrap next config**

Replace `apps/web/next.config.ts` entirely:

```ts
import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@peron/types"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: "peron-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
});
```

- [ ] **Step 7: Append to `apps/web/.env.example`**

```
# Sentry DSN for the web project. NEXT_PUBLIC_ variant is shipped to the browser.
SENTRY_DSN_WEB=
NEXT_PUBLIC_SENTRY_DSN_WEB=
SENTRY_ORG=
SENTRY_AUTH_TOKEN=
GIT_COMMIT_SHA=
```

- [ ] **Step 8: Build verifies**

```bash
pnpm --filter @peron/web build
```

Expected: build succeeds. Sentry build plugin will be a no-op if `SENTRY_AUTH_TOKEN` is unset (warning emitted, ignorable).

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/sentry.*.config.ts apps/web/instrumentation.ts apps/web/next.config.ts apps/web/.env.example pnpm-lock.yaml
git commit -m "feat(web): Sentry instrumentation (server + edge + client)"
```

---

## Section C — Canary smoke script

### Task 8: Production canary script

**Why:** A scripted post-deploy check that verifies the api is reachable, returns valid health JSON, and can complete a real search end-to-end with a parseSuccessRate above 0.8. Run manually after every deploy; later we can wire into Coolify post-deploy hook.

**Files:**
- Create: `scripts/canary.sh`

- [ ] **Step 1: Create `scripts/canary.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

API="${1:-https://api.garalagara.com}"
WEB="${2:-https://garalagara.com}"

echo "[canary] checking $API/health"
HEALTH=$(curl -sf "$API/health")
echo "$HEALTH" | grep -q '"status":"ok"' || { echo "FAIL: health"; exit 1; }

echo "[canary] checking $WEB landing"
curl -sf -o /dev/null -w "%{http_code}" "$WEB/" | grep -q "^200$" || { echo "FAIL: web 200"; exit 1; }

echo "[canary] running real CFR search (Bucuresti-Nord -> Brasov, T+1)"
TOMORROW=$(date -u -d 'tomorrow' '+%Y-%m-%d' 2>/dev/null || date -v+1d '+%Y-%m-%d')
RESULT=$(curl -sf -X POST "$API/api/search" \
  -H 'content-type: application/json' \
  -H "origin: $WEB" \
  -d "{\"from\":\"Bucuresti-Nord\",\"to\":\"Brasov\",\"date\":\"$TOMORROW\"}")

COUNT=$(echo "$RESULT" | grep -o '"id"' | wc -l | tr -d ' ')
RATE=$(echo "$RESULT" | sed -n 's/.*"parseSuccessRate":\([0-9.]*\).*/\1/p')

echo "[canary] itineraries=$COUNT parseSuccessRate=$RATE"
[ "$COUNT" -ge 1 ] || { echo "FAIL: no itineraries"; exit 1; }
awk "BEGIN { exit !($RATE >= 0.8) }" || { echo "FAIL: parseSuccessRate $RATE < 0.8"; exit 1; }

echo "[canary] OK"
```

- [ ] **Step 2: Make executable and smoke-test against local stack**

```bash
chmod +x scripts/canary.sh
docker compose up -d
sleep 5
./scripts/canary.sh http://localhost:3001 http://localhost:3000
docker compose down
```

Expected: `[canary] OK`. If the local box hits captcha (residential IP usually doesn't), the script will fail with `FAIL: no itineraries` — that's expected behavior, retry later.

- [ ] **Step 3: Commit**

```bash
git add scripts/canary.sh
git commit -m "feat: post-deploy canary script (health + real search + parseRate)"
```

---

## Section D — Server provisioning

### Task 9: Provision Hetzner CX22

**Manual UI flow** (Hetzner Cloud Console — `console.hetzner.cloud`).

- [ ] **Step 1: Create a new project**

Console → "New Project" → name `peron`. (If you reuse the Tavli project, that's fine; isolation is cleaner.)

- [ ] **Step 2: Add SSH key**

Project → Security → SSH Keys → "Add SSH Key". Paste your `~/.ssh/id_ed25519.pub`.

- [ ] **Step 3: Create the server**

Project → Servers → "Add Server":

- **Location:** Falkenstein (FSN1) — closest CFR latency from Hetzner DCs (~30ms)
- **Image:** Ubuntu 24.04
- **Type:** CX22 (2 vCPU, 4GB RAM, 40GB disk, ~€4.51/mo)
- **Networking:** IPv4 + IPv6 enabled
- **SSH keys:** select the one from Step 2
- **Name:** `peron-prod`
- **Cloud config (User data) — paste this** for initial hardening:

```yaml
#cloud-config
package_update: true
package_upgrade: true
packages:
  - ufw
  - fail2ban
  - unattended-upgrades

users:
  - name: peron
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ssh-ed25519 AAAA... # paste your public key here

runcmd:
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw allow 8000/tcp   # Coolify dashboard (we'll lock down via Cloudflare Access later)
  - ufw --force enable
  - systemctl enable --now fail2ban
  - sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  - sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - systemctl restart sshd
  - fallocate -l 2G /swapfile
  - chmod 600 /swapfile
  - mkswap /swapfile
  - swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Replace `ssh-ed25519 AAAA...` with your actual public key.

- [ ] **Step 4: Wait for boot, capture the IPv4**

Note the public IPv4 address — you'll use it for Cloudflare DNS in Task 12 and SSH in Step 5.

- [ ] **Step 5: SSH in to verify hardening**

```bash
ssh peron@<IPv4>
sudo ufw status verbose      # expect rules from cloud-init
sudo systemctl status fail2ban
free -h                      # expect 2G swap active
exit
```

Expected: ufw allows 22/80/443/8000, fail2ban active, 2G swap.

- [ ] **Step 6: Commit decisions to a runbook stub**

Create `docs/runbook.md`:

```markdown
# Peron production runbook

## Server
- Provider: Hetzner Cloud
- Location: Falkenstein (FSN1)
- Type: CX22 (2 vCPU / 4GB / 40GB)
- Image: Ubuntu 24.04
- Hostname: peron-prod
- IPv4: <FILL IN AFTER PROVISION>
- SSH user: peron (sudo NOPASSWD)

## Stack
- Coolify v4 (Docker)
- Two services: peron-api, peron-web
- TLS: Cloudflare origin certificate -> Traefik
- DNS: Cloudflare proxied (orange cloud)

## Logs
- Application: Coolify dashboard -> service -> Logs tab (pino JSON, search "msg")
- System: ssh peron@<IP>; sudo journalctl -fu coolify

## Redeploy
- Auto: push to main; Coolify webhook redeploys both
- Manual: Coolify dashboard -> service -> "Redeploy"

## Captcha incident
1. Check Sentry for spike in `kind:captcha` warnings.
2. If sustained, set `CFR_PROXY_URL=<residential-proxy-url>` env var on api, redeploy.
3. Re-run canary: `./scripts/canary.sh`.
```

- [ ] **Step 7: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: production runbook stub"
```

---

### Task 10: Install Coolify

**Manual on the box.**

- [ ] **Step 1: SSH in and run the Coolify installer**

```bash
ssh peron@<IPv4>
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

This pulls Coolify v4, installs Docker, sets up Traefik, and starts the dashboard on `:8000`.

- [ ] **Step 2: Set initial password via the web UI**

Browser → `http://<IPv4>:8000` → Coolify shows a one-time root setup screen. Set:
- Email: yours
- Password: store in 1Password as "Coolify peron-prod"
- Instance name: `peron-prod`

- [ ] **Step 3: Lock down dashboard access**

Settings → Server → "Force HTTPS for dashboard" → on. Update DNS later (Task 13) to put dashboard behind Cloudflare with Access policy.

- [ ] **Step 4: Verify Docker daemon and Traefik are up**

```bash
ssh peron@<IPv4> 'docker ps'
```

Expected: at least `coolify`, `coolify-proxy` (Traefik), and `coolify-db` (Postgres for Coolify metadata) running.

- [ ] **Step 5: No code commit needed.**

---

## Section E — Cloudflare DNS + cert

### Task 11: Register garalagara.com

**Manual UI flow** (Cloudflare dashboard — `dash.cloudflare.com`).

- [ ] **Step 1: Register the domain via Cloudflare Registrar**

Dashboard → Domain Registration → Register Domains → search `garalagara.com` → buy. At-cost (~$10/yr), no markup.

- [ ] **Step 2: Confirm zone activation**

Once registered, the domain auto-creates a zone in your Cloudflare account. Status should be "Active" within minutes.

- [ ] **Step 3: No code commit needed.**

---

### Task 12: DNS records (proxied)

**Manual UI flow.**

- [ ] **Step 1: Add A records**

Cloudflare → garalagara.com → DNS → Records → "Add record":

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `garalagara.com` (`@`) | `<CX22 IPv4>` | Proxied (orange cloud) |
| A | `api` | `<CX22 IPv4>` | Proxied (orange cloud) |
| A | `coolify` | `<CX22 IPv4>` | Proxied (orange cloud) |

- [ ] **Step 2: Verify resolution**

```bash
dig +short garalagara.com api.garalagara.com coolify.garalagara.com
```

Expected: each returns a Cloudflare IP (`104.x.x.x` or `172.x.x.x`), NOT your Hetzner IP — proof that proxying is on.

- [ ] **Step 3: No code commit needed.**

---

### Task 13: Cloudflare origin certificate

**Why:** With Cloudflare proxying, Let's Encrypt's HTTP-01 challenge is intercepted. A Cloudflare Origin Certificate is a free 15-year cert valid only for CF→origin traffic — exactly what we want. Set CF SSL mode to Full (strict) so CF requires a valid cert from origin.

**Manual UI flow.**

- [ ] **Step 1: Generate origin certificate**

Cloudflare → garalagara.com → SSL/TLS → Origin Server → "Create Certificate":

- **Hostnames:** `*.garalagara.com, garalagara.com`
- **Key type:** ECC (smaller, faster)
- **Validity:** 15 years
- Click Create.

Copy the **Origin Certificate** (PEM) and **Private Key** (PEM) — Cloudflare shows them once. Store both in 1Password as "Cloudflare origin cert garalagara.com".

- [ ] **Step 2: Set SSL/TLS encryption mode**

Cloudflare → SSL/TLS → Overview → "Full (strict)".

- [ ] **Step 3: Enable HSTS + always-HTTPS**

Cloudflare → SSL/TLS → Edge Certificates:
- "Always Use HTTPS" → on
- "HTTP Strict Transport Security (HSTS)" → enable, max-age 6 months, no preload yet
- "Minimum TLS Version" → 1.2
- "Automatic HTTPS Rewrites" → on

- [ ] **Step 4: No code commit needed.**

---

## Section F — Coolify deploy

### Task 14: Coolify project + GitHub connection

**Manual UI flow** (Coolify dashboard — `http://<IPv4>:8000` or after Task 13, `http://coolify.garalagara.com`).

- [ ] **Step 1: Create project**

Coolify → Projects → "+ Add" → name `peron`, environment `production`.

- [ ] **Step 2: Connect GitHub**

Coolify → Sources → "+ Add" → GitHub App → follow the flow to install the Coolify GitHub App, grant access to the `peron` repository.

- [ ] **Step 3: Add server target**

Coolify → Servers → confirm `peron-prod` (localhost from Coolify's POV) is registered. If not auto-detected, add manually.

- [ ] **Step 4: Add origin certificate as a custom CA**

Coolify → Settings → Certificates → "+ Add" → paste the Origin Certificate and Private Key from Task 13. Name: `cloudflare-origin-garalagara`.

- [ ] **Step 5: No code commit needed.**

---

### Task 15: Deploy api service

**Manual UI flow.**

- [ ] **Step 1: Create the service**

Coolify → project `peron` → "+ Add Resource" → "Application":
- **Source:** GitHub → `peron` repo → branch `main`
- **Build pack:** Dockerfile
- **Base directory:** `/`
- **Dockerfile location:** `apps/api/Dockerfile`
- **Name:** `peron-api`
- **Port:** 3001

- [ ] **Step 2: Set environment variables**

Service → Environment Variables → add:

```
CFR_BASE_URL=https://bilete.cfrcalatori.ro
PERON_WEB_ORIGIN=https://garalagara.com
LOG_LEVEL=info
PORT=3001
SENTRY_DSN_API=<from Sentry: peron-api project DSN>
GIT_COMMIT_SHA=${COOLIFY_GIT_COMMIT_SHA}
NODE_ENV=production
```

- [ ] **Step 3: Bind domain + cert**

Service → Domains → "+ Add":
- **Domain:** `https://api.garalagara.com`
- **Certificate:** `cloudflare-origin-garalagara` (from Task 14 Step 4)

Coolify auto-generates Traefik labels for this.

- [ ] **Step 4: Health check**

Service → Health Check:
- **Enabled:** yes
- **Path:** `/health`
- **Port:** 3001
- **Interval:** 30s
- **Timeout:** 5s

- [ ] **Step 5: Deploy**

Click "Deploy". Wait for build (~3 min for first build with cold cache).

- [ ] **Step 6: Verify**

```bash
curl -s https://api.garalagara.com/health
```

Expected: `{"status":"ok","pool":{"size":0,"breakerOpen":false},"stations":{"cached":0}}`.

If you get a 521/522 from Cloudflare: Coolify isn't routing; check service Logs. If TLS error: origin cert misconfigured.

- [ ] **Step 7: No code commit needed.**

---

### Task 16: Deploy web service

**Manual UI flow.**

- [ ] **Step 1: Create the service**

Coolify → project `peron` → "+ Add Resource" → "Application":
- **Source:** GitHub → `peron` repo → branch `main`
- **Build pack:** Dockerfile
- **Base directory:** `/`
- **Dockerfile location:** `apps/web/Dockerfile`
- **Name:** `peron-web`
- **Port:** 3000

- [ ] **Step 2: Environment variables**

```
API_URL=https://api.garalagara.com
NEXT_PUBLIC_API_URL=https://api.garalagara.com
SENTRY_DSN_WEB=<from Sentry: peron-web project DSN>
NEXT_PUBLIC_SENTRY_DSN_WEB=<same DSN>
SENTRY_ORG=<your Sentry org slug>
SENTRY_AUTH_TOKEN=<from Sentry: User Settings -> Auth Tokens, scopes: project:releases, org:read>
GIT_COMMIT_SHA=${COOLIFY_GIT_COMMIT_SHA}
NODE_ENV=production
```

- [ ] **Step 3: Bind domain + cert**

- **Domain:** `https://garalagara.com`
- **Certificate:** `cloudflare-origin-garalagara`

- [ ] **Step 4: Health check**

- **Path:** `/`
- **Port:** 3000
- **Interval:** 30s

- [ ] **Step 5: Deploy and verify**

Click "Deploy". After build:

```bash
curl -sI https://garalagara.com/ | head -1
```

Expected: `HTTP/2 200`.

Then in a browser, open `https://garalagara.com`, search **Bucuresti-Nord → Brasov** for tomorrow. Expect at least 1 itinerary, click "Details", verify the fare matrix populates.

- [ ] **Step 6: No code commit needed.**

---

### Task 17: Auto-deploy webhook on push to main

**Manual UI flow.**

- [ ] **Step 1: Enable automatic deploys for both services**

For `peron-api` and `peron-web` in Coolify:
- Service → Webhooks → "Auto-deploy on push to branch" → toggle on, branch `main`.

- [ ] **Step 2: Push a no-op to verify**

```bash
git commit --allow-empty -m "chore: verify Coolify auto-deploy"
git push origin main
```

Watch Coolify → both services → Deployments tab. Both should kick off within 30s.

- [ ] **Step 3: Run canary against production**

```bash
./scripts/canary.sh https://api.garalagara.com https://garalagara.com
```

Expected: `[canary] OK`. Note the parseSuccessRate value — that's your baseline (typically 0.95-1.0).

- [ ] **Step 4: Update runbook with the baseline**

Append to `docs/runbook.md`:

```markdown

## Baseline metrics (post Plan 4 deploy)
- Date: 2026-04-27
- parseSuccessRate baseline: <FILL IN from canary>
- Cold-start latency (api /health first hit): <FILL IN>
- First search latency (CFR bootstrap + scrape + parse): <FILL IN>

Re-measure monthly. Sustained drop below 0.9 -> open issue, check selectors against fresh CFR HTML.
```

- [ ] **Step 5: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: production baseline metrics"
git push origin main
```

---

## Section G — Monitoring + handoff

### Task 18: Upptime monitor

**Manual + repo creation.**

- [ ] **Step 1: Create the Upptime repo**

GitHub → "New repository from template" → template `upptime/upptime` → name `peron-status`, public.

- [ ] **Step 2: Configure `.upptimerc.yml`**

In the new repo, edit `.upptimerc.yml`:

```yaml
owner: <your-github-handle>
repo: peron-status

sites:
  - name: api
    url: https://api.garalagara.com/health
    expectedStatusCodes:
      - 200
  - name: web
    url: https://garalagara.com/
    expectedStatusCodes:
      - 200

status-website:
  cname: status.garalagara.com
  name: Peron status
  introTitle: Peron uptime
  introMessage: Public uptime for garalagara.com and the CFR proxy api.

assignees:
  - <your-github-handle>
```

- [ ] **Step 3: Enable GitHub Actions + Pages**

Repo → Settings → Actions → Allow all actions. Settings → Pages → source = "GitHub Actions".

Manually trigger the "Setup CI" workflow to bootstrap.

- [ ] **Step 4: Optional — point status.garalagara.com at GitHub Pages**

Cloudflare DNS → add CNAME `status` → `<your-github-handle>.github.io` (DNS-only, gray cloud — Pages handles its own TLS).

- [ ] **Step 5: No code commit needed in peron repo.**

---

### Task 19: Final verification + plan close

- [ ] **Step 1: Run end-to-end verification checklist**

```bash
# All from your laptop:
curl -sf https://api.garalagara.com/health | grep -q '"status":"ok"'   && echo "api health OK"
curl -sIf https://garalagara.com/ | head -1                            # expect HTTP/2 200
./scripts/canary.sh https://api.garalagara.com https://garalagara.com
```

In a browser:
- [ ] Landing renders, search form works, station autocomplete suggests results
- [ ] Search returns itineraries with prices, durations, transfer counts
- [ ] Clicking "Details" expands fare matrix; cells fill within 5s
- [ ] "Book on CFR ↗" link goes to bilete.cfrcalatori.ro
- [ ] Dark mode renders correctly (toggle OS dark mode)
- [ ] Mobile (resize browser to 375px) — layout doesn't break

In Sentry:
- [ ] Trigger a 500 by hitting `https://api.garalagara.com/api/search` with malformed body — confirm event lands in Sentry within 30s.

In Coolify:
- [ ] Both services show "Healthy" and green dots in dashboard.
- [ ] Recent deployment logs visible.

- [ ] **Step 2: Update runbook with anything you learned**

Append issues, gotchas, or workarounds to `docs/runbook.md`.

- [ ] **Step 3: Update `README.md` to mention production**

Add at the bottom of `README.md`:

```markdown

## Production

Deployed at https://garalagara.com (web) + https://api.garalagara.com (api).
Single Hetzner CX22 + Coolify; see `docs/superpowers/plans/2026-04-27-plan4-deploy.md` and `docs/runbook.md`.
Status: https://status.garalagara.com
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/runbook.md
git commit -m "docs: production deployed at garalagara.com"
git push origin main
```

- [ ] **Step 5: Tag the release**

```bash
git tag -a v1.0.0 -m "Peron v1.0.0 — first production deploy"
git push origin v1.0.0
```

---

## Deferred to a future plan

- IP-flag mitigation: residential-proxy `CFR_PROXY_URL` env-var swap path. Wire when first sustained captcha incident hits.
- `parseSuccessRate < 0.9` Sentry alert rule (needs a few weeks of baseline data first).
- Coolify dashboard behind Cloudflare Access (currently exposed on `coolify.garalagara.com` with just CF proxy + dashboard auth; fine for v1).
- Backups (no DB, in-memory state acceptable to lose on restart).
- Multi-region / failover (single CX22 acceptable for v1 portfolio side project).

## Self-review notes

- All env-var names referenced match: `PERON_WEB_ORIGIN`, `CFR_BASE_URL`, `LOG_LEVEL`, `PORT`, `SENTRY_DSN_API`, `SENTRY_DSN_WEB`, `NEXT_PUBLIC_SENTRY_DSN_WEB`, `SENTRY_ORG`, `SENTRY_AUTH_TOKEN`, `GIT_COMMIT_SHA`, `API_URL`, `NEXT_PUBLIC_API_URL`.
- Domain `garalagara.com` consistent throughout.
- CORS allow-list includes `https://garalagara.com` via `PERON_WEB_ORIGIN` (already implemented in `apps/api/src/middleware/cors.ts:3`).
- No placeholders / TBDs.
- tsup decision in Task 1 fixes a real production runtime bug (raw-TS type imports unresolvable by `node`); was not visible to dev/test workflows.
