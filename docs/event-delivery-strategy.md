# Estrategia de entrega y procesamiento de eventos — Fase 3 (Plan de Telemetría)

**Insumos usados:** `docs/mandatory_metrics.md` (briefing), `docs/telemetry-catalog.md` (Fase 1), `docs/event-envelope.md` + `docs/event-schemas.json` (Fase 2). Esta fase **no implementa** infraestructura de captura, envío ni procesamiento — define cuándo y cómo deben procesarse los 20 `event_type` ya contractuales.

**Principio rector, aplicado en todo el documento:** la captura de un evento (generar `eventId`/`timestamp` y registrarlo) ocurre **siempre en el instante en que pasa el hecho**, sin excepción, incluso para eventos que luego se procesan en lote. "Batch" describe cuándo se **agrega/ingiere** el evento al almacén analítico para que alimente una decisión — nunca cuándo se registra. Ningún evento de este catálogo espera a un lote para ser capturado.

---

## 1. Modalidad de procesamiento por evento

Criterio aplicado a cada evento (en este orden, no por preferencia técnica):
1. ¿Qué decisión concreta habilita? (columna "Decisión que habilita" de `docs/mandatory_metrics.md`/`docs/telemetry-catalog.md`)
2. ¿Esa decisión es urgente (se actúa en minutos/horas) o es de revisión periódica (días/semanas)?
3. ¿Hay una necesidad operativa real de detectarlo rápido, más allá de la decisión declarada?
4. ¿Qué pasa concretamente si se procesa con retraso?

Solo 3 de los 20 eventos superan la barra de "stream": uno por lenguaje explícito de alerta en el briefing, y dos por representar intentos de violar un control (no un patrón a analizar después, sino la señal misma que se quiere detectar). El resto son decisiones de revisión periódica — se les dio una periodicidad lo bastante corta para que el dato no se sienta "viejo" sin construir infraestructura de streaming que nadie pidió.

