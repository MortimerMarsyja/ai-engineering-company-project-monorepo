# Evaluación de cacheabilidad de endpoints — `services/api`

**Estado:** Evaluación completada. Los endpoints marcados ✅ **Cacheable** ya tienen caché implementado (TTL in-memory, ver [`app/core/cache.py`](../services/api/app/core/cache.py)); los marcados 🟡 **Cacheable parcialmente** se dejaron sin cambios a propósito (requieren separar catálogo de stock antes de cachear, ver sección 2). Acompañada de una herramienta de diagnóstico de tiempos: [`services/api/benchmark_endpoints.py`](../services/api/benchmark_endpoints.py).

**Stack:** FastAPI (`services/api`), TinyDB (`db.json`) para `users`/`profiles`/`records`/`incidents`/`suppliers`, SQLModel/Postgres (Supabase) para `menu_items`/`inbound_stock`/`stock_exits` (inventory). Prefijo de API: `/api/v1`. Hoy **no existe ninguna capa de caché** en el repo (ni `unstable_cache`, ni Redis, ni memoización) — cada request recalcula todo desde cero.

## Criterio de decisión

Para cada endpoint se cruzan dos ejes:

1. **Coste computacional**: ¿cuánto trabajo hace el servidor en cada llamada? (una lectura de un documento vs. recorrer toda una tabla, vs. N+1 de queries SQL, vs. agregaciones en memoria).
2. **Volatilidad / tolerancia a datos desactualizados**: ¿con qué frecuencia cambia el resultado, y qué tan grave es para el negocio que el cliente vea un valor con unos segundos (o minutos) de retraso?

Un endpoint solo es buen candidato a caché cuando **el coste es alto Y la tolerancia a staleness también lo es**. El ejemplo guía de esta evaluación: el **estado de una incidencia** cambia con cada acción del equipo y el cliente necesita el valor real en todo momento — aunque fuera costoso de calcular, cachearlo sería la decisión equivocada porque el riesgo (mostrar una incidencia como "abierta" cuando ya se resolvió) pesa más que el ahorro de tiempo. Lo mismo aplica a cualquier endpoint de escritura (POST/PATCH/PUT/DELETE): nunca se cachean.

Veredictos usados:
- ✅ **Cacheable** — coste alto, staleness tolerable con un TTL corto.
- 🟡 **Cacheable parcialmente** — solo la parte "estable" de la respuesta debería cachearse; la parte volátil se recalcula siempre.
- ❌ **No cacheable** — el dato debe ser siempre el real (alta sensibilidad a staleness), o el coste ya es bajo y no justifica la complejidad de cachear.

---

## 1. Incidents — `app/routers/incidents.py`

| Endpoint | Coste | Volatilidad | Veredicto | Estrategia |
|---|---|---|---|---|
| `GET /incidents` (línea 56) | Medio — TinyDB sin índices, filtra/ordena/pagina en Python sobre toda la tabla en cada llamada | Alta — el estado de una incidencia es justo lo que el cliente consulta | ❌ **No cacheable** | El cliente necesita el estado real siempre (caso guía de esta evaluación) |
| `GET /incidents/{id}` (línea 195) | Bajo | Alta — mismo motivo | ❌ **No cacheable** | — |
| `GET /incidents/metrics` (línea 91) | **Alto** — `get_incident_metrics()` recorre toda la tabla y calcula `Counter`s + promedios (satisfacción, tiempo de resolución) en cada request | Media — es un dashboard de liderazgo que agrega todas las incidencias; un retraso de 30–60s es aceptable para ver tendencias, no afecta decisiones operativas por incidencia | ✅ **Cacheable — implementado** | TTL de 45s (`app/core/cache.py`). Se invalida al crear/editar una incidencia (`POST /incidents`, `PATCH /incidents/{id}`, `PATCH /incidents/{id}/status`) |
| `POST /incidents`, `PATCH /incidents/{id}`, `PATCH /incidents/{id}/status` | — | — | ❌ (escritura) | Si se cachea `metrics`, estas rutas deben invalidar esa entrada |
| `POST /incidents/analyze` (línea 98) | Alto (parseo CSV + persistencia) | — | ❌ (escritura) | Nota: ya usa una variable global `_last_analysis` como pseudo-caché de un solo proceso (línea 52) — es un problema de **corrección/arquitectura** (se pierde si hay >1 worker), no de performance. Fuera de alcance de esta evaluación |
| `GET /incidents/result/export` (línea 169) | Bajo (solo serializa `_last_analysis`) | Depende de la última `/analyze` | ❌ **No cacheable** | Ya depende de un estado mutable; cachearlo no ayuda |

