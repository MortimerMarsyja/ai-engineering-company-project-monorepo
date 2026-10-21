# `performance-tests`

Playwright + Lighthouse performance audits for `brasaland-web` (public site) and `brasaland-backoffice` (admin app), against **production builds** (`next build` + `next start`) — not `next dev`, which would give misleading (worse) scores.

Manual, on-demand report generator — not a CI gate. Every page is gated at a Lighthouse score of 90 across all four categories (performance, accessibility, best-practices, SEO); a test fails if any category drops below that. Adjust the default in `helpers/lighthouse-audit.ts`, or pass a different `thresholds` object per call site.

## Prerequisite

The FastAPI backend must already be running and seeded — this package only starts the two Next.js apps, not the backend:

```bash
cd services/api
uv run uvicorn app.main:app --port 8000   # separate terminal
uv run seed-users                          # once, so admin@brasaland.com exists
```

**Stop the Docker Compose stack first if it's running.** The `ui` and `backend`
containers bind the same ports this suite uses (3000, 3001, 8000). Playwright's
`webServer.reuseExistingServer` means it will silently attach to those
containers instead of building fresh — and the containerized `ui`'s backend URL
only resolves inside Docker's network, so the login step hangs until the
`beforeAll` hook times out. Run `docker compose down` (or stop just those two
containers) before `pnpm test:perf`.

## Run

```bash
cp .env.example .env     # first time only; defaults already work for local dev
pnpm test:perf           # from the repo root
```

This builds and starts both Next.js apps (ports 3000/3001), audits every page listed in `tests/*.spec.ts`, and writes a consolidated report to `reports/index.html`.

## Config

See `.env.example` — base URLs for each app and the admin credentials used to log into the backoffice (defaults match `services/api/seed_users.py`).
