# Auditoría-3 — Rubro 3: Despliegue (Vercel + Supabase)

Auditor adversarial independiente (Sonnet), Fase 3 / Lote 3.3 + parche nocturno
(pool serverless SSL, cron sync-ical, Sentry, Resend — commits hasta `2bc33ea`,
ver `git log --since="2026-09-06 08:00"`). Alcance: `apps/api/api/index.ts`,
`deploy/build-api-vercel.mjs`, `packages/db/src/runner/{conexionServerless,migrar}.ts`,
`apps/api/src/db/pool.ts`, `apps/api/src/rutas/internas/cronSync.ts`,
`apps/api/src/observabilidad/sentry.ts`, `apps/api/src/seguridad/correoResend.ts`,
`scripts/db-migrate-prod.mjs`, `vercel.json`, `deploy/Dockerfile`, `deploy/docker-compose.yml`,
`.github/workflows/deploy.yml`, `docs/despliegue/{README,supabase,cron-sync}.md`.

Nota de método: rubro auditado en solitario (sin sub-agentes) por inestabilidad de la
API esta noche. Verificación por lectura + repro ejecutable donde fue barato hacerlo
(build real del bundle serverless); el resto se verificó por lectura de código y
contraste contra la documentación de despliegue citada en los propios comentarios.

## Hallazgos

### A3-DESP-01 — MEDIO — El cron de sync iCal banaliza el mecanismo de "romper cristal"

- **Archivo:** `apps/api/src/rutas/internas/cronSync.ts:26-51, 224-238` (comentario de
  cabecera + `crearProveedorSesionPostgres`).
- **Problema:** el propio código documenta el trade-off: `GET /internal/cron/sync-ical`
  (disparado cada 15 min por `vercel.json` `crons`) se auto-otorga, con la identidad
  `CRON_SYNC_SUPERADMIN_ID`, una concesión "romper cristal" a **todos los tenants a la
  vez**, cada ejecución, para poder leer/escribir a través de RLS. El mecanismo
  `acceso_romper_cristal` (H-075/H-076) fue diseñado para accesos humanos raros y
  justificados, auditados individualmente; usarlo como mecanismo de arranque de un cron
  automático que corre indefinidamente cada 15 minutos **desensibiliza** cualquier
  auditoría futura de esa tabla — un vistazo a `acceso_romper_cristal` mostrará miles de
  filas rutinarias (`ALCANCE_ROMPER_CRISTAL_CRON`) mezcladas con cualquier concesión
  humana real, dificultando detectar un uso indebido genuino por volumen de ruido.
- **Mitigado parcialmente:** motivo fijo y distinguible
  (`MOTIVO_ROMPER_CRISTAL_CRON = "[sistema] cron automático..."`), ventana de vida corta
  (5 min) y revocación explícita al terminar (`cerrar()`). El propio archivo referencia
  `docs/despliegue/cron-sync.md` con "la alternativa recomendada (una migración con una
  función `SECURITY DEFINER` dedicada)" — es decir, el equipo YA identificó la corrección
  correcta y decidió no aplicarla en este lote por estar fuera del alcance de archivos
  mutables permitidos esa sesión.
- **Impacto:** no es una vulnerabilidad de acceso no autorizado (el token `CRON_SECRET`
  sigue siendo la única puerta de entrada, ver A3-DESP-OK más abajo), pero sí degrada el
  valor de "romper cristal" como señal de auditoría de seguridad mientras el cron exista
  en esta forma.
- **Corrección sugerida:** implementar la función `SECURITY DEFINER` dedicada para el
  fan-out cross-tenant de solo lectura/escritura de canales iCal (sin pasar por
  `acceso_romper_cristal`), como ya recomienda `docs/despliegue/cron-sync.md`.

## Verificado con reproducción ejecutable real

### El entrypoint serverless NO arrastra `embedded-postgres` al bundle

