# RV20 — Operación, observabilidad y recuperación
Cómo se sabe que el calendario unificado dice la verdad, y qué hace un humano cuando deja de saberlo

Proyecto: Atiende Rentas Vacacionales — calendario unificado multi-canal
Caso ancla: administrador de portafolio pequeño (10-20 unidades, 3 canales activos — Airbnb, Booking.com, un tercero vía iCal), operando desde México, con guardia humana de horario extendido pero no 24/7 dedicado a operaciones (el mismo administrador o un encargado revisa alertas).
Fecha del informe: 2026-09-05 · Autor: agente de investigación Sonnet (sesión RV20)
Informes relacionados: RV07 (sincronización/overbooking, consumidor directo de las métricas de drift), RV17 (arquitectura/datos — outbox, idempotencia, estado de conector `no_conectado|bloqueado_por_partner|sandbox|producción`, aún pendiente de escribirse), RV18 (automatizaciones/agentes — límites de qué puede decidir un agente), RV19 (seguridad/privacidad/legal — marco de PII que RV20 solo aplica, no define), RV03/RV04 (capacidades y límites reales de Airbnb/Booking, fuera de este alcance).

**Principio rector del producto (no negociable):** el sistema NUNCA cancela reservas ni contacta huéspedes sin autorización humana explícita. Este módulo extiende el principio a la operación: **ninguna alerta automatiza una acción irreversible**; toda alerta termina en revisión humana o en una acción reversible y segura (ej. pausar temporalmente el push de disponibilidad hacia un canal problemático — nunca borrar ni modificar una reserva).

### Nota metodológica (leer primero)

Se buscó documentación primaria de OpenTelemetry (opentelemetry.io/docs/specs/otel) para fundamentar el diseño de trazas, métricas y logs, y se leyeron directamente (WebFetch, no resumen ajeno) seis páginas de la especificación viva: Tracing API, Metrics API, Metrics Data Model, Messaging Spans (semantic conventions), Logs Data Model, y dos páginas de convenciones generales de atributos. El presupuesto de `WebSearch` de esta sesión se agotó (200/200) tras dos intentos fallidos de buscar guía de PII en semantic conventions; se compensó yendo directo a URLs candidatas por WebFetch, dos de las cuales devolvieron HTTP 404 (URLs de convención vieja) y se sustituyeron por las vigentes. Hallazgo relevante de esa búsqueda: **OpenTelemetry no prescribe una regla de PII** en su especificación de atributos/logs (confirmado en dos páginas independientes) — la política "logs sin PII" de este módulo es, por tanto, una decisión de producto/cumplimiento propia (coherente con RV19), no un mandato externo, y se etiqueta así explícitamente en vez de atribuirle a OTel algo que no dice.

Se leyeron directamente (no resumen) los tres archivos reales de Likida (marca separada, solo lectura, patrones técnicos — nunca identidad visual ni dominio fiscal/logístico): `ci.yml`, `ESQUELETO-AUTONOMIA.md` y `correr.sh`, citados con `ruta:línea` en el ledger.

Se verificó el toolchain real de esta máquina con comandos ejecutados en esta sesión (`which docker supabase psql node npm`, `node --version`) y se leyó completo `atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md` (mediciones reales de otro investigador Sonnet en esta misma Mac) para no inventar infraestructura de entornos que no se puede probar aquí.

Convención de etiquetas de este informe (ver `docs/investigacion/00-PLAN.md` §2): `[DATO]` = leído literalmente de fuente primaria en esta sesión; `[R]` = fuente secundaria re-verificable; `[E]` = estimación/diseño propio, con su supuesto en la tabla de supuestos (§12).

Este informe no diseña el modelo de datos de outbox/idempotencia (RV17) ni las capacidades reales de las APIs de Airbnb/Booking (RV03/RV04): donde depende de ellos, se marca explícitamente "según RV17 (pendiente)" o "según RV03/RV04 (pendiente)" y no se inventa cifra.

---

## 1. Observabilidad por canal

### 1.1 Qué se mide y con qué instrumento OTel

El diseño de métricas se apoya en los tipos de instrumento definidos literalmente por la especificación de OpenTelemetry [RV20-F-04][RV20-F-05]: un Counter para eventos que solo suman, un Histogram para distribuciones (duración, tamaño), un UpDownCounter para cantidades que suben y bajan, y un Gauge asíncrono para valores no aditivos muestreados por observación.

| Métrica | Instrumento OTel | Justificación (cita) | Dimensiones (labels) |
|---|---|---|---|
| Edad de la última sincronización exitosa por cuenta de canal | Asynchronous Gauge | "reports non-additive value(s)...when the instrument is being observed" [RV20-F-05] — la edad en segundos no se suma entre cuentas, se observa por cuenta en cada scrape | `channel` (airbnb/booking/vrbo/otro), `channel_account_id`, `property_group_id` |
| Tasa de errores de sync (webhooks/polling fallidos) | Counter (numerador) sobre total de intentos | "count the number of HTTP 5xx errors" es el ejemplo textual de uso de Counter [RV20-F-04] | `channel`, `channel_account_id`, `error_class` (timeout/4xx/5xx/parse/firma_invalida) |
| Duración interna del ciclo webhook→cola→worker→escritura→confirmación | Histogram | "used to report arbitrary values that are likely to be statistically meaningful...the request duration" [RV20-F-04] | `channel`, `stage` (recepcion/encolado/procesamiento/escritura/confirmacion) |
| Profundidad de la cola de eventos pendientes | UpDownCounter | ejemplo textual: "the number of items in a queue" [RV20-F-04] | `channel`, `queue_name` |
| Drift detectado (noches donde el sistema cree "disponible" y el canal externo muestra "ocupado" o viceversa) | Counter (eventos de drift detectado) + Gauge (drift abierto actualmente, no resuelto) | drift es un evento que se cuenta al detectarse (Counter) y un estado que persiste hasta resolverse (Gauge de "drift abierto") | `channel`, `channel_account_id`, `direccion` (sistema_cree_disponible_canal_dice_ocupado / inverso) |

