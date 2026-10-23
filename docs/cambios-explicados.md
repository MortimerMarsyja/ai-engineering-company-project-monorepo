# Qué cambié y por qué — guía para repasar

Este documento resume **todo** lo que modifiqué en el proyecto durante esta sesión, explicado paso a paso. La idea es que puedas leerlo como quien repasa un diff con un compañero que te explica el porqué de cada cosa, no solo el qué.

Está dividido en dos bloques grandes:

1. **Pruebas de rendimiento (Playwright + Lighthouse)** — frontend
2. **Auditoría de serialización de la API** — backend

---

## Bloque 1 — Pruebas de rendimiento (frontend)

### Contexto

Ya tenías instalado Playwright + Lighthouse para auditar `brasaland-web` y `brasaland-backoffice` (carpeta `uis/performance-tests/`). Mi trabajo fue **probar que funcionara de verdad** y arreglar lo que encontré roto en el camino.

### 1.1 — El conflicto con Docker

**El síntoma:** al correr `pnpm test:perf`, a veces fallaba el login con un timeout rarísimo, y otras veces pasaba todo perfecto. Nada parecía tener sentido.

**La causa real:** tenías un `docker compose` corriendo en segundo plano (contenedores `ui` y `backend`) que ocupaban **los mismos puertos** (3000, 3001, 8000) que usa la suite de pruebas. Playwright tiene una opción llamada `reuseExistingServer`: si algo ya está respondiendo en ese puerto, Playwright asume que es "su" servidor y lo reutiliza en vez de levantar uno nuevo. El problema es que lo que había ahí era el contenedor de Docker, no el build de producción que la suite necesitaba auditar — y ese contenedor tenía configurada una URL de backend que solo existe *dentro* de la red de Docker, así que el navegador (que corre en tu máquina, no dentro de Docker) nunca podía completar el login.

> 💡 **Concepto clave:** cuando una prueba "a veces falla, a veces no" sin que cambies nada en el código, sospecha de **estado externo compartido** (puertos, procesos de fondo, bases de datos no limpiadas) antes de sospechar del código de la prueba.

**El arreglo:** en `uis/performance-tests/playwright.config.ts`, cambié `reuseExistingServer: !process.env.CI` (que en local es `true`) a `reuseExistingServer: false` para ambos servidores. Así, si hay un puerto ocupado, Playwright **falla con un error claro** ("puerto ya en uso") en vez de probar silenciosamente la app equivocada. Fallar ruidosamente es mejor que fallar en silencio.

También documenté esto en el `README.md` de esa carpeta: hay que apagar Docker antes de correr la suite.

### 1.2 — Un bug real de React, encontrado por accidente

Mientras investigaba por qué `/dashboard` sacaba mala nota en Lighthouse (76-78 de rendimiento, cuando el resto de páginas sacaba 100), encontré esto en la consola del navegador:

```
Error: Hydration failed because the server rendered text didn't match the client.
```

**¿Qué es "hydration" (hidratación)?** Next.js primero genera el HTML de la página en el **servidor** (para que cargue rápido) y después React vuelve a "montar" ese mismo HTML en el **navegador** para que se vuelva interactivo. Si lo que genera el servidor y lo que genera el navegador no coinciden exactamente, React se asusta, tira el HTML del servidor a la basura y vuelve a renderizar todo desde cero en el cliente. Eso es lento y es justo lo que estaba pasando en `/dashboard`.

**La causa:** `app/dashboard/page.tsx` tenía `"use client"` (lo marca como "Client Component", o sea que corre tanto en servidor como en navegador) y llamaba a `generateDailySales()`, una función en `lib/data.ts` que usa `Math.random()` para inventar datos de ventas de ejemplo. Cada vez que se llama, da un número distinto — así que el servidor generaba una cosa y el navegador, un segundo después, generaba otra. Mismatch garantizado.

