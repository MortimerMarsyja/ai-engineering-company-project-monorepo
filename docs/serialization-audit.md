# Auditoría de serialización — `services/api`

**Stack:** FastAPI 0.115.12, Pydantic 2.11.3, SQLModel (Supabase/Postgres) para `menu_items`/`inbound_stock`/`stock_exits`, TinyDB (`db.json`) para `users`/`profiles`/`records`/`candidate_notes`/`incidents`/`suppliers`/`password_reset_tokens`.

Estado: **Fase 3 completada** (auditoría → implementación → verificación). Ver "Estado final" al pie de cada bloque y la sección de verificación al final del documento.

## Leyenda

- ✅ Correctamente serializado
- ⚠️ Parcialmente serializado
- ❌ Sin contrato de serialización explícito
- ➖ Excepción justificada (no corresponde un modelo JSON)

---

## 1. `health` — `app/routers/health.py`

| Método | Ruta | response_model | Clasificación inicial | Clasificación final |
|---|---|---|---|---|
| GET | `/health` | `HealthResponse` | ✅ | ✅ (sin cambios) |

Sin cambios necesarios.

---

## 2. `auth` — `app/routers/auth.py`

| Método | Ruta | response_model antes | Qué devolvía realmente | Clasificación inicial |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `ApiResponse` (datos sin tipar) | `{access_token, token_type, user}` donde `user` = `users_service.get_user_by_id(...)` (dict completo, incluye `email`) | ⚠️ |
| GET | `/api/v1/auth/me` | `ApiResponse` (datos sin tipar) | `UserResponse.model_dump()` (incluye `email`, correcto per spec) | ⚠️ |
| POST | `/api/v1/auth/forgot-password` | `ApiResponse` | `message` only, `data=None` | ✅ |
| POST | `/api/v1/auth/reset-password` | `ApiResponse` | `message` only | ✅ |
| POST | `/api/v1/auth/change-password` | `ApiResponse` | `message` only | ✅ |

**Riesgo detectado:** el login devolvía el objeto `user` completo (incluyendo `email`) sin ningún contrato que lo filtrara — `ApiResponse.data: dict | list | None` no valida ni recorta nada. Nunca se filtró la contraseña (el servicio ya la excluye), pero el campo `email` viola la instrucción explícita de no devolver email en login, y **ningún consumidor del repo usa ese campo**: `uis/backoffice/lib/auth.ts::loginUser` tipa la respuesta como `{access_token, token_type}` y el componente `app/login/page.tsx` solo lee `session.access_token`. Verificado por grep, no supuesto.

**Decisión:** eliminar `user` de la respuesta de login (no solo el email) — nadie lo consume y es el mínimo dato necesario. `GET /auth/me` se mantiene con `email` (explícitamente permitido).

**Estado final:**
- `POST /auth/login` → `response_model=ApiResponse[LoginData]`, `LoginData = {access_token, token_type}`. ✅
- `GET /auth/me` → `response_model=ApiResponse[UserResponse]`. ✅
- Las otras tres rutas: `response_model=ApiResponse[None]`. ✅

---

## 3. `users` — `app/routers/users.py`

| Método | Ruta | response_model antes | Clasificación inicial |
|---|---|---|---|
| POST | `/api/v1/users/` | `ApiResponse` (sin tipar) | ⚠️ — devolvía el usuario completo con `email`, violando la instrucción para "registro" |
| GET | `/api/v1/users/` | `ApiResponse` (sin tipar) | ⚠️ |
| GET | `/api/v1/users/{id}` | `ApiResponse` (sin tipar) | ⚠️ |
| PUT | `/api/v1/users/{id}` | `ApiResponse` (sin tipar) | ⚠️ |
| DELETE | `/api/v1/users/{id}` | `ApiResponse` | ✅ (`message` only) |

