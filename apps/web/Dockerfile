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
