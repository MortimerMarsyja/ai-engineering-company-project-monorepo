# Event Envelope y esquemas de eventos — Fase 2 (Plan de Telemetría)

**Insumos usados:** `docs/mandatory_metrics.md` (contenido real de `company-BRIEFING.md`, confirmado por el usuario), `docs/telemetry-catalog.md` (Fase 1, este mismo repositorio), y el código fuente citado en ambos. Esta fase **define el contrato**; no implementa captura, envío ni almacenamiento — eso queda para una fase posterior.

**Entregable ejecutable:** [`docs/event-schemas.json`](./event-schemas.json) — JSON Schema draft-07, validado con `ajv-cli` (ver §7).

---

## 1. Event Envelope común

Todos los eventos usan exactamente estas 8 claves (ni más, ni menos — `additionalProperties: false` en el JSON Schema). Las 8 claves son siempre **obligatorias como clave** (siempre presentes); algunas admiten valor `null` cuando el caso real no tiene un identificador que poner ahí — nunca se inventa un id para rellenarlas.

| Campo | Tipo | ¿Admite `null`? | Significado | Origen |
|---|---|---|---|---|
| `eventId` | `string` (UUID v4) | No | Identificador único del evento, para deduplicar en el pipeline de ingesta | Generado en el momento de la captura (cliente o backend) — la implementación concreta queda para la fase de captura |
| `timestamp` | `string` (ISO 8601 / RFC3339, con zona, p. ej. `2026-10-28T15:04:05.123Z`) | No | Momento en que ocurrió el hecho que genera el evento | `new Date().toISOString()` en frontend, o `datetime.now(timezone.utc).isoformat()` en backend (mismo patrón ya usado en `services/api/app/routers/suppliers.py:80` para `created_at`) |
| `sessionId` | `string` (UUID) | **Sí, justificado abajo** | Identificador de la sesión de navegación (concepto nuevo, solo de analítica) | **No existe ningún concepto de sesión en el código actual** — no hay `middleware.ts`, no hay cookie de sesión; solo hay un JWT en `localStorage` (`uis/backoffice/lib/auth.ts:1`, confirmado en Fase 1). `sessionId` se definiría en la fase de captura como un UUID generado en el navegador (p. ej. guardado en `sessionStorage`, uno por pestaña/visita), independiente del JWT. **Null solo está reservado para un futuro evento originado por un proceso del servidor sin navegador de por medio** (p. ej. un script batch) — ningún evento de este catálogo lo necesita hoy, porque los 20 eventos definidos se originan siempre en una sesión de navegador |
| `userId` | `string` | **Sí, justificado abajo** | Id interno del usuario autenticado (`current_user["id"]`, `services/api/app/services/users.py`), convertido a `string` | Backend: `str(current_user["id"])`. **`null` cuando no hay una identidad resuelta todavía**: `login_failed` (las credenciales no resolvieron ningún usuario — no se busca el id por email para no crear un canal de enumeración de cuentas dentro del propio dato de telemetría) y cualquier vista pre-autenticación (`/login`, `/register`, `/forgot-password`). No se inventa un id de "usuario anónimo" |
| `event_type` | `string` (enum cerrado, 20 valores — ver §2) | No | Identifica qué pasó | Fijo por evento, definido en este contrato |
| `schemaVersion` | `string` (`^\d+\.\d+\.\d+$`, semver) | No | Versión del esquema específico de `properties` para ese `event_type` (no la versión del archivo completo) | `"1.0.0"` para los 20 eventos en esta fase; se incrementa cuando cambien las propiedades de ese evento en particular |
| `requestId` | `string` | **Sí, justificado abajo** | Correlaciona el evento con la petición HTTP que lo originó | **Hoy no existe ningún mecanismo de request-id en el repo** (verificado: cero resultados para `request_id`/`X-Request-Id`/`correlation` en `services/api` y `uis/backoffice`). Por tanto será `null` en la práctica para **todos** los eventos hasta que una fase futura añada un middleware que genere un id por petición (p. ej. en FastAPI) y lo propague al frontend. Además, incluso implementado, seguirá siendo legítimamente `null` para eventos sin una petición HTTP asociada (`page_viewed`, `form_abandoned`, `frontend_error_detected` cuando el error no ocurre dentro de un `fetch`) |
| `properties` | `object` | No (pero puede ser `{}`) | Datos específicos del evento | Esquema cerrado por `event_type`, ver §3. Nunca contiene contraseñas, tokens, ni el cuerpo completo de una petición/respuesta |

