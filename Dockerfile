# syntax=docker/dockerfile:1
# Production images, built from the repository root:
#   docker build --target server -t chinchi-server .
#   docker build --target web -t chinchi-web .
# deploy/docker-compose.yml builds both.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chinchi/server build && pnpm --filter @chinchi/web build
# A self-contained server directory: production dependencies only, plus the bundle and migrations.
RUN pnpm --filter @chinchi/server deploy --prod --legacy /out/server \
  && cp -r apps/server/dist apps/server/drizzle /out/server/

# The API and realtime gateway. Runs migrations at start.
FROM node:24-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.mjs"]

# The web app, served by Caddy, which also terminates TLS and proxies the API, files and voice.
FROM caddy:2.10-alpine AS web
COPY --from=build /repo/apps/web/dist /srv/web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=755 deploy/caddy-entrypoint.sh /usr/local/bin/caddy-entrypoint.sh
# Writes where files and voice live (one domain or their own) before Caddy reads its config.
ENTRYPOINT ["caddy-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