| `event_type` | Categoría | Clasif. | Modalidad | Latencia máx. propuesta | Periodicidad (si batch) | Decisión que habilita | Justificación |
|---|---|---|---|---|---|---|---|
| `ingredient_price_variance_detected` | Inventario | OB | **stream** | ≤15 min | — | Alertar a Lucía/Mariana para renegociar o cambiar proveedor | **Único evento obligatorio con lenguaje de urgencia explícito en el briefing** ("Alertar"). Cada hora de retraso es, literalmente, más pedidos hechos al precio anómalo antes de que alguien pueda actuar — el costo de retraso es dinero real, no solo "dato viejo" |
| `direct_stock_edit_rejected` | Inventario | OB | **stream** | ≤15 min | — | Reforzar capacitación/permisos donde ocurre con más frecuencia (Jake) | La decisión declarada (capacitación) es periódica, **pero** el evento representa un intento activo de saltarse el control de trazabilidad — no un patrón a analizar después, sino la señal de un posible intento en curso. Riesgo asimétrico: tenerlo disponible pronto no cuesta nada (es un evento de muy baja frecuencia esperada); descubrirlo tarde si resulta ser relevante, sí |
| `login_failed` | Autenticación | OI | **stream** | ≤15 min | — | Decidir si hace falta lockout/rate-limiting | Mismo razonamiento que el anterior: es un intento de acceso no autorizado, no una métrica de uso. Una ráfaga de fallos contra la misma cuenta es exactamente el patrón que se querría detectar mientras ocurre, no al día siguiente |
| `inbound_order_created` | Inventario | OB | batch | 24 h | diaria | Consolidar compras entre locales para negociar precios (Lucía) | Negociar con proveedores es un ciclo de semanas, no de minutos. Sin lenguaje de urgencia en el briefing |
| `outbound_order_created` | Inventario | OB | batch | 24 h | diaria | Ajustar la sugerencia automática de pedidos (Felipe) | Una sugerencia automática de reabastecimiento es, por naturaleza, un cálculo que corre periódicamente (p. ej. cada noche), no por evento individual |
| `stock_waste_registered` | Inventario | OB | batch | 24 h | diaria | Priorizar auditorías de merma en locales con peor indicador (Felipe) | Priorizar auditorías es una decisión de revisión semanal/mensual; procesar a diario mantiene el dato fresco sin forzar una decisión diaria. **Pendiente de confirmar**: si `reason=theft_suspected` debería escalar distinto (ver §4) |
| `stock_threshold_triggered` | Inventario | OB | batch | 24 h | diaria | Ajustar el umbral mínimo o la frecuencia de reabastecimiento | La propia redacción del briefing ("con qué frecuencia…") pide un conteo agregado, no una alerta puntual — es una decisión de calibración, no de reacción inmediata. **Pendiente de confirmar** con Felipe: si además se quiere un aviso operativo el mismo día de que un local se quedó corto (sería un cambio de modalidad a stream, no decidido aquí) |
| `inbound_order_rejected` | Inventario | OI | batch | 7 días | semanal | Decidir si rediseñar el selector de sede/producto | Patrón de UX a revisar en diseño, no una emergencia operativa — es un error de formulario, no un intento de bypass |
| `outbound_order_rejected` | Inventario | OI | batch | 7 días | semanal | Decidir reabastecimiento más frecuente o rediseñar el selector | Mismo razonamiento. **Pendiente de confirmar**: el caso `insufficient_stock` podría justificar una alerta más rápida que `location_mismatch`/`product_not_found`, pero el esquema actual no distingue modalidad por valor de `rejection_reason` dentro de un mismo `event_type` — se deja como una sola modalidad por simplicidad, señalado explícitamente aquí en vez de decidirlo en silencio |
| `inventory_products_viewed` | Inventario | OI | batch | 1 h | horaria | Priorizar qué endpoint cachear con tráfico real (retroalimenta `docs/cache-evaluation.md`) | Es tráfico acumulativo; una hora de ventana da suficiente volumen sin necesitar streaming |
| `login_succeeded` | Autenticación | OI | batch | 24 h | diaria | Dimensionar capacidad, detectar accesos fuera de horario | Análisis de patrones agregados, sin urgencia — es el resultado "bueno", no una señal de riesgo |
| `session_expired` | Autenticación | OI | batch | 7 días | semanal | Decidir ampliar duración del token / autoguardado | Decisión de producto revisada en ciclos de sprint, no reacción inmediata |
| `password_reset_requested` | Autenticación | OI | batch | 24 h | diaria | Entender uso de autoservicio / detectar abuso | Sin lenguaje de urgencia; se mantiene en el mismo ciclo que `password_reset_completed` para poder calcular la tasa de conversión sobre la misma ventana |
| `password_reset_completed` | Autenticación | OI | batch | 24 h | diaria | Idem (tasa de conversión del flujo de autoservicio) | Mismo motivo — debe compartir ventana con `password_reset_requested` |
| `api_latency_recorded` | Rendimiento | OI | batch | 1 h | horaria | Priorizar qué endpoints cachear/rediseñar (retroalimenta `docs/cache-evaluation.md`) | El valor viene de la distribución estadística (p50/p95) sobre muchas muestras, no de una muestra individual — y cada muestra debe conservarse íntegra (ver §2) |
| `page_load_recorded` | Rendimiento | OI | batch | 24 h | diaria | Priorizar optimización de páginas lentas | Análisis de tendencia tipo Lighthouse, ya se revisa en ciclos (ver `docs/cambios-explicados.md`), no por carga individual |
| `frontend_error_detected` | Errores | OI | batch | 1 h | horaria | Priorizar estabilidad/bugfixing en rutas con más errores | El roadmap del propio proyecto (`memory-bank/progress.md`, Fase 4: "Monitoreo: Error tracking (Sentry) + uptime") ya contempla herramientas de error-tracking en tiempo real como un paso **futuro** separado — por ahora, sin ese sistema, una ventana horaria da visibilidad el mismo día sin construir streaming que nadie más consume todavía |
| `form_submission_failed` | Errores | OI | batch | 1 h | horaria | Priorizar qué formulario rediseñar por volumen de fricción | Mismo razonamiento — detectar un pico de fallos el mismo día es suficiente; no hay una acción automática que dependa de saberlo en minutos |
| `page_viewed` | Navegación | OI | batch | 24 h | diaria | Priorizar roadmap hacia secciones más usadas | Analítica de uso pura, sin urgencia |
| `form_abandoned` | Navegación | OI | batch | 7 días | semanal | Simplificar el paso donde más se abandona | Análisis de funnel, necesita ventanas más largas para ser estadísticamente significativo; sin urgencia operativa |