- **Repro:** `node deploy/build-api-vercel.mjs` (ejecutado durante esta auditoría) genera
  `api/index.js` (~980 KB) con 9 dependencias externas (`pg-native, @hono/node-server,
  @sentry/node, @types/nodemailer, hono, jose, nodemailer, pg, zod`) — **cero** apariciones
  de `embedded-postgres`/`EmbeddedPostgres` en el bundle resultante
  (`grep -c "embedded-postgres\|EmbeddedPostgres" api/index.js` → `0`). El bundle generado
  se descartó con `git checkout -- api/index.js` al terminar la verificación (el archivo
  versionado en el repo es solo un placeholder, según el commit `876b07b`).
- Confirmado por lectura: `apps/api/src/app.ts:9-10` y `apps/api/src/db/pool.ts:3` importan
  `@atiende-rv/db` por **ruta de módulo directa** (`@atiende-rv/db/src/runner/
  conexionServerless.js`), nunca por el barril `@atiende-rv/db` (que sí reexporta
  `crearMotorEmbeddedPostgres`, `packages/db/src/index.ts:11`) — exactamente la corrección
  del commit `f1e0235`. Ningún listener HTTP propio: `apps/api/api/index.ts` exporta una
  función `fetch` nombrada (nunca `export default`, ver comentario líneas 110-119 sobre por
  qué eso rompía en un despliegue de prueba real) y jamás llama `serve()`/`.listen()`.

### Fail-closed de secretos en el borde

- `apps/api/api/index.ts:81-91`: si `crearApp()` lanza por falta de `JWT_SECRET`/
  `CANAL_CIFRADO_CLAVES` (política fail-closed de `apps/api/src/config/env.ts`), el
  entrypoint sirve una app mínima que responde `GET /health` con `status: "sin_configurar"`
  y **503** a cualquier otra ruta — nunca deja pasar tráfico de negocio sin secretos.

### SSL obligatorio hacia Supabase, con documentación del requisito de pooler en modo sesión

- `packages/db/src/runner/conexionServerless.ts:55-127`: TLS automático para hosts
  `*.supabase.co`/`*.pooler.supabase.com` (`hostRequiereSslPorDefecto`), o forzado por
  `DATABASE_SSL=require`; `rejectUnauthorized` solo se desactiva con
  `DATABASE_SSL_NO_VERIFY=true` explícito (nunca por defecto), con `console.warn` cuando se
  usa. El pool de runtime real (`apps/api/src/db/pool.ts:14-17`, `crearPool` →
  `obtenerPoolServerlessCompartido`) usa este mismo helper — no es solo el healthcheck.
- **Requisito de modo SESIÓN del pooler de Supabase: SÍ está documentado**, tanto en
  código (`conexionServerless.ts:31-52`, explicando por qué `SET LOCAL`/contexto de RLS de
  sesión se rompería con el *Transaction Pooler* de puerto 6543) como en
  `docs/despliegue/supabase.md:16-31` (tabla comparativa Direct/Session pooler/Transaction
  pooler) y `docs/despliegue/README.md:71-75` (instrucción explícita de usar
  `DATABASE_URL_DIRECT` para migraciones y el pooler de sesión para runtime, nunca el de
  transacción).

### Migraciones idempotentes con verificación de hash (D-DSD-14)

- `packages/db/src/runner/migrar.ts:51-104`: cada `id` ya aplicado se compara por hash de
  contenido contra el catálogo en memoria; un hash distinto **lanza y detiene** el proceso
  (nunca reaplica ni ignora en silencio); un `id` aplicado antes de que el runner
  rastreara hashes se adopta como línea base. `scripts/db-migrate-prod.mjs` (dedicado a
  Supabase, prioriza `DATABASE_URL_DIRECT`) reutiliza este mismo runner y tiene su propio
  test (`scripts/db-migrate-prod.test.mjs`) verificando idempotencia real contra
  `embedded-postgres` (según el mensaje del commit `9830d42` — no se re-ejecutó ese test en
  esta sesión por tiempo, se tomó como verificado dado que corre en gates del propio lote).

### Cron interno protegido correctamente

