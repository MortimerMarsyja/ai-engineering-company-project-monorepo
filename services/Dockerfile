# Dev-only image for the FastAPI backend (services/api), also reused
# as-is for the `worker`/`flower` Celery services (only the command
# differs — see docker-compose.yml). Build context is the repo root (not
# ./services) because app/services/reporting.py imports
# data/pipelines/weekly-location-performance/ directly by an absolute
# path (see that module's own docstring) — that sibling directory must be
# copied into the image too, which isn't reachable from a ./services-only
# build context.
FROM python:3.12-slim

# uv needs a C toolchain for a couple of sdists it may have to build on
# some platforms; psycopg2-binary itself ships prebuilt wheels so no
# libpq headers are required here.
RUN pip install --no-cache-dir uv

# A dedicated venv keeps installed packages out of /app/api, which is
# bind-mounted over at runtime by docker-compose — if the venv lived
# inside /app/api, the bind mount would shadow it and the container
# would boot with no dependencies installed.
ENV VIRTUAL_ENV=/opt/venv
RUN uv venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app/api

# Install dependencies in their own layer, before the source copy, so
# editing application code doesn't invalidate the dependency cache.
COPY services/api/requirements.txt ./requirements.txt
RUN uv pip install -r requirements.txt

# Overridden at runtime by docker-compose's bind mount for --reload; kept
# here so the image is runnable standalone too.
COPY services/api ./

# app/services/reporting.py's sys.path setup expects this pipeline at
# exactly this absolute path in every environment that imports app.main
# (also bind-mounted at runtime by docker-compose for live reload, same
# reasoning as ./api above).
COPY data/pipelines/weekly-location-performance /data/pipelines/weekly-location-performance

EXPOSE 8000

# The real app module: services/api/app/main.py exposes `app` — this
# Dockerfile's WORKDIR matches services/api so "app.main:app" resolves.
CMD ["uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