**Consumidores comprobados:** solo `uis/backoffice/lib/auth.ts::registerUser` llama a `POST /users`, y su resultado se descarta por completo (`await registerUser(payload)`, sin leer la respuesta) en `app/register/page.tsx`. Ningún endpoint de listado/detalle/edición de usuarios tiene consumidor en el repo (`GET /users`, `GET /users/{id}`, `PUT /users/{id}` no se usan desde el frontend actual) — se mantiene un contrato correcto por diseño/API pública, sin inventar requisitos de consumidor que no existen.

**Decisión:**
- `POST /users/` deja de devolver `email` (instrucción explícita para "registro"), manteniendo el resto (`id`, `role`, `is_active`, `created_at`, `profile`) porque es la convención REST estándar de devolver el recurso creado y los tests existentes ya verifican esos campos.
- `GET/PUT /users/{id}` y `GET /users/` **sí** mantienen `email` — no son "registro/login/recuperación", son gestión interna de usuarios por staff.

**Estado final:**
- `POST /users/` → `response_model=ApiResponse[UserRegisteredResponse]` (nuevo esquema sin `email`). ✅
- `GET /users/` → `response_model=ApiResponse[list[UserResponse]]`. ✅
- `GET /users/{id}` → `response_model=ApiResponse[UserResponse]`. ✅
- `PUT /users/{id}` → `response_model=ApiResponse[UserResponse]`. ✅
- `DELETE /users/{id}` → `response_model=ApiResponse[None]`. ✅

---

## 4. `profiles` — `app/routers/profiles.py`

| Método | Ruta | response_model antes | Clasificación inicial |
|---|---|---|---|
| GET | `/api/v1/profiles/me` | `ApiResponse` (sin tipar) | ⚠️ |
| PUT | `/api/v1/profiles/me` | `ApiResponse` (sin tipar) | ⚠️ |

El contenido real ya coincidía con `ProfileResponse` (sin campos sensibles), pero no había contrato que lo garantizara.

**Estado final:**
- Ambas rutas → `response_model=ApiResponse[ProfileResponse]`. ✅

---

## 5. `incidents` — `app/routers/incidents.py`

| Método | Ruta | response_model antes | Qué devolvía | Clasificación inicial |
|---|---|---|---|---|
| GET | `/api/v1/incidents` | ninguno | `{data, total, page, limit}` (dict crudo de TinyDB) | ❌ |
| POST | `/api/v1/incidents` | `IncidentResponse` | — | ✅ |
| GET | `/api/v1/incidents/metrics` | ninguno | `{"data": {...Counters...}}` | ❌ |
| POST | `/api/v1/incidents/analyze` | ninguno | `{"status": "ok", "data": {...resumen...}}` (multipart in, JSON out) | ❌ |
| GET | `/api/v1/incidents/result/export` | ninguno (`StreamingResponse`) | CSV descargable | ➖ (archivo, correcto tal cual) |
| GET | `/api/v1/incidents/{id}` | `IncidentResponse` | — | ✅ |
| PATCH | `/api/v1/incidents/{id}` | `IncidentResponse` | — | ✅ |
| PATCH | `/api/v1/incidents/{id}/status` | `IncidentResponse` | — | ✅ |

**Consumidores comprobados** (`uis/backoffice/lib/incidents.ts` + `incidents-api.ts`):
- Listado espera exactamente `{data: Incident[], total, page, limit}` — sin envoltura `success/message`.
- Métricas espera `json.data` con la forma de `IncidentMetrics` (TS) — sin `success/message`.
- Analyze espera `json.data` con la forma de `AnalyzeSummary` — el campo `status` del backend no se lee en ningún lado.

**Decisión:** no envolver estos tres en `ApiResponse` (el consumidor no espera `success`/`message` y ya funciona así) — en su lugar, darles un modelo Pydantic explícito con exactamente esa forma, para que FastAPI valide y filtre.

**Estado final:**
- `GET /incidents` → `response_model=PaginatedResponse[IncidentResponse]` (`{data, total, page, limit}`). ✅
- `GET /incidents/metrics` → `response_model=DataEnvelope[IncidentMetricsResponse]` (`{data}`, sin `status`/`success`). ✅
- `POST /incidents/analyze` → `response_model=DataEnvelope[AnalyzeSummaryResponse]`. Se eliminó el campo `status` del cuerpo (no usado por nadie, confirmado por grep). ✅
- `GET /incidents/result/export` → excepción justificada, sin cambios. ➖

