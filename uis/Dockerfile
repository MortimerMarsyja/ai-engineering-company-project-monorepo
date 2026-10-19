# Dev-only image: runs both Next.js apps (brasaland-web + backoffice) with
# their own `dev` process, reloading on code changes via bind mounts from
# docker-compose. Not a production/standalone build.
FROM node:20-alpine

# libc6-compat: Next.js/Turbopack ship some prebuilt native bindings that
# expect glibc-ish symbols even on musl (Alpine) — the official Next.js
# Docker examples add this for the same reason.
# bash: start.sh uses `wait -n`, not supported by Alpine's default ash.
RUN apk add --no-cache libc6-compat bash

# Pin pnpm to the version this monorepo's lockfile was generated with
# (see root pnpm-lock.yaml's lockfileVersion / `pnpm --version` in dev).
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

WORKDIR /app

# ── Install each app's dependencies in its own layer ───────
# Neither uis/brasaland-web nor uis/backoffice has its own lockfile today
# (the monorepo's single pnpm-lock.yaml only tracks the repo root and
# uis/backoffice as workspace members — brasaland-web isn't wired into
# the root workspace yet). So each app is installed standalone, from its
# own package.json, in its own directory — not via a workspace filter.
# If either app later ships its own lockfile, `pnpm install` picks it up
# and respects it automatically; nothing here needs to change.
COPY brasaland-web/package.json ./brasaland-web/package.json
RUN cd brasaland-web && pnpm install

COPY backoffice/package.json ./backoffice/package.json
RUN cd backoffice && pnpm install

# ── Application source ──────────────────────────────────────
# Overridden at runtime by docker-compose's bind mounts for live reload;
# copied here so the image is runnable standalone too (e.g. `docker run`
# without compose).
COPY brasaland-web ./brasaland-web
COPY backoffice ./backoffice

COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 3000 3001

CMD ["/usr/local/bin/start.sh"]
