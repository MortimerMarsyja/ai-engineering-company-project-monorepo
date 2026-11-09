# Dev-only image: runs both Next.js apps (brasaland-web + backoffice) with
# their own `dev` process, reloading on code changes via bind mounts from
# docker-compose. Not a production/standalone build.
#
# Build context is the REPO ROOT (see docker-compose.yml's `ui` service),
# not this uis/ directory — every COPY below is relative to the root.
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

# ── brasaland-web: fully standalone install ────────────────
# No workspace:* dependencies — installed directly from its own
# package.json, same as before.
COPY uis/brasaland-web/package.json ./brasaland-web/package.json
RUN cd brasaland-web && pnpm install

# ── backoffice: needs a real (if minimal) pnpm workspace ───
# backoffice depends on "@repo/shared-types": "workspace:*"
# (packages/shared) — pnpm can only resolve the `workspace:` protocol
# inside an actual workspace rooted at a pnpm-workspace.yaml, never from
# a single package.json installed in isolation (that previously made
# `pnpm install` fail here with ERR_PNPM_WORKSPACE_PKG_NOT_FOUND on any
# cache-cold build). Declaring a workspace scoped to just these two
# packages — not the monorepo's real root pnpm-workspace.yaml, which
# also lists uis/* and would expect brasaland-web/backend/etc. to be
# present too — is enough for pnpm to link @repo/shared-types locally
# instead of trying to fetch it from a registry.
RUN printf 'packages:\n  - backoffice\n  - packages/shared\n' > pnpm-workspace.yaml
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/types ./packages/shared/types
COPY uis/backoffice/package.json ./backoffice/package.json
RUN pnpm install

# ── Application source ──────────────────────────────────────
# Overridden at runtime by docker-compose's bind mounts for live reload;
# copied here so the image is runnable standalone too (e.g. `docker run`
# without compose).
COPY uis/brasaland-web ./brasaland-web
COPY uis/backoffice ./backoffice

COPY uis/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 3000 3001

CMD ["/usr/local/bin/start.sh"]