**Nota sobre "latencia máxima" en eventos batch:** es el tiempo máximo entre que el evento se captura y que queda disponible en el almacén analítico tras la ejecución del siguiente lote — no el tiempo hasta que alguien toma la decisión de negocio (esa cadencia, semanal o mensual según el caso, es un proceso humano aparte y más lento).

**Ninguna de las periodicidades de esta tabla está exigida por el briefing** — `docs/mandatory_metrics.md` no especifica latencia para ningún evento. Son propuestas razonadas, marcadas para confirmación con los stakeholders citados en cada fila (Lucía, Felipe, Jake, Mariana).

---

## 2. Eventos de alta frecuencia: throttle, debounce o ninguno

### 2.1 Con mecanismo de limitación

| Evento | Mecanismo | Intervalo propuesto | Ámbito | Qué se conserva | Qué podría perderse | Efecto sobre métricas/decisiones |
|---|---|---|---|---|---|---|
| `frontend_error_detected` | **throttle** | 1 por combinación `(route, error_name)` cada 5 min | Por `sessionId` + ruta + tipo de error | La primera ocurrencia completa (mensaje, ruta, momento) | El conteo exacto de repeticiones dentro de la ventana (p. ej. un error que se repite 400 veces por segundo por un bucle de render solo se registra una vez cada 5 min) | No afecta la decisión ("qué ruta priorizar arreglar") porque esa decisión solo necesita saber *que* ocurrió y *dónde*, no cuántas veces exactas se repitió en una ráfaga. No es un evento obligatorio ni de trazabilidad de inventario |
| `form_submission_failed` | **throttle** | 1 por combinación `(form_name, http_status)` cada 60 s | Por `sessionId` + formulario + tipo de error | La primera ocurrencia completa (incluye `error_message`) | El conteo exacto de reintentos frenéticos de un usuario frustrado reenviando el mismo formulario | No afecta la decisión de rediseño (que se basa en qué formulario falla más, no en cuántos clics exactos dio un usuario) |

### 2.2 Con deduplicación técnica (debounce, por ruido de implementación, no por volumen de negocio)

| Evento | Mecanismo | Intervalo propuesto | Ámbito | Qué se conserva | Qué podría perderse |
|---|---|---|---|---|---|
| `page_viewed` | **debounce** | ~1 s | Por `sessionId` + ruta | Cada navegación real a una ruta distinta | Disparos duplicados del mismo hook de navegación (p. ej. doble ejecución de efectos en React) — no una visita real |
| `inventory_products_viewed` | **debounce** | ~1 s | Por `sessionId` | Cada carga real del listado | Mismo motivo — artefacto técnico, no pérdida de señal de negocio |
| `form_abandoned` | **debounce** | 2 s de inactividad + confirmación de navegación fuera del formulario | Por `sessionId` + `form_name` | Exactamente un evento por abandono real | Disparos intermedios si la detección corre en cada `blur` de campo en vez de al salir de verdad |

Esta categoría no es "limitar frecuencia de negocio" sino "evitar que un detalle de implementación (reejecución de un efecto, blur de un campo) genere más de un evento por un solo hecho real." No se pierde ninguna ocurrencia de negocio, solo ruido técnico.

### 2.3 Sin throttle ni debounce — íntegramente conservados

El resto de los 20 eventos (15) no llevan ningún mecanismo de limitación, por dos razones distintas:

