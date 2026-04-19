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
