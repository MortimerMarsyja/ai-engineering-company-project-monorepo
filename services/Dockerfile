# Dev-only image for the FastAPI backend (services/api). Only one service
# exists under services/ today; this Dockerfile builds it explicitly so
# adding a second service later doesn't require restructuring the build
# context (build context: ./services, this file: services/Dockerfile).
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
COPY api/requirements.txt ./requirements.txt
RUN uv pip install -r requirements.txt

# Overridden at runtime by docker-compose's bind mount for --reload; kept
# here so the image is runnable standalone too.
COPY api ./

EXPOSE 8000

# The real app module: services/api/app/main.py exposes `app` — this
# Dockerfile's WORKDIR matches services/api so "app.main:app" resolves.
CMD ["uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