**a) Porque limitar destruiría exactamente la señal que se busca** (eventos de intento de violación de control / detección de incidentes — excluidos explícitamente de throttle/debounce por instrucción de esta fase):
- `direct_stock_edit_rejected` — la frecuencia de intentos *es* la métrica (Jake quiere saber "dónde ocurre esto con más frecuencia"); throttlearlo lo haría invisible.
- `login_failed` — una ráfaga de fallos es la señal de fuerza bruta; suprimir repeticiones elimina la única evidencia de un ataque en curso.

**b) Porque cada ocurrencia es una acción discreta y deliberada, de volumen naturalmente bajo y acotado por actor** (nadie registra cientos de órdenes de inventario por segundo), y además son en su mayoría eventos obligatorios o de trazabilidad, donde perder una ocurrencia altera directamente la métrica:
`inbound_order_created`, `outbound_order_created`, `stock_waste_registered`, `stock_threshold_triggered`, `ingredient_price_variance_detected`, `inbound_order_rejected`, `outbound_order_rejected`, `login_succeeded`, `session_expired`, `password_reset_requested`, `password_reset_completed`, `page_load_recorded`, `api_latency_recorded`.

Caso especial — **`api_latency_recorded`**: aunque técnicamente puede dispararse muy seguido (una vez por cada llamada autenticada), **no se throttlea deliberadamente**: su utilidad depende de la distribución completa de muestras (p50/p95/p99) que alimenta `docs/cache-evaluation.md`; descartar muestras sesgaría exactamente el cálculo que este evento existe para habilitar.

**Conclusión de esta sección:** sí existen eventos de alta frecuencia potencial (`frontend_error_detected`, `form_submission_failed` ante errores en bucle; `page_viewed`/`inventory_products_viewed` ante artefactos de navegación), y se les aplicó un mecanismo proporcionado al riesgo real (ráfagas de errores idénticos, duplicados técnicos) sin tocar ningún evento obligatorio, de trazabilidad de inventario, ni de detección de incidentes de seguridad.

---

## 3. Riesgos y exclusiones

### 3.1 Eventos considerados y descartados

| Candidato | Motivo | Origen de la decisión |
|---|---|---|
| Eventos específicos por página (`/locations`, `/loyalty`, etc.) | Ya cubiertos por el `page_viewed` genérico; un evento por página sería proliferación sin utilidad adicional | Ya documentado en Fase 1 (`docs/telemetry-catalog.md`) |
| `supplier_rate_updated` / `supplier_status_changed` | Vínculo de decisión demasiado débil frente al resto del catálogo (no se pudo completar la plantilla "capturamos X porque necesitamos saber Y, lo que permite decidir Z" con una decisión tan concreta como las demás) | Ya descartado en el razonamiento de Fase 1, no incluido en el catálogo final de 20 eventos |
| Telemetría de movimiento de ratón / scroll / heatmaps | No hay ninguna decisión de negocio que la requiera hoy; alto volumen, utilidad no establecida | Nuevo en esta fase (exclusión por coste/volumen/escasa utilidad) |
| Eventos a nivel de campo de formulario (uno por tecla/campo tocado) | `form_abandoned.fields_completed_pct` ya resume lo necesario para la decisión de rediseño; granularidad de campo no aporta una decisión adicional | Nuevo en esta fase |
| Captura de la IP del cliente | Sin necesidad de negocio declarada (no hay concepto de geolocalización en el modelo de usuario, confirmado en Fase 1); riesgo de privacidad innecesario | Nuevo en esta fase |

### 3.2 Datos que no se capturan por privacidad (ya establecido en Fase 2, reafirmado aquí)

Contraseñas, tokens/JWT completos, cabeceras de autorización, cuerpos completos de petición/respuesta, nombres de empleados o de clientes en eventos de inventario, email en claro (se usa `email_hash` seudonimizado), IP del cliente (nueva exclusión de esta fase, ver 3.1).

### 3.3 Datos/eventos excluidos por coste, volumen o escasa utilidad

Ver tabla 3.1 (heatmaps, eventos por campo de formulario). Adicionalmente: no se capturan stack traces completos en `frontend_error_detected` (solo `error_name` + `error_message` truncado a 500 caracteres, ya definido en Fase 2) — **supuesto que puede resultar insuficiente para depuración detallada**, señalado como pendiente en §4.

