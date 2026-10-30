# Catálogo de oportunidades de datos — Fase 1 (Plan de Telemetría)

**Fuente del briefing:** `docs/mandatory_metrics.md` (el usuario confirma que es el contenido real de `company-BRIEFING.md`, secciones 3–6; no se localizaron secciones 1–2 en el repo — ver "Dudas y carencias"). Contexto de empresa complementario: `CONTEXT.md`, `memory-bank/ProjectBrief.md`, `incidents-context.md`.

**Alcance de esta fase:** únicamente análisis. No se ha tocado código. Todo lo que aquí se marca como "comprobado en código" fue verificado leyendo los archivos citados; todo lo que se marca como "no verificable" o "no existe" se señala explícitamente en vez de inventar comportamiento.

---

## 1. Resumen de los requisitos obligatorios

`docs/mandatory_metrics.md` exige, sin excepción, estos 6 `event_type` (nombres textuales, no se renombran):

| `event_type` | Se dispara cuando... | Hipótesis de negocio | Decisión que habilita |
|---|---|---|---|
| `inbound_order_created` | Un local registra la llegada de mercancía de un proveedor | Cuánto y qué se compra, por local y proveedor | Consolidar compras entre locales para negociar mejores precios (Lucía) |
| `outbound_order_created` | Un local registra consumo de ingredientes al preparar un plato | Qué ingredientes se consumen más y a qué ritmo, por local | Ajustar la sugerencia automática de pedidos a proveedores (Felipe) |
| `stock_waste_registered` | Un local registra merma (vencido, error de cocina, pérdida/robo) | Cuánto producto se pierde, por qué razón y en qué local | Priorizar auditorías de merma en los locales con peor indicador (Felipe) |
| `stock_threshold_triggered` | El stock de un producto cae por debajo del mínimo configurado para ese local | Con qué frecuencia un local se queda corto de un ingrediente clave | Ajustar el umbral mínimo o la frecuencia de reabastecimiento |
| `direct_stock_edit_rejected` | Un usuario intenta modificar el stock directamente (fuera de una orden) y el sistema lo rechaza | Si el personal intenta saltarse el control de trazabilidad | Reforzar capacitación o permisos en los locales con más incidencia (Jake) |
| `ingredient_price_variance_detected` | El costo unitario de una orden de entrada varía más de un umbral (p. ej. 10%) vs. el histórico del mismo producto/proveedor | Cuándo un ingrediente clave sube de precio de forma anómala | Alertar a Lucía y Mariana para renegociar o buscar proveedor alterno |

**Campos mínimos obligatorios en `properties`** (eventos de inventario, además del envelope estándar): `location_id`, `country` (CO/US), `product_id`, `product_category`, `quantity`, `unit`, `currency` (COP/USD); y en `outbound_order_created`/`stock_waste_registered` además `reason` (solo merma: `expired`, `kitchen_error`, `theft_suspected`).

**Restricciones de negocio obligatorias:**
- Los montos se registran en la moneda del local (COP u USD); no convertir en la capa de telemetría.
- El stock nunca se modifica directamente: toda modificación pasa por `InboundOrder`/`OutboundOrder`, trazable a un usuario.
- El idioma de la interfaz (ES/EN) es independiente de `country` — no mezclar.
- No incluir nombres de empleados ni datos de clientes en `properties`.
- Diseñar pensando en agregación futura por local, país y semana (dashboard de Felipe, reporte ejecutivo de Mariana).

**Datos semilla sugeridos** (para cuando se implemente): 8–10 productos en ≥3 categorías (proteína, vegetal/salsa, empaque), 3 locales (≥1 Colombia, ≥1 Florida), 15–20 inbound entre esos locales y ≥3 proveedores, 15–20 outbound con ≥3 registros de merma con razones distintas, ≥2 casos de `stock_threshold_triggered` y 1 de `ingredient_price_variance_detected`.

