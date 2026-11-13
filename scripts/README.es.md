# Carpeta `scripts`

Esta carpeta contiene **scripts auxiliares** del monorepo: automatizaciones de desarrollo, utilidades de mantenimiento, tareas repetitivas (setup, lint, migraciones, generación de datos, etc.) y tooling interno.

- **Propósito principal**: agrupar herramientas de soporte que no pertenecen a una app/agente/pipeline específico, pero facilitan el trabajo del equipo.
- **Recomendación**: documenta cada script (qué hace, parámetros, requisitos, ejemplos de uso) y procura que sean reproducibles (y seguros) en distintos entornos.

## API local: `dev-backend.mjs`

Ejecuta `pnpm dev:back` desde la raíz para iniciar la API con recarga automática en el puerto 8000. El script utiliza `services/api/.venv` si existe; en caso contrario, necesita `uv` en el PATH. El entorno virtual debe tener instaladas las dependencias de la API.

Si una herramienta exporta un valor no booleano de `DEBUG`, el script lo descarta para que la API lea su configuración de `.env`. `pnpm dev:all` inicia las tres aplicaciones y detiene el conjunto si alguna falla, evitando que el backoffice quede abierto sin la API.

## `nightly_export.py` — exportación nocturna de telemetría + disparo de la pipeline del Milestone 6

```bash
python scripts/nightly_export.py                       # ayer, UTC
TARGET_DATE=2026-07-13 python scripts/nightly_export.py # fecha concreta (manual/backfill)
```

Ejecutar con el intérprete del virtualenv de `services/api` (`app.*` —
acceso a la base de datos — solo es importable ahí):

```bash
services/api/.venv/bin/python scripts/nightly_export.py
```

Qué hace:
1. Resuelve `target_date` — variable de entorno `TARGET_DATE`
   (`YYYY-MM-DD`) si está definida; si no, el día anterior en UTC. Un
   `TARGET_DATE` inválido se rechaza antes de hacer nada más (no se crea
   ninguna fila en `job_runs` para ese caso).
2. Adquiere atómicamente el derecho a ejecutar vía
   `app.services.job_runner` (respaldado por la tabla `job_runs` — ver
   `supabase/migrations/20261113090000_create_job_runs.sql`): omite la
   ejecución con código de salida 0, sin realizar trabajo, si (a) ya hay
   una ejecución `processing` para este job (cualquier fecha), o (b) ya
   hay una ejecución `completed` para ese `target_date` exacto. Una
   ejecución `failed` previa nunca bloquea un reintento.
3. Exporta `telemetry_events` de ese día UTC a
   `data/raw/telemetry_<target_date>.csv` — **solo si ese archivo no
   existe ya** (nunca se sobrescribe; se publica de forma atómica
   mediante un archivo temporal, así que una exportación fallida nunca
   deja un CSV parcial en la ruta final). Este archivo es solo una copia
   de respaldo/auditoría; la pipeline siempre lee de la base de datos,
   nunca de este CSV.
4. Ejecuta la pipeline del Milestone 6 como subproceso (mismo intérprete
   de Python, `target_date` pasado explícitamente — ver `PIPELINE_MODULE`
   en el script, actualmente `data.pipelines.telemetry_kpi_daily.run`, un
   **placeholder**: no existe ningún spec de Milestone 6 en este repo
   todavía, ver el docstring de ese módulo).
5. Marca la ejecución como `completed` solo si ambos pasos tuvieron
   éxito; cualquier fallo en alguno la marca `failed` con el mensaje de
   error y termina con código distinto de cero.

**Recuperar una ejecución atascada**: si el proceso termina
abruptamente a mitad de la ejecución, su fila en `job_runs` queda
`processing` para siempre (no hay caducidad automática del bloqueo, por
diseño) y sigue bloqueando cualquier ejecución futura de este job.
Recupérala a mano:

```sql
UPDATE job_runs
   SET status = 'failed', finished_at = now(),
       error_message = 'Recuperado manualmente: ejecución abandonada por un proceso terminado.'
 WHERE id = '<id de la ejecución atascada>';
```

Encuentra primero la fila atascada con
`SELECT * FROM job_runs WHERE job_name = 'nightly_export' AND status = 'processing';`
y confirma que el proceso realmente ya no existe antes de actualizarla.

**Programación**: ver [`deploy/README.md`](./deploy/README.md) — un
timer de systemd, diariamente a las 02:00 UTC por defecto (no existía un
horario previo para este job). Este script nunca corre dentro del
proceso de FastAPI (sin APScheduler, sin `@repeat_every`, sin hook de
lifespan) — solo como su propio proceso del sistema operativo programado.
