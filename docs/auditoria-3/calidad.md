# Auditoría-3 — Rubro 5: Calidad/DoD + Notificaciones/Webhooks salientes + Regresiones

Auditor adversarial independiente (Sonnet), Fase 3. Rubro combinado (calidad/DoD,
notificaciones/webhooks salientes del tenant, y muestra de regresión de Fase 2) por
límite de tiempo de esta sesión — ver `00-RESUMEN.md` para el estado de traspaso.

## Hallazgos — Notificaciones / Webhooks salientes (H-054)

### A3-NOTIF-01 — MEDIO — Firma HMAC del webhook saliente sin componente de tiempo (sin anti-replay estructural) — **CORREGIDO**

- **Estado:** corregido. `firmarPayloadWebhook`/`verificarFirmaWebhook`
  (`packages/domain/src/notificaciones/webhookFirma.ts`) ahora firman
  `"${timestampUnixSegundos}.${payloadSerializado}"` — el timestamp de ENVÍO es
  componente ESTRUCTURAL de la cadena firmada, exactamente el mismo algoritmo que
  este repo ya implementaba correctamente para Stripe
  (`packages/domain/src/facturacion/pagos/stripe.ts`,
  `verificarYParsearWebhook`/`TOLERANCIA_TIMESTAMP_SEGUNDOS`). `webhookSaliente.ts`
  genera el timestamp en el momento del envío (`Math.floor(Date.now() / 1000)`,
  nunca el `emitidoEn` del payload, que es dato de negocio) y lo manda en un header
  dedicado (`x-atiende-timestamp`), junto a `x-atiende-signature`.
  `verificarFirmaWebhook` rechaza (`false`, nunca lanza) cualquier timestamp fuera
  de `TOLERANCIA_TIMESTAMP_SEGUNDOS` (5 min, mismo valor que Stripe) ANTES de tocar
  la firma — una firma criptográficamente correcta pero de un timestamp viejo (una
  repetición) se rechaza igual.
- **Repro real de replay:** `packages/domain/test/notificaciones/webhookFirma.test.ts`
  ("REPLAY: una firma+timestamp VÁLIDOS pero más viejos que la tolerancia se
  RECHAZAN, aunque el HMAC en sí sea correcto" + prueba de borde de tolerancia +
  timestamp del futuro) y
  `apps/api/test/notificaciones/webhookSaliente.test.ts` ("A3-NOTIF-01 (REPLAY): un
  timestamp+firma real y VÁLIDO en el momento del envío deja de verificar como
  válido fuera de la ventana de tolerancia" — captura los headers/body reales que
  produce `enviarWebhookFirmado` y confirma que los mismos bytes, repetidos 10
  minutos después, ya no verifican). Las dos suites completas PASAN (11 tests en
  `webhookFirma.test.ts`, 9 en `webhookSaliente.test.ts`).
- **Hallazgo original** (antes de la corrección), por lectura:
  `packages/domain/src/notificaciones/webhookFirma.ts:14-36`.
- **Problema:** a diferencia del patrón de Stripe (que el propio repo replica
  correctamente en `packages/domain/src/facturacion/pagos/stripe.ts` — timestamp
  dentro de la cadena firmada + tolerancia de 5 min), el header
  `x-atiende-signature: sha256=<hex>` de los webhooks salientes de Atiende hacia el
  tenant firma solo el contenido del payload (`version, tipoEvento, titulo,
  cuerpoTexto, metadata, emitidoEn`) — `emitidoEn` es un dato de negocio, no un
  componente estructural de la firma con una ventana de tolerancia exigida. Un
  payload+firma capturado (por cualquier vía fuera del control de Atiende, p. ej. un
  proxy/log del lado del tenant) sigue siendo válido para siempre; no hay manera de
  que el receptor rechace un replay basándose solo en la firma.
- **Impacto:** bajo en la práctica (requiere una vía de captura del payload en tránsito
  o en el receptor, y HTTPS ya protege el tránsito), pero es una desviación real del
  patrón "firma con anti-replay" que el propio proyecto sí implementa correctamente
  para el caso de Stripe.
- **Corrección sugerida:** incluir un timestamp de ENVÍO (no de negocio) en la cadena
  firmada (`"${timestamp}.${payload}"`, igual que Stripe) y documentar al tenant que
  debe validar tolerancia — o, más simple, añadir un header `x-atiende-timestamp` y
  firmarlo junto al cuerpo.