⚠️ **Hallazgo crítico que afecta a 4 de los 6 obligatorios** (detalle completo en la tabla y en "Dudas y carencias"): el modelo de datos actual (`services/api/app/models/{menu_item,inbound,outbound}.py`) **no tiene** columna de costo/precio en las órdenes de entrada, **no tiene** concepto de umbral mínimo de stock, su enum de razones de salida (`kitchen_use`/`waste`/`transfer`/`other`, `schemas.py:217`) no coincidía con los valores exigidos (`expired`/`kitchen_error`/`theft_suspected`) — **✅ resuelto en Fase 3**, ver nota en la fila de `stock_waste_registered` abajo —, y no existe ningún endpoint que acepte un valor de stock directamente (por lo que "rechazar una edición directa" no tiene hoy un camino de código dedicado que lo distinga de cualquier otro error de validación). Esto no descarta estos eventos — son obligatorios — pero su instrumentación real requiere primero cambios de modelo que son responsabilidad de una fase de implementación posterior, no de este catálogo.

---

## 2. Mapa del flujo de gestión de inventario

Recorrido real, verificado en código, desde que un usuario autenticado entra al sistema hasta que completa (o falla al completar) una orden de entrada/salida. Las sedes se identifican hoy solo por `country`+`city` (p. ej. `"Colombia"`+`"Medellín"`) — no existe un código de sede tipo `COL-01` para inventario (ese formato solo existe en el flujo de incidencias, `incidents-context.md`, y no se reutiliza aquí).

```
1. Login            POST /api/proxy/auth/login → backend POST /auth/login
                     (uis/backoffice/lib/auth.ts:95-103; services/api/app/routers/auth.py:29-50)
                     Token JWT guardado en localStorage ("brasaland_access_token",
                     uis/backoffice/lib/auth.ts:1; app/login/page.tsx:67). Expira a los
                     30 min (ACCESS_TOKEN_EXPIRE_MINUTES, services/api/app/core/config.py:28).

2. Navegación       Usuario entra a /inventory (Sidebar/AppShell usan usePathname()).
   a /inventory     GET /inventory/products — N+1 real (2 SUM() por producto,
                     services/api/app/routers/inventory.py:38-59,95-102) — ya auditado
                     en docs/cache-evaluation.md como el endpoint más costoso del backoffice.

3. Alta de entrada  Usuario va a /inventory/deliveries/new → InboundOrderForm
   (camino feliz)   → POST /inventory/orders/inbound (lib/inventory-api.ts:90-105)
                     → backend valida product_id existe (404 si no) y que
                     country+city de la orden coincidan con los del producto
                     (422 "Order location must match...", inventory.py:126-130)
                     → inserta InboundStock → toast.success + redirect a /inventory
                     (InboundOrderForm.tsx:62-83).

4. Alta de entrada  Si el backend devuelve 422 (desajuste de localización) o 404
   (camino de       (producto inexistente), buildApiError() (lib/inventory-api.ts:57-75)
   error)           propaga el detail crudo del backend; el form solo muestra
                     toast.error(...) — no hay reintento ni log, solo UI.

5. Salida de        Usuario va a /inventory/exits/new → OutboundOrderForm
   stock             → POST /inventory/orders/outbound → backend recalcula
   (camino feliz)    _current_stock() y, si available >= quantity, inserta
                     StockExit (inventory.py:140-169) → toast.success + redirect.

6. Salida de        Si quantity > available, el backend devuelve 400
   stock             "Cannot withdraw X... only Y available" SIN insertar nada
   (rechazada)       (inventory.py:154-163) → OutboundOrderForm muestra toast.error
                     con ese mensaje. Este es un rechazo real y verificado, pero
                     NO es el mismo evento que direct_stock_edit_rejected: aquí sí
                     se intentó una orden trazable, solo que excede el disponible.

7. Intento de       No existe ningún endpoint PUT/PATCH sobre /inventory/products
   edición directa  ni ningún campo "stock"/"current_stock" aceptado en el body de
   de stock         POST /products, /orders/inbound o /orders/outbound: los tres
   (no verificable  Create schemas usan extra="forbid" (schemas.py:431,474,507), así
   como evento      que un cliente que enviara current_stock en el JSON recibiría un
   dedicado)        422 de Pydantic antes de llegar al handler — pero el sistema no
                     distingue hoy ese 422 de cualquier otro error de validación.
                     No existe, por tanto, un "rechazo de edición directa" como
                     concepto de negocio separado en el código actual.

8. Activación de    No existe ningún campo de umbral mínimo en MenuItem ni en
   umbral mínimo    ningún otro modelo (grep confirmado: cero resultados para
   (no existe hoy)  "threshold"/"minimum_stock"/"reorder" en services/api y
                     uis/backoffice). Después del paso 5/6, nada en el código
                     compara el nuevo current_stock contra un mínimo. No puede
                     "comprobarse en código" porque no existe código que lo haga.

9. Sesión caducada  Si el JWT expira mientras el usuario llena un formulario largo
   a mitad de flujo (>30 min), la siguiente llamada autenticada devuelve 401 →
                     authenticatedFetch() lo intercepta, llama logout() y redirige a
                     /login (lib/authenticated-fetch.ts:25-44) — el formulario en
                     curso se pierde sin aviso previo (no hay guardado automático).

10. Vuelta al       Usuario regresa a /inventory; GET /inventory/products vuelve a
    listado         recalcular current_stock (N+1 de nuevo) y refleja el nuevo valor.
```