**Regla general de privacidad del envelope:** `eventId`, `sessionId`, `requestId`, `schemaVersion` y `event_type` no son datos personales por sí mismos. `userId` **sí es un dato personal** (identifica a una persona concreta, aunque sea mediante un id interno en vez de su email) y se trata como tal en todo el pipeline de almacenamiento posterior — eso es trabajo de una fase futura, pero se señala aquí porque afecta a cómo se diseñó el campo.

---

## 2. Eventos obligatorios y su relación con las métricas de `company-BRIEFING.md`

Los 6 nombres son exactamente los exigidos por el briefing, sin renombrar:

| `event_type` | Métrica/hipótesis que cubre | Propiedades que permiten calcularla |
|---|---|---|
| `inbound_order_created` | "Cuánto y qué se compra, por local y proveedor" (Lucía) | `location_id`, `country`, `supplier_id`, `product_id`, `product_category`, `quantity`, `unit` — agregando por `location_id`+`supplier_id`+`product_id` se obtiene volumen de compra por local/proveedor/producto |
| `outbound_order_created` | "Qué ingredientes se consumen más y a qué ritmo, por local" (Felipe) | `location_id`, `product_id`, `product_category`, `quantity`, `unit`, `timestamp` — agregando por `location_id`+`product_id` a lo largo del tiempo se obtiene ritmo de consumo |
| `stock_waste_registered` | "Cuánto se pierde, por qué razón, en qué local" (Felipe) | `location_id`, `product_id`, `quantity`, `unit`, `reason` (`expired`/`kitchen_error`/`theft_suspected`) — agregando por `location_id`+`reason` se obtiene el indicador de merma por sede y causa |
| `stock_threshold_triggered` | "Con qué frecuencia un local se queda corto de un ingrediente clave" | `location_id`, `product_id`, `quantity` (= `current_stock` en el momento del disparo), `minimum_stock` — contar eventos por `location_id`+`product_id` en una ventana de tiempo da la frecuencia |
| `direct_stock_edit_rejected` | "Si el personal intenta saltarse el control de trazabilidad" (Jake) | `endpoint`, `rejected_field`, `userId` (del envelope) — agregando por `userId`/`location_id` del usuario se identifica dónde ocurre más |
| `ingredient_price_variance_detected` | "Cuándo un ingrediente clave sube de precio de forma anómala" | `product_id`, `supplier_id`, `unit_cost_actual`, `unit_cost_historical`, `variance_pct`, `variance_threshold_pct` — filtrando por `variance_pct >= variance_threshold_pct` se identifican las alertas a disparar |

⚠️ **Tres de estos seis eventos no tienen hoy un origen de datos real en el código** (ya señalado en Fase 1): `stock_threshold_triggered` (no existe `minimum_stock` en ningún modelo), `ingredient_price_variance_detected` (no existe costo/precio en `InboundStock`) y, parcialmente, `direct_stock_edit_rejected` (no hay un disparador de negocio dedicado, solo el 422 genérico de Pydantic). Esta fase define el **contrato que deberán cumplir** una vez el modelo de datos se extienda; no inventa que esos campos ya existen en la base de datos actual. Ver §6 y §8.

---

## 3. Eventos adicionales (Fase 1 → Fase 2)

14 eventos, repartidos en 5 categorías (se exigían ≥8 en ≥3 categorías). Algunos se renombraron respecto al catálogo de Fase 1 para seguir la convención `entidad_verbo` en `snake_case` pedida en esta fase (p. ej. `session_expired_redirect` → `session_expired`, `api_response_time` → `api_latency_recorded`); se indica la correspondencia.

