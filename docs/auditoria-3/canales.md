# Auditoría-3 — Rubro 4: Canales de distribución (México, RV22)

Auditor adversarial independiente (Sonnet), Fase 3 / Lote 3.4. Alcance:
`packages/adapters/src/{agoda,booking,expedia,siteminder,vrbo,airbnb,google-vr,ical,net,sync}/**`,
`packages/sim/src/{agoda-ical,booking-api,booking-ical,expedia-api,siteminder-pmsxchange,vrbo-ical}/**`,
`packages/sim/src/comun/etiquetado.ts`, `packages/domain/src/channelAdapter.ts`,
`tests/adversarial/{canales,ssrf}/casos.test.ts`.

Nota de método: rubro auditado en solitario (sin sub-agentes) por inestabilidad de la
API esta noche. Se priorizó ejecutar la batería adversarial YA EXISTENTE (regresión
real) y verificar por lectura los puntos nuevos de mayor riesgo (SSRF, XXE, estados
honestos, simuladores). No se escribieron pruebas nuevas en este rubro: se reutilizó y
se ejecutó la cobertura existente como evidencia, y se documentan honestamente los
puntos que no aplican por no existir todavía código de red real.

## No se encontraron hallazgos nuevos de severidad crítica/alta en este rubro

## Verificado con ejecución real de la batería existente

- `npx vitest run tests/adversarial/canales/casos.test.ts tests/adversarial/ssrf/casos.test.ts`
  → **14/14 pruebas pasan** (3 de canales + 11 de SSRF), incluyendo explícitamente:
  - *"ack perdido de Expedia: reintento no duplica la reserva"* — reenvía la misma
    reserva en cada pull hasta confirmar; la ingesta deduplica por `(canal,
    external_id)`. Esto cubre la idempotencia de confirmaciones pedida por la
    auditoría, aunque a nivel de dominio (ingesta), no de reintentos de transporte
    HTTP (ver más abajo por qué no hay tal capa todavía).
  - *"el puente SiteMinder reexporta nuestro propio bloqueo como reserva entrante →
    anti-eco"* — `detectarEco` reconoce el rango ya exportado (capa 3 de detección,
    por rango de fechas coincidente) incluso con UID/hash distinto — el caso de "eco
    cruzado" pedido explícitamente por la auditoría.
  - Las 11 pruebas de `tests/adversarial/ssrf/casos.test.ts` (heredadas de Fase 2)
    siguen en verde tras añadir los adaptadores de Fase 3 — sin regresión.

## Verificado por lectura de código

### SSRF en Agoda iCal — cubierto por el mismo motor que Airbnb/Vrbo

- `packages/adapters/src/agoda/adapter.ts`: el adaptador de Agoda **reutiliza el mismo
  motor de sincronización iCal** (`packages/adapters/src/sync/motor.ts`) que Airbnb y
  Vrbo, el cual llama `fetchIcsSeguro` (`packages/adapters/src/net/fetchSsrf.ts:323`)
  — el mismo guardado SSRF de Fase 2 (`packages/adapters/src/net/ssrf.ts`: bloquea
  loopback, RFC1918, link-local/metadata cloud `169.254.169.254`, CGNAT, multicast,
  además de esquemas no-http(s), credenciales embebidas en URL, DNS que resuelve a IP
  vacía, y demasiadas redirecciones). No existe una ruta de red separada para Agoda que
  pudiera saltarse este guardado — está estructuralmente forzado a pasar por él.

### XXE en respuestas de Booking OTA/B.XML — NO APLICA (no hay parser de XML entrante)

- `packages/adapters/src/booking/otaXml.ts` (153 líneas) **solo construye XML
  saliente** (`construirOtaHotelAvailNotifRq`/`construirOtaHotelRateAmountNotifRq`,
  con `xmlEscape` propio para los valores interpolados). La lectura de reservas
  (`mapearReservaSimuladaAOta`) traduce la forma **JSON** que expone
  `BookingApiSimulator` (`@atiende-rv/sim`), no XML parseado.
- `grep` de `DOMParser|xml2js|fast-xml-parser|libxmljs|parseXml|xmldom` en
  `packages/adapters/src` y `packages/sim/src` → **0 resultados**: no existe ningún
  parser de XML en el repo.