### A3-NOTIF-02 — MEDIO — Clave de cifrado del secreto de webhook sin fail-closed en producción

- **Archivo:** `apps/api/src/workers/notificaciones/cifradoSecreto.ts:19-38`.
- **Problema:** `NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE` ausente cae a una clave
  EFÍMERA generada en memoria con solo un `console.warn` — nunca lanza, a diferencia
  de `JWT_SECRET`/`CANAL_CIFRADO_CLAVES` en `apps/api/src/config/env.ts:161-191`, que
  SÍ son fail-closed (lanzan) fuera de `development`/`test`. Esta variable no está
  centralizada en `cargarConfiguracion()` — se lee directo de `process.env` dentro del
  propio módulo, saltándose la política de secretos del resto del proyecto.
- **Impacto:** en un despliegue serverless (Vercel), una clave efímera generada por
  cold start significa que un secreto de webhook cifrado en una invocación puede
  volverse indescifrable en la siguiente instancia/cold start (impacto funcional: el
  webhook deja de poder firmarse correctamente sin previo aviso claro más allá de un
  `console.warn` fácil de perder en el volumen de logs de Vercel). No es una fuga
  directa de secretos (la advertencia SÍ se imprime), pero rompe con la disciplina de
  "fail-closed en el borde" que el resto del despliegue sí exige explícitamente para
  otros secretos.
- **Corrección sugerida:** mover esta variable a `cargarConfiguracion()` y aplicarle el
  mismo criterio fail-closed que `CANAL_CIFRADO_CLAVES`.

### A3-NOTIF-03 — BAJO — Sin reintentos/backoff en la entrega del webhook saliente — **CORREGIDO**

- **Estado:** corregido (decisión de producto: cerrar el hallazgo, no dejarlo
  pendiente). `apps/api/src/workers/notificaciones/webhookReintento.ts` añade una
  cola de reintento persistida (`webhook_saliente_reintento`,
  `packages/db/src/migrations/0131_webhook_saliente_reintento.ts`) siguiendo el
  MISMO patrón de diseño que `apps/api/src/workers/observabilidad/outboxWorker.ts`
  ya usa para otros eventos (una fila por entrega pendiente, un worker periódico
  que la procesa una transacción por fila, con re-chequeo `FOR UPDATE` dentro de la
  transacción) — sin reutilizar literalmente `outbox_evento`, porque modela un
  ciclo de vida distinto: esa tabla aplica un efecto exactamente una vez, mientras
  que un envío de webhook puede reintentarse VARIAS veces con backoff creciente
  hasta agotar un tope.
  - `dispatcher.ts` sigue intentando la entrega SÍNCRONA de un solo intento como
    antes (no se puede bloquear la operación de negocio que disparó la
    notificación esperando reintentos) — lo que cambia es que, si ese intento
    falla (timeout, 5xx, error de red), se encola vía `encolarReintentoWebhook` en
    vez de descartarse para siempre.
  - El worker periódico (`procesarReintentosWebhookPendientes`, expuesto en
    `GET /internal/cron/webhooks-retry` —
    `apps/api/src/rutas/internas/cronWebhooksReintento.ts`, protegido por
    `CRON_SECRET` igual que `GET /internal/cron/sync-ical`, cada 5 min en
    `vercel.json`) reintenta con backoff exponencial ACOTADO: 1min/5min/30min/2h
    (`BACKOFF_REINTENTO_WEBHOOK_MS`), resolviendo la config vigente del tenant en
    el momento del reintento (nunca una copia obsoleta).
  - Entrega exitosa → la fila se BORRA (idempotencia hacia adelante: nunca se
    reenvía una tercera vez tras recuperarse). Entrega fallida tras agotar
    `MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO` (5 intentos totales: el síncrono +
    los 4 escalones de backoff) → la fila pasa a `estado = 'agotado'` (fallo
    PERMANENTE, nunca reintentos infinitos), se CONSERVA para revisión humana, y
    se loggea (`webhook_reintento_agotado`). `contarWebhookReintentoPorEstado`
    queda expuesto en `GET /health/detallado` (mismo criterio que
    `contarPendientesOutbox`).
  - **Pruebas:** `apps/api/test/notificaciones/webhookReintento.test.ts` (8 tests
    — backoff estrictamente creciente y medible sobre `proximo_intento_en` real,
    fallo permanente tras agotar intentos sin volver a invocar el envío,
    idempotencia: una entrega recuperada al 2º intento nunca reenvía un 3º),
    `apps/api/test/notificaciones/dispatcher.test.ts` (3 casos nuevos: encola al
    fallar, nunca encola si se entrega, nunca propaga si el propio encolado
    falla) y `apps/api/test/notificaciones/cronWebhooksReintento.test.ts` (6 tests
    de auth fail-closed/401/200/500 del endpoint HTTP). Las 364 pruebas de
    `apps/api` y las 89 de `packages/db` pasan en verde.