Puntos de instrumentación identificados (≥5 exigidos): **2, 3, 4, 5, 6, 7\* (parcial), 9**. El punto 8 no puede instrumentarse sin un cambio de modelo previo (ver sección "Dudas y carencias"); se documenta igualmente porque el briefing lo exige.

---

## 3. Catálogo de eventos

Leyenda de clasificación: **OB** = Obligatorio (nombre exacto exigido por el briefing) · **OI** = Oportunidad identificada (propuesta propia, justificada con la plantilla pedida).

### 3.1 Inventario

| Categoría | Evento | Clasif. | Punto de captura (archivo:línea) | Métricas / propiedades | Entidades / IDs | Hipótesis o pregunta | Decisión que permite tomar |
|---|---|---|---|---|---|---|---|
| Inventario | `inbound_order_created` | **OB** | `services/api/app/routers/inventory.py:118-136` (`create_inbound_order`), tras `db.commit()` en línea 134 | `quantity`, `unit`, `product_category` (desde `MenuItem.category`), `currency` (derivado de `country`: Colombia→COP, US→USD — **no hay campo de moneda nativo**), `location_id` (**gap**, ver abajo) | `product_id`=`ingredient_id`, `supplier_id` (nullable), `user_id`=`user_uuid` | Necesitamos saber cuánto y qué se compra, por local y proveedor | Consolidar compras entre locales para negociar mejores precios (Lucía) |
| Inventario | `outbound_order_created` | **OB** | `inventory.py:140-169` (`create_outbound_order`), tras `db.commit()` en línea 167, **solo** en el camino donde `quantity <= available`. Implementado en `OutboundOrderForm.tsx` | `quantity`, `unit`, `product_category`, `reason` (`ExitReason`: `kitchen_use`/`transfer`/`other`) | `product_id`, `user_id` | Necesitamos saber qué ingredientes se consumen más y a qué ritmo, por local | Ajustar la sugerencia automática de pedidos a proveedores (Felipe) |
| Inventario | `stock_waste_registered` | **OB** | Mismo punto que `outbound_order_created`, disparado en vez de este cuando `reason` indica merma. **✅ Gap de modelo resuelto en Fase 3**: `ExitReason` ahora incluye `expired`/`kitchen_error`/`theft_suspected` (reemplazando el "waste" genérico, `schemas.py:217`), y el selector de `OutboundOrderForm.tsx` los ofrece directamente | `quantity`, `unit`, `product_category`, `reason` (los 3 valores exigidos) | `product_id`, `user_id` | Necesitamos saber cuánto se pierde, por qué razón y en qué local | Priorizar auditorías de merma en los locales con peor indicador (Felipe) |
| Inventario | `stock_threshold_triggered` | **OB** | **No existe punto de captura hoy.** Debería ir justo después de insertar el `StockExit` en `create_outbound_order` (inventory.py:167-169), comparando el nuevo `current_stock` contra un umbral — pero ese umbral no existe en ningún modelo. No verificable en código actual; se documenta sin inventar el mecanismo | `product_id`, `location_id`, `current_stock`, `minimum_stock` (campo que no existe aún) | `product_id` | Necesitamos saber con qué frecuencia un local se queda corto de un ingrediente clave | Ajustar el umbral mínimo o la frecuencia de reabastecimiento |
| Inventario | `direct_stock_edit_rejected` | **OB** | **No existe un punto dedicado.** El único mecanismo real y verificado que rechaza un intento de fijar stock es el `extra="forbid"` de Pydantic en `MenuItemCreate`/`InboundStockCreate`/`StockExitCreate` (`schemas.py:431,474,507`) — un 422 genérico de FastAPI, no distinguido de otros errores de validación | `endpoint`, `rejected_field` | `user_id` (si autenticado) | Necesitamos saber si el personal intenta saltarse el control de trazabilidad | Reforzar capacitación o permisos donde esto ocurre más (Jake) |
| Inventario | `ingredient_price_variance_detected` | **OB** | **No existe punto de captura hoy** — `InboundStock` no tiene ningún campo de costo/precio (confirmado: `services/api/app/models/inbound.py` solo tiene `quantity`/`unit`/`supplier_id`). No hay histórico de costo por producto/proveedor que comparar. No verificable, se documenta la necesidad sin inventar el campo | `product_id`, `supplier_id`, `unit_cost_actual`, `unit_cost_historical`, `variance_pct` | `product_id`, `supplier_id` | Necesitamos saber cuándo un ingrediente clave sube de precio de forma anómala | Alertar a Lucía y Mariana para renegociar o buscar proveedor alterno |
| Inventario | `inbound_order_rejected` | OI | `inventory.py:126-130`, rama `if (payload.country, payload.city) != (product.country, product.city)` en `create_inbound_order` | `product_id`, `attempted_country`, `attempted_city`, `rejection_reason` | `product_id`, `user_id` | Necesitamos saber si el formulario de alta confunde a los usuarios sobre la sede del producto | Decidir si hay que rediseñar el selector de sede/producto en el formulario |
| Inventario | `outbound_order_rejected` | OI | `inventory.py:148-152` (desajuste de sede) y `154-163` (`if payload.quantity > available`, stock insuficiente) en `create_outbound_order`, antes de cualquier `db.add` | `product_id`, `requested_quantity`, `available_quantity`, `rejection_reason` | `product_id`, `user_id` | Necesitamos saber si un local intenta retirar más stock del disponible, con qué frecuencia, y si el formulario confunde sobre la sede | Decidir si ese local necesita reabastecimiento más frecuente, revisar su registro de entradas, o rediseñar el selector de sede/producto |
| Inventario | `inventory_products_viewed` | OI | `uis/backoffice/app/inventory/page.tsx` / componente `ProductsTable` tras `GET /inventory/products` exitoso | `product_count`, `response_time_ms` | — | Necesitamos saber cuántas veces y con qué latencia se consulta el listado (sabemos por `docs/cache-evaluation.md` que su N+1 lo hace el endpoint más costoso del backoffice) | Priorizar la implementación del caché ya evaluado (`docs/cache-evaluation.md`) con datos reales de tráfico, no solo de coste teórico |