**Cómo se mide el drift en la práctica** [E]: una comprobación periódica (no solo al vuelo del webhook) que compara la última foto de disponibilidad que el sistema empujó/cree tener contra una lectura de solo-lectura del canal (vía iCal export del canal o vía la API si el partner lo permite, según RV03/RV04 — pendiente) para una muestra de noches próximas (ej. próximos 60 días). Una discrepancia incrementa el Counter de drift y abre el Gauge de "drift abierto" para esa noche/cuenta hasta que una siguiente comprobación confirme reconciliación. Este mecanismo de reconciliación en sí (qué hacer cuando dos canales reportan estados distintos) es diseño de RV07, no de RV20; aquí solo se define cómo se observa y se alerta.

### 1.2 Trazas distribuidas del flujo de sincronización

El flujo webhook entrante → cola → worker → escritura → confirmación se modela como **una sola traza** (mismo `TraceId`, [RV20-F-01]) con spans encadenados:

1. **Span de recepción del webhook** (SERVER): "covers server-side handling of a remote request while the client awaits a response" [RV20-F-01] — el canal externo llama, el sistema responde 200/202 rápido.
2. **Span de encolado** (PRODUCER): "describes the initiation or scheduling of a local or remote operation" que "often ends before the correlated CONSUMER span" [RV20-F-02][RV20-F-06] — se adjunta `messaging.system`, `messaging.destination.name` (nombre de la cola) y `messaging.message.id` (id del evento) [RV20-F-06], y el productor "SHOULD attach a message creation context to each message" [RV20-F-06] para que el worker continúe la misma traza en vez de abrir una nueva.
3. **Span de procesamiento del worker** (CONSUMER): "represents the processing of an operation initiated by a producer, where the producer does not wait" [RV20-F-01][RV20-F-06] — hijo remoto del span de encolado (`IsRemote=true` en su `SpanContext` heredado [RV20-F-01]).
4. **Span de escritura** (INTERNAL): la escritura en la tabla canónica de disponibilidad/reserva (dominio de RV17).
5. **Span de confirmación** (INTERNAL o CLIENT si implica un ACK saliente hacia el canal): cierre del ciclo.

Cada span termina en `Status=Ok` solo si esa etapa se confirmó; si el ciclo se corta a mitad (timeout, worker caído, error de escritura) el span correspondiente queda `Error` o `Unset` — nunca `Ok` por omisión ["Unset: The default status"; "Error: The operation contains an error"; jerarquía "Ok > Error > Unset" [RV20-F-03]]. Esto es la base técnica del principio ya registrado en `docs/LAGUNAS.md:171` (fila de responsabilidad de RV20): **un feed inaccesible o un ciclo interrumpido no significa "disponible"**, significa "estado desconocido, no tocar" — un span sin `Ok` explícito debe tratarse aguas abajo como no confirmado.

### 1.3 Logs sin PII

Regla de producto: ningún log en texto plano contiene nombre, documento de identidad o teléfono de huésped. Diseño concreto, apoyado en la separación que el propio modelo de datos de logs de OTel hace entre `Body` y `Attributes` [RV20-F-07]:

- El `Body` del log es siempre una plantilla fija parametrizada por **identificadores opacos** (`reservation_id`, `unit_id`, `channel_account_id`), nunca por texto libre que contenga el nombre del huésped: ej. `"sync completada: unidad {unit_id}, canal {channel}, reserva {reservation_id}"`.
- La correlación con la traza usa `TraceId`/`SpanId` tal como los define el modelo de logs ("Can be set for logs that are part of request processing and have an assigned trace ID"; "If SpanId is present TraceId SHOULD be also present" [RV20-F-07]) — así un incidente se investiga siguiendo la traza, sin necesidad de que el log repita datos del huésped.
- Como se documentó en el ledger (§ metodológica), **OTel no obliga esto** — es una regla de producto que se apoya en la separación Body/Attributes que la especificación sí ofrece, no en una prohibición textual de PII que la especificación no tiene [RV20-F-07][RV20-F-08][RV20-F-09]. El marco legal de qué datos de huésped existen y cómo deben protegerse es de RV19 (pendiente de consulta cruzada); RV20 solo garantiza que la tubería de logs no los reproduce en claro.
- Cualquier atributo estructurado que sí necesite un identificador de huésped (ej. para debug de un caso puntual) debe usar el mismo id opaco que usa la base de datos, resoluble solo consultando la base con los mismos controles de acceso que protegen a la tabla de huéspedes — nunca duplicado en el sistema de logs.

---

## 2. Alertas y runbooks

Cada alerta termina en **revisión humana** o en una **acción reversible y seguridad-primero** (pausar push hacia un canal). Ninguna alerta dispara cancelación de reserva ni contacto al huésped — eso requiere que un humano lo decida y lo ejecute manualmente, consistente con RV18 (pendiente) sobre qué puede/no puede decidir un agente.

