# Nexura central server -- Phase 3's multi-tenant cloud API. Pure backend:
# unlike apps/local-server/Dockerfile, this does NOT bundle a frontend.
# central-server's CORS is intentionally permissive-cross-origin (see
# src/app.ts) because the Org Portal / Platform Admin Console are meant to
# be hosted separately (e.g. static hosting) and call this API cross-origin
# -- that's the existing architecture, not something this Dockerfile changes.
#
# Build from apps/central-server/ as the context:
#   docker build -t registry.nexura.app/nexura-central:VERSION apps/central-server/
#
# node:20-bookworm-slim (glibc) so better-sqlite3 can use its prebuilt
# binary instead of needing a C++ toolchain in the image.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# db/client.ts reads init.sql relative to process.cwd(), not dist/ -- see
# src/db/client.ts. Keep the same relative path in the image.
COPY src/db/init.sql ./src/db/init.sql

# SQLite lives here (src/db/client.ts: NEXURA_CENTRAL_DB_PATH ?? ./data/central.db).
# Must be a named volume/bind mount in production so data survives redeploys.
VOLUME /app/data

EXPOSE 5000
CMD ["node", "dist/index.js"]