### 3.4 Riesgos de la estrategia y medidas propuestas

| Riesgo | Afecta a | Medida propuesta | Limitación que permanece |
|---|---|---|---|
| Retraso del propio job de agregación batch (p. ej. falla y no corre un día) | Todos los eventos batch, incluidos los 4 obligatorios que lo son | Monitorizar el pipeline de ingesta (alerta si el job no corrió en N horas) | Esta meta-telemetría del pipeline no está definida en el catálogo actual (es infraestructura, no un evento de negocio) — queda pendiente para la fase de implementación |
| Pérdida de eventos del cliente (pestaña cerrada antes de enviar, sobre todo `form_abandoned`/`frontend_error_detected`) | Eventos originados en el navegador | Usar `navigator.sendBeacon`/`fetch` con `keepalive: true` al implementar la captura | Ninguna estrategia de envío es 100% garantizada en el navegador; siempre existirá una pérdida residual pequeña |
| Eventos duplicados por reintento de red | Todos | Generar `eventId` una sola vez por ocurrencia, antes de cualquier intento de envío, y deduplicar en la ingesta por `eventId` | Requiere que la fase de implementación respete esta regla desde el primer día — no autoimpuesto por el esquema |
| Reloj del navegador desincronizado afecta el orden entre `timestamp` de cliente y servidor | Eventos originados en frontend | El pipeline de ingesta debería registrar también un `receivedAt` propio del servidor (campo de infraestructura, no del envelope de evento) | No resuelto en el contrato de Fase 2; es una decisión de la capa de ingesta, no del evento |
| Pérdida de detalle por throttle/debounce (ver §2) | Solo 5 eventos, ninguno obligatorio | Ya diseñado para preservar la primera ocurrencia y la señal de negocio relevante | El conteo exacto de repeticiones dentro de la ventana se pierde en 2 de los 5 casos (`frontend_error_detected`, `form_submission_failed`) — aceptado explícitamente |
| 3 de los 6 eventos obligatorios siguen sin origen de datos real (`stock_threshold_triggered`, `ingredient_price_variance_detected`, parcialmente `direct_stock_edit_rejected`) | Mandatorios | Ya señalado en Fases 1 y 2 | Esta fase define la modalidad/latencia que tendrán **una vez existan** — no resuelve que hoy no se generan |

**Conflicto con requisitos obligatorios:** no se detectó ninguno — los 6 eventos obligatorios conservan íntegramente cada ocurrencia (sin throttle/debounce) y su modalidad/latencia se basa en la decisión que cada uno habilita, tal como exige el briefing.

---

## 4. Supuestos y cuestiones pendientes de confirmar

1. Ninguna periodicidad batch está exigida por el briefing — todas son propuestas (ver nota al final de §1), pendientes de validar con Lucía/Felipe/Jake/Mariana.
2. `stock_threshold_triggered` y el caso `insufficient_stock` de `outbound_order_rejected`: ¿se necesita además una alerta operativa el mismo día (no solo el conteo agregado diario)? No decidido aquí — señalado explícitamente para no decidirlo en silencio.
3. `stock_waste_registered` con `reason=theft_suspected`: ¿debería escalar con una modalidad distinta al resto de razones de merma? El esquema actual usa un único `event_type` con una sola modalidad; no se resuelve en esta fase.
4. `login_failed`/`direct_stock_edit_rejected` se clasificaron como stream por ser señales de intento de violación de control, pero **hoy no existe ningún sistema (lockout, alertas de seguridad) que consuma ese stream con una acción automática** — su valor en esta fase es preparatorio/preventivo, no una integración con un sistema existente.
5. El límite de 500 caracteres en `error_message` (definido en Fase 2) puede ser insuficiente para depuración detallada — pendiente de validar con el equipo de desarrollo si se necesita más contexto (p. ej. un stack trace truncado) sin violar las restricciones de privacidad ya establecidas.
6. No existe hoy infraestructura real de stream ni de batch en el repositorio (confirmado en fases previas: sin Kafka/colas, sin cron jobs, sin Redis) — esta fase define la estrategia, no la construye.