### 3.2 Autenticación

| Categoría | Evento | Clasif. | Punto de captura | Métricas / propiedades | Entidades / IDs | Hipótesis o pregunta | Decisión |
|---|---|---|---|---|---|---|---|
| Auth | `login_failed` | OI | `services/api/app/routers/auth.py:37-43`, ramas `doc is None` (credenciales incorrectas) y `not doc.get("is_active")` (cuenta inactiva) — **comprobado: no hay rate-limiting ni conteo de intentos fallidos hoy** (`app/services/users.py:172-179`, grep confirmado sin resultados para "lockout"/"rate_limit") | `failure_reason` (`invalid_credentials`/`inactive_account`), `email_hash` (nunca el email en claro) | — (usuario aún no identificado) | Necesitamos saber si hay patrones de fuerza bruta o cuentas inactivas que generan fricción | Decidir si implementar lockout/rate-limiting (hoy no existe) |
| Auth | `login_succeeded` | OI | `auth.py:45-50`, tras `create_access_token` | `role` | `user_id` | Necesitamos saber cuántos inicios de sesión exitosos hay por rol y horario | Dimensionar capacidad y detectar accesos fuera de horario laboral |
| Auth | `session_expired` | OI | `uis/backoffice/lib/authenticated-fetch.ts:41-44`, rama `response.status === 401` dentro de una llamada ya autenticada (token expirado en uso, no login) | `route_at_expiry` | `user_id` (si se puede leer del token ya vencido antes de limpiarlo) | Necesitamos saber con qué frecuencia una sesión caduca a mitad de una tarea (hoy 30 min fijos, `ACCESS_TOKEN_EXPIRE_MINUTES`) y si eso hace perder trabajo en curso (no hay autoguardado) | Decidir si ampliar la duración del token, añadir refresh token, o autoguardar formularios largos |
| Auth | `password_reset_requested` / `password_reset_completed` | OI | `auth.py:60-81` (`forgot_password`) y `84-90` (`reset_password`) | `outcome` | — / `user_id` | Necesitamos saber cuántos usuarios necesitan autoservicio de contraseña y si lo completan | Decidir si el flujo de reseteo necesita mejoras de UX o si hay abuso (enumeración de cuentas) |