| Categoría | `event_type` | Nombre en Fase 1 (si cambió) | Clasificación |
|---|---|---|---|
| Inventario | `inbound_order_rejected` | (nuevo, consolida un caso de Fase 1) | Oportunidad identificada |
| Inventario | `outbound_order_rejected` | consolida `inventory_order_rejected_insufficient_stock` + `inventory_order_rejected_location_mismatch` | Oportunidad identificada |
| Inventario | `inventory_products_viewed` | `inventory_products_list_viewed` | Oportunidad identificada |
| Autenticación | `login_failed` | = | Oportunidad identificada |
| Autenticación | `login_succeeded` | = | Oportunidad identificada |
| Autenticación | `session_expired` | `session_expired_redirect` | Oportunidad identificada |
| Autenticación | `password_reset_requested` | = | Oportunidad identificada |
| Autenticación | `password_reset_completed` | = | Oportunidad identificada |
| Rendimiento | `api_latency_recorded` | `api_response_time` | Oportunidad identificada |
| Rendimiento | `page_load_recorded` | `page_load_time` | Oportunidad identificada |
| Errores | `frontend_error_detected` | `frontend_uncaught_error` | Oportunidad identificada |
| Errores | `form_submission_failed` | `form_submission_error_shown` | Oportunidad identificada |
| Navegación | `page_viewed` | `page_view` | Oportunidad identificada |
| Navegación | `form_abandoned` | = | Oportunidad identificada |

Nota sobre `inbound_order_rejected`/`outbound_order_rejected`: en Fase 1 se habían propuesto como eventos separados por causa de rechazo (desajuste de sede vs. stock insuficiente). En esta fase se consolidan en un evento por tipo de orden con una propiedad `rejection_reason` cerrada, porque comparten el mismo punto de captura en código (`services/api/app/routers/inventory.py:126-130` y `148-163`) y la misma utilidad de negocio (entender por qué fallan las órdenes) — evita proliferar `event_type` sin necesidad real.

---

## 4. Propiedades permitidas por evento (`properties`)

Lista cerrada — ninguna propiedad fuera de esta lista es válida (`additionalProperties: false`, también para objetos anidados; no hay ninguno en este contrato). El detalle ejecutable y exacto (tipos, enums, patrones, mínimos) vive en `event-schemas.json`; esta tabla es la referencia legible para cada evento.

### 4.1 Campos comunes a los 6 eventos obligatorios de inventario

Exigidos literalmente por el briefing ("además del envelope estándar"): `location_id`, `country`, `product_id`, `product_category`, `quantity`, `unit`, `currency`. Se mantienen en los 6 eventos; cuando un campo no aplica semánticamente al evento se **conserva la clave** y se permite `null`, justificado caso por caso:

| Propiedad | Tipo | Obligatoria (clave) | Admite `null` | Descripción / restricciones |
|---|---|---|---|---|
| `location_id` | string | Sí | No | `"{country}-{city}"` en mayúsculas sin acentos, p. ej. `"CO-MEDELLIN"`, `"US-MIAMI"`. **Es un identificador sintético definido en esta fase** — el modelo de datos actual solo tiene `country`+`city` (`services/api/app/models/menu_item.py`), no una tabla de sedes con código propio como `COL-01` (ese formato es de incidencias, no de inventario). Ver §6 |
| `country` | string enum `["CO","US"]` | Sí | No | Transformado desde el valor nativo del modelo (`"Colombia"`→`CO`, `"United States"`→`US`, `services/api/app/models/schemas.py:200`) — el dato nativo no usa ya el código ISO corto |
| `product_id` | string | Sí | No | `str(MenuItem.id)` |
| `product_category` | string enum `["Meat","Produce","Beverages","Dairy","Seafood","Spices","Other"]` | Sí | No | Valores exactos del `ProductCategory` Literal (`schemas.py:213-215`) |
| `quantity` | number (`> 0`, salvo excepciones abajo) | Sí | Solo en `direct_stock_edit_rejected` | Semántica por evento: cantidad de la orden (`inbound_order_created`/`outbound_order_created`), cantidad perdida (`stock_waste_registered`), stock actual en el momento del disparo (`stock_threshold_triggered`, aquí se permite `>= 0`), cantidad de la orden cuyo costo varió (`ingredient_price_variance_detected`), o valor que el usuario intentó fijar directamente (`direct_stock_edit_rejected` — `null` si el payload rechazado no contenía un valor numérico extraíble) |
| `unit` | string (1–20 caracteres) | Sí | Solo en `direct_stock_edit_rejected` | Mismo motivo que `quantity`: el payload rechazado puede no incluir unidad |
| `currency` | string enum `["COP","USD"]` | Sí | Solo en `stock_threshold_triggered` y `direct_stock_edit_rejected` | Derivado de `country` (CO→COP, US→USD) — **no existe un campo de moneda nativo en `InboundStock`/`StockExit`** (gap de Fase 1). `null` en los dos eventos que no representan una transacción monetaria — se conserva la clave por el mínimo exigido, con el valor justificado como no aplicable |

