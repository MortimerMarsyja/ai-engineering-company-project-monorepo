# Carpeta `scripts`

Esta carpeta contiene **scripts auxiliares** del monorepo: automatizaciones de desarrollo, utilidades de mantenimiento, tareas repetitivas (setup, lint, migraciones, generación de datos, etc.) y tooling interno.

- **Propósito principal**: agrupar herramientas de soporte que no pertenecen a una app/agente/pipeline específico, pero facilitan el trabajo del equipo.
- **Recomendación**: documenta cada script (qué hace, parámetros, requisitos, ejemplos de uso) y procura que sean reproducibles (y seguros) en distintos entornos.

## API local: `dev-backend.mjs`

Ejecuta `pnpm dev:back` desde la raíz para iniciar la API con recarga automática en el puerto 8000. El script utiliza `services/api/.venv` si existe; en caso contrario, necesita `uv` en el PATH. El entorno virtual debe tener instaladas las dependencias de la API.

Si una herramienta exporta un valor no booleano de `DEBUG`, el script lo descarta para que la API lea su configuración de `.env`. `pnpm dev:all` inicia las tres aplicaciones y detiene el conjunto si alguna falla, evitando que el backoffice quede abierto sin la API.