---

## 6. `inventory` — `app/routers/inventory.py`

| Método | Ruta | response_model | Clasificación |
|---|---|---|---|
| POST | `/api/v1/inventory/products` | `MenuItemResponse` | ✅ |
| GET | `/api/v1/inventory/products` | `list[MenuItemResponse]` | ✅ |
| GET | `/api/v1/inventory/products/{id}` | `MenuItemResponse` | ✅ |
| POST | `/api/v1/inventory/orders/inbound` | `InboundStockResponse` | ✅ |
| POST | `/api/v1/inventory/orders/outbound` | `StockExitResponse` | ✅ |
| GET | `/api/v1/inventory/orders` | `list[OrderResponse]` | ✅ |

Router ya ejemplar: SQLModel ORM (`from_attributes=True`) con esquemas Pydantic independientes del modelo de base de datos, `current_stock` calculado documentado como no persistido. Sin cambios.

---

## 7. `records` — `app/routers/records.py`

| Método | Ruta | response_model antes | Qué devolvía | Clasificación inicial |
|---|---|---|---|---|
| GET | `/api/v1/records` | ninguno | `{data, total, page, limit}` | ❌ |
| POST | `/api/v1/records` | `CandidateResponse` | — | ✅ |
| GET | `/api/v1/records/{id}` | `CandidateResponse` | — | ✅ |
| PUT | `/api/v1/records/{id}` | `CandidateResponse` | — | ✅ |
| PATCH | `/api/v1/records/{id}` | `CandidateResponse` | — | ✅ |
| DELETE | `/api/v1/records/{id}` | ninguno, 204 | sin cuerpo | ➖ |
| GET | `/api/v1/records/{id}/notes` | ninguno | `{data: [...], meta: {total}}` | ❌ |
| POST | `/api/v1/records/{id}/notes` | ninguno, 201 | dict de nota crudo | ❌ (esquema `CandidateNote` ya existía pero no se declaraba) |
| DELETE | `/api/v1/records/{id}/notes/{note_id}` | ninguno, 204 | sin cuerpo | ➖ |

**Consumidores comprobados** (`uis/backoffice/lib/types.ts` + `lib/api.ts`):
- Listado: `{data: Candidate[], total, page, limit}`, sin envoltura.
- Notas: `{data: CandidateNote[], meta: {total}}` — forma exacta, incluido el `meta.total` anidado (no `total` plano).
- Crear nota: el consumidor espera el objeto `CandidateNote` plano, sin envoltura.

**Estado final:**
- `GET /records` → `response_model=PaginatedResponse[CandidateResponse]`. ✅
- `GET /records/{id}/notes` → `response_model=NotesListResponse` (`{data, meta: {total}}`). ✅
- `POST /records/{id}/notes` → `response_model=CandidateNote` (ya existía, solo se declaró). ✅

---

## 8. `suppliers` — `app/routers/suppliers.py`

| Método | Ruta | response_model antes | Clasificación inicial |
|---|---|---|---|
| POST | `/api/v1/suppliers` | `ApiResponse` (sin tipar) | ⚠️ |
| GET | `/api/v1/suppliers` | `ApiResponse` (sin tipar) | ⚠️ |
| GET | `/api/v1/suppliers/{id}` | `ApiResponse` (sin tipar) | ⚠️ |
| PATCH | `/api/v1/suppliers/{id}/rate` | `ApiResponse` (sin tipar) | ⚠️ |
| PATCH | `/api/v1/suppliers/{id}/status` | `ApiResponse` (sin tipar) | ⚠️ |
| DELETE | `/api/v1/suppliers/{id}` | `ApiResponse` | ✅ (`message` only) |

