# Carpeta `data/raw`

Esta carpeta está pensada para almacenar **datos en bruto** (raw) relacionados con la compañía: dumps, exports, archivos de ejemplo, muestras de eventos, o datasets sin transformar.

- **Propósito principal**: servir como zona de aterrizaje o referencia de datos originales antes de ser procesados por pipelines.
- **Recomendación**: documenta el origen de cada dataset, formato, tamaño esperado, consideraciones de privacidad/PII y cómo se versiona (idealmente evitando subir datos sensibles al repositorio).

## `telemetry_<YYYY-MM-DD>.csv`

Copia de respaldo/auditoría diaria de `telemetry_events` para ese día
UTC, escrita por `scripts/nightly_export.py` — nunca se sobrescribe una
vez que existe, y ninguna pipeline la vuelve a leer (la pipeline siempre
consulta la base de datos directamente). Está en `.gitignore`
(`data/raw/telemetry_*.csv`) — contienen datos reales de telemetría
(session_id/user_id/tags), nunca se commitean. Ver la sección
`nightly_export.py` de `scripts/README.es.md` para el contrato completo.