**El arreglo:** quité `"use client"` de `app/dashboard/page.tsx`. Ahora es un **Server Component** — solo se ejecuta una vez, en el servidor, y el navegador recibe el resultado ya calculado sin tener que recalcularlo. Como ese archivo no usa ningún hook de React (`useState`, `useEffect`, clics, etc.), no necesitaba ser Client Component para empezar.

> 💡 **Concepto clave (Next.js App Router):** por defecto, todo componente es un **Server Component**. Solo lo conviertes en **Client Component** (`"use client"`) cuando necesitas interactividad del navegador (estado, eventos, hooks). Si no la necesitas, déjalo como Server Component — es más rápido y evita bugs como este.

**Resultado medido:** el rendimiento de `/dashboard` subió de 76-78 a **99**, y el "Largest Contentful Paint" (LCP, qué tan rápido aparece el contenido principal) bajó de 5.1s a 2.1s.

### 1.3 — El reporte no mostraba recomendaciones de mejora

**El síntoma:** el reporte (`reports/index.html`) solo mostraba números (70, 85, 100...) pero no decía *qué* mejorar.

**La causa:** Lighthouse sí guarda esa información (qué imagen optimizar, qué JS está sin minificar, etc.) en el JSON de cada página, pero el script `scripts/build-report.mjs` que genera el reporte resumen nunca la leía — solo armaba una tabla con los puntajes y un link al reporte completo de cada página (22 páginas, 22 reportes separados para abrir uno por uno).

**El arreglo:** modifiqué `build-report.mjs` para que, por cada página, extraiga las 5 auditorías peor puntuadas y las muestre en un panel desplegable (`<details>`) justo debajo de los puntajes, con el título, el ahorro estimado y el link a la documentación de Lighthouse. Si una página saca 100 en todo, el panel dice "No notable improvement opportunities" en vez de estar vacío sin explicación.

### 1.4 — Umbral mínimo de calidad (90/100)

Pediste que todas las categorías (performance, accesibilidad, buenas prácticas, SEO) tuvieran un mínimo de 90 para considerar la prueba "pasada". Antes, `helpers/lighthouse-audit.ts` tenía los cuatro umbrales en `0` — es decir, la prueba nunca fallaba, solo *reportaba* el número sin juzgarlo.

**El arreglo:** cambié los cuatro valores a `90` en `DEFAULT_THRESHOLDS`. Ahora, si cualquier página cae por debajo de 90 en cualquier categoría, el test de esa página falla explícitamente (lo viste en acción cuando `/suppliers/new` sacó 79 y el run se marcó en rojo).

---

## Bloque 2 — Auditoría de serialización de la API (backend)

Esto fue un trabajo más grande, en tres fases, sobre `services/api` (FastAPI + Pydantic).

### ¿Qué es "serialización" y por qué importa?

Cuando tu API responde a una petición, tiene que convertir objetos de Python (modelos de base de datos, diccionarios) en JSON para mandarlos por HTTP. **Serializar bien** significa decidir *a propósito* qué campos van en esa respuesta — ni más (fuga de datos) ni menos (el frontend no tiene lo que necesita). FastAPI y Pydantic te dejan declarar esto con un `response_model`: un "molde" que dice exactamente qué forma debe tener la respuesta, y que **filtra automáticamente** cualquier campo que no esté en el molde.

El problema que encontré: muchas rutas **no tenían ese molde**, o tenían uno tan genérico (`dict | list | None`) que no filtraba nada. Eso significa que si alguien cambiaba el código del servicio por error y agregaba, sin querer, el hash de la contraseña al diccionario que se devuelve, **nada lo hubiera detectado** — se habría ido directo al cliente.

### 2.1 — Fase 1: Auditoría (`docs/serialization-audit.md`)