---

## 2. Inventory — `app/routers/inventory.py`

| Endpoint | Coste | Volatilidad | Veredicto | Estrategia |
|---|---|---|---|---|
| `GET /inventory/products` (línea 95) | **Alto — patrón N+1**: por cada producto devuelto, `_current_stock()` (línea 38) ejecuta 2 queries `SUM()` (inbound y outbound) | Mixta: el catálogo (nombre, sku, precio, categoría) casi no cambia; el `current_stock` cambia con cada orden | 🟡 **Cacheable parcialmente** | Separar la respuesta: cachear la lista de `MenuItem` (catálogo) con TTL largo (p.ej. 5 min, invalidar en `POST /inventory/products`), y recalcular `current_stock` siempre fresco (o cachearlo con TTL muy corto, 5–10s, si el N+1 se vuelve un cuello de botella real). No cachear el stock con TTL largo: el cliente que registra una orden necesita ver el stock real inmediatamente después |
| `GET /inventory/products/{id}` (línea 106) | Medio (mismo `_current_stock`, 1 producto) | Igual que arriba | 🟡 **Cacheable parcialmente** | Mismo criterio, menor prioridad por ser de menor coste absoluto |
| `GET /inventory/orders` (línea 173) | Alto — 2 `SELECT ... JOIN`, merge y `sort()` en Python sobre *todas* las órdenes históricas | Alta — nueva orden = nueva fila visible de inmediato | ❌ **No cacheable con TTL largo** | Si el listado crece mucho, mejor paginar en SQL que cachear agresivamente; a lo sumo TTL de 2–5s solo para absorber picos de tráfico simultáneo |
| `POST /inventory/products`, `POST /inventory/orders/inbound`, `POST /inventory/orders/outbound` | — | — | ❌ (escritura) | Deben invalidar el caché del catálogo (`products`) si se implementa |

---

## 3. Suppliers — `app/routers/suppliers.py`

| Endpoint | Coste | Volatilidad | Veredicto | Estrategia |
|---|---|---|---|---|
| `GET /suppliers` (línea 96) | Medio — TinyDB `.all()` + filtrado en Python sobre todo el directorio | Baja — el directorio de proveedores cambia poco (altas/bajas ocasionales, rate/status editado esporádicamente) | ✅ **Cacheable — implementado** | TTL de 180s, cacheado por combinación de filtros (`product_category`, `status`). Se invalida en `POST /suppliers`, `PATCH /{id}/rate`, `PATCH /{id}/status`, `DELETE /{id}` |
| `GET /suppliers/{id}` (línea 123) | Bajo (lectura directa por `doc_id`) | Baja | ❌ **No prioritario** | Coste ya bajo; cachear no aporta ahorro significativo frente a la complejidad de invalidación |
| `POST/PATCH/DELETE /suppliers/**` | — | — | ❌ (escritura) | Invalidan el caché de `GET /suppliers` si se implementa |

---

## 4. Records (pipeline de contratación) — `app/routers/records.py`

| Endpoint | Coste | Volatilidad | Veredicto | Estrategia |
|---|---|---|---|---|
| `GET /records` (línea 33) | Medio — paginación + búsqueda sobre TinyDB | Media — candidatos cambian de etapa con cierta frecuencia durante procesos activos | 🟡 **Opcional, baja prioridad** | Si se cachea, TTL muy corto (10–15s) e invalidar en `PATCH`/`PUT`/creación. El beneficio es menor que en `incidents/metrics` o `inventory/products` porque el coste base ya es moderado |
| `GET /records/{id}`, `GET /records/{id}/notes` | Bajo | Media | ❌ **No prioritario** | — |
| `POST/PUT/PATCH/DELETE /records/**` | — | — | ❌ (escritura) | — |