### 3.3 Rendimiento

| Categoría | Evento | Clasif. | Punto de captura | Métricas / propiedades | Entidades / IDs | Hipótesis o pregunta | Decisión |
|---|---|---|---|---|---|---|---|
| Rendimiento | `api_latency_recorded` | OI | Punto único recomendado: `uis/backoffice/lib/authenticated-fetch.ts` (único wrapper por el que pasan todas las llamadas autenticadas, líneas 25-44) — medir con `performance.now()` alrededor del `fetch`. **Hoy no existe ninguna medición de este tipo** (grep confirmado: cero resultados para `performance.now`/`web-vitals` en `uis/backoffice`) | `endpoint`, `method`, `status_code`, `duration_ms`, `cache_hit` (relevante para `incidents/metrics` y `suppliers`, ya cacheados — ver `docs/cache-evaluation.md`) | — | Necesitamos saber qué endpoints son lentos en producción real, no solo en benchmark local (`services/api/benchmark_endpoints.py`) | Priorizar qué endpoints cachear o rediseñar primero (retroalimenta directamente `docs/cache-evaluation.md`) |
| Rendimiento | `page_load_recorded` | OI | Punto único recomendado: `components/AppShell/AppShell.tsx` (ya usa `usePathname()`, línea 21) combinado con Next.js `useReportWebVitals` — **no existe hoy** | `route`, `lcp_ms`, `ttfb_ms` | — | Necesitamos saber qué páginas del backoffice cargan lento para el personal de sede | Priorizar optimización de las páginas más lentas y más usadas |

### 3.4 Errores de frontend