Antes de tocar código, revisé **las 31 rutas** de la API una por una: qué `response_model` declaraban, qué devolvían *en realidad* (lo comprobé leyendo el código del servicio, no asumiendo), y si el frontend (`uis/backoffice`) de verdad usaba esos campos (lo comprobé con `grep` en el código real del frontend, no adivinando).

Clasifiqué cada ruta con una de estas etiquetas:
- ✅ **Correctamente serializada** — tiene molde y el molde es correcto.
- ⚠️ **Parcialmente serializada** — tiene molde, pero genérico/sin filtrar de verdad (ej: `ApiResponse` con `data: dict`).
- ❌ **Sin contrato explícito** — no declara ningún `response_model`, FastAPI deja pasar lo que sea.
- ➖ **Excepción justificada** — no debe tener molde JSON (ej: descarga de un CSV, respuesta `204 No Content`).

Resultado inicial: **10 ✅ / 13 ⚠️ / 6 ❌ / 2 ➖**.

**El hallazgo más importante:** `POST /auth/login` devolvía el usuario completo (incluyendo su `email`) dentro de la respuesta del login, sin que **ningún** componente del frontend lo leyera (lo confirmé revisando `uis/backoffice/lib/auth.ts`: la función `loginUser` solo usa `access_token`). Es decir, se estaba exponiendo un dato de más que nadie pedía ni necesitaba.

### 2.2 — Fase 2: Implementación

#### a) Un molde genérico reutilizable (`Generic[T]` de Pydantic)

En `app/models/schemas.py` cambié esto:

```python
class ApiResponse(BaseModel):
    data: dict | list | None = None
```

por esto:

```python
T = TypeVar("T")

class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
```

> 💡 **Concepto clave:** `Generic[T]` es como decir "esta clase tiene un espacio en blanco (`T`) que cada quien rellena". `ApiResponse[UserResponse]` significa "una ApiResponse cuyo campo `data` es, específicamente, un `UserResponse` — ni un dict cualquiera". Pydantic valida ese molde de verdad: si el código intenta meter un campo que no está declarado en `UserResponse`, Pydantic lo descarta antes de que salga por HTTP.

También agregué `DataEnvelope[T]` (para respuestas tipo `{data: ...}` sin el resto del sobre) y `PaginatedResponse[T]` (para listados tipo `{data: [...], total, page, limit}`) — porque el frontend ya esperaba esas dos formas distintas y no quería romperlas.

#### b) Login: ya no devuelve el usuario

Creé un esquema nuevo, `LoginData`, con **solo** `access_token` y `token_type`. El login ya no manda el objeto `user` completo. Si una pantalla necesita saber quién es el usuario logueado, usa `GET /auth/me` por separado (que ya existía y es donde la app sí tiene permitido mostrar el `email`).

#### c) Registro: ya no devuelve el email

Mismo criterio: creé `UserRegisteredResponse` (sin `email`) para la respuesta de `POST /users`. Esto no lo pedía explícitamente ningún consumidor (de hecho, el frontend ni siquiera lee la respuesta del registro), pero la instrucción de seguridad era clara: ni login, ni registro, ni recuperación de contraseña deben devolver el email en el cuerpo.

#### d) Les puse molde a las rutas que no tenían ninguno

`GET /incidents`, `GET /incidents/metrics`, `POST /incidents/analyze`, `GET /records`, `GET /records/{id}/notes` y `POST /records/{id}/notes` no tenían `response_model` — devolvían diccionarios armados a mano en el router. Les creé esquemas Pydantic exactos (`IncidentMetricsResponse`, `AnalyzeSummaryResponse`, `NotesListResponse`, etc.) copiando la forma que el frontend ya esperaba (lo verifiqué leyendo los tipos TypeScript en `uis/backoffice/lib/`).

#### e) Las rutas de `suppliers`, `profiles` y `users` (listar/editar)

