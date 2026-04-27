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
