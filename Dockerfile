# SessionVault — single image: builds the web SPA and runs the API which serves it.
# Multi-stage so the final image stays lean.

# ---- Stage 1: build the web SPA ----
FROM node:22-alpine AS web
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./
# Build with Vite directly (Vite transpiles TS; avoids tsc -b project refs and
# pnpm workspace quirks inside the image).
RUN node ./node_modules/vite/bin/vite.js build

# ---- Stage 2: install API deps ----
FROM node:22-alpine AS api-deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app/services/api
COPY services/api/package.json services/api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app/services/api
ENV NODE_ENV=production

# API source + deps
COPY services/api/package.json services/api/pnpm-lock.yaml services/api/tsconfig.json ./
COPY --from=api-deps /app/services/api/node_modules ./node_modules
COPY services/api/src ./src
# Migrations live at repo root; copy them where migrate.ts expects (../../../../migrations).
COPY migrations /app/migrations
# Built SPA
COPY --from=web /app/apps/web/dist /app/web

ENV WEB_DIST=/app/web
EXPOSE 8080

# tsx runs the TypeScript entrypoint directly (no separate build step needed).
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
