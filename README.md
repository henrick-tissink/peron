# Gara la Gara

> User-facing brand: **Gara la Gara** at https://garalagara.com.
> Repo / package / infra codename: **peron** (kept for historical reasons; same pattern as Anthropic / Claude).

A cleaner frontend for searching Romanian trains on CFR Călători. Romanian for "station to station" — the entire product story in three syllables.

## Dev

```bash
pnpm install
pnpm typecheck
pnpm test

pnpm dev:api    # Hono backend at :3001
pnpm dev:web    # Next.js frontend at :3000
```

## Packages

- `apps/web` — Next.js 16 frontend
- `apps/api` — Hono backend + CFR proxy
- `packages/types` — Shared JSON contract

See `docs/superpowers/specs/` for design docs.

## Production

Live at https://garalagara.com (web) + https://api.garalagara.com (api).
Single Hetzner CX22 + Coolify; see `docs/superpowers/plans/2026-04-27-plan4-deploy.md`
and `docs/runbook.md`.