El contenido (`SupplierResponse`, construido por `_doc_to_response`) ya era correcto y coincide con `uis/backoffice/lib/suppliers-types.ts::Supplier` campo por campo — el problema es puramente de contrato: `_doc_to_response` hacía `.model_dump(mode="json")` para meterlo en un `dict` sin tipar.

**Estado final:** todas las rutas de datos → `response_model=ApiResponse[SupplierResponse]` o `ApiResponse[list[SupplierResponse]]`; `_doc_to_response` ahora devuelve la instancia `SupplierResponse` directamente (no un dict), dejando que FastAPI serialice. ✅

---

## 9. Exposición de información sensible — hallazgos

- **Contraseñas/hashes:** nunca se devuelven; `_build_user_response` (services/users.py) ya las excluye en el límite del servicio. Sin regresión, pero ahora además hay un `response_model` que lo garantiza en el límite HTTP (defensa en profundidad).
- **Email en login/registro:** violación real encontrada y corregida (secciones 2 y 3).
- **`GET /auth/me`:** mantiene `email` — permitido explícitamente.
- **IDs/FKs** (`user_uuid` en inventario, `ingredient_id`, `supplier_id`, `record_id`): se mantienen — son necesarios para trazabilidad operativa interna (quién registró qué movimiento) y no son PII; no se tratan como sensibles automáticamente, según indicación.
- **Tokens de autenticación:** `access_token`/`token_type` del login se conservan (contrato legítimo).

---

## 10. Endpoints excluidos de OpenAPI / fuera de alcance JSON

Ninguna ruta usa `include_in_schema=False`. `GET /incidents/result/export` es la única respuesta no-JSON (`StreamingResponse` de CSV) — excepción justificada, sin cambios.

---

## Recuento de endpoints

| Clasificación | Antes | Después |
|---|---|---|
| ✅ Correctamente serializado | 10 | 29 |
| ⚠️ Parcialmente serializado | 13 | 0 |
| ❌ Sin contrato explícito | 6 | 0 |
| ➖ Excepción justificada | 2 | 2 |
| **Total** | **31** | **31** |

(Incluye las 31 rutas JSON/stream listadas arriba; `/health` y las dos de exportación/eliminación sin cuerpo quedan dentro del recuento total.)

---

## Incertidumbres / pendientes

- **`GET /users`, `GET /users/{id}`, `PUT /users/{id}`:** no tienen consumidor en el repo actual. Se les dio un contrato correcto (`UserResponse`, con `email`) por ser la gestión de usuarios "canónica" del backend, pero no hay evidencia de un frontend que los use hoy — si en el futuro un consumidor real aparece con necesidades distintas, este contrato puede necesitar ajuste.
- **`test_inventory.py` no existe.** El router de inventario ya estaba ✅ antes de esta auditoría y no se tocó; no se agregó suite de tests nueva para no exceder el alcance de esta tarea (serialización), pero es una brecha de cobertura preexistente que vale la pena señalar.
- **Pydantic generics (`ApiResponse[T]`, `PaginatedResponse[T]`):** es la abstracción mínima necesaria para que `response_model` valide/filtre el contenido de los wrappers existentes sin cambiar su forma externa (`{success, message, data}` / `{data, total, page, limit}`). Se evaluó NO introducir genéricos y en su lugar declarar un modelo de respuesta distinto por endpoint (p. ej. `SupplierApiResponse`, `UserApiResponse`, ...), pero eso hubiera multiplicado clases casi idénticas sin beneficio real; los genéricos de Pydantic 2 están soportados de forma nativa por la versión instalada (2.11.3) y por FastAPI 0.115 vía `response_model=ApiResponse[X]`.

---

## Verificación (Fase 3) — ejecutada

### 1. Suite de tests

```
cd services/api && uv run pytest -q
```

Resultado real: **225 passed** (216 preexistentes + 9 nuevos de contrato), 0 fallos, 0 regresiones. Ejecutada dos veces consecutivas para confirmar que no hay estado compartido entre corridas.