| Categoría | Evento | Clasif. | Punto de captura | Métricas / propiedades | Entidades / IDs | Hipótesis o pregunta | Decisión |
|---|---|---|---|---|---|---|---|
| Errores | `frontend_error_detected` | OI | **No existe ningún mecanismo de captura hoy**: no hay `error.tsx`/`global-error.tsx` en ningún punto de `app/`, ni `ErrorBoundary` de clase, ni `window.onerror`/`unhandledrejection` en todo el repo (confirmado por búsqueda exhaustiva). Se propone añadir un `global-error.tsx` y un listener de `unhandledrejection` como punto de captura | `error_message`, `route`, `component_stack` (sin datos de usuario/cliente) | `user_id` (si disponible) | Necesitamos saber si el personal sufre crashes silenciosos que hoy solo ven como "pantalla en blanco" sin que nadie se entere | Decidir si priorizar estabilidad/bugfixing sobre features nuevas en las rutas con más errores |
| Errores | `form_submission_failed` | OI | Genérico, en cada `catch` de formularios (`InboundOrderForm.tsx:62-83`, `OutboundOrderForm.tsx:~75-87`, y equivalentes de incidents/suppliers/hiring) justo donde hoy se llama `toast.error(...)` | `form_name`, `error_message`, `http_status` | `user_id` | Necesitamos saber qué formularios generan más errores visibles al usuario (más allá de los dos casos ya cubiertos por eventos obligatorios de inventario) | Priorizar qué formulario rediseñar primero por volumen de fricción |

### 3.5 Navegación

| Categoría | Evento | Clasif. | Punto de captura | Métricas / propiedades | Entidades / IDs | Hipótesis o pregunta | Decisión |
|---|---|---|---|---|---|---|---|
| Navegación | `page_viewed` | OI | `components/AppShell/AppShell.tsx:21` y `components/Sidebar.tsx:54`, ya usan `usePathname()` para resaltar el link activo — mismo hook, añadir el side-effect de tracking | `route`, `referrer_route` | `user_id` | Necesitamos saber qué secciones del backoffice se usan más (inventario, incidencias, proveedores, contratación...) | Priorizar roadmap de producto hacia las secciones realmente usadas |
| Navegación | `form_abandoned` | OI | Mismos componentes de formulario de inventario/incidencias/proveedores: detectar `beforeunload`/cambio de ruta con campos tocados y sin envío exitoso — **no existe hoy** | `form_name`, `fields_completed_pct` | `user_id` | Necesitamos saber en qué paso del alta de entrada/salida (u otros formularios) la gente abandona | Simplificar o rediseñar el paso donde más se abandona |

---

## 4. Referencias de código citadas

- `services/api/app/routers/inventory.py` — líneas 38-59 (`_current_stock`, N+1), 95-102 (`list_products`), 118-169 (create inbound/outbound y sus rechazos), 173-221 (`list_orders`).
- `services/api/app/models/menu_item.py`, `inbound.py`, `outbound.py` — campos reales de cada tabla (sin stock ni costo).
- `services/api/app/models/schemas.py` — líneas 200-220 (`Country`, `City`, `ProductCategory`, `ExitReason`, `CITIES_BY_COUNTRY`), 411-543 (schemas de inventario, `extra="forbid"`).
- `services/api/app/routers/auth.py` — login/me/forgot/reset/change-password.
- `services/api/app/core/security.py` y `core/config.py` — JWT, `ACCESS_TOKEN_EXPIRE_MINUTES=30`.
- `services/api/app/core/deps.py` — `get_current_user`, `require_staff`, códigos 401/403.
- `services/api/app/services/users.py:172-179` — `authenticate()`, sin rate-limiting.
- `uis/backoffice/lib/auth.ts`, `lib/authenticated-fetch.ts`, `lib/inventory-api.ts` — flujo de login, wrapper único de fetch autenticado, llamadas de inventario.
- `uis/backoffice/components/InboundOrderForm/`, `OutboundOrderForm/`, `AppShell/`, `Sidebar.tsx` — puntos de UI donde instrumentar.
- `docs/cache-evaluation.md` y `services/api/benchmark_endpoints.py` — trabajo previo de esta misma sesión, reutilizado como justificación directa de `api_latency_recorded`.
- `incidents-context.md` — origen del formato `location_id` tipo `COL-01`/`FLA-04`, que **no** se usa en el modelo de inventario actual (solo `country`+`city`).

---

## 5. Dudas, carencias y pendientes de verificar

