# RV07 — Sincronización multi-canal y overbooking

Investigador: Sonnet (subagente), sesión Fable 5.1. Consulta de fuentes: 2026-09-05. Ledger de evidencia: `docs/fuentes/rv06-07.md`. Este módulo se apoya en los hechos de RV06 (`docs/investigacion/RV06-ical-rfc5545.md`), en particular: `DTEND` exclusivo, `UID`/`SEQUENCE` como claves de versión, ausencia de límites de tamaño en RFC 5545, y las frecuencias de sync documentadas por Airbnb y Vrbo.

## Resumen ejecutivo

**Corrección 2026-09-05 (hallazgo "Alta" de la auditoría independiente):** la versión previa de este módulo cubría solo el eje iCal y no mencionaba el eje API/webhook ni consumía `docs/LAGUNAS.md`, pese a que el plan de investigación (`00-PLAN.md` §5) asigna ambos ejes a RV07. La sección 0 (nueva) consolida lo ya verificado por RV03/RV04/RV05 sobre webhook vs. polling por canal, y las secciones 3.1 y 7 referencian filas concretas de `docs/LAGUNAS.md`. Conclusión de esa consolidación: **ningún canal (Airbnb, Booking.com, Vrbo, ni "otros") tiene un mecanismo push/webhook confirmado por fuente oficial propia**; Booking.com es el único con un modelo de polling documentado con precisión (20s + ack); el resto debe tratarse como polling con latencia de horas o no documentada.

El calendario iCal por canal es un mecanismo de **cierre de disponibilidad por polling periódico**, no un bus de eventos en tiempo real: Airbnb documenta que su calendario "automatically updates every 3 hours" al consumir feeds importados, y Vrbo documenta "Calendars sync every 30 minutes" en su app móvil (con hasta 20 minutos adicionales para que un evento importado aparezca en el dashboard web). Ninguna fuente primaria de Booking.com pudo leerse (403 al intentar acceder a `partner.booking.com`/`partnerhelp.booking.com`), así que su frecuencia queda como laguna explícita — **no se inventa un número**. Esta latencia externa, no controlada por nuestro sistema, define una **ventana residual de doble reserva** que ningún diseño interno puede cerrar del todo: aunque nuestra propia sincronización sea instantánea, el canal remoto solo leerá nuestro export en su propio ciclo. El diseño de RV07 debe: (1) tener una única fuente de verdad interna; (2) exportar un feed propio por unidad/canal y detectar y descartar el "eco" de nuestros propios bloqueos al reimportar; (3) deduplicar por `UID+SEQUENCE`+hash de contenido; (4) resolver conflictos por capas de razón de bloqueo (reserva > bloqueo de dueño > mantenimiento) sin nunca reabrir una noche ocupada por otra causa al procesar una cancelación; (5) tratar un feed vacío/inaccesible/malformado como señal de error, nunca como "disponibilidad total", con cuarentena y alerta; y (6) comunicar honestamente al usuario que la ventana de doble reserva vía iCal existe y está acotada por la latencia documentada del canal remoto, no por nuestro sistema.

## 0. Eje API/webhook por canal (corrección "Alta" 2026-09-05 — complemento explícito al eje iCal)

**Hallazgo de la auditoría independiente que motiva esta sección:** la versión previa de este módulo cubría exclusivamente el eje iCal/polling y no mencionaba en ningún punto el eje API/webhook, pese a que `docs/LAGUNAS.md` asigna explícitamente a RV07 el consumo de las filas de webhook vs. polling por canal (§1.1, §2.1, §3.1, §4.1). Esta sección cierra ese vacío consolidando lo ya verificado en RV03 (Airbnb), RV04 (Booking.com) y RV05 (Vrbo), sin re-investigar — cada hallazgo remite a la fuente primaria original.

| Canal | Vía API/webhook | Qué documenta oficialmente | Fila de `docs/LAGUNAS.md` | Implicación para el diseño de sync |
|---|---|---|---|---|
| **Booking.com** | Connectivity API (Reservations, Rates & Availability) | **100% pull/polling, sin webhooks documentados** [DATO]. Cita textual (RV04, F06/F07): "GET OTA_HotelResNotif will repetitively return bookings until they are acknowledged." Polling recomendado cada 20s para reservas; push B.XML de disponibilidad/tarifas es responsabilidad del proveedor (no hay notificación push de Booking.com hacia el proveedor). | §2.1 "Webhook vs. polling" → EVIDENCIA ("modelo 100% pull/polling confirmado, ningún webhook documentado") | Es el canal con más certeza en este eje: el diseño de polling adaptativo (§11 de este documento) debe tratar a Booking.com igual que a iCal en cuanto a que ambos son pull, pero con ventana mucho más corta (20s vs. horas) — el riesgo de doble reserva vía la API de Booking.com es mucho menor que vía iCal de Airbnb/Vrbo, siempre que el polling propio no se retrase. |
| **Airbnb** | Homes API / Activities API (partner aprobado) | **NO CONFIRMADO** si existen webhooks [DATO sobre la ausencia, RV03 F10]: solo agregadores de terceros (apis.io, apievangelist.com) afirman la existencia de una "Airbnb Webhooks API"; developer.withairbnb.com público no lo confirma. Tratado explícitamente como laguna en RV03, no como capacidad. | §1.1 "Webhook vs. polling" → LAGUNA HONESTA ("solo catálogos de terceros no oficiales... no confirmado en developer.withairbnb.com público") | El diseño de RV07 NO puede asumir push para Airbnb vía API; debe diseñarse como si fuera polling (igual que el iCal ya cubierto), con la latencia real de la API totalmente desconocida (ni siquiera un SLA aproximado) hasta obtener acceso de partner. |
| **Vrbo** | Expedia Group Connectivity (software certificado) | **Sin especificación técnica pública** (RV05): SLA cualitativo ("rates/availability en pocas horas", "contenido 24-48h") sin mecanismo de entrega documentado (push vs. poll). El Rapid API público es demand-side, no aplica. | §3.1 "Webhook vs. polling" → LAGUNA HONESTA | Tratar como pull con SLA de horas hasta tener acceso de partner; no diseñar ninguna ruta que dependa de notificación push de Vrbo. |
| **Otros canales** (Google Vacation Rentals, Agoda, TripAdvisor, agregadores LATAM/España) | Variable, mayormente por invitación/contrato | **NO ABORDADA** en el eje webhook/API para ninguno de estos canales (RV05 §4.1, §4.2) | §4.1 "Webhook vs. polling" → NO ABORDADA | El fallback universal para cualquier canal nuevo debe asumir por defecto polling/pull hasta confirmar lo contrario — ningún canal investigado hasta ahora ofrece push confirmado por fuente oficial propia. |