| Métrica (§1.1) | Umbral de alerta [E] | Severidad | Runbook (qué hace el humano de guardia) |
|---|---|---|---|
| Edad de última sync exitosa por cuenta | > 3x el ciclo esperado de ese canal/método (ej. si Airbnb sincroniza iCal cada ~horas según RV03 (pendiente), alertar tras 3 ciclos sin éxito) | Alta si hay reservas activas en los próximos 14 días para esa cuenta; media si no | 1) Confirmar si es un problema del canal externo (estado público del partner, si existe) o del propio conector. 2) Si es ambiguo o del canal: **pausar el push de disponibilidad automático hacia esa cuenta** (acción reversible, no borra nada) y dejar el calendario en modo "última disponibilidad conocida, marcada como no confirmada" en la UI. 3) Nunca cancelar reservas existentes ni contactar al huésped como respuesta. 4) Documentar el incidente y reanudar el push manualmente tras confirmar que el canal respondió normal de nuevo. |
| Tasa de errores de sync | > 5% de intentos fallidos en ventana de 15 min, o cualquier error de clase `firma_invalida`/`token_revocado` | Alta | 1) Si es `token_revocado` o `bloqueado_por_partner`: reflejar el estado del conector como tal (según diseño de estado de RV17 — pendiente) en vez de reintentar indefinidamente. 2) Iniciar el runbook de reconexión OAuth (§9) — requiere acción humana del administrador dueño de la cuenta del canal, nunca automatizable (las credenciales pertenecen al humano). 3) Si es error transitorio (5xx/timeout): dejar que el backoff automático reintente; escalar a humano solo si persiste tras el umbral de tiempo. |
| Drift detectado (Counter incrementando) | Cualquier drift nuevo en una noche dentro de los próximos 30 días con reserva confirmada de por medio | Crítica | 1) El drift NUNCA se resuelve borrando o modificando una reserva automáticamente. 2) Congelar (pausar) escritura automática de disponibilidad hacia el canal en conflicto para esa unidad. 3) Presentar el conflicto al administrador en la UI del calendario (RV09, pendiente) con ambas versiones (lo que el sistema cree, lo que el canal muestra) para que decida manualmente. 4) Solo tras decisión humana se reanuda la escritura automática. |
| Drift abierto (Gauge > 0 sostenido) | Sin resolver por más de 2 horas | Alta (escalamiento del anterior) | Igual que el anterior; escalar el canal de aviso (ej. de panel a notificación directa) si sigue abierto — pero la acción de fondo sigue siendo la misma: pausa reversible + revisión humana, nunca acción sobre la reserva. |
| Profundidad de cola sostenidamente creciente | Crecimiento sin drenar por > 10 min | Alta | 1) Verificar salud de los workers (¿mueren a mitad de proceso? ver §5). 2) Si los workers están caídos, reiniciarlos manualmente o vía el runbook de despliegue; el diseño de idempotencia (RV17, pendiente) debe garantizar que reprocesar la cola no duplica reservas. 3) Nunca vaciar la cola sin procesar como "solución" — eso pierde cierres de disponibilidad pendientes. |
| Latencia interna del ciclo (Histogram, p95) | Ver §3 (SLO interno) | Media/Alta según cuánto exceda el SLO | 1) Revisar qué etapa del span (§1.2) concentra la latencia. 2) Si es la etapa de escritura: revisar salud de la base de datos (posible migración en curso, contención — ver §6). 3) Si es la etapa de confirmación hacia el canal: no es del control de RV20 — anotar como posible señal de RV03/RV04 (pendiente), no autoescalar como incidente propio. |

**Regla transversal de runbook:** toda acción del humano de guardia queda registrada (quién, cuándo, qué decidió) — el mismo patrón de "estado durable entre corridas" verificado en Likida (`registro.jsonl` [RV20-F-12]) aplicado aquí a un log de decisiones de guardia, para que una alerta repetida no se resuelva dos veces de forma contradictoria y para que exista rastro auditable ante RV21 (pruebas/aceptación).

---

## 3. SLOs internos vs. dependencias externas

Distinción explícita y no negociable: **SLO interno** = lo que este sistema controla (tiempo de su propia API, tiempo de su propio worker). **Disponibilidad/latencia de las APIs de canal** (Airbnb/Booking/etc.) = **no la controla este módulo**, pertenece a RV03/RV04 y se marca "según RV03/RV04 (pendiente)" — no se inventa un SLA de un tercero.

| SLO interno propuesto | Valor [E] | Razonamiento explícito |
|---|---|---|
| Latencia de recepción del webhook (span SERVER, §1.2, etapa `recepcion`) | p95 < 500 ms [E] | El único trabajo de esta etapa es validar firma/autenticidad y encolar; no debe hacer I/O de escritura síncrona. 500 ms es generoso para eso y dentro de lo que la mayoría de canales toleran antes de reintentar el webhook como "fallido" — evita que el propio sistema provoque reintentos duplicados del lado del canal por lentitud propia (riesgo: sin cifra pública de timeout de webhook de Airbnb/Booking verificada en esta sesión — según RV03/RV04, pendiente — 500 ms es un margen conservador frente a timeouts típicos de integraciones HTTP de 5-30s, no una cifra tomada de documentación del canal).
| Latencia interna total del ciclo webhook→escritura→confirmación (histograma completo) | p95 < 5 s, p99 < 15 s [E] | Es la métrica que más directamente protege contra overbooking: cuanto más tiempo pase entre "el canal A vendió una noche" y "el canal B deja de ofrecerla", más ancha es la ventana de doble venta. 5 s en p95 es agresivo pero alcanzable si la escritura es una transacción simple sobre una tabla indexada (sin llamada de red saliente síncrona en el camino crítico); 15 s en p99 da margen para picos de carga sin sobre-diseñar para el peor caso raro. Este SLO es sobre el **camino interno**, no incluye el tiempo que tarda el canal externo en reflejar el push saliente (eso es RV03/RV04, pendiente).
| Tiempo de procesamiento del worker por evento (etapa `procesamiento`, Histogram) | p95 < 2 s [E] | Un worker que tarda más de eso por evento individual probablemente está haciendo I/O evitable (llamada síncrona a un canal externo dentro del worker, en vez de encolar esa llamada aparte); 2s es un techo que, si se cruza sistemáticamente, es señal de rediseño, no de tolerancia.
| Disponibilidad de la API propia (lectura de calendario para la UI) | 99.9% mensual (~43 min de downtime/mes) [E] | Es una cifra estándar de industria para un servicio interno de tamaño pequeño-mediano, elegida (no inventada arbitrariamente) porque el caso ancla (10-20 unidades, guardia no 24/7) no justifica pagar el costo de ingeniería de 99.99% (multi-región activa-activa) cuando el modo degradado de solo-lectura (§10) ya cubre el escenario más costoso (caída de la base primaria). Se prefiere invertir ese esfuerzo en robustez del pipeline de sync antes que en alta disponibilidad de la capa de lectura.
| Disponibilidad/latencia de la API de Airbnb, Booking, Vrbo | **Según RV03/RV04 (pendiente) — no se fija SLO propio sobre infraestructura ajena.** | Fuera de alcance: este módulo no controla el uptime del canal externo. Lo único que RV20 controla es la reacción del sistema propio ante la indisponibilidad del canal (§1.2, §2): tratar "canal no responde" como "estado desconocido", no como "disponible".