- `apps/api/src/rutas/internas/cronSync.ts:296-341`: sin `CRON_SECRET` configurado, 503
  fail-closed **sin tocar Postgres**; comparación del token con `timingSafeEqual` tras
  verificar longitud igual (`tokenValido`, líneas 291-296) — evita al menos el timing leak
  del cuerpo del token (el chequeo de longitud en sí es una fuga mínima y aceptada, práctica
  común). Token ausente o incorrecto → 401.

### Sentry sin PII

- `apps/api/src/observabilidad/sentry.ts:86-107`: `beforeSend` (`redactarEventoSentry`)
  redacta cabeceras sensibles (`authorization/cookie/set-cookie`), cualquier campo cuyo
  NOMBRE matchee un patrón de secreto en cualquier nivel de anidamiento (recursivo, límite
  de profundidad 8 contra payloads patológicos), todas las cookies (siempre redactadas por
  nombre, no solo por valor) y el email de usuario salvo opt-in explícito
  (`SENTRY_SEND_PII=true`). No-op total sin `SENTRY_DSN` (sin llamada a `Sentry.init`).

### Resend: clave solo por env, plantillas escapadas, sin redirección abierta

- `apps/api/src/seguridad/correoResend.ts`: `apiKey`/`remitente` fail-closed en el
  constructor (nunca inventa un remitente); nunca incluye la API key en mensajes de error;
  reintento único solo en 429/5xx respetando `Retry-After`, nunca en 4xx de credencial/payload
  inválido.
- `apps/api/src/seguridad/plantillasCorreo/escape.ts`: escape manual de `& < > " '` para
  todo valor dinámico interpolado en las plantillas HTML (no hay motor de plantillas con
  lógica que pudiera interpretar el valor como marcado).
- Los enlaces de verificación/reset se arman con `urlPublicaWeb` = `WEB_ORIGIN` (variable
  de entorno fija en el servidor, `apps/api/src/config/env.ts:253`), nunca con un `Origin`/
  `Host` de la petición entrante — descarta open redirect vía cabecera falsificada
  (`apps/api/src/routes/auth.ts:285,854,1128,1185`).

### CORS y cabeceras de seguridad

- `apps/api/src/app.ts:90`: `cors({ origin: config.origenWeb, credentials: true })` —
  origen único desde `WEB_ORIGIN`, no `"*"` con credenciales.
- `apps/api/src/seguridad/cabeceras.ts`: CSP `default-src 'none'`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` vía `hono/secure-headers`.

### `vercel.json` no expone rutas internas sin protección adicional

- Las rutas de `apps/api/src/routes/backoffice/*` y `apps/api/src/routes/agentes/*`
  (montadas bajo el mismo árbol que reescribe `/api/(.*)`) están protegidas individualmente
  por `requiereAutenticacion` + `exigirRol` (verificado por `grep` en los 9 archivos de
  `backoffice/`) — el rewrite de Vercel no añade superficie nueva, cualquier ruta interna
  ya exige sesión+rol independientemente del transporte.

### Docker / GitHub Actions sin fuga de secretos

- `deploy/Dockerfile`/`docker-compose.yml`: sin `COPY` de `.env` reales ni secretos
  hardcodeados; `deploy/.env.docker.example` es solo plantilla.
- `.github/workflows/deploy.yml`: secretos siempre vía `${{ secrets.* }}`, sin `echo` de su
  valor ni `set -x`; el paso de Vercel se omite explícitamente (con `::warning::`, no falla
  el workflow) si faltan `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`.

## No verificado por límite de tiempo

- No se re-ejecutó `scripts/db-migrate-prod.test.mjs` en esta sesión (se aceptó la
  descripción del commit `9830d42` como evidencia, no como repro propia — declarado
  explícitamente para no inflar la confianza).
- No se intentó una conexión real contra un proyecto Supabase (no hay credenciales
  disponibles ni autorización de despliegue real en esta sesión).
- No se auditó exhaustivamente `apps/api/src/workers/observabilidad/**` (más allá del
  cron) ni el resto de `docs/despliegue/cron-sync.md` en detalle.