### 4.2 Propiedades específicas por evento

**`inbound_order_created`** (además de 4.1): `order_id` (string, id de la fila `InboundStock`), `supplier_id` (string o `null` — `InboundStock.supplier_id` es opcional, `services/api/app/models/inbound.py`).

**`outbound_order_created`** (además de 4.1): `order_id` (string), `reason` (string enum `["kitchen_use","transfer","other"]`, obligatoria, no `null`). Nota: excluye los 3 valores de merma a propósito — ver §6 sobre la separación con `stock_waste_registered`.

**`stock_waste_registered`** (además de 4.1): `order_id` (string), `reason` (string enum `["expired","kitchen_error","theft_suspected"]`, obligatoria, no `null` — valores exactos exigidos por el briefing).

**`stock_threshold_triggered`** (además de 4.1, con `quantity` = stock actual): `minimum_stock` (number `> 0`, obligatoria, no `null`).

**`direct_stock_edit_rejected`** (además de 4.1): `endpoint` (string, p. ej. `"/inventory/products"`), `rejected_field` (string, p. ej. `"current_stock"`), `http_status` (integer enum `[422]`). Todas obligatorias y no `null` — si no se puede determinar el campo rechazado, no se emite el evento (no se inventa un valor).

**`ingredient_price_variance_detected`** (además de 4.1): `order_id` (string), `supplier_id` (string o `null`), `unit_cost_actual` (number `> 0`), `unit_cost_historical` (number `> 0`), `variance_pct` (number), `variance_threshold_pct` (number `> 0`, el umbral usado para disparar, p. ej. `10`).

**`inbound_order_rejected`**: `product_id` (string), `location_id` (string, intento), `attempted_country` (enum `["CO","US"]`), `attempted_city` (string), `rejection_reason` (enum `["location_mismatch","product_not_found"]`), `http_status` (integer enum `[404,422]`).

**`outbound_order_rejected`**: igual que `inbound_order_rejected` + `requested_quantity` (number `> 0`), `available_quantity` (number `>= 0` o `null` si el rechazo fue por `location_mismatch`/`product_not_found`, donde nunca se llega a calcular disponibilidad), `unit` (string), `rejection_reason` (enum `["location_mismatch","product_not_found","insufficient_stock"]`), `http_status` (integer enum `[400,404,422]`).

**`inventory_products_viewed`**: `product_count` (integer `>= 0`), `response_time_ms` (number `>= 0`), `cache_hit` (boolean — siempre `false` hoy, `GET /inventory/products` no está cacheado, ver `docs/cache-evaluation.md`).

**`login_failed`**: `failure_reason` (enum `["invalid_credentials","inactive_account"]`), `email_hash` (string, SHA-256 hex del email en minúsculas — ver §5 sobre privacidad, **no es un dato anónimo**).

**`login_succeeded`**: `role` (enum `["admin","manager","user"]`, valores exactos de `UserRole`).

**`session_expired`**: `route_at_expiry` (string, pathname), `token_age_seconds` (number `>= 0` o `null` si no puede calcularse porque el token ya fue descartado antes de capturar el evento).

**`password_reset_requested`**: `email_hash` (string, SHA-256). **Deliberadamente no incluye** si la cuenta existe o está activa — el propio backend ya evita esa fuga (`services/api/app/routers/auth.py:60-81`, respuesta idéntica siempre); incluirlo en el evento de telemetría recrearía el mismo canal de enumeración que el backend evita.