---

## 4. Backups y restauración

- **Frecuencia y retención [E]:** backup completo diario + WAL/binlog continuo (point-in-time recovery) para minimizar la ventana de pérdida de datos ante un restore; retención de 35 días en almacenamiento de backups más 12 meses de backups mensuales para retención de cumplimiento/auditoría. Justificación: 35 días cubre el caso de que un problema (drift silencioso, corrupción de datos) se detecte semanas después de introducido, algo plausible dado que el drift solo se percibe cuando la reconciliación periódica lo detecta (§1.1), no al instante.
- **Un backup no probado no es un backup:** se define una prueba de restauración periódica (mensual, en un entorno aislado — ver §8 dev/staging de esta máquina) que restaura el backup más reciente a una base separada y corre un conjunto mínimo de verificaciones automáticas (conteo de filas por tabla clave, integridad referencial, una reserva conocida de prueba recuperable) antes de considerar el backup "válido". Un backup que falla esta prueba genera una alerta de severidad alta — el mismo tratamiento que un drift crítico (§2), porque un backup roto descubierto solo durante un desastre real es el peor momento posible para descubrirlo.
- **Riesgo específico de la tabla de eventos/outbox al restaurar desde backup:** si el backup restaurado incluye eventos del outbox que ya habían sido procesados y confirmados hacia los canales *después* del punto de backup, reproducir el outbox tras el restore puede reenviar cierres de disponibilidad o intentos de escritura duplicados hacia canales externos — riesgo de reservas "fantasma" (una reserva que el sistema cree existente porque el evento se reprocesó, pero que ya fue cancelada o modificada después del punto de backup) o de duplicados (un mismo evento de "cerrar noche" empujado dos veces). La mitigación correcta depende del diseño de idempotencia del outbox (claves de idempotencia, número de secuencia por evento, marca de "ya confirmado hacia el canal X") que es responsabilidad de **RV17 (pendiente)** — este módulo no rediseña ese modelo de datos, pero establece el requisito operativo: **todo restore de backup debe ir seguido de una fase de reconciliación de drift (§1.1) contra los canales reales antes de reanudar el push automático**, precisamente porque el restore mismo puede haber introducido drift.

---

## 5. Recuperación ante crash y replay

Escenario: el worker que procesa un webhook de reserva muere a mitad de proceso (entre "leyó el evento de la cola" y "confirmó la escritura + el cierre de disponibilidad en otros canales").

- **Qué debe garantizar el diseño (dependencia de RV17, no rediseñada aquí):** el evento no debe considerarse "consumido" de la cola hasta que la escritura y su outbox de salida (los cierres pendientes hacia otros canales) queden confirmados de forma atómica o cuasi-atómica; si el worker muere antes de eso, el evento debe volver a estar disponible para reprocesamiento (visibilidad/redelivery de la cola) y el reprocesamiento debe ser **idempotente**: reprocesar el mismo evento dos veces no debe crear una segunda reserva ni un segundo cierre de disponibilidad duplicado. Esto depende del patrón de outbox/idempotencia que RV17 debe definir (clave de idempotencia por evento, tabla de outbox con estado de envío por canal, deduplicación en la escritura).
- **Qué observa RV20 de ese proceso (sí es su responsabilidad):** el span de procesamiento del worker (§1.2, CONSUMER) que nunca llegó a `Status=Ok` es la señal operativa de que el evento no se completó; la métrica de profundidad de cola (§1.1) debe reflejar que el mensaje volvió a estar pendiente, no que se perdió; y el runbook de guardia (§2, fila de "cola creciente") es el que un humano sigue si los reintentos automáticos no logran drenar la cola — sin que eso implique tocar manualmente reservas o outbox a mano sin entender primero por qué el worker murió.
- **Qué NO hace RV20:** no define el esquema de la tabla de idempotencia ni el mecanismo exacto de "exactly-once lógico sobre entrega at-least-once" — eso es RV17. RV20 solo exige que ese mecanismo exista y que sea observable (trazas y métricas que permitan confirmar, tras un crash, si el reproceso fue limpio o si quedó un evento en estado ambiguo que requiere revisión humana).

---

## 6. Migraciones seguras

El calendario nunca puede quedar en un estado "no sé si está disponible" durante un despliegue. Patrón adoptado: **expand/contract** (también conocido como parallel change), nunca una migración que bloquee la tabla de reservas/disponibilidad en horario pico:

1. **Expand:** añadir la columna/tabla nueva sin quitar ni renombrar nada existente; el código viejo y el nuevo conviven, ambos siguen escribiendo/leyendo lo que ya conocían.
2. **Migrar datos** en el fondo, en lotes pequeños (nunca un `UPDATE` masivo de una sola transacción larga sobre la tabla de reservas), verificando que no se mantenga un lock exclusivo prolongado.
3. **Cambiar el código** para leer/escribir la columna/tabla nueva, con feature flag (§7) para poder revertir el comportamiento sin un segundo despliegue si algo sale mal.
4. **Contract:** solo después de confirmar que el nuevo camino es estable en producción (ventana de observación, no inmediato), quitar la columna/código viejo en un despliegue separado y de bajo riesgo.
- Ninguna migración de `ALTER TABLE` bloqueante larga se corre en horario pico [E: horario pico definido por el patrón de check-in/check-out del caso ancla, ej. tarde-noche; las migraciones se agendan en ventanas de baja actividad de reservas, aunque el sistema en sí debe seguir disponible 24/7 porque los canales externos no respetan huso horario del anfitrión].
- Toda migración de una tabla con volumen (reservas, eventos/outbox) se valida primero contra `embedded-postgres` en el entorno de integración de esta máquina (§8) antes de aplicarse a staging/producción, precisamente porque ahí sí se puede medir contención/locks reales (a diferencia de PGlite, que serializa todo — ver §8).