**Conclusión de esta sección:** de los cuatro canales cubiertos por la investigación, **ninguno tiene un mecanismo push/webhook confirmado por fuente oficial propia accesible públicamente**. Booking.com es el único con un modelo de sincronización de reservas documentado con precisión (pull cada 20s + ack), y es también el único donde la ausencia de webhook está confirmada como hecho negativo verificado (no solo como laguna). Esto refuerza la conclusión de la sección 9 de este documento: el diseño de sincronización de Atiende debe asumir polling/pull como el modelo por defecto para los cuatro canales, con Booking.com como el caso de mejor latencia garantizada (20s) y Airbnb/Vrbo/otros como los casos de peor latencia garantizada (horas, vía iCal o SLA cualitativo de API).

## Contenido

### 1. Modelo de sincronización multi-canal

**Unidad individual:** una propiedad publicada en N canales tiene N feeds de import (uno por canal de origen) y hasta N feeds de export (uno por canal de destino), todos apuntando a la misma línea de tiempo de disponibilidad interna.

**Multi-unidad:** cada unidad física es una línea de tiempo independiente; un mismo canal (p. ej. Booking.com) puede requerir múltiples URLs de export, una por unidad/listing, porque el estándar iCal no tiene noción de "portafolio" — cada `.ics` describe un único calendario. La arquitectura debe generar/mantener un par (feed de export, feed de import) por combinación (unidad, canal), nunca un feed agregado de todas las unidades bajo una sola URL, porque los canales importan por listing.

**Fuente de verdad interna:** el estado autoritativo de ocupación por noche y por unidad NO es ningún feed iCal (de import ni de export); es una tabla/registro interno de "bloqueos" tipados por razón (`RESERVA_CANAL_X`, `BLOQUEO_PROPIETARIO`, `MANTENIMIENTO`, `BUFFER_LIMPIEZA`) con su origen, `UID` externo si aplica, rango `[check-in, check-out)`, y estado (activo/cancelado). Los feeds de export se generan a partir de esta fuente de verdad; los feeds de import solo la alimentan, nunca la reemplazan.

### 2. Export e import por canal

- **Export:** por cada unidad y canal, el sistema publica un `.ics` con un `VEVENT` por bloqueo activo, `DTSTART`/`DTEND;VALUE=DATE` exclusivos (RV06), `UID` estable y determinístico (para que reimportar el mismo bloqueo produzca el mismo `UID`), y `SEQUENCE` incrementado en cada modificación del bloqueo. El `UID` exportado debe llevar un **prefijo o namespace propio** (p. ej. `<hash-bloqueo>@atiende-rv.internal`) que permita reconocerlo si alguna vez rebota de vuelta.
- **Import:** por cada unidad y canal externo, el sistema hace polling del `.ics` publicado por ese canal, parsea `VEVENT`s conforme a RV06, y produce candidatos a bloqueo tipo `RESERVA_CANAL_X` para conciliación contra la fuente de verdad.

### 3. Anti-eco: no reimportar lo que nosotros exportamos

Cuando un canal permite "importar un calendario externo" (p. ej. Vrbo: "you can import external calendars into Vrbo to keep your availability accurate everywhere" — funcionalidad de import documentada oficialmente), existe el riesgo de que el propio canal reexponga en su feed de export algo que en realidad vino de nuestro export hacia él (o de otro canal a través de él), creando un ciclo. Mecanismo de defensa, en capas:
1. **Por `UID`/prefijo:** si el `UID` de un `VEVENT` importado coincide con el namespace que nosotros usamos al exportar (mismo prefijo/hash determinístico), se descarta como eco — nunca se crea un bloqueo nuevo a partir de él.
2. **Por hash de contenido:** si el `UID` no es reconocible (el canal reescribe UIDs, comportamiento no documentado pero plausible y no descartable sin evidencia en contra), se calcula un hash de `(unidad, DTSTART, DTEND, razón inferida)` y se compara contra los bloqueos que nosotros mismos exportamos a ese canal en esa unidad; coincidencia exacta de rango con un bloqueo de origen `RESERVA_CANAL_X` o `BLOQUEO_PROPIETARIO` que nosotros generamos se trata como eco.
3. **Por origen declarado:** cada bloqueo interno lleva metadatos de "a qué canales se exportó"; al reconciliar un import de un canal, se descarta cualquier candidato cuyo rango coincida exactamente con un bloqueo cuyo campo "exportado_a" incluya ese canal.

