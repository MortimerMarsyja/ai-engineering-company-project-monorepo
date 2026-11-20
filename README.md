# AI Engineering Company Project — Student Template

[![4Geeks Academy](https://img.shields.io/badge/4Geeks-Academy-blue)](https://4geeksacademy.com)
[![AI Engineering](https://img.shields.io/badge/track-AI%20Engineering-green)](https://4geeksacademy.com/es/programas-de-carrera/ingenieria-ia)

_Base template for transversal projects in the AI Engineering Career Program — 4Geeks Academy._

_Estas instrucciones tambien estan disponibles en [espanol](./README.es.md)._

---

## Purpose

This repository is the **starter template** for transversal projects. You will work on real company scenarios (Brasaland, TrackFlow, Nexova), building deliverables that map to course milestones (Web, Programming, Backend, Telemetry, RAG, Agents, Workflows, Real-time).

- Create a template from this repository.
- Replace the placeholder `CONTEXT.md` with your assigned company context.
- Use `skills/` and the directory-level `README.md` files as working guidance.

---

## How to start

1. **Use this repository as a template** and create your own project repo.
2. **Clone** your repository (or open it in Codespaces).
3. **Replace** `CONTEXT.md` with the full context for your assigned company.
4. **Read this folder guide** and open the `README.md` of the folder you are working in.
5. **Start implementing** in the right folder — do not dump everything in the root.
6. **Document** what you add: each new app, service, agent, or pipeline gets a subfolder + README.

---

## Running tests

The backend (`services/api`, pytest) and the backoffice frontend (`uis/backoffice`, Jest) each have their own test suite. Run them from the **repo root**:

```bash
pnpm test:back    # backend only — pytest with coverage (app/)
pnpm test:front   # frontend only — Jest with coverage (uis/backoffice/lib/*.ts logic)
pnpm test         # both, back-to-back
```

- `pnpm test:back` requires the API's test dependencies — either a `services/api/.venv` created from `services/api/requirements.txt` (or `pyproject.toml`'s `[project.optional-dependencies].test`), or `uv` installed (it falls back to `uv run pytest`). It prints a coverage report for `services/api/app` after the test results.
- `pnpm test:front` requires the backoffice's dev dependencies (`pnpm install` at the repo root installs every workspace, including `uis/backoffice`). It prints a coverage report for the frontend's pure business-logic modules (form validation, status transitions, error classification — not components or HTTP wrappers).
- Both suites also work directly from their own package if you're already in that folder: `cd services/api && uv run pytest` / `cd uis/backoffice && pnpm test`.

---

## Running everything with Docker

`docker-compose.yml` (repo root) runs the whole stack: the FastAPI backend and both Next.js apps (`brasaland-web` + `backoffice`, sharing one container — see `uis/start.sh`).

```bash
cp .env.example .env     # fill in real values — DATABASE_URL, SECRET_KEY, etc.
docker compose up --build
```

- **brasaland-web** → http://localhost:3000
- **backoffice** → http://localhost:3001
- **backend (FastAPI)** → http://localhost:8000 (docs at `/docs`)

Other commands:

```bash
docker compose stop              # stop containers, keep them (and volumes) around
docker compose down               # stop and remove containers
docker compose up --build         # rebuild images after a Dockerfile/dependency change
docker compose logs -f backend    # tail one service's logs
docker compose config             # validate the compose file (no secrets printed)
```

Notes:

- `.env` is gitignored — never commit it. `.env.example` has the full list of variables with placeholder values.
- Both services load their config from this **one root `.env`** (`env_file` in `docker-compose.yml`), not from `services/api/.env` directly — though if that file exists too (bind-mounted in), it only fills in anything the root `.env` left unset, it never overrides it.
- Source code is bind-mounted for live reload (`--reload` on Uvicorn, `next dev` on both frontends); installed dependencies (`node_modules`, the backend's `/opt/venv`) live outside the mounted paths so the bind mounts can't shadow them.
- Containers reach each other by **service name** (`http://backend:8000`), never `localhost` — `localhost` inside a container refers to that container itself. The backoffice's browser-side code still points at `http://localhost:8000` (`NEXT_PUBLIC_API_URL`) since the browser runs on the host, outside Docker's network.

---

## Background task processing (Celery + Redis)

`POST /api/v1/incidents/analyze` (CSV upload → incident ingestion) runs as a **Celery task** instead of inline in the request — it's the only CPU/DB-bound operation in the API heavy enough to justify it (the other write endpoints are single-row inserts). The task, broker config, and dead-letter handling live in `services/api/app/celery_app.py` and `services/api/app/tasks/incidents.py`.

**Required env var:** `REDIS_URL` (see `.env.example`) — the same Redis instance is Celery's broker **and** result backend. Defaults to `redis://localhost:6379/0` for running `services/api` directly on the host; `docker-compose.yml` overrides it to `redis://redis:6379/0` for the `backend`, `worker`, and `flower` containers.

### Install and migrate

```bash
cd services/api
uv pip install -r requirements.txt   # or: pip install -e ".[test]" — adds celery[redis] + flower
```

The dead-letter/submission tables are a normal Supabase migration: `supabase/migrations/20261118100000_create_task_tracking_tables.sql`. Apply it the same way as every other migration in `supabase/migrations/`.

### Start / stop

With Docker (recommended — starts Redis, the worker, and Flower alongside the API):

```bash
docker compose up --build        # redis, backend, worker, flower, ui
docker compose stop              # stop everything, keep containers
docker compose logs -f worker    # tail the worker's logs
docker compose logs -f flower
```

Running on the host instead (needs a local Redis — `brew install redis && redis-server`, or `redis:7-alpine` on its own):

```bash
cd services/api
uv run celery -A app.celery_app worker --loglevel=info
uv run celery -A app.celery_app flower --port=5555
```

- **Flower UI** → http://localhost:5555 (local dev only, no auth configured — do not expose it publicly as-is; see Limitations).

### Submitting a task and polling status

```bash
# Submit — returns 202 immediately, before the CSV is actually processed.
curl -X POST http://localhost:8000/api/v1/incidents/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@incidents.csv"
# {"task_id": "3f1b7e3a-..."}

# Poll status with the returned task_id.
curl http://localhost:8000/api/v1/tasks/3f1b7e3a-... \
  -H "Authorization: Bearer $TOKEN"
# {"task_id": "3f1b7e3a-...", "status": "started", "result": null}
# ... later ...
# {"task_id": "3f1b7e3a-...", "status": "success", "result": {"total_rows": 10, "valid_count": 10, "persisted_count": 10}}
```

`status` is one of `pending`, `started`, `retry`, `success`, `failure` (lowercased from Celery's own states). Only the task's submitter, or an admin/manager, may poll it — anyone else gets `403`; an unknown `task_id` returns `404`.

### Retry behavior and attempt numbering

Transient failures (DB connectivity errors) are retried automatically: **1 initial attempt + up to 3 retries**, with exponential backoff (2s, 4s, 8s between attempts). Attempt numbers are **one-based** — exhausting all retries means failing on **attempt 4**. Permanent errors (e.g. the submitting user is no longer active) are never retried and fail immediately on attempt 1. Retrying never duplicates the DB writes a prior attempt already made for the same `task_id` (see Idempotency below).

### Dead-letter storage and inspection

When a task exhausts its retries (or hits a permanent error), exactly one row is written to `task_dead_letters` — never one per intermediate retry, and never more than one per terminal failure even if the failure signal fires more than once:

```sql
select task_id, task_name, attempt_number, error_message, created_at
from task_dead_letters
order by created_at desc
limit 20;
```

If writing the dead-letter row itself fails, both the original task error and the dead-letter write error are logged separately — the task is never reported as successful in that case.

### Result retention and unknown/expired tasks

Successful/failed results are kept in the Redis result backend for 24h (`result_expires`), then expire. A `GET /tasks/{task_id}` for a `task_id` that was never submitted, or whose result already expired, both currently return `pending`/`404` depending on whether a submission row still exists — `pending` does **not** prove a task exists or is actually queued; it can also mean "never existed" or "result expired." The API relies on its own `task_submissions` table (written before enqueueing) to distinguish "never submitted" (`404`) from "submitted, no result yet or expired" (`pending`).

### Idempotency

Before writing incident rows, the task checks whether its own `task_id` already persisted (`task_submissions.persisted_at`). A redelivery or retry of the same `task_id` that already wrote its rows will report `persisted_count: 0` on the later run instead of duplicating them.

### Operational limitations

- **Independent worker only** — the worker is its own container/process; it is never started inside the FastAPI app or its lifespan.
- **Flower visibility vs. API visibility**: Flower's event stream only shows a task once a worker has actually received it (received/started/retried/succeeded/failed). A task that's been *published to the broker but not yet picked up by any worker* won't show up in Flower yet, even though `GET /tasks/{task_id}` already reports `pending` for it via the result backend. This is expected Celery/Flower behavior, not a bug.
- **`GET /incidents/result/export`** (export of the last in-process analysis) is now broken by this change — it read an in-memory global that only existed when analysis ran inline in the API process. It's out of scope for this task and documented here as a known follow-up.
- **Flower has no authentication configured** in `docker-compose.yml` (`FLOWER_UNAUTHENTICATED_API` is intentionally left unset) — its port is bound to `127.0.0.1` only for local dev; do not expose it publicly without adding auth first.
- A full `docker compose up` of the `redis`/`worker`/`flower` services was not exercised end-to-end in this environment (no running Docker daemon at the time); `docker compose config` was used to validate the compose file instead. The Celery pipeline itself (task, retries, backoff, dead-letters, idempotency, API endpoints, Flower lifecycle events) was verified against a real standalone Redis + a real independent worker process + a real Flower instance + real HTTP requests.

---

## How to think about this monorepo

You are building **one company** across many milestones and projects. Each top-level folder has a **single responsibility** — like a real engineering team repo.

| Layer               | Folders                           | What lives here                                                  |
| ------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Company context** | `CONTEXT.md`                      | Domain facts, field names, constraints for your assigned company |
| **User-facing**     | `uis/`, `services/`               | Frontends and backends users (or operators) interact with        |
| **Data**            | `data/`                           | Raw files, pipelines, processed datasets, evaluation sets        |
| **AI**              | `agents/`, `skills/`, `mcps/`     | Agents, reusable agent capabilities, MCP tool servers            |
| **Automation**      | `workflows/`                      | n8n flows and cross-system orchestration                         |
| **Reuse**           | `packages/`, `shared/`            | Shared types, SDKs, schemas, templates                           |
| **Operations**      | `infra/`, `scripts/`, `internal/` | Docker, deploy configs, one-off scripts, internal CLIs           |
| **Documentation**   | `docs/`                           | Architecture, decisions, conventions for the whole repo          |

**Rule of thumb:** if it has a UI → `uis/`. If it exposes an API or runs in the background → `services/`. If it moves or transforms data → `data/`. If an AI model does the work → `agents/` (+ `skills/` or `mcps/` as needed).

---

## Current status of the template

> 💡 This repository currently provides a **base folder structure and documentation skeleton** only. It does not include runnable apps or global scripts yet.
>
> - `CONTEXT.md` is a placeholder and must be replaced with your assigned company context.
> - There is no root `AGENTS.md` yet.
> - Shared package metadata exists in `packages/shared/package.json` (`@repo/shared-types`), but no workspace runner is configured at root.

---

## Folder guide — what goes where

Read the linked `README.md` inside each folder before you start coding there.

### Root files

| Path                         | Purpose                                                                   | What you do here                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`CONTEXT.md`](./CONTEXT.md) | Single source of truth for your company (Brasaland, TrackFlow, or Nexova) | **First step:** copy your assigned company briefing here so every app, agent, and prompt uses the same domain |
| `docker-compose.yml`         | Local dev orchestration for the whole stack                               | Keep at repo root — wires `services/`, databases, and other containers from one place                         |
| `README.md` / `README.es.md` | This guide                                                                | Orientation — you are here                                                                                    |

### `uis/` — user interfaces

**Purpose:** All frontend applications — anything a human sees and clicks.

**Put here:**

- Public website (`website/`)
- Internal admin / backoffice (`backoffice/`)
- Customer portals, loyalty apps, Streamlit/Gradio tools, dashboards with a UI

**Examples:** corporate landing page, operations backoffice, loyalty portal, telemetry dashboard UI

→ See [`uis/README.md`](./uis/README.md)

### `services/` — centralized company API (FastAPI)

**Purpose:** One **centralized FastAPI backend** for the whole company — a single entry point that keeps complexity low as the project grows.

**Put here:**

- One main FastAPI app (e.g. `api/`) with routers/modules per domain (locations, menus, sales, telemetry, etc.)
- Background workers only when they truly need to run separately from the API

**Recommendation:** avoid splitting into many microservices early. Add endpoints to the same FastAPI app; extract a worker only when necessary.

**Examples:** `/locations`, `/menus`, `/sales/reports`, webhook handlers, scheduled jobs

→ See [`services/README.md`](./services/README.md)

### `data/` — datasets, pipelines, and evaluation

**Purpose:** Everything data-related, from raw files to production-ready tables.

| Subfolder                                       | Purpose                      | What you do here                                                          |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| [`data/raw/`](./data/raw/README.md)             | Untouched source data        | Store dumps, exports, sample CSVs/JSON — document origin and PII rules    |
| [`data/pipelines/`](./data/pipelines/README.md) | ETL/ELT jobs                 | Write ingestion, cleaning, and transformation scripts                     |
| [`data/process/`](./data/process/README.md)     | Clean / intermediate outputs | Save artifacts produced by pipelines (features, aggregates, clean tables) |
| [`data/eval/`](./data/eval/README.md)           | Quality measurement          | Golden sets, RAG/agent eval datasets, experiment metrics                  |

**Flow:** `raw` → `pipelines` → `process` → consumed by `services/`, `uis/`, or `agents/`. Use `eval` to prove quality.

### `agents/` — AI agents

**Purpose:** Autonomous or semi-autonomous AI assistants for the company.

**Put here:**

- One subfolder per agent (e.g. `support-agent/`, `onboarding-agent/`)
- Agent config, prompts, tools wiring, tests
- Start from [`agents/_template/`](./agents/_template/README.md) when creating a new agent

**Examples:** customer support bot, employee onboarding copilot, training assistant

→ See [`agents/README.md`](./agents/README.md)

### `skills/` — reusable agent capabilities

**Purpose:** Packaged instructions + scripts that agents (or you in Cursor) reuse across the repo.

**Put here:**

- Skills for data analysis, code review, scraping, research, etc.
- Each skill = a folder with `SKILL.md`, optional scripts and resources

**Example included:** `skills/data-analysis/` (pandas cleaning script + metrics reference)

→ See [`skills/README.md`](./skills/README.md)

### `mcps/` — Model Context Protocol servers

**Purpose:** Bridge AI models to your systems — databases, APIs, GitHub, custom tools.

**Put here:**

- One subfolder per MCP server (e.g. `database-mcp/`, `github-mcp/`)
- Tool definitions, resources, and server config

**When to use:** when an agent needs live access to data or actions your codebase alone cannot provide

→ See [`mcps/README.md`](./mcps/README.md)

### `workflows/` — automation and orchestration

**Purpose:** Connect systems without writing full apps — scheduled jobs, webhooks, notifications.

**Put here:**

- n8n workflow exports, Make/Zapier configs, or orchestration docs
- Flows that link `services/`, `data/pipelines/`, and `agents/`

**Examples:** new-order → Slack alert, nightly ETL trigger, lead → CRM sync

→ See [`workflows/README.md`](./workflows/README.md)

### `packages/` — shared libraries

**Purpose:** Versionable code reused by multiple apps, agents, or pipelines.

**Put here:**

- Shared TypeScript types (`packages/shared/` → `@repo/shared-types`)
- UI component libraries, API clients, analytics SDKs

**Rule:** if `uis/` and `services/` both need the same interface → extract it here

→ See [`packages/README.md`](./packages/README.md)

### `shared/` — loose shared assets

**Purpose:** Resources that are not a full package — schemas, templates, static assets, short docs.

**Put here:**

- JSON schemas, email templates, OpenAPI specs, design tokens
- Anything reused but too small or non-code for `packages/`

→ See [`shared/README.md`](./shared/README.md)

### `docs/` — cross-cutting documentation

**Purpose:** Architecture and decisions that span the whole company project.

**Put here:**

- System architecture diagrams, ADRs, security/observability guides
- Conventions not tied to one app or agent

→ See [`docs/README.md`](./docs/README.md)

### `infra/` — infrastructure and deployment

**Purpose:** How the company project runs in Docker, cloud, or CI.

**Put here:**

- Dockerfiles, Terraform, K8s manifests, Nginx configs, CI/CD pipelines

**Keep at repo root:** `docker-compose.yml` — orchestrates local dev for `services/`, databases, and other containers from one place.

→ See [`infra/README.md`](./infra/README.md)

### `scripts/` — helper scripts

**Purpose:** Small, repeatable automation — not full apps.

**Put here:**

- Setup scripts, seed data generators, lint wrappers, one-off migrations
- Document each script: what it does, args, and how to run it

**Difference from `internal/`:** scripts are usually single files; `internal/` tools are structured projects with their own deps and tests.

→ See [`scripts/README.md`](./scripts/README.md)

### `internal/` — internal developer tools

**Purpose:** Robust utilities for the engineering team.

**Put here:**

- CLIs, packaged migration tools, prompt evaluators
- Tools with their own `package.json`, tests, and install steps

→ See [`internal/README.md`](./internal/README.md)

---

## Where should I put this?

Quick decision guide:

```text
Does it have buttons and screens?          → uis/
Does it run on a server / API / queue?     → services/
Is it raw or transformed data?             → data/raw/ or data/process/
Does it move data between systems?         → data/pipelines/
Do you measure AI/pipeline quality?        → data/eval/
Is it an AI assistant with a goal?         → agents/
Is it a reusable AI capability/instruction?→ skills/
Does AI need to call external tools/APIs?  → mcps/
Is it n8n / scheduled automation?          → workflows/
Will 2+ folders import the same code?      → packages/
Is it a schema/template/asset, not a lib?  → shared/
Is it architecture or team-wide docs?      → docs/
Is it docker-compose for local dev?        → repo root
Is it Docker / deploy / cloud config?      → infra/
Is it a one-off script?                    → scripts/
Is it a CLI tool with its own package?     → internal/
```

---

## Repository structure (tree)

```text
ai-engineering-company-project-monorepo/
├── README.md / README.es.md   # This guide
├── CONTEXT.md                 # ← Replace with your company briefing
├── docker-compose.yml         # ← Local dev orchestration (repo root)
├── uis/                       # Frontends (website, backoffice, dashboards)
├── services/                  # Centralized FastAPI company API
├── data/
│   ├── raw/                   # Source datasets
│   ├── pipelines/             # ETL/ELT jobs
│   ├── process/               # Clean / intermediate outputs
│   └── eval/                  # Evaluation sets and metrics
├── agents/                    # AI agents (+ _template/ starter)
├── skills/                    # Reusable agent skills
├── mcps/                      # MCP servers for tool access
├── workflows/                 # n8n and automation flows
├── packages/                  # Shared libraries (@repo/shared-types, …)
├── shared/                    # Schemas, templates, loose assets
├── docs/                      # Architecture and cross-cutting docs
├── infra/                     # Docker, Terraform, deployment
├── scripts/                   # Helper scripts
└── internal/                  # Internal CLIs and dev tools
```

---

## Links

- [4Geeks Academy — AI Engineering](https://4geeksacademy.com/es/programas-de-carrera/ingenieria-ia)
- [How to start a coding project](https://4geeks.com/lesson/how-to-start-a-project)

---

## Contributors

This template was built as part of the 4Geeks Academy AI Engineering Career Program by [@marcogonzalo](https://www.linkedin.com/in/marcogonzalo) and [@alezanchezr](https://x.com/alesanchezr) and many other contributors. Find out more about our [AI Engineering Course](https://4geeksacademy.com/en/career-programs/ai-engineering), and [other courses](https://4geeksacademy.com/en/program-comparison).

You can find other templates and resources like this at the [4Geeks Academy GitHub page](https://github.com/4geeksacademy).

_This template is maintained by 4Geeks Academy for the AI Engineering track. For exclusive use in the programme._