---

## 7. Feature flags

Patrón: activar/desactivar funcionalidad nueva (un canal nuevo, un agente LLM nuevo) sin desplegar código, con **default apagado** para cualquier funcionalidad sensible (dinero, cancelaciones, contacto a huéspedes) — inspirado en el patrón de otra línea de producto interna: `atiende-hoteles-staging/docs/referencia/01-blueprint-y-decision-llm.md:326`, **BP-163**, que exige "compliance codificado por plaza y país... con flags apagados por defecto (facial, outbound EE.UU., índice de destino)" y cuyo criterio de aceptación es "Flags de features sensibles verificados como `false` por defecto en configuración". Se cita como referencia interna de otra línea de producto (Hoteles), no como fuente externa autoritativa — el patrón (default seguro = apagado, verificado en configuración) es directamente portable a rentas vacacionales.

Aplicación concreta a RV20:

| Flag (ejemplo) | Default | Quién lo activa | Nota |
|---|---|---|---|
| Nuevo canal en modo escritura (push de disponibilidad activo) | Apagado (solo lectura/observación hasta aprobar) | Humano administrador, tras validar en sandbox del canal | Un canal nuevo entra primero en modo "solo observar drift", nunca empujando cierres reales |
| Agente LLM nuevo con capacidad de sugerir acciones sobre el calendario | Apagado | Humano, y aun activado solo puede *sugerir*, nunca ejecutar cierre/cancelación (ver RV18, pendiente) | Coherente con "nunca cancela ni contacta sin autorización" |
| Cualquier flag que toque cobro, cancelación o contacto directo al huésped | Apagado por defecto, sin excepción | Requiere aprobación explícita registrada (mismo patrón de auditoría de decisiones de §2) | Refleja BP-163 aplicado a este dominio |
| Push automático de disponibilidad hacia una cuenta de canal específica pausado por alerta (§2) | Se apaga automáticamente ante alerta crítica de drift/token revocado | El sistema lo apaga (acción reversible y seguridad-primero); solo un humano lo reactiva | Es la única "automatización" de un flag que este módulo permite: apagar, nunca activar solo, y nunca sobre acciones irreversibles |

---

## 8. Entornos (dev, staging, producción) — verificados en esta máquina

Se verificó el toolchain real de esta Mac en esta sesión: `docker`, `supabase` (CLI) y `psql` **no están instalados** como binarios de sistema; `node` (`/opt/homebrew/bin/node`, v25.6.1) y `npm` (`/opt/homebrew/bin/npm`) sí lo están [DATO, verificado con `which`/`node --version` en esta sesión]. Esto coincide con lo medido por el investigador Sonnet de `atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md`, que además confirma con experimentos reales en esta misma Mac: PGlite funciona para lógica/RLS pero **serializa toda concurrencia** (medido **1344 ms** [DATO, medido en `07-stack-viabilidad.md`] en una prueba que debería tomar ~300 ms si hubiera paralelismo real); `embedded-postgres` (Postgres 18.4 real empaquetado vía npm) sí da concurrencia real entre conexiones (medido **302 ms** [DATO, medido en `07-stack-viabilidad.md`]), pero corre bajo Rosetta 2 en esta Mac (el log del proceso reporta el slice `x86_64-apple-darwin24.6.0` aunque la máquina es arm64); y Playwright puede conducir el Chrome del sistema (`channel: 'chrome'`) sin descargar navegadores propios.

Diseño de entornos realista sobre esa base, sin inventar infraestructura no probada aquí:

- **Dev (esta máquina, sin Docker):**
  - Persistencia: `embedded-postgres` para cualquier prueba que necesite concurrencia real (contención de escritura sobre disponibilidad, locks, idempotencia bajo carrera) — es el único motor en esta máquina que lo demuestra (302 ms medido); PGlite se reserva para pruebas unitarias rápidas de lógica/RLS donde la concurrencia no es la variable bajo prueba.
  - **Simuladores de canal etiquetados explícitamente como simulador**: cada conector de canal (Airbnb/Booking/Vrbo) tiene, en dev, una implementación *simulador* con nombre inequívoco en código y configuración (ej. `AirbnbChannelSimulator`, nunca solo `AirbnbChannel` con un flag oculto) que sirve fixtures grabados (payloads de webhook reales capturados y anonimizados, no generados a mano de forma optimista) — el requisito no negociable es que **nunca pueda confundirse con producción**: distinto nombre de clase/módulo, distinta URL base obviamente falsa (ej. `simulador.local`), y una comprobación de arranque que se niegue a correr si las credenciales configuradas parecen de producción real.
  - E2E: Playwright con `channel: 'chrome'` contra el Chrome ya instalado en esta Mac (confirmado que funciona sin descargar binarios propios), sirviendo el backend Node/TS local contra `embedded-postgres`.
  - CI local: orden de gates inspirado directamente en el patrón verificado de Likida [RV20-F-10] — instalar con lockfile exacto (`npm ci`), auditoría de dependencias bloqueante solo para runtime (no tooling), typecheck y lint, tests deterministas offline (sin llamar a ningún canal real ni a los simuladores por red, solo lógica), tests con umbral de cobertura, y un smoke E2E final contra un build real, sin secretos de canal reales — igual que el smoke de Likida arranca su propio servidor y visita solo rutas públicas antes de considerar el build sano.