- **Límite conocido, documentado a propósito** (mismo criterio que
  `outboxWorker.ts`): esto asume UN solo worker/invocación de cron activo a la
  vez — sin `SELECT ... FOR UPDATE SKIP LOCKED` no hay protección contra dos
  invocaciones concurrentes tomando la misma fila. El cron real (Vercel Cron, un
  solo disparo por horario) no produce ese escenario en producción.
- **Hallazgo original** (antes de la corrección), por lectura: el envío era
  explícitamente "best-effort" — un solo intento, sin cola de reintento ni
  backoff. Un fallo transitorio del lado del tenant (su endpoint caído por 30
  segundos) descartaba la notificación para siempre, sin reintento posterior.

## Verificado y BIEN implementado (Notificaciones)

- **SSRF de webhooks salientes**: `apps/api/src/workers/notificaciones/
  webhookSaliente.ts` resuelve DNS y valida TODAS las IPs resultantes contra la
  deny-list compartida de Fase 2 antes de conectar, rechaza esquemas distintos de
  `https:`, rechaza credenciales embebidas en la URL, y usa `redirect: "manual"` para
  nunca seguir una redirección automáticamente (cierra la clase de ataque
  "redirección hacia IP privada" sin reimplementar el pinning DNS→conexión).
- **Verificación de firma en tiempo constante**: `verificarFirmaWebhook` usa
  `timingSafeEqual` y compara longitudes antes, nunca `===`.
- **Cifrado en reposo del secreto HMAC**: AES-256-GCM con IV/tag propios por fila
  (cuando la clave SÍ está configurada — ver A3-NOTIF-02 para el caso contrario).

## Regresiones de Fase 2 — muestra verificada