**`password_reset_completed`**: sin propiedades específicas (`properties: {}` — la identidad ya está en `userId` del envelope).

**`api_latency_recorded`**: `endpoint` (string, plantilla de ruta sin ids, p. ej. `"/inventory/products/{id}"`, para evitar alta cardinalidad), `method` (enum `["GET","POST","PATCH","PUT","DELETE"]`), `status_code` (integer), `duration_ms` (number `>= 0`), `cache_hit` (boolean o `null` cuando el endpoint no tiene caché aplicable).

**`page_load_recorded`**: `route` (string), `lcp_ms` (number `>= 0` o `null` si el navegador no soporta la Web Vitals API), `ttfb_ms` (number `>= 0` o `null`, mismo motivo).

**`frontend_error_detected`**: `route` (string), `error_name` (string, p. ej. `"TypeError"`), `error_message` (string, máx. 500 caracteres, saneada — ver §5).

**`form_submission_failed`**: `form_name` (enum `["inbound_order","outbound_order","incident","supplier","candidate","login","register","change_password","reset_password"]`), `http_status` (integer o `null` si el fallo fue una validación de cliente sin llamada HTTP), `error_message` (string, máx. 500 caracteres, saneada).

**`page_viewed`**: `route` (string), `referrer_route` (string o `null` si es la primera página de la visita).

**`form_abandoned`**: `form_name` (mismo enum que `form_submission_failed`), `fields_completed_pct` (number `0`–`100`).

---

## 5. Privacidad por evento

Reglas globales (se aplican a los 20 eventos, no se repiten fila por fila): nunca se incluyen contraseñas, tokens/JWT, cabeceras de autorización, ni el cuerpo completo de una petición o respuesta. Ningún evento de inventario incluye nombre de cliente ni de empleado (exigencia explícita del briefing) — solo `userId` (id interno) identifica al actor, nunca su nombre o email en claro.

| `event_type` | Datos personales/sensibles presentes | Tratamiento aplicado |
|---|---|---|
`inbound_order_created` / `outbound_order_created` / `stock_waste_registered` / `stock_threshold_triggered` (los 4 obligatorios de inventario sin fila propia abajo) | `userId` del envelope (dato personal, id interno) | Ninguno adicional sobre `properties` — no describen personas, solo productos/locales/órdenes, tal como exige el briefing |
| `direct_stock_edit_rejected` | `userId` | Ninguno adicional — no se registra el payload completo rechazado, solo el nombre del campo (`rejected_field`), nunca su valor crudo |
| `login_failed` | Email del intento de login | **Seudonimización**: `email_hash` = SHA-256 del email en minúsculas. Se documenta explícitamente como **seudonimizado, no anónimo** (es reversible por diccionario/fuerza bruta contra una lista de emails conocidos, como exige esta fase). No se incluye el email en claro ni la contraseña |
| `login_succeeded` | `userId`, `role` | Ninguno adicional |
| `session_expired` | `userId` (si se puede leer del token antes de limpiarlo) | Ninguno adicional — no se incluye el JWT, solo la ruta y, si es calculable, la edad del token en segundos |
| `password_reset_requested` | Email | **Seudonimización** (`email_hash`, igual que `login_failed`). **Exclusión deliberada** de cualquier indicador de si la cuenta existe (ver §4.2) |
| `password_reset_completed` | `userId` | Ninguno adicional — sin propiedades |
| `frontend_error_detected` / `form_submission_failed` | Mensaje de error, potencialmente con fragmentos de datos si el error ocurrió al procesar un formulario | **Saneamiento**: truncado a 500 caracteres y, antes de truncar, se elimina cualquier subcadena con forma de JWT (tres segmentos base64url separados por `.`) o de cabecera `Bearer ...` — regla de diseño de esta fase, no implementada aún |
| `page_viewed` / `page_load_recorded` / `api_latency_recorded` / `form_abandoned` / `inventory_products_viewed` | `userId` del envelope | Ninguno adicional — solo rutas, tiempos y contadores |
| `inbound_order_rejected` / `outbound_order_rejected` | `userId` | Ninguno adicional |
| `ingredient_price_variance_detected` | — | Ninguno — solo datos de producto/proveedor/costo, no de personas |