- **Staging (integración pendiente, no completa en esta máquina):** requiere Docker/Supabase real para paridad de contrato HTTP (PostgREST/GoTrue) según lo que ya documentó el investigador de stack-viabilidad como pendiente — RV20 no repite esa investigación, la hereda. Lo que sí es responsabilidad de RV20 en staging: los simuladores de canal se sustituyen por **sandboxes reales del partner** (cuando el canal los ofrece, según RV03/RV04 — pendiente) o se mantiene el simulador pero con un banner/flag explícito de "staging, no producción" visible en cualquier panel de operación, para que nadie confunda una alerta de staging con un incidente real.
- **Producción:** los mismos simuladores **no existen**; solo credenciales reales de canal (gestión de secretos, §9) y el mismo pipeline de observabilidad de §1-§2, con el requisito adicional de que las alertas de producción y de staging estén visualmente/canalmente separadas (ej. distinto canal de notificación) para que la guardia humana nunca actúe sobre una alerta de staging pensando que es producción, ni al revés.

---

## 9. Gestión de secretos y tokens de canal

- **Almacenamiento:** credenciales OAuth (client id/secret, refresh/access tokens) por cuenta de canal se almacenan cifradas en reposo, nunca en el código ni en logs (coherente con §1.3), con acceso de lectura restringido al proceso del conector, no a humanos vía consola directa salvo un flujo de "romper cristal" auditado.
- **Rotación:** los tokens de acceso de corta vida se refrescan automáticamente vía el refresh token antes de expirar (ventana de refresco con margen, no esperar al último minuto); el refresh token en sí tiene su propia política de rotación/expiración según lo que el partner exija (según RV03/RV04 — pendiente, no se inventa aquí un ciclo de expiración de Airbnb/Booking que no se ha verificado).
- **Qué pasa cuando un token expira o es revocado por el partner:** esto debe reflejarse como un **estado honesto del adaptador**, no como un error genérico de red — depende directamente del diseño de estado de conector que RV17 debe definir (`no_conectado|bloqueado_por_partner|sandbox|producción`, mencionado ahí como dependencia, no rediseñado aquí). RV20 exige que ese estado sea observable: un token revocado debe transicionar el conector a `bloqueado_por_partner` (o el estado equivalente que RV17 defina), disparar la alerta correspondiente (§2, fila de errores de sync con clase `token_revocado`) y **pausar el push automático hacia ese canal** hasta que un humano reconecte la cuenta manualmente (flujo OAuth normal, no una automatización que reintente credenciales indefinidamente — reintentar contra un token ya revocado es ruido, no recuperación).
- **Runbook de reconexión (humano):** 1) confirmar en el estado del conector que es `bloqueado_por_partner` y no un error transitorio; 2) el administrador dueño de la cuenta de canal repite el flujo de autorización OAuth; 3) el sistema verifica el nuevo token contra una llamada de bajo riesgo (lectura, no escritura) antes de reanudar el push automático; 4) solo entonces se reanuda, y se registra el evento de reconexión en el mismo log de decisiones de guardia de §2.

---

## 10. Disaster recovery

- **Qué se prueba:** (a) restauración de backup con verificación automática (§4), mensual; (b) failover de lectura a réplica cuando la primaria de escritura no responde, trimestral (simulacro controlado, no solo teórico); (c) el runbook completo de "canal revocado" (§9) y "drift crítico" (§2), como parte de un simulacro semestral que ejercita al humano de guardia real, no solo al código.
- **Modo degradado seguro si la base principal cae [E]:** el calendario puede seguir **mostrándose en modo solo-lectura desde una réplica** (si existe una réplica de lectura configurada — esto es una decisión de infraestructura que depende de qué motor de base de datos soporte staging/producción, fuera del alcance de "esta máquina sin Docker" cubierto en §8) mientras se recupera la capacidad de escritura. En modo solo-lectura: (1) la UI se marca explícitamente como "datos de disponibilidad pueden estar desactualizados, escritura pausada" — nunca se oculta que es un modo degradado; (2) **todo push saliente de disponibilidad hacia los canales se pausa** (no se puede escribir de forma confiable durante la degradación, y escribir con datos potencialmente desactualizados es peor que no escribir) — la misma filosofía de "estado desconocido, no tocar" de §1.2 aplicada a un desastre de infraestructura, no solo a un fallo de canal; (3) ninguna reserva se cancela ni se contacta a huéspedes como parte de la recuperación — el modo degradado protege contra escribir mal, no habilita ninguna acción nueva sobre reservas.
- **Por qué este diseño y no otro [E]:** para el caso ancla (10-20 unidades, sin equipo de guardia 24/7 dedicado), invertir en una arquitectura activa-activa multi-región no se justifica frente al costo de ingeniería; lo que sí se justifica, porque protege directamente contra el peor escenario del producto (overbooking silencioso), es garantizar que una caída de la base de escritura se traduzca en "pausa visible y admitida", nunca en "el sistema sigue aceptando cambios con datos que ya no confía en sí mismo".

---

## Riesgos/límites