Mismo patrón: tenían `ApiResponse` sin tipar, y ahora declaran `ApiResponse[SupplierResponse]`, `ApiResponse[ProfileResponse]`, `ApiResponse[list[UserResponse]]`, etc. El contenido real ya era correcto (no exponían contraseñas), pero ahora hay un contrato que lo **garantiza**, no solo que "da la casualidad de que funciona".

### 2.3 — Fase 3: Verificación

No me quedé en "creo que funciona". Hice tres cosas:

1. **Corrí toda la suite de tests** (`uv run pytest -q`): **225 tests pasaron** (216 que ya existían + 9 nuevos que escribí para los contratos que acabo de arreglar). Lo corrí dos veces para confirmar que no quedaba basura de una corrida afectando la siguiente.

2. **Revisé el esquema OpenAPI real** (`/openapi.json` de un servidor levantado para la verificación) y confirmé, leyendo el JSON, que `UserRegisteredResponse` no tiene la propiedad `email` y que `LoginData` no tiene la propiedad `user`. No lo asumí por el código — lo leí del esquema generado.

3. **Probé a mano con `curl`** contra un servidor real: registré un usuario, hice login, pedí `/auth/me` y listé `/suppliers`, y confirmé en cada respuesta que la forma era exactamente la esperada. Después borré ese usuario de prueba de la base de datos real para no dejar basura.

**Dos cosas que encontré y arreglé sobre la marcha, mientras verificaba:**
- Al escribir los tests nuevos, se me olvidó parchear la ruta de base de datos de pruebas para `suppliers` (usa un archivo distinto a `users`/`profiles`), así que un test terminó escribiendo en el `db.json` real por accidente. Lo detecté porque el test fallaba *solo* cuando corría la suite completa (no solo, otra señal clásica de "estado compartido"), lo arreglé en el fixture de test, y limpié el dato que había quedado en el `db.json` real.

### Resultado final

| Clasificación | Antes | Después |
|---|---|---|
| ✅ Correctamente serializado | 10 | 29 |
| ⚠️ Parcialmente serializado | 13 | 0 |
| ❌ Sin contrato explícito | 6 | 0 |
| ➖ Excepción justificada | 2 | 2 |

El detalle completo, ruta por ruta, está en `docs/serialization-audit.md` — este archivo es el resumen "para entender", ese otro es el registro técnico completo.

---

## Lo que quedó pendiente (a propósito, no por descuido)

- `GET /users`, `GET /users/{id}`, `PUT /users/{id}` no tienen ningún consumidor real en el frontend hoy. Les di un contrato correcto por si se usan en el futuro, pero no inventé requisitos de un consumidor que no existe.
- El router de `inventory` (productos, pedidos) ya estaba bien serializado desde antes y no lo toqué — pero no tiene ninguna prueba HTTP (solo pruebas que llaman directo a las funciones de servicio). Es una brecha que ya existía, fuera del alcance de esta tarea puntual.

## Glosario rápido

- **Server Component vs Client Component (Next.js):** el primero se ejecuta solo en el servidor (más rápido, no puede usar `useState`/clics); el segundo se ejecuta también en el navegador (puede ser interactivo, pero pesa más y puede causar bugs de hidratación).
- **Hidratación (hydration):** el proceso de React "revivir" el HTML generado por el servidor en el navegador. Si no coincide exactamente, React lo descarta y vuelve a renderizar todo.
- **`response_model` (FastAPI):** el molde Pydantic que define qué forma debe tener la respuesta de una ruta. Filtra automáticamente cualquier campo no declarado.
- **Pydantic `Generic[T]`:** una forma de escribir un molde reutilizable con un "hueco" que se rellena distinto en cada uso (`ApiResponse[UserResponse]`, `ApiResponse[SupplierResponse]`, etc.) sin copiar y pegar la clase entera cada vez.
- **`reuseExistingServer` (Playwright):** opción que decide si Playwright reutiliza un servidor que ya esté corriendo en el puerto que necesita, o si falla si ese puerto está ocupado por otra cosa.