- **Razón:** el Connectivity Partner Program de Booking.com está pausado a nuevos
  proveedores (`D-011`, `MOTIVO_PARTNER_PENDIENTE_BOOKING` en
  `packages/adapters/src/booking/adapter.ts`) — nunca se conecta de verdad a
  `connect.booking.com`, así que no hay todavía ninguna respuesta XML real que parsear.
  Conclusión: el vector XXE pedido por la auditoría **no tiene superficie de ataque
  hoy** porque el código que lo tendría (un parser de la respuesta real de Booking) no
  existe todavía — no es "vulnerabilidad corregida", es "funcionalidad no construida".
  Si/cuando se implemente un parser real, DEBE deshabilitar explícitamente
  resolución de DTD/entidades externas (p. ej. `libxmljs2` con `noent: false,
  dtdload: false, dtdvalid: false`, o un parser SAX que ignore DOCTYPE) — dejar esto
  registrado para cuando ese trabajo se haga.

### Expedia: sin cliente HTTP real todavía — 429/reintentos no aplican por el mismo motivo

- `packages/adapters/src/expedia/client.ts`/`adapter.ts`: `grep "fetch("` → 0
  resultados. El archivo declara tipos, límites documentados (`LIMITE_
  ACTUALIZACIONES_POR_MENSAJE_EXPEDIA = 5000`, `LIMITE_REGISTROS_POR_LLAMADA_
  BOOKING_RETRIEVAL = 125`) y funciones puras de troceo (`dividirEnLotesDisponibilidad`),
  pero ninguna llamada de red real — apunta a `api.sandbox.expediagroup.com` solo como
  constante documentada, nunca se invoca. Igual que Booking: sin credenciales de
  partner aprobadas, no hay código de transporte real que pudiera tener un bug de
  reintento/429. La idempotencia de **confirmaciones** SÍ está cubierta a nivel de
  dominio (ver la prueba de "ack perdido" arriba), que es lo que corre hoy contra el
  simulador.

### SiteMinder: cliente con posible conexión real — mismo hallazgo que Booking/Expedia sobre parsing

- `packages/adapters/src/siteminder/client.ts`/`adapter.ts`: tampoco se encontró
  `fetch(` real (0 resultados) — incluye tipos y constructor de payload, sin ejecutar
  la llamada HTTP contra un pmsXchange real todavía.

### Simuladores imposibles de activar fuera de dev/test

- `packages/sim/src/comun/etiquetado.ts` (`assertNoParecerProduccion`,
  `ENTORNOS_SIMULADOR_PERMITIDOS`): allow-list explícita
  (`desarrollo/pruebas/development/test/dev`) — CUALQUIER otro valor de
  `ATIENDE_ENTORNO`/parámetro, incluida una variante mal escrita o con acento de
  "producción", bloquea el arranque (fail-closed por construcción, no por enumerar
  formas de escribir "producción" — corrección real de un bug de Fase 2, S-04, donde
  `.toLowerCase()` no normalizaba acentos). Además rechaza credenciales que "parezcan"
  de producción por prefijo (`live_`, `prod_`, `sk_live_`, `AIRBNB_PROD_`,
  `BOOKING_PROD_`).
- Confirmado por `grep` que **todos** los simuladores nuevos de Fase 3
  (`agoda-ical`, `booking-api`, `booking-ical`, `expedia-api`, `siteminder-pmsxchange`,
  `vrbo-ical`) importan este mismo módulo compartido — no hay un simulador nuevo que
  reimplemente su propio guardado (y por tanto pueda olvidarlo).

### Estados honestos — ningún canal se marca `produccion` sin evidencia verificable

- `packages/domain/src/channelAdapter.ts:100-104`: el comentario y la lógica de
  `evaluarEstadoConexion` documentan explícitamente "Nunca 'produccion' sin sync real
  exitoso y reciente, aunque el partner declare push 'real-time'" — el estado se deriva
  de evidencia de sincronización real (`EvidenciaConexionCanal`), no de un flag que un
  admin pueda simplemente activar.
- `H-147` (BACKLOG): "`GET /canales-mexico/catalogo`, `GET /canales-mexico/:canal/
  asistente` ... sin botón de 'marcar conectado'" — no se encontró, en el tiempo
  disponible, ninguna ruta que permita a un tenant o admin fijar manualmente el estado
  `produccion` de un canal.

## No verificado por límite de tiempo

- No se auditó el resto de `packages/adapters/src/vrbo`, `/airbnb`, `/google-vr`
  (esqueletos Nivel B) más allá de confirmar que comparten el mismo patrón "sin
  simulador por spec no pública"/"invitación exclusiva" ya documentado en el BACKLOG.
- No se verificó el asistente de conexión web (`apps/web`) pixel a pixel — solo se
  contrastó contra la descripción de H-147 en el BACKLOG.
- No se intentó forzar manualmente el estado `produccion` vía manipulación directa de
  la API (más allá de la lectura de `channelAdapter.ts`) — declarado como
  verificación por lectura, no repro ejecutable.