1. Este módulo depende de decisiones de RV17 (modelo de outbox/idempotencia, estado del conector) que aún no están escritas; los SLOs y runbooks aquí definidos son consistentes con ese diseño pendiente, pero no pueden validarse en código real hasta que RV17 exista.
2. La medición de drift (§1.1) requiere poder leer el estado real del canal externo de forma independiente al propio push del sistema (vía iCal export del canal o API de lectura) — su viabilidad concreta por canal depende de RV03/RV04 (pendiente); si un canal no ofrece ninguna vía de lectura independiente, el drift de ese canal específico no puede detectarse proactivamente, solo reactivamente (cuando un huésped o el propio canal reportan un conflicto).
3. Ningún experimento de esta sesión ni de `07-stack-viabilidad.md` valida Supabase real (PostgREST/GoTrue), por lo que el diseño de staging de §8 tiene una brecha de paridad de contrato HTTP no resuelta en esta máquina.
4. La política de "logs sin PII" (§1.3) es una decisión de producto sin mandato externo de OTel — su cumplimiento depende de disciplina de implementación (nunca interpolar datos de huésped en el `Body`), no de una garantía automática de la herramienta de observabilidad.
5. `embedded-postgres` corre bajo Rosetta 2 en esta Mac [DATO, medido en `07-stack-viabilidad.md`]; si se usa como motor de pruebas de migración/concurrencia en un CI local frecuente, su costo de CPU/arranque debe vigilarse (riesgo ya señalado por el investigador de stack-viabilidad, heredado aquí sin resolver).
6. Los patrones de Likida citados (§ CI, kill switch, registro jsonl) son de un dominio distinto (liquidación fiscal/logística de flotas); se adaptaron por su mecánica operativa, pero no fueron diseñados pensando en calendarios de disponibilidad multi-canal — su portabilidad exacta debe revalidarse cuando exista código real de RV20 que implementar.

---

## Implicaciones para requisitos

- **RV20-R-01.** El sistema debe exponer, por cuenta de canal, un Gauge de "edad de última sincronización exitosa" y un Counter de "tasa de errores de sync" con dimensión `error_class`, siguiendo los tipos de instrumento definidos por la especificación de métricas de OpenTelemetry [RV20-F-04][RV20-F-05].
- **RV20-R-02.** Todo ciclo de sincronización (webhook→cola→worker→escritura→confirmación) debe instrumentarse como una traza única con spans PRODUCER/CONSUMER en el cruce cola-worker, propagando el contexto de traza en el mensaje encolado, según el patrón de convenciones de mensajería de OpenTelemetry [RV20-F-01][RV20-F-02][RV20-F-06].
- **RV20-R-03.** Ningún log del sistema debe interpolar nombre, documento de identidad o teléfono de huésped en el campo `Body`; toda referencia a un huésped en logs debe hacerse por identificador opaco, resoluble solo contra la base de datos con los mismos controles de acceso que la protegen.
- **RV20-R-04.** Ninguna alerta definida en este módulo puede disparar, directa o indirectamente, la cancelación de una reserva o el contacto a un huésped; el único efecto automatizable de una alerta es pausar el push de disponibilidad hacia un canal específico (acción reversible), nunca una escritura destructiva.
- **RV20-R-05.** Se debe definir y medir un SLO interno de latencia del ciclo de sincronización (propuesto: p95 < 5 s) exclusivamente sobre el camino que el sistema controla; ninguna comunicación de producto o contrato con clientes debe presentar como SLA propio la disponibilidad o latencia de las APIs de Airbnb/Booking/Vrbo, que quedan explícitamente fuera de este módulo (RV03/RV04, pendiente).
- **RV20-R-06.** Debe existir una prueba de restauración de backup automatizada y periódica (propuesta: mensual) que falle de forma visible (misma severidad que un drift crítico) si el backup restaurado no pasa verificaciones mínimas de integridad.
- **RV20-R-07.** Todo restore de backup en producción debe ir seguido obligatoriamente de una fase de reconciliación de drift contra los canales reales antes de reanudar cualquier push automático de disponibilidad, por el riesgo de outbox reproducido de forma no idempotente (dependencia directa de RV17).
- **RV20-R-08.** El reprocesamiento de un evento de webhook tras un crash del worker debe ser idempotente end-to-end (no solo en la escritura de base de datos, sino en el efecto hacia canales externos); RV20 exige que este comportamiento sea observable vía trazas/métricas, pero el mecanismo mismo es responsabilidad de RV17.
- **RV20-R-09.** Toda migración de esquema sobre tablas de reservas/disponibilidad/eventos debe seguir el patrón expand/contract; ninguna migración que tome un lock exclusivo prolongado puede ejecutarse en horario de check-in/check-out del caso ancla.
- **RV20-R-10.** Toda funcionalidad nueva que module dinero, cancelaciones o contacto a huéspedes debe controlarse por feature flag con default `false`, verificable en configuración — mismo criterio de aceptación que BP-163 en la línea de producto de Hoteles, adoptado aquí como requisito propio.
- **RV20-R-11.** Los simuladores de canal usados en desarrollo deben llevar nombre/identificador inequívoco de "simulador" en código y configuración, y el arranque debe rechazarse si las credenciales configuradas parecen de producción real, para eliminar el riesgo de confundir un entorno simulado con uno real.
- **RV20-R-12.** El estado de un token de canal expirado o revocado por el partner debe reflejarse en el estado del conector (dependencia de RV17: `no_conectado|bloqueado_por_partner|sandbox|producción`) y pausar automáticamente el push hacia ese canal hasta reconexión manual del humano dueño de la cuenta — nunca reintentar indefinidamente contra credenciales ya revocadas.
- **RV20-R-13.** Debe existir un modo de degradación de solo-lectura del calendario (desde réplica) cuando la base de escritura primaria no responde, con pausa automática de todo push saliente durante ese modo y señalización visible en la UI de que los datos pueden estar desactualizados.

---

## Lagunas

