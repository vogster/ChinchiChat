# syntax=docker/dockerfile:1
# Production images, built from the repository root:
#   docker build --target server -t chinchi-server .
#   docker build --target web -t chinchi-web .
# Multi-arch, as releases do: docker buildx build --platform linux/amd64,linux/arm64 ...
# deploy/docker-compose.yml builds both.

FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# The web app is the same files on every architecture: build it once, natively (no emulation).
FROM --platform=$BUILDPLATFORM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS web-build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@chinchi/web..."
RUN pnpm --filter @chinchi/web build

# The server for the target architecture (amd64 or arm64): sharp's native binary must match it.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@chinchi/server..."
RUN pnpm --filter @chinchi/server build
# A self-contained server directory: production dependencies only, plus the bundle and migrations.
RUN pnpm --filter @chinchi/server deploy --prod --legacy /out/server \
  && cp -r apps/server/dist apps/server/drizzle /out/server/

# The API and realtime gateway. Runs migrations at start.
FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# Security fixes Debian published after the base image was built, and no package managers at
# runtime: the server only needs `node`, while npm and corepack vendor their own (older) copies
# of undici, minimatch and friends that the release scan would otherwise flag.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-*
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.mjs"]

# The web app, served by Caddy, which also terminates TLS and proxies the API, files and voice.
FROM caddy:2.11-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS web
COPY --from=web-build /repo/apps/web/dist /srv/web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 deploy/caddy-entrypoint.sh /usr/local/bin/caddy-entrypoint.sh
# Writes where files and voice live (one domain or their own) before Caddy reads its config.
ENTRYPOINT ["caddy-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