Laguna: no existe evidencia primaria de que Airbnb, Booking.com o Vrbo reescriban o preserven el `UID` original al reexportar un evento importado de otra fuente (comportamiento interno de cada canal, no documentado en los artículos de ayuda leídos). El mecanismo de hash de contenido (2) es la mitigación obligatoria precisamente porque no se puede confiar solo en (1).

### 3.1 Consolidado por canal — qué identificador de reserva/evento documenta cada canal (corrección "Alta", complementa §3/§4)

| Canal | Identificador oficial | ¿UID/SEQUENCE tipo iCal? | Dedupe documentado oficialmente | Anti-eco documentado oficialmente | Fila de `docs/LAGUNAS.md` |
|---|---|---|---|---|---|
| Airbnb — API | Ninguno confirmado públicamente | No — sin evidencia (F09) | No documentado | No documentado | §1.1 (NO ABORDADA en ambas) |
| Airbnb — iCal | `UID` de VEVENT (RFC 5545 genérico) | Sí, por RFC; Airbnb no aclara si lo preserva al reexportar | No documentado por Airbnb | No documentado por Airbnb | §1.2 (LAGUNA HONESTA en ambas) |
| Booking.com — API | `reservationId`/`bookingRequestId` + campo `status` | No — Booking.com no usa el modelo iCal en su API (ver RV04 §6.1) | **Sí, documentado explícitamente**: ack vía `POST OTA_HotelResNotif`, responsabilidad de dedupe del receptor (F07) | No documentado (stop-sell propio releído como cambio externo) | §2.1 (EVIDENCIA para dedupe; NO ABORDADA para anti-eco) |
| Booking.com — iCal | Desconocido | Desconocido | Desconocido | Desconocido | §2.2 (LAGUNA HONESTA / PENDIENTE-EXTERNO en todo — bloqueo 403 total) |
| Vrbo — API | Desconocido | Desconocido | Desconocido | Desconocido | §3.1 (NO ABORDADA / LAGUNA HONESTA) |
| Vrbo — iCal | `UID` de VEVENT (RFC 5545 genérico) | Sí, por RFC; Vrbo no aclara mecanismo exacto | No documentado por Vrbo | **Sí, con advertencia oficial directa** ("payment issues" al reimportar el propio export — RV05 §4.1) | §3.2 (LAGUNA HONESTA para dedupe; EVIDENCIA parcial para anti-eco — la mejor evidencia de los tres canales) |
| Otros canales | Desconocido | Desconocido | Desconocido | Desconocido | §4.1/§4.2 (NO ABORDADA en su mayoría) |

**Lectura del consolidado:** el único canal con dedupe oficialmente documentado es Booking.com (vía ack, no vía UID/SEQUENCE); el único canal con anti-eco oficialmente reconocido es Vrbo (vía advertencia de "payment issues", no vía especificación de UID). Ningún canal documenta ambos simultáneamente. El mecanismo de `(canal, unidad, UID)` + hash de contenido definido en §4 de este documento es, por tanto, una **convención propia de Atiende** para los casos donde el canal no ofrece un mecanismo oficial equivalente — se aplica a Airbnb/Vrbo/otros vía iCal, y se sustituye por `(canal, reservationId)` + el campo `status` oficial para Booking.com vía API (ver RV04 §6.1).

### 4. Deduplicación e idempotencia por UID+SEQUENCE+hash

Aplicando RV06 (`UID` como identidad, `SEQUENCE`/`LAST-MODIFIED` como versión no garantizada): la regla de idempotencia de import es:
- Clave de identidad: `(canal, unidad, UID)`.
- Si ya existe un candidato con esa clave: comparar `SEQUENCE` (si presente) y `LAST-MODIFIED`/hash de `(DTSTART,DTEND,STATUS)`. Aplicar el evento entrante solo si su `SEQUENCE` es mayor, o si es igual/ausente pero el hash de contenido difiere (cambio real sin bump de `SEQUENCE`, dado que RV06 documenta que esto no está garantizado fuera de flujos iTIP con organizador).
- Si `SEQUENCE` entrante es menor al ya aplicado: descartar (evento fuera de orden/replay de una versión vieja) y registrar la anomalía sin aplicar cambio.
- Reintentos de red (mismo `GET` reprocesado, o el mismo evento repetido dos veces en el mismo feed) deben producir el mismo resultado final sin duplicar bloqueos — la operación de "aplicar VEVENT" debe ser un `upsert` por `(canal, unidad, UID)`, no un `insert`.

### 5. Eventos desordenados y replay

Un ciclo de polling puede: (a) llegar tarde respecto a otro (dos workers concurrentes procesando el mismo feed), o (b) repetirse tras un fallo (reintento que reprocesa un feed ya aplicado). El patrón de **outbox transaccional** (Chris Richardson, microservices.io: "the service that sends the message first store[s] the message in the database as part of the transaction that updates the business entities... Messages are guaranteed to be sent if and only if the database transaction commits") es el patrón reconocido aplicable aquí: cada aplicación de un `VEVENT` importado y cada generación de un evento de export deben persistirse atómicamente junto con el cambio de estado de disponibilidad, de modo que un crash entre "escribí el bloqueo" y "confirmé el ciclo de sync" sea recuperable por reproceso idempotente (upsert por `UID`, ver §4) en vez de perder o duplicar el efecto.

### 6. Modificación de fechas (ampliar/reducir/mover)