---

## 6. Decisiones de diseño y supuestos (explícitos, no implícitos)

1. **`location_id` es un identificador sintético** (`"{country}-{city}"`), no una columna existente. El modelo de inventario no tiene tabla de sedes con código propio; se definió esta regla de derivación para poder cumplir el campo mínimo exigido por el briefing sin esperar a un cambio de modelo.
2. **`country` se transforma de `"Colombia"/"United States"` a `"CO"/"US"`** en el momento de capturar el evento — es una transformación de presentación, no un cambio de modelo.
3. **`currency` se deriva de `country`** (CO→COP, US→USD) porque no existe un campo de moneda nativo en las órdenes. Ver gap en §8.
4. **Separación entre `outbound_order_created` y `stock_waste_registered`**: el briefing los describe como dos `event_type` distintos que comparten el campo `reason`, pero con conjuntos de valores distintos (el genérico para consumo normal, el de merma de 3 valores para desperdicio). Esta fase decide que son **mutuamente excluyentes sobre la misma fila de salida de stock**: una salida con `reason` de consumo normal (`kitchen_use`/`transfer`/`other`) emite `outbound_order_created`; una salida con `reason` de merma (`expired`/`kitchen_error`/`theft_suspected`) emite `stock_waste_registered` **en vez de** `outbound_order_created`, para no contar la misma salida dos veces en dos métricas distintas (ritmo de consumo vs. merma). El enum `ExitReason` actual del código (`kitchen_use`/`waste`/`transfer`/`other`, `schemas.py:217`) no tiene esta granularidad — es un gap de modelo ya señalado en Fase 1, no resuelto aquí.
5. **`sessionId` es un concepto nuevo**, sin equivalente en el código actual (no hay sesión de servidor). Se define como un id de analítica generado en el navegador, independiente del JWT.
6. **`requestId` será `null` en la práctica para todo evento hasta que se implemente un middleware de id de petición** — no existe hoy en ningún punto del repo.

---

## 7. Verificación realizada

Herramienta usada: `ajv-cli` (vía `npx`, sin dependencia nueva añadida al proyecto — ver detalle de versión y comandos ejecutados en el resumen final de esta tarea). Ver `docs/event-schemas.json` para el esquema y la sección de resumen de la conversación para el detalle exacto de cada comando y su resultado (JSON válido, `$schema` válido como draft-07, 20 ejemplos válidos aceptados, y los 5 casos de rechazo exigidos — campo obligatorio ausente, tipo incorrecto, `event_type` desconocido, propiedad adicional, y `timestamp` con formato inválido).

---

## 8. Dudas y limitaciones no resueltas

1. No existe en el repo una definición previa de "envelope estándar" (mencionada por `docs/mandatory_metrics.md` como si ya existiera) — este documento la define desde cero, no la recupera de ningún sitio.
2. Tres de los seis eventos obligatorios (`stock_threshold_triggered`, `ingredient_price_variance_detected`, parcialmente `direct_stock_edit_rejected`) no tienen hoy un origen de datos real en el modelo (`minimum_stock`, costo de `InboundStock`, discriminador dedicado de rechazo) — el contrato que se define aquí es el objetivo a cumplir, no una descripción de algo que ya funciona.
3. `location_id` como `"{country}-{city}"` es una decisión de esta fase, no un id que exista ya en la base de datos — si en el futuro se crea una tabla de sedes con códigos propios (como el formato `COL-01` ya usado en incidencias), este contrato debería migrarse a usar ese id real en vez del sintético.
4. No se pudo verificar en código cómo se calculará `token_age_seconds` en `session_expired`, porque no existe hoy ningún punto donde se capture la edad del token al expirar — se deja como propiedad nullable hasta que la fase de captura decida cómo (o si) se calcula.
5. La regla de saneamiento de `error_message` (eliminar patrones de JWT/Bearer) es una regla de diseño de esta fase; no hay código de saneamiento existente que verificar porque no existe ningún punto de captura de errores de frontend hoy (confirmado en Fase 1: no hay `error.tsx` ni `ErrorBoundary`).