| Afirmación/dato pendiente | Por qué quedó pendiente | Fuente esperada para cerrarlo | Fila de LAGUNAS.md relacionada |
|---|---|---|---|
| Regla explícita de OTel sobre PII en atributos/logs | Se verificó directamente (dos páginas de semantic conventions) que la especificación no la tiene; no es una laguna de investigación sino un hallazgo negativo confirmado | No aplica — se declara como decisión de producto propia, no como dato externo por confirmar | N/A (hallazgo cerrado, no pendiente) |
| Timeout real de webhook / tolerancia a latencia de Airbnb, Booking antes de considerar el webhook fallido | Fuera de alcance de RV20 (pertenece a las capacidades documentadas o no documentadas de cada canal) | Documentación oficial de Airbnb/Booking sobre webhooks (RV03/RV04) | No hay fila específica en LAGUNAS.md; se sugiere añadirla bajo la sección de webhooks de cada canal |
| Vía de lectura independiente del estado real de disponibilidad por canal (para medir drift sin depender del propio push) | Depende de qué expone cada canal en modo lectura (API o iCal), no verificado en esta sesión | RV03/RV04 | `docs/LAGUNAS.md:171` (responsabilidad conjunta RV07/RV20, ya registrada) |
| Paridad de Supabase real (PostgREST/GoTrue) para staging | Ya documentada como pendiente por el investigador de stack-viabilidad; RV20 la hereda sin resolverla | Prueba con Docker/proyecto Supabase remoto real | No existe fila específica en LAGUNAS.md; es una laguna de infraestructura, no de investigación de canal |
| Ciclo de expiración/rotación real de refresh tokens de Airbnb/Booking | No se investigó en esta sesión (fuera del alcance de OTel/Likida); no se debe inventar | Documentación oficial de OAuth de cada partner (RV03/RV04) | Sugerir fila nueva en LAGUNAS.md bajo "Credenciales/sandbox/producción" de cada canal |
| Cobertura de fuentes por debajo del mínimo de 25 URLs del plan (§1.3 de `00-PLAN.md`) | Presupuesto de `WebSearch` agotado (200/200); la sesión priorizó profundidad sobre 6 páginas vivas de la especificación de OpenTelemetry más lectura directa de código interno, en vez de amplitud de fuentes externas adicionales | Sesión adicional con presupuesto de búsqueda disponible, si se requiere ampliar más allá de OTel/Likida | No aplica — declarado en la sección "Fuentes de este módulo" |

---

## Supuestos

| Supuesto | Valor usado | Lógica/fórmula | Módulo(s) que lo consumen | Cómo se reemplaza por dato real |
|---|---|---|---|---|
| Caso ancla de guardia humana | 10-20 unidades, 3 canales, guardia de horario extendido no 24/7 dedicado | Define la exigencia de SLO (§3) y la elección de no invertir en alta disponibilidad multi-región (§10) | RV20 (este módulo), RV21 | Reemplazar con datos reales de segmentación de RV01 cuando exista |
| Umbral de alerta de "edad de última sync" en 3x el ciclo esperado | 3x | Evita falsos positivos por variabilidad normal del ciclo, sin tardar tanto en alertar que el drift crezca sin control | RV20-R-01 | Ajustar empíricamente una vez que existan datos reales de variabilidad del ciclo por canal |
| SLO interno p95 < 5s / p99 < 15s del ciclo completo | 5s / 15s | Balance entre "agresivo para minimizar ventana de overbooking" y "alcanzable sin I/O síncrona innecesaria en el camino crítico" (§3) | RV20-R-05 | Revisar tras medir el ciclo real en staging/producción con carga representativa |
| Retención de backups: 35 días + 12 meses mensual | 35 días / 12 meses | 35 días cubre detección tardía de drift/corrupción; 12 meses cubre auditoría/cumplimiento básico | RV20-R-06, RV20-R-07 | Ajustar según requisito legal específico que determine RV19 |
| Disponibilidad de API propia: 99.9% mensual | 99.9% | Cifra estándar de industria para servicio interno de este tamaño, elegida para no sobre-invertir frente al costo de multi-región (§3, §10) | RV20-R-05 | Revisar cuando exista compromiso contractual real con clientes enterprise (RV21) |
| Prueba de restauración de backup: mensual; failover de réplica: trimestral; simulacro completo: semestral | mensual/trimestral/semestral | Frecuencia decreciente según costo/riesgo: restaurar un backup es barato y rápido de probar; un failover real de infraestructura es más costoso de simular; un simulacro completo que incluya al humano de guardia es el más costoso y menos frecuente pero el más realista | RV20-R-06, §10 | Ajustar según capacidad real del equipo cuando exista |

---

## Fuentes de este módulo

Fecha de consulta de todas las fuentes: 2026-09-05. Total: 6 URLs externas (por debajo del mínimo de 25 del plan — declarado explícitamente, no por pereza: el presupuesto de `WebSearch` de la sesión se agotó y la investigación se enfocó en profundidad sobre la especificación viva de OpenTelemetry en vez de en amplitud de fuentes, complementada con lectura directa de código/documentación interna verificable de primera mano — ver Nota metodológica al inicio de este documento).

**Especificación de OpenTelemetry (trazas, métricas, logs, convenciones):**
- https://opentelemetry.io/docs/specs/otel/trace/api/ — RV20-F-01, RV20-F-02, RV20-F-03
- https://opentelemetry.io/docs/specs/otel/metrics/api/ — RV20-F-04, RV20-F-05
- https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ — RV20-F-06
- https://opentelemetry.io/docs/specs/otel/logs/data-model/ — RV20-F-07
- https://opentelemetry.io/docs/specs/semconv/general/naming/ — RV20-F-08
- https://opentelemetry.io/docs/specs/semconv/general/attributes/ — RV20-F-09

**Documentación/código interno de referencia (no URL pública, citado por ruta:línea — ver ledger `docs/fuentes/rv17-18-20.md`):**
- `atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md` (mediciones reales de stack sin Docker)
- `atiende-hoteles-staging/docs/referencia/01-blueprint-y-decision-llm.md` (BP-163, patrón de feature flags)
- `audit-likida/.github/workflows/ci.yml` — RV20-F-10
- `audit-likida/scripts/mejora-diaria/ESQUELETO-AUTONOMIA.md` — RV20-F-11
- `audit-likida/scripts/mejora-diaria/correr.sh` — RV20-F-12

Fin del informe RV20. Siguiente paso sugerido: escribir RV17 (arquitectura/datos — outbox, idempotencia, estado del conector) para poder validar en código real los requisitos RV20-R-07, RV20-R-08 y RV20-R-12 que hoy dependen de un diseño aún no escrito.