Tests actualizados por el cambio de contrato (documentando el impacto, no ocultándolo):
- `tests/test_auth.py::TestLogin::test_login_success_returns_token_only` (antes `test_login_success_returns_token_and_user`) — ya no espera `data.user`; ahora afirma `set(data.keys()) == {"access_token", "token_type"}`.
- `tests/test_users.py::TestRegisterUser::test_registration_defaults_to_user_role` — se quitó la aserción `data["email"] == ...`; se añadió `test_registration_response_never_exposes_email` como test nuevo explícito.

Tests nuevos (`tests/test_serialization_contracts.py`, 9 casos) cubriendo exactamente los endpoints que pasaron de ❌/⚠️ a ✅:
- Forma y tipos: `/auth/login`, `/users` (POST), `/auth/me`, `/incidents` (list), `/incidents/metrics`, `/incidents/analyze`, `/records` (list), `/records/{id}/notes` (GET y POST), `/suppliers` (POST).
- Ausencia de campos sensibles/internos: ausencia de `email`/`password`/`hashed_password` en login y registro; presencia correcta de `email` en `/auth/me`.
- Forma exacta de envoltura (con/sin `success`/`message`, anidación de `meta.total`, etc.) comparada contra los tipos TypeScript reales del frontend.

### 2. OpenAPI

Servidor de verificación: `uv run uvicorn app.main:app --port 8010` (instancia descartable, detenida al finalizar). Se descargó `/openapi.json` y se comprobó:

- `/api/v1/auth/login` → `ApiResponse_LoginData_` (antes: `ApiResponse` genérico sin tipar).
- `/api/v1/users/` POST → `ApiResponse_UserRegisteredResponse_`; propiedades de `UserRegisteredResponse` = `["id", "is_active", "role", "created_at", "profile"]` — **sin `email`**, confirmado leyendo el schema, no asumido.
- `/api/v1/users/` GET → `ApiResponse_list_UserResponse__`.
- `/api/v1/incidents` GET → `PaginatedResponse_IncidentResponse_`.
- `/api/v1/incidents/metrics` GET → `DataEnvelope_IncidentMetricsResponse_`.
- `/api/v1/records/{record_id}/notes` GET/POST → `NotesListResponse` / `CandidateNote`.
- `/api/v1/suppliers` GET/POST → `ApiResponse_list_SupplierResponse__` / `ApiResponse_SupplierResponse_`.
- `LoginData` propiedades = `["access_token", "token_type"]` — sin objeto `user`, confirmado leyendo el schema.

### 3. Comprobación manual vía HTTP (equivalente a `/docs`, contra el servidor de verificación real)

Se usó `curl` directo contra `http://localhost:8010` en lugar de accionar `/docs` desde un navegador (no disponible en este entorno) — **método real ejecutado, no simulado**:

1. **Escritura** — `POST /api/v1/users/` con `{email: verify@test.com, password, role: manager}` → `201`, cuerpo `{data: {id, is_active, role, created_at, profile}}`, **sin `email`**.
2. **Escritura/login** — `POST /api/v1/auth/login` → `200`, cuerpo `{data: {access_token, token_type}}`, **sin `user`**.
3. **Lectura** — `GET /api/v1/auth/me` (con el token recién emitido) → `200`, cuerpo incluye `email: "verify@test.com"` (permitido) y ningún campo de contraseña.
4. **Listado** — `GET /api/v1/suppliers` → `200`, 8 proveedores (datos ya sembrados), cada uno con exactamente los campos de `SupplierResponse` — nada de más, nada de menos.

El usuario de prueba (`verify@test.com`, id 11) y su perfil fueron eliminados del `db.json` real tras la verificación (`TinyDB.remove`); `git status db.json` confirma que el archivo no quedó modificado.

### Estado final por endpoint

Todas las rutas listadas en las secciones 1–8 quedaron en ✅ o ➖ (ninguna en ⚠️/❌) — ver la tabla de "Recuento de endpoints" arriba, ya actualizada a su estado final (29 ✅, 0 ⚠️, 0 ❌, 2 ➖).
