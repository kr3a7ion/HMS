# Nexura local server -- distributed image (Auth/Distribution doc Part 10.1):
# backend + SQLite + the compiled React build, served together on one origin.
# Build FROM THE REPO ROOT (this Dockerfile needs the frontend source too):
#
#   docker build -f apps/local-server/Dockerfile -t registry.nexura.app/nexura-local:VERSION .
#
# node:20-bookworm-slim (glibc, not Alpine/musl) so better-sqlite3 can use
# its prebuilt binary instead of needing a C++ toolchain in the image.
#
# VITE_API_BASE_URL is baked in empty so the bundled frontend calls the API
# on the same origin it's served from (no CORS, works over LAN with no DNS).
# VITE_CENTRAL_API_BASE_URL stays a real internet address -- this same
# bundle also renders the Org Portal / Admin Console routes, which always
# talk to the central server, never to this branch's own local server.

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/index.html apps/web/vite.config.ts ./
COPY apps/web/src ./src
ARG VITE_API_BASE_URL=""
ARG VITE_CENTRAL_API_BASE_URL="https://api.nexura.app"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_CENTRAL_API_BASE_URL=$VITE_CENTRAL_API_BASE_URL
RUN npm run build

FROM node:20-bookworm-slim AS server-builder
WORKDIR /app/server
COPY apps/local-server/package.json apps/local-server/package-lock.json ./
RUN npm ci
COPY apps/local-server/tsconfig.json ./
COPY apps/local-server/src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY apps/local-server/package.json apps/local-server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /app/server/dist ./dist
# db/client.ts reads init.sql relative to process.cwd(), not dist/ -- see
# apps/local-server/src/db/client.ts. Keep the same relative path in the image.
COPY apps/local-server/src/db/init.sql ./src/db/init.sql
COPY --from=frontend-builder /app/dist ./public

# SQLite lives here (src/db/client.ts: NEXURA_DB_PATH ?? ./data/nexura.db).
# Must be a named volume/bind mount in production -- an update's container
# swap (services/updater/containerSwap.ts) starts the new container against
# the same mounted data before switching traffic, so this is how a branch's
# data survives an update, not something baked into the image.
VOLUME /app/server/data

EXPOSE 4000
CMD ["node", "dist/index.js"]