Al recibir un `VEVENT` con el mismo `UID` pero rango `[DTSTART,DTEND)` distinto al bloqueo existente:
- **Ampliar** (nuevo rango contiene al viejo): el sistema debe verificar que las noches añadidas no estén ya ocupadas por otro bloqueo de razón distinta antes de aceptar la ampliación completa; si hay solapamiento con otra reserva, es un conflicto que requiere alerta (no auto-resolución silenciosa), nunca cancelación automática de la reserva ajena (regla de negocio del proyecto: nunca cancelar reservas).
- **Reducir** (nuevo rango es subconjunto del viejo): las noches que salen del rango se liberan **solo si ninguna otra razón de bloqueo las reclama** (ver invariante de no reapertura, §8).
- **Mover** (rango se desplaza): tratarse como liberar el rango viejo (sujeto a §8) y ocupar el nuevo (sujeto a la misma verificación de solapamiento que "ampliar").
- En los tres casos, el efecto en "noches" debe recalcularse noche por noche usando el modelo exclusivo de RV06 (`[check-in, check-out)`), no como una operación de reemplazo ciego del rango.

### 7. Cancelación/expiración: nunca reabrir noches ocupadas por otra causa

Este es el invariante de seguridad más importante del módulo. Cuando un `VEVENT` se cancela (`STATUS:CANCELLED` o desaparición del feed, ambos casos documentados como posibles en RV06 §5) o cuando un bloqueo interno expira:
- El sistema libera esa franja de noches **solo si el motivo que se cancela era el único ocupante de cada noche individual**.
- Se requiere una **resolución por capas** de razones de bloqueo, con precedencia explícita (propuesta, no derivada de ninguna fuente externa sino de la regla de negocio "nunca cancelar reservas ni contactar huéspedes"): `RESERVA_CANAL` (cualquier canal) > `BLOQUEO_PROPIETARIO` > `MANTENIMIENTO` > `BUFFER_LIMPIEZA`. Si dos razones distintas reclaman la misma noche (p. ej. una reserva confirmada y un bloqueo de mantenimiento superpuesto creado por error), la noche permanece ocupada por la de mayor precedencia y el conflicto se reporta, nunca se resuelve cancelando la reserva. **Nota de vocabulario (no bloqueante):** esta "capa" de precedencia es un concepto distinto del campo `capa` de `bloqueo_manual` en `docs/investigacion/RV17-arquitectura-datos.md` §1.1 (subtipo de bloqueo) y del `tipo` discriminador top-level `reserva`/`bloqueo` de RV17 §2.3/BLUEPRINT §3.2/DECISIONES D-002 — las tres nociones son coherentes en comportamiento, solo difiere el nombre usado en cada documento (ver `docs/auditoria-investigacion-1/contradicciones.md` #9 y nota equivalente en RV17 §2.3).
- Formalmente: `ocupado(unidad, noche) = OR sobre todos los bloqueos activos b tal que noche ∈ [DTSTART(b), DTEND(b))`. Cancelar un bloqueo `b` solo cambia su propio término del OR; nunca fuerza `ocupado=false` para una noche que otro término todavía cubre.

### 8. Feed inaccesible/vacío/malformado ≠ calendario vacío

Un `GET` que falla (timeout, 5xx, DNS), devuelve un cuerpo vacío, o devuelve un `.ics` que no parsea (folding roto, `BEGIN`/`END` desbalanceados, tamaño que excede el límite propio de RV06-R-07) **no debe interpretarse jamás como "el canal remoto no tiene reservas"** — eso abriría disponibilidad falsa y es exactamente el escenario de overbooking que el producto existe para prevenir. Política de reconciliación:
1. **Cuarentena:** ante fallo de fetch/parseo, el último estado válido conocido de ese canal/unidad se mantiene congelado (no se aplican cambios derivados de este ciclo fallido); se marca el feed como "en cuarentena" con timestamp del último éxito.
2. **Umbral de alerta:** si la edad del último sync exitoso supera un umbral configurable (p. ej. N veces el intervalo de polling esperado), se emite una alerta operativa — el umbral concreto es una decisión de producto, no un hecho de ninguna fuente citada; no se fija aquí un número como si viniera documentado.
3. **Nunca vaciar el calendario del canal fallido:** los bloqueos ya conocidos de ese canal permanecen activos en la fuente de verdad hasta que un ciclo exitoso posterior los confirme, modifique o cancele explícitamente.
4. **Distinción vacío-válido vs vacío-por-error:** un `.ics` que parsea correctamente y contiene cero `VEVENT` es una señal válida distinta de un fetch fallido; solo el primero puede interpretarse como "sin reservas actualmente en ese canal", y aun así con cautela operativa (alerta informativa si un canal que normalmente tiene eventos pasa a cero de golpe, como posible indicio de que el canal cambió la URL o rotó credenciales).

### 9. Ventana residual de doble reserva vía iCal

Dado (RV06 + hechos de canal leídos):
- Airbnb (Help artículo 99): *"Your Airbnb calendar automatically updates every 3 hours, and pulls in information from the other calendars you've connected."*
- Vrbo (Help): *"Calendars sync every 30 minutes. You can also manually refresh at any time by tapping ⟳ (refresh)."* (app móvil); adicionalmente, el dashboard web indica que "Imported events may take up to 20 minutes to appear" tras un refresh manual.
- Booking.com: **laguna** — no se pudo leer la fuente primaria (403 en los dos intentos de acceso a `partner.booking.com` y `partnerhelp.booking.com`); no se afirma ninguna cifra de frecuencia para Booking.com en este documento.

La consecuencia aritmética simple: si una unidad está en Airbnb y Vrbo simultáneamente y ambos dependen de iCal (no de API en tiempo real) para verse entre sí, la ventana en la que una reserva confirmada en un canal puede no reflejarse aún en el otro está acotada, en el peor caso observado, por el ciclo de polling más lento del canal que aún no ha leído el cambio (hasta ~3 horas según lo documentado por Airbnb para su propio ciclo de refresco; el ciclo de Vrbo es más corto según lo documentado, 30 minutos más hasta 20 minutos de propagación interna). **Esta ventana es responsabilidad del canal remoto y de la latencia inherente al protocolo de "archivo estático + polling" de iCal — no de la velocidad de nuestro propio sistema.** Comunicación honesta al usuario: el producto debe declarar explícitamente que "cerrar disponibilidad" internamente es instantáneo, pero que la propagación a un canal que aún no leyó nuestro export, o cuyo propio ciclo de import del feed de un tercero aún no corrió, puede tardar hasta el intervalo documentado por ese canal (o "tiempo no documentado por el canal" cuando aplique, como en el caso de Booking.com aquí). No se debe prometer "cero riesgo de doble reserva" mientras el canal remoto dependa de iCal.

### 10. Latencia interna objetivo vs externa

- **Latencia interna:** el tiempo entre "se confirma una reserva/bloqueo en nuestra fuente de verdad" y "el feed de export propio refleja ese cambio" debe diseñarse para ser mínima (segundos), porque es enteramente controlable por el sistema (regenerar el `.ics` de esa unidad/canal de inmediato tras cada cambio, no en batch periódico).
- **Latencia externa:** el tiempo entre "nuestro export cambió" y "el canal remoto lo refleja en su propio calendario visible a terceros" está fuera de nuestro control y es la documentada en §9 (3 h Airbnb; 30 min + hasta 20 min Vrbo; no documentada para Booking.com).
- La suma relevante para el riesgo de doble reserva entre dos canales A y B es aproximadamente `latencia_export_a_B + latencia_import_de_B_por_A_o_por_nosotros`, dominada por el término externo documentado más lento conocido.

### 11. Polling adaptativo y límites

Dado que ni Airbnb ni Vrbo documentan una `REFRESH-INTERVAL` (RFC 7986) en sus feeds (laguna de RV06 §12), y que un canal puede además limitar la frecuencia de fetch de sus URLs de export (no documentado explícitamente por ninguno de los tres canales en las fuentes leídas — laguna), el diseño de polling debe ser conservador por defecto:
- No exceder una frecuencia de import mayor a la que el propio canal declare como su ciclo de actualización (p. ej. no tiene sentido consultar el feed de Airbnb más seguido que cada 3 horas si Airbnb mismo solo lo actualiza en ese ciclo — aunque si el import es de un feed que Airbnb consume de terceros, la cadencia relevante es la de Airbnb, no la nuestra).
- Adaptar la frecuencia al alza (dentro de límites razonables y sin evidencia de límites documentados) cuando se detecta actividad reciente (cambios en los últimos ciclos) y a la baja cuando el feed permanece estable, para no generar carga innecesaria sobre servidores de terceros — política de ingeniería propia, no derivada de una fuente citada.
- Respetar cualquier código HTTP 429/Retry-After si el canal lo emite (no documentado por ninguna fuente primaria leída si lo hacen; se implementa por buena práctica defensiva).

### 12. Buffers de limpieza y estancias contiguas

RV06 estableció que `DTEND` es exclusivo, por lo que un check-out el día D y un check-in el mismo día D para otra reserva son, por construcción del modelo `[check-in, check-out)`, compatibles sin solaparse (el rango saliente no incluye D, el entrante sí). Un buffer de limpieza (p. ej. "no permitir check-in el mismo día del check-out, dejar N horas/noches libres") es una regla de negocio adicional que el sistema debe modelar como su propio tipo de bloqueo (`BUFFER_LIMPIEZA`) ocupando `[check-out_reserva, check-out_reserva + N)`, coexistiendo con el invariante de RV06 sin contradecirlo — el buffer no cambia la semántica de `DTEND` exclusivo, añade una franja adicional de "ocupado por limpieza" después de ella.

### 13. Duración mínima

Una `duración_mínima` (mínimo de noches) es una regla de disponibilidad que no puede derivarse de iCal (RV06: iCal no transporta restricciones de estancia). Debe vivir como regla en la fuente de verdad interna, aplicada al aceptar/exportar bloqueos manuales, y es independiente del parseo/generación de `VEVENT`s (que siempre representan una ocupación concreta ya decidida, no una regla de disponibilidad futura).

### 14. DST y cambios de zona

Con el modelo de fechas `DATE` (sin hora, RV06 §1) para `DTSTART`/`DTEND`, los cambios de horario de verano no afectan el cálculo de noches ocupadas (una fecha calendario no tiene ambigüedad de DST). El riesgo de DST aparece si, en algún punto del pipeline interno, una fecha `DATE` se convierte a un instante `DATE-TIME` (p. ej. para generar una notificación a una hora concreta, o para calcular "hace cuántas horas fue el último sync exitoso" cruzando una transición de DST). RFC 8536 documenta que una transición TZif ocurre "when one or more of the following happen simultaneously: a change in UT offset, a change in whether daylight saving time is in effect, a change in time zone abbreviation, or a leap second" — cualquier cálculo de "última sincronización exitosa hace X horas" que mezcle timestamps UTC (correcto) con timestamps locales de la propiedad (frágiles frente a DST) debe normalizarse a UTC internamente y solo convertir a hora local de la propiedad para presentación, nunca para lógica de negocio de ocupación.

### 15. Reconciliación periódica completa vs incremental

- **Incremental** (cada ciclo de polling): aplica solo los `VEVENT`s presentes en el feed más reciente, vía upsert idempotente (§4).
- **Completa** (periódica, menos frecuente): compara el conjunto completo de bloqueos activos de origen "canal X" en la fuente de verdad contra el conjunto completo de `UID`s presentes en el feed más reciente de ese canal; cualquier bloqueo activo de ese canal cuyo `UID` **no** aparece ya en el feed actual es candidato a cancelación implícita (el canal dejó de listarlo) — sujeto siempre al invariante de no reapertura de noches ocupadas por otra causa (§7). La reconciliación completa es la defensa contra la pérdida silenciosa de un evento `CANCELLED`/eliminado que un ciclo incremental pudo no capturar por una ventana de fallo o feed en cuarentena.

### 16. Métricas

- **Edad del último sync exitoso por canal/unidad:** timestamp UTC del último ciclo de import (o export confirmado) que completó sin error; expuesto y comparado contra el umbral de alerta de §8.
- **Drift detectado:** número de discrepancias encontradas en una reconciliación completa (§15) entre lo que la fuente de verdad cree ocupado por un canal y lo que el feed más reciente de ese canal realmente contiene.
- **Conflictos:** número de eventos entrantes que solapan con un bloqueo de razón distinta y que requirieron alerta en vez de aplicación automática (§6, §7).

## Tabla de escenarios adversariales

| Escenario | Comportamiento esperado |
|---|---|
| Doble evento (mismo `UID` recibido dos veces en el mismo feed o en ciclos distintos) | Upsert idempotente por `(canal, unidad, UID)`; segunda aplicación es no-op si `SEQUENCE`/hash no cambiaron (§4). |
| Reserva simultánea confirmada en dos canales para las mismas noches | Se detecta como conflicto al aplicar el segundo import (solapa con `RESERVA_CANAL` ya activa de otro canal); se alerta de inmediato como posible overbooking; NUNCA se cancela ninguna de las dos reservas automáticamente; requiere intervención humana con el canal correspondiente. |
| Eventos fuera de orden (ciclo de polling B llega antes que A pero A era más reciente) | Comparar `SEQUENCE`/hash de contenido antes de sobrescribir; descartar el evento con versión inferior y registrar la anomalía (§4). |
| UID reciclado (un canal reutiliza un `UID` ya visto para un bloqueo distinto tras eliminar el original) | Si el nuevo contenido difiere sustancialmente del bloqueo previo con el mismo `UID` (fechas muy distintas, sin continuidad razonable), tratar como reemplazo completo del bloqueo (cancelar el viejo sujeto a §7, crear el nuevo), no como una actualización incremental; registrar como anomalía para revisión, dado que no hay evidencia primaria de que los canales garanticen unicidad perpetua de `UID`. |
| Timeout de nuestro sistema tras éxito remoto (el canal aplicó/leyó el cambio pero nuestra confirmación local se perdió) | Patrón outbox (§5): el estado a reintentar es idempotente (upsert), así que un reintento posterior converge al mismo resultado sin duplicar ni perder el efecto. |
| ACK perdido (confirmación de un `PUT`/publicación de export no llega aunque el canal ya lo recibió) | Mismo tratamiento que el anterior: idempotencia por contenido determinístico del `.ics` exportado hace que reintentar el export sea seguro. |
| Crash y replay (el proceso de sync cae a medio ciclo y se reinicia) | Reproceso completo del último feed descargado (o nueva descarga) aplicado vía upsert idempotente; ningún efecto duplicado porque la clave de aplicación es `(canal, unidad, UID)`, no "evento número N del ciclo". |
| Bloqueo manual superpuesto con una reserva de canal | Precedencia por capas (§7): `RESERVA_CANAL` tiene mayor precedencia que `BLOQUEO_PROPIETARIO`/`MANTENIMIENTO`; la noche permanece ocupada por la reserva; se alerta el solapamiento para que un humano corrija el bloqueo manual, sin tocar la reserva. |
| Cambio de horario de verano (DST) durante una estancia o durante un ciclo de sync | Sin efecto en el cálculo de noches porque `DTSTART`/`DTEND` son `DATE` sin hora (RV06); cualquier lógica interna que use `DATE-TIME`/instantes (p. ej. cálculo de "hace cuántas horas fue el último sync") debe operar en UTC internamente y convertir a hora local de la propiedad solo para presentación. |

## Riesgos / límites

1. La ventana de doble reserva vía iCal no puede reducirse a cero mientras el canal remoto dependa de su propio ciclo de polling documentado (Airbnb ~3h — confianza baja/media, latencia externa no controlada, ver RV03 S1; Vrbo ~30min+20min; Booking.com desconocido por laguna de acceso). Cualquier promesa comercial de "cero overbooking" es falsa mientras el transporte sea iCal puro; solo una integración API en tiempo real por canal podría reducir la parte de latencia externa, y eso está fuera del alcance de RV06/RV07 (que cubren iCal).
2. La ausencia de garantías sobre `SEQUENCE`/`UID` estable en modo publish puro obliga a depender de hash de contenido como red de seguridad, lo cual añade costo de cómputo y superficie de bugs de comparación.
3. La reconciliación completa (§15) es potencialmente costosa a escala (muchas unidades × muchos canales); su frecuencia es una decisión de producto no derivada de ninguna fuente citada.
4. La detección de "UID reciclado" es heurística (comparación de similitud de contenido) porque no existe garantía documentada de unicidad perpetua por parte de los canales.
5. Sin acceso a la fuente primaria de Booking.com, cualquier parámetro operativo específico de ese canal (frecuencia de sync, límites de tamaño, soporte de caché HTTP) queda como laguna que debe cerrarse antes de fijar SLAs contractuales con el usuario.

## Implicaciones para requisitos e invariantes formales

- **RV07-R-01**: La fuente de verdad de ocupación por noche y unidad DEBE ser interna al sistema; ningún feed iCal (import o export) puede sustituirla.
- **RV07-R-02**: Todo bloqueo interno DEBE llevar razón tipada con precedencia total y determinística (`RESERVA_CANAL` > `BLOQUEO_PROPIETARIO` > `MANTENIMIENTO` > `BUFFER_LIMPIEZA`, u orden equivalente definido por producto), usada para resolver toda cancelación/expiración sin reabrir noches ocupadas por otra causa. *Invariante formal:* `ocupado(u,n) = ∃ b activo : n ∈ [DTSTART(b), DTEND(b))`; cancelar `b` solo remueve su propio término del existencial.
- **RV07-R-03**: Todo import DEBE ser idempotente por clave `(canal, unidad, UID)`, con desempate por `SEQUENCE`/hash de contenido cuando `SEQUENCE` esté ausente o no sea confiable.
- **RV07-R-04**: El sistema DEBE implementar anti-eco por al menos dos mecanismos independientes (reconocimiento de `UID`/namespace propio, y coincidencia de hash de contenido contra lo exportado), dado que no hay garantía documentada de preservación de `UID` por los canales.
- **RV07-R-05**: Un fallo de fetch, un cuerpo vacío o un `.ics` malformado NUNCA DEBE traducirse en liberar disponibilidad; DEBE activar cuarentena del último estado válido y, tras cruzar un umbral configurable, una alerta operativa.
- **RV07-R-06**: El sistema DEBE exponer, por canal y unidad, la edad del último sync exitoso, el drift detectado en la última reconciliación completa y el conteo de conflictos activos.
- **RV07-R-07**: Toda comunicación al usuario sobre "disponibilidad cerrada" DEBE distinguir entre "cerrada en nuestra fuente de verdad" (instantáneo) y "reflejada en el canal remoto" (sujeto a la latencia documentada de ese canal, o declarada como no documentada cuando aplique), sin prometer sincronización instantánea entre canales mientras el transporte sea iCal.
- **RV07-R-08**: Ninguna operación de sincronización DEBE cancelar una reserva ni contactar al huésped; todo conflicto detectado (doble reserva entre canales, solapamiento de bloqueo manual con reserva) DEBE resolverse por alerta a un humano, nunca por acción automática sobre la reserva.
- **RV07-R-09**: Toda operación de generación/aplicación de eventos de sync DEBE ser recuperable ante crash mediante el patrón de outbox transaccional (persistencia atómica del efecto de negocio junto con el registro de sync), de modo que un reinicio a medio ciclo converja al mismo estado final vía upsert idempotente.
- **RV07-R-10** (nuevo, corrección "Alta" 2026-09-05): El motor de sincronización DEBE tratar el eje API tan defensivamente como el eje iCal: ningún canal tiene webhook confirmado por fuente oficial propia (sección 0), por lo que la arquitectura de polling adaptativo (§11) aplica también a las conexiones API de Airbnb/Vrbo, no solo a iCal. La única excepción documentada con precisión es Booking.com (pull cada 20s + ack, RV04 §4), que debe modelarse con su propio SLA de latencia, distinto y mejor que el de iCal.

## Lagunas

*(Referencia cruzada obligatoria a `docs/LAGUNAS.md`, mandato de `00-PLAN.md` §5 — 0 referencias en la versión previa de este documento, corregido 2026-09-05.)*

1. Frecuencia de sincronización documentada por Booking.com — no se pudo leer la fuente primaria oficial (403 en `partner.booking.com` y `partnerhelp.booking.com` en dos intentos cada uno, 2026-09-05). Ver `docs/LAGUNAS.md` §2.2 (fila "Frecuencia y latencia real" — PENDIENTE-EXTERNO/LAGUNA HONESTA).
2. Si Airbnb/Vrbo preservan el `UID` original al reexportar un evento importado de otra fuente (riesgo de eco) — no documentado. Ver `docs/LAGUNAS.md` §1.2 y §3.2 (filas "Anti-eco de bloqueos").
3. Si Airbnb/Booking/Vrbo aplican rate-limiting (HTTP 429) a los `GET` de sus URLs de export — no documentado en las fuentes leídas. Ver `docs/LAGUNAS.md` §1.2/§3.2 (filas "Límites de tasa/reintento").
4. Umbrales numéricos concretos de alerta por "edad de último sync" y de "drift aceptable" — son decisiones de producto, deliberadamente no fijadas aquí como si vinieran de una fuente externa. (Ver `barra-calidad.md` de la auditoría, hallazgo de que estas dos estimaciones no aparecían en la tabla de Supuestos — corregido, ver sección "Supuestos" de este documento más abajo.)
5. Comportamiento exacto de Booking.com ante bloqueos superpuestos o feeds malformados — no verificado por falta de acceso a fuente primaria. Ver `docs/LAGUNAS.md` §2.2.
6. No se dispuso de un feed `.ics` real de ningún canal para probar empíricamente los mecanismos de anti-eco y deduplicación descritos; el diseño es correcto respecto a RFC 5545/5546 y a lo documentado por Airbnb/Vrbo, pero no ha sido validado contra tráfico real. Ver `docs/LAGUNAS.md` §1.2/§3.2 (filas "UID/SEQUENCE/dedupe/idempotencia").
7. (Nueva, corrección "Alta") **Ningún mecanismo push/webhook está confirmado por fuente oficial propia en ninguno de los 4 canales** — ver sección 0 y `docs/LAGUNAS.md` §1.1/§3.1/§4.1 (filas "Webhook vs. polling").
8. (Nueva, corrección "Alta") **El escenario de "stop-sell propio de Booking.com releído como cambio externo" y el de "3+ feeds cruzados sobre la misma unidad"**, ambos pedidos explícitamente por `docs/LAGUNAS.md` (§2.1 fila "Anti-eco de bloqueos"; §4.2 fila "Todas las dimensiones"), **nunca se investigaron con acceso real a los canales** — quedan como lagunas honestas de este documento, no rellenadas por inferencia.
9. **Cobertura de fuentes por debajo del mínimo del plan.** Este módulo cita ~15 URLs distintas en "Fuentes de este módulo" (RFC-editor/icalendar.org, airbnb.com/help, help.vrbo.com, developers.booking.com, cheatsheetseries.owasp.org, microservices.io), por debajo del mínimo de 25 URLs distintas exigido por `docs/investigacion/00-PLAN.md` §1.3. La razón declarada: este módulo depende en gran parte de los hallazgos ya citados con fuente primaria por RV03/RV04/RV05/RV06 en vez de duplicar sus URLs, y `partner.booking.com`/`partnerhelp.booking.com` siguen bloqueados (403) para el detalle de sincronización de Booking.com (ver Laguna #1). Ampliar esta cobertura depende de que RV03/RV04/RV05/RV06 amplíen primero las suyas.

## Supuestos

| Supuesto [E] | Valor usado | Lógica/fórmula | Módulo(s) que lo consumen | Cómo se reemplaza por dato real |
|---|---|---|---|---|
| Precedencia de capas de bloqueo | `RESERVA_CANAL > BLOQUEO_PROPIETARIO > MANTENIMIENTO > BUFFER_LIMPIEZA` (§7) | Derivado de la regla de negocio "nunca cancelar reservas ni contactar huéspedes"; ninguna fuente externa documenta esta jerarquía | RV07, RV17 (vocabulario de capas, ver contradicción #9 de la auditoría) | Confirmar con producto antes de construir; no es un hecho de ningún canal, es una decisión de diseño |
| Umbral de alerta por "edad de último sync" (§8) | No fijado con cifra concreta (deliberado); ejemplo ilustrativo: "N veces el intervalo de polling esperado" | Ninguna fuente cita un número; se deja como parámetro configurable para no presentar una decisión de ingeniería como si viniera de un canal | RV07, RV20 (observabilidad) | Fijar con datos reales de producción (tasa de falsos positivos/negativos de alerta) antes de congelar el valor por defecto |
| Frecuencia de reconciliación completa (§15) | No fijada con cifra concreta (deliberado) | Ninguna fuente documenta cada cuánto debe correr la reconciliación completa vs. incremental; es un balance costo-cómputo vs. riesgo de pérdida silenciosa de un `CANCELLED` no capturado por el ciclo incremental | RV07, RV17 | Fijar con medición real de costo de reconciliación a escala (número de unidades × canales) antes de congelar el valor por defecto |
| Ausencia de rate-limiting documentado ⇒ diseño de polling adaptativo (§11) | Backoff/adaptación conservadora por defecto | La ausencia de evidencia de límites de tasa no equivale a ausencia real de límites; se trata como mitigación defensiva prudente, no como respuesta a un límite documentado | RV07 | Confirmar con acceso de partner o con observación empírica de HTTP 429 en producción |
| Todo feed relevante usa `VALUE=DATE` sin hora para `DTSTART`/`DTEND` (§14) | Fechas de calendario, no instantes | Heredado de RV06; el análisis de DST se centra en la lógica interna que sí opera con instantes | RV07 | Confirmar contra un feed `.ics` real de cada canal |

*(Tabla reformateada 2026-09-05 al formato de 5 columnas de `00-PLAN.md` §3.1, corrigiendo el hallazgo de `barra-calidad.md`/C11 de que las dos estimaciones de arquitectura —umbral de alerta y frecuencia de reconciliación— se usaban en el diseño sin aparecer en la tabla de Supuestos.)*

---

## Fuentes de este módulo

Todas leídas o re-verificadas el 2026-09-05. Ledger completo con cita textual: `docs/fuentes/rv06-07.md`.

- **RFC 5545/5546/6868/7986/8536 (vía RV06):** rfc-editor.org/rfc/rfc5545, rfc5546, rfc6868, rfc7986, rfc8536; icalendar.org (mirror de reproducción) [DATO].
- **Airbnb (frecuencia iCal, webhook API):** airbnb.com/help/article/99 [DATO]; ausencia de webhook confirmada por RV03 vía developer.withairbnb.com [DATO negativo].
- **Vrbo (frecuencia iCal, anti-eco):** help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar, help.vrbo.com/articles/Export-your-reservation-calendar [DATO].
- **Booking.com (webhook/API, corrección "Alta" — vía RV04):** developers.booking.com/connectivity/docs, .../reservations-api/reservations-overview, .../reservations-api/retrieving-new-reservations-ota [DATO]; partner.booking.com/partnerhelp.booking.com bloqueados (403, declarado, no usado como fuente).
- **Seguridad (SSRF, para RV19-R-01/02):** cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html [DATO].
- **Patrón de arquitectura (outbox transaccional):** microservices.io/patterns/data/transactional-outbox.html [DATO].