- **Grep de promesas indebidas** ("tiempo real", "cero overbooking", "Booking
  conectado") sobre `apps/web/src`, `apps/api/src`, `packages/*/src`: todas las
  coincidencias encontradas son DESMENTIDOS explícitos ("Nunca decimos 'tiempo
  real'...") o nombres de tipo/constante legítimos (`overbooking_confirmado` como
  valor de enum de conflicto, no una promesa de "cero overbooking") — sin
  regresión encontrada.
- **SSRF (iCal + webhooks salientes)**: `tests/adversarial/ssrf/casos.test.ts`
  ejecutado en esta sesión — **11/11 en verde** tras los adaptadores nuevos de Fase 3.
- **Anti-eco de canales**: `tests/adversarial/canales/casos.test.ts` — **3/3 en verde**,
  incluido el caso nuevo de Fase 3 (puente SiteMinder).
- **RLS/NODE_ENV vacío**: `npx vitest run --config tests/auditoria-2/seguridad/
  vitest.config.rls-auth.ts` — **13/13 en verde**, confirmando que las correcciones de
  Fase 2 siguen vigentes: aislamiento de tenant bajo pool compartido (200 requests
  entrelazadas admin-A/admin-B, cero fuga), `JWT_SECRET` hardcodeado de desarrollo ya
  no es aceptado, canal lateral de tiempo en `/auth/login` sigue neutralizado (mismo
  costo de `scrypt` exista o no el usuario), motivo de "romper cristal" de solo
  espacios sigue rechazado con 422, y una concesión revocada no se puede reutilizar.
  `logs-flags`/`secretos-inyeccion` NO se re-ejecutaron por límite de tiempo — pendiente.
- **ALERTA — suite completa de `apps/api` con fallas no explicadas**: `npx vitest run`
  en `apps/api` (tras corregir `node_modules` con `npm install`) terminó con
  **4 archivos de prueba fallidos, 16 pruebas fallidas de 331** (incluye un error
  `FATAL 57P01` de Postgres en `test/integration/canalesCatalogo.test.ts`, compatible
  con agotamiento de recursos por correr muchas instancias de `embedded-postgres` en
  paralelo en esta máquina de auditoría, no necesariamente un bug real de producto) —
  **NO se determinó en el tiempo disponible si es un flake de entorno (muy probable,
  dado el patrón de error de conexión Postgres) o una regresión real**. Esto contradice
  la cifra "test 780 ... todo verde" de `docs/PROGRESO.md` y debe re-verificarse con
  `npm run test`/`test:integration` completos, preferentemente en una máquina con menos
  contención, antes de dar el veredicto final por bueno.

## Calidad/DoD

- **BACKLOG vs. realidad**: `docs/fase2/BACKLOG.md` — de las historias `H-` listadas,
  solo **1 de ~124** está marcada `por hacer` (H-048, prioridad COULD, multi-empresa-
  gestora sin fuga cruzada — no bloqueante) y **1** marcada honestamente `parcial`
  (H-091, modo degradado de solo-lectura — el propio backlog explica qué falta y por
  qué se dejó fuera). El resto declara `hecho`. Se verificaron por profundidad, no solo
  por el texto del backlog, las historias H-096–H-108 (auth), H-140–H-148 (canales),
  H-149–H-155 (facturación/despliegue) — cubiertas en `seguridad-auth.md`,
  `canales.md`, `facturacion-onboarding.md`/`despliegue.md` respectivamente — y se
  encontraron 6 hallazgos reales (2 alto, 3 medio, 1 bajo) pese a que el backlog las
  marca todas `hecho`: el marcador `hecho` del backlog es honesto sobre "se construyó
  la funcionalidad", no sobre "sin defectos" — matiz importante para el veredicto.
- **Colisiones de migraciones**: `ls packages/db/src/migrations/*.ts` sobre los
  prefijos numéricos → **0 duplicados** (71 archivos, 71 prefijos distintos).
- **Commits ajenos a la ruta permitida (B-007)**: NO se auditó exhaustivamente cada uno
  de los 84 commits desde `2026-09-06 08:00` por límite de tiempo — se encontró **un**
  archivo de producto sin commitear en el árbol de trabajo al momento de este rubro
  (`apps/web/src/pages/calendario/cacheOcupaciones.ts`, no tocado por esta auditoría,
  dejado intacto) y una modificación no comiteada a `docs/AGENTES.md`/`docs/PROGRESO.md`
  /`docs/BLOQUEOS.md`/`docs/logs/bucle.log` — ambas atribuibles al orquestador
  concurrente de esta misma sesión de filesystem, no a un lote de construcción; no se
  interpretan como violación de B-007 de un lote de código.
- **Dependencias declaradas vs. instaladas**: se encontró `node_modules` local
  desincronizado de `package-lock.json` (faltaban `@sentry/node`/`@sentry/react`) al
  inicio de esta sesión — corregido con `npm install` (sin cambios en
  `package-lock.json`, confirmado con `git status`), así que es un problema de
  entorno local de esta sesión de auditoría, no del repo — advertencia para cualquiera
  que clone en frío: correr `npm ci`, nunca asumir que `node_modules` está al día.
- **Capturas/evidencia**: no se auditó exhaustivamente por límite de tiempo — se
  encontraron referencias a capturas reales en `docs/capturas/` desde `docs/PROGRESO.md`
  (p. ej. `lote3-0-{pricing-paridad,monitor-latencia}.png`) pero no se abrieron para
  verificar su contenido.

## No verificado por límite de tiempo (declarar honestamente)

- Re-ejecución completa de los gates (`npm run test`/`test:integration`/
  `test:adversarial`) para reconfirmar "780/186/52" tras el fix de `npm install` —
  se lanzó `npx vitest run` en `apps/api` en background al momento del traspaso, sin
  resultado confirmado a tiempo.
- Auditoría línea por línea de los 84 commits desde 08:00 para B-007.
- Muestra completa de ≥30 historias H-096+ con verificación de código (se cubrieron
  ~23 en profundidad vía los otros rubros, no 30).