1. **No se localizó `company-BRIEFING.md` como tal.** El usuario indicó que su contenido real es `docs/mandatory_metrics.md`, que empieza en la sección "3." — las secciones 1-2 (presumiblemente contexto de empresa/stakeholders para esta fase específica) no existen en el repo bajo ningún nombre encontrado. Se completó el contexto de empresa con `CONTEXT.md`, `memory-bank/ProjectBrief.md` e `incidents-context.md` (milestones anteriores), pero ninguno define el "envelope estándar" que `mandatory_metrics.md` menciona como si ya existiera. **No hay ningún envelope de telemetría definido en el repo** — se recomienda definirlo explícitamente en la fase de diseño (mínimo: `event_type`, `timestamp`, `user_id`, `role`, `session_id`, `properties{}`).
2. **`location_id` no tiene una columna equivalente en inventario.** El modelo usa `country`+`city` (nombres completos: `"Colombia"`/`"Medellín"`), no un código de sede como `COL-01`. Hay que decidir si `location_id` se deriva como `country+city` concatenado, o si se crea una tabla de sedes propia — no until then, la propiedad `location_id` exigida por el briefing no tiene una fuente de datos 1:1 todavía.
3. **`country` en el modelo es `"Colombia"`/`"United States"`, no `"CO"`/`"US"`.** El briefing pide el código ISO corto; hace falta un mapeo en el momento de capturar el evento (no es un cambio de modelo, solo de transformación).
4. **No hay campo de costo/precio en `InboundStock`.** Esto bloquea tanto `ingredient_price_variance_detected` como, en parte, el valor de negocio de `inbound_order_created` (Lucía quiere negociar precios, lo que requiere costo, no solo cantidad). Es el gap más importante de todo el catálogo.
5. ~~El enum `ExitReason` no tiene los 3 valores de merma exigidos~~ — **✅ Resuelto en Fase 3**: `ExitReason` ahora es `kitchen_use`/`transfer`/`other`/`expired`/`kitchen_error`/`theft_suspected`.
6. **No existe ningún campo de umbral mínimo de stock** en ningún modelo — `stock_threshold_triggered` no tiene ningún dato que comparar hasta que se añada.
7. **`direct_stock_edit_rejected` no tiene un disparador de negocio dedicado** — el único mecanismo real (422 de Pydantic por `extra="forbid"`) no distingue "alguien intentó tocar el stock" de cualquier otro error de payload. Habría que decidir si basta con ese proxy o si se necesita un chequeo explícito.
8. **No hay tests de inventario** (`services/api/tests/` no tiene `test_inventory*.py`) — ningún comportamiento de validación (stock insuficiente, desajuste de sede) está cubierto por tests, solo verificado leyendo el código fuente directamente.
9. **No existe `middleware.ts`** en `uis/backoffice` — no hay guard de rutas a nivel de servidor; cualquier instrumentación de "sesión caducada" debe apoyarse en el interceptor de cliente (`authenticated-fetch.ts`), que es client-side y por tanto no cubre el primer acceso directo a una URL protegida sin token.
10. **`SECRET_KEY` tiene un valor por defecto inseguro** (`"change-me-in-production"`, `core/config.py:27`) — no es un tema de telemetría, pero se señala porque apareció durante la revisión de autenticación.

---

## 6. Verificación de cobertura

- ✅ Los 6 `event_type` obligatorios están incluidos tal cual los nombra el briefing, con sus propiedades mínimas y sus restricciones de negocio reproducidas.
- ✅ Se documentan explícitamente los 4 eventos obligatorios que no tienen hoy un camino de código verificable, sin inventar el mecanismo que les falta.
- ✅ El flujo de inventario cubre login → navegación → alta de entrada (éxito y rechazo) → salida (éxito y rechazo) → caso de edición directa → caso de umbral → vuelta al listado → sesión caducada: 7 puntos de instrumentación verificados en código, más uno (umbral) documentado como no implementable hoy.
- ✅ Se exploraron auth, rendimiento, errores de frontend y navegación más allá del mínimo de inventario, con un evento por cada pregunta de negocio concreta — no se añadieron eventos sin una decisión asociada (se descartaron, por ejemplo, eventos específicos por página de `/locations` o `/loyalty`, cubiertos ya por el `page_viewed` genérico).