---

## 5. Auth / Users / Profiles

| Endpoint | Coste | Volatilidad | Veredicto | Estrategia |
|---|---|---|---|---|
| `POST /auth/login` | Bajo-medio (hash de password + JWT) | — | ❌ **No cacheable** | Es una escritura de sesión conceptualmente; nunca se cachea una autenticación |
| `GET /auth/me`, `GET /profiles/me` | Bajo (lectura de un documento por id) | Baja, pero es *identidad del usuario actual* | ❌ **No prioritario** | Coste ya bajo; cachear identidad añade riesgo (permisos/roles desactualizados) por un ahorro marginal |
| `GET /users`, `GET /users/{id}` | Bajo-medio | Baja | ❌ **No prioritario** | Mismo razonamiento que suppliers por id: coste no justifica la complejidad todavía |

---

## Resumen de prioridades

1. **`GET /incidents/metrics`** — mayor relación coste/beneficio: agregación pesada + volatilidad tolerable. Primer candidato a implementar.
2. **`GET /inventory/products` (y `/{id}`)** — coste alto por el N+1, pero requiere separar catálogo (cacheable) de stock (no cacheable sin TTL muy corto) para no arriesgar mostrar stock desactualizado en el punto de venta.
3. **`GET /suppliers`** — bajo riesgo, ganancia moderada; buen tercer paso de bajo riesgo.
4. Todo lo demás: no cacheable (datos operativos sensibles a staleness) o de prioridad baja (coste ya bajo).

## Siguientes pasos (fuera de esta tarea)

Ya se implementó el caché in-memory (TTL, un único proceso/worker) para `incidents/metrics` y `suppliers` list — ver `app/core/cache.py` y su uso en `app/routers/incidents.py` / `app/routers/suppliers.py`. Pendiente para una tarea futura:
1. Si el servicio se despliega con más de un worker/instancia, este caché en memoria deja de ser consistente entre procesos — habría que migrar a Redis (ya propuesto en `docs/ARCHITECTURE_PROPOSAL.md`).
2. Decidir si vale la pena abordar los endpoints 🟡 "cacheables parcialmente" (`inventory/products`), separando catálogo (cacheable) de stock (no cacheable) — se dejaron sin tocar en esta tarea.
3. Usar `services/api/benchmark_endpoints.py` (ver abajo) para cuantificar el recorte de tiempos a medida que el dataset real crezca (con los volúmenes de seed actuales el ahorro es mínimo porque las operaciones ya son muy rápidas).

---

## Herramienta de diagnóstico de tiempos

`services/api/benchmark_endpoints.py` mide la latencia de los endpoints del backend FastAPI directamente (sin pasar por el proxy de `uis/backoffice`), para poder demostrar con números el recorte de tiempos una vez se implemente el caché.

### Uso

```bash
cd services/api
# Backend corriendo en otra terminal: uvicorn app.main:app --reload (o `pnpm dev:back` desde la raíz)

# 1. Medir el estado actual (sin caché)
python benchmark_endpoints.py --label before

# 2. Implementar el caché en los endpoints priorizados arriba …

# 3. Medir de nuevo
python benchmark_endpoints.py --label after

# 4. Comparar
python benchmark_endpoints.py --compare before after
```

Variables de entorno opcionales: `BENCH_BASE_URL` (default `http://localhost:8000`), `BENCH_EMAIL` / `BENCH_PASSWORD` (default: usuario admin de `seed_users.py`), `BENCH_REQUESTS` (repeticiones por endpoint, default 20).

Los endpoints medidos incluyen tanto los candidatos a caché (`incidents/metrics`, `inventory/products`, `inventory/orders`, `suppliers`) como un par de endpoints **no cacheables** como control (`incidents` list/detail) — así se puede confirmar que cualquier mejora de tiempos viene del caché y no de ruido general del entorno.

Cada corrida se guarda en `services/api/benchmarks/results/<label>_<timestamp>.json` con min/promedio/p50/p95/max en milisegundos por endpoint.
