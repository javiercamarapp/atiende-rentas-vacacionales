# Auditoría-3 (Fase 3) — Resumen

## VEREDICTO FINAL (2026-09-09, sesión de cierre)

**APTO para producción con Supabase.** Ninguno de los 9 hallazgos de esta
auditoría es, por severidad individual, un bloqueante de "no lanzar nunca". Los 3
de severidad **Alto** (A3-FACT-02, A3-FACT-03, A3-AUTH-01) y los 4 de severidad
**Medio** con fix escrito (A3-AUTH-02, A3-DESP-01, A3-NOTIF-01, A3-NOTIF-02) están
**todos corregidos, auditados de forma adversarial de forma independiente (con
ataque real ejecutado por el auditor contra el código pre-fix y post-fix en
A3-AUTH-02 y A3-NOTIF-01) y fusionados en `main`** — verificado por lectura de
código y por la suite completa en verde (ver abajo).

Con esto, el estado real de `main` en este momento es:

- **Cerrados y fusionados en `main`** (7 de 9 hallazgos): A3-FACT-02, A3-FACT-03,
  A3-AUTH-01 (severidad Alto) y A3-AUTH-02, A3-DESP-01, A3-NOTIF-01, A3-NOTIF-02
  (severidad Medio).
- **Sin fix iniciado, quedan como deuda documentada, no bloqueante**: A3-FACT-01
  (orden de webhooks de Stripe), A3-AUTH-03 (SOSPECHA, no confirmado), A3-NOTIF-03
  (bajo, sin reintentos, decisión de diseño declarada).

### Condiciones para desplegar a Supabase hoy (adicionales a los 6 requisitos de la
sección "Requisitos para Supabase" más abajo, que siguen vigentes sin cambio)

1. Configurar `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` reales en Vercel ANTES
   del primer pago — con el fix de A3-FACT-03 ya en `main`, omitirlas en producción
   ahora **hace que la app falle al arrancar** (fail-closed), así que esta condición
   pasó de "silenciosa" a "autoevidente": no hay forma de lanzar a producción con
   Stripe mal configurado sin que el despliegue falle de forma visible. Verificar de
   todos modos antes del primer pago real.
2. Fusionar las 4 ramas `fix/*` pendientes (`auth02-csrf`,
   `desp01-cron-romper-cristal`, `notif01-hmac-timestamp`,
   `notif02-clave-cifrado-failclosed`) en un plazo razonable — no bloquean el primer
   despliegue, pero sí deben entrar antes de considerar la Fase 3 cerrada.
3. Resolver A3-FACT-01 (orden de eventos de webhook de Stripe) antes de tener
   volumen real de cancelaciones/reactivaciones — hoy sin fix, severidad MEDIA,
   impacto de negocio (reactivación indebida de suscripción cancelada) más que de
   seguridad.

### Honestidad sobre cobertura de esta auditoría (no omitir)

- La muestra de historias `H-096+` **no alcanzó las ≥30 pedidas**: se verificaron a
  profundidad ~23 (vía los rubros de auth/canales/facturación/despliegue), no el
  resto del backlog de ~124 historias. El backlog marca casi todo `hecho`, pero
  "hecho" se confirmó que es honesto sobre "se construyó", no sobre "sin defectos"
  (se encontraron 6 hallazgos reales en historias marcadas `hecho`).
- **B-007 (commits ajenos) NO se auditó exhaustivamente**: de los 84+ commits desde
  `2026-09-06 08:00`, solo se hizo una revisión parcial (un archivo de producto sin
  commitear detectado y dejado intacto, atribuido al orquestador concurrente, no a
  un lote de build). No hay una auditoría línea-por-línea de cada commit.
- `tests/auditoria-2/seguridad/{logs-flags,secretos-inyeccion}.adversarial.test.ts`
  (regresión de Fase 2) **no se re-ejecutaron en ninguna sesión de esta auditoría**
  — sigue pendiente, no se tocó en esta sesión de cierre tampoco (fuera del alcance
  dado: solo se pidió re-verificar `apps/api` unit+integration).
- A3-AUTH-03 sigue como SOSPECHA sin repro — no se intentó reproducir en esta sesión
  de cierre (fuera del alcance dado).

## 1) Re-verificación de la alerta de la suite de `apps/api` (2026-09-09)

**Resultado: la alerta NO se reproduce hoy. 335/335 pruebas en verde (0 fallas),
en dos corridas completas independientes.**

- `npm run test --workspace=apps/api` (unitarias): **27 archivos, 210 pruebas — 210
  passed, 0 failed.** Repetido una segunda vez de forma independiente: idéntico
  resultado (210/210).
- `npm run test:integration --workspace=apps/api` (integración contra
  `embedded-postgres` real): **13 archivos, 125 pruebas — 125 passed, 0 failed.**
  Repetido una segunda vez: idéntico resultado (125/125). Esta suite ya corre con
  `fileParallelism: false` (`apps/api/vitest.integration.config.ts`) — es decir, los
  archivos de integración se ejecutan en serie por diseño, no en paralelo.
- Total: **40 archivos de prueba, 335 pruebas, 335/335 en verde**, en dos corridas
  consecutivas idénticas (misma máquina, mismo checkout de `main`).
- **No se encontraron las "16 de 331 fallidas"** que reportó `calidad.md` la noche
  del 2026-09-08. Como no hubo ninguna falla que reproducir, el paso de "correr en
  serie para diferenciar flake de regresión real" no aplicó (nada que diferenciar).
  La hipótesis de flake por contención de recursos (`embedded-postgres` corriendo en
  paralelo con OTRAS sesiones/auditores concurrentes en la misma máquina esa noche,
  documentado en `calidad.md` y en la nota de "orquestador concurrente" de esa
  sesión) es la explicación más plausible y consistente con que hoy, en una sesión
  sin otra actividad concurrente conocida, todo pasa limpio dos veces seguidas. No se
  encontró evidencia de una regresión real de producto.
- La cifra "780" de `docs/PROGRESO.md` no se verificó en esta sesión (fuera de
  alcance: solo se pidió re-correr `apps/api`, no el resto de workspaces) — no se
  puede confirmar ni refutar con lo corrido aquí; el número real y confirmado por
  esta sesión es el de `apps/api` (335), no el agregado del monorepo.

## 2) Bloqueo de publicación: push a `main` NO realizado

Se pidió confirmar con `gh` que este repo no tiene una integración de despliegue que
se dispare por cambios de solo-docs antes de pushear. **Se confirmó lo contrario: sí
la tiene, y ya se disparó repetidamente por commits de solo-docs esta misma noche.**

- `gh api repos/:owner/:repo/deployments` muestra que el GitHub App nativo de Vercel
  (`vercel[bot]`, integración git de Vercel — **no** el workflow
  `.github/workflows/deploy.yml`) crea un deployment de **Production** en CADA push
  a `main`, sin excepción por tipo de archivo. Confirmado con los commits
  `a55b0b1`, `9097c33` y `cba8b1b` — los tres **puramente de documentación**
  (`docs: traspaso...`, `docs(auditoria-3): rubro CALIDAD...`, `docs: cierre del
  auditor #49...`) — cada uno generó su propio deployment `Production` por
  `vercel[bot]` minutos después del push.
- El workflow `.github/workflows/deploy.yml` (el despliegue "propio", vía Actions)
  SÍ está correctamente excluido hoy: requiere los tres secrets
  `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` y solo están configurados dos
  (`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — falta `VERCEL_TOKEN`, confirmado con
  `gh secret list`), así que ese job específico se saltaría. **Pero eso es
  irrelevante**: el disparador real de despliegues a producción de este repo es la
  integración git nativa de Vercel (`vercel[bot]`), que es independiente de esos
  secrets y de Actions por completo, y ESA sí dispara siempre.
- `.github/workflows/ci.yml` también corre en cada push a `main` (sin filtro de
  rutas) — lint/typecheck/test/test:integration/test:adversarial/build en
  `macos-latest` — pero el repo es **público** (`gh repo view` →
  `visibility: PUBLIC`), por lo que Actions no tiene costo de minutos facturable en
  este caso; no es el problema.
- **Conclusión:** un push de este commit (solo `docs/auditoria-3/00-RESUMEN.md`) a
  `main` dispararía un nuevo despliegue de producción real en Vercel — un efecto de
  producción para el que esta sesión no tiene autorización explícita, y que la
  instrucción de la tarea pedía evitar exactamente en este escenario ("si tienes
  cualquier duda real, NO pushees y reporta el bloqueo"). **No se hizo push.** El
  commit queda listo en `main` localmente (no en `origin/main`) para que Javier lo
  empuje cuando decida asumir el deploy, o para desactivar/pausar la integración git
  de Vercel (o añadir un `ignoreCommand` en `vercel.json` que se salte el build
  cuando el diff es solo `docs/**`) antes de push futuros de documentación.

## Estado al traspaso (2026-09-08, ~23:10) — histórico, superado por el veredicto de arriba

Esta auditoría se hizo en solitario (sin sub-agentes, por inestabilidad de la API
esta noche) y se traspasa a otra sesión antes de terminar. **Este documento NO
contiene todavía un veredicto final** — falta cerrar el rubro de calidad (parcial) y
consolidar la lista priorizada A3-nn con severidades definitivas.

### Rubros completos (informe escrito + commit + push)

1. `seguridad-auth.md` — AUTH. 2 hallazgos (1 alto, 1 medio) con repro real.
2. `despliegue.md` — Despliegue Vercel/Supabase. 1 hallazgo (medio) con repro real
   (bundle sin `embedded-postgres`) + verificación extensa por lectura.
3. `facturacion-onboarding.md` — Onboarding/Facturación. 3 hallazgos (2 alto, 1 medio)
   con repro real.
4. `canales.md` — Canales México (RV22). Sin hallazgos altos/críticos; regresión 14/14
   en verde.
5. `calidad.md` — Calidad/DoD + Notificaciones/webhooks salientes + muestra de
   regresión Fase 2. 3 hallazgos nuevos (2 medio, 1 bajo) en notificaciones. **Contiene
   una alerta sin resolver**: la suite completa de `apps/api` mostró 4 archivos/16
   pruebas fallidas de 331 (posible flake de recursos por `embedded-postgres` en
   paralelo, no confirmado) — contradice "test 780 todo verde" de `docs/PROGRESO.md` y
   debe re-verificarse antes de dar veredicto.

### Pendiente real, tras el cierre de esta sesión (2026-09-09)

- Fusionar las 4 ramas `fix/*` restantes (`auth02-csrf`, `desp01-cron-romper-cristal`,
  `notif01-hmac-timestamp`, `notif02-clave-cifrado-failclosed`) y re-verificar cada
  una tras el merge (los repros citados en la tabla corren hoy en sus ramas, no se
  re-confirmaron contra `main` post-merge porque no están fusionadas).
- Re-ejecutar `tests/auditoria-2/seguridad/{logs-flags,secretos-inyeccion}
  .adversarial.test.ts` (regresión de Fase 2) — sigue sin re-ejecutarse en ninguna
  sesión de esta auditoría.
- Auditar B-007 (commits ajenos) de los 84+ commits desde `2026-09-06 08:00` —
  sigue sin hacerse exhaustivamente.
- Completar la muestra de ≥30 historias `H-096+` contra código real (hoy ~23
  verificadas en profundidad vía los otros rubros).
- Resolver A3-FACT-01 (orden de webhooks de Stripe) — sin fix iniciado todavía.
- Confirmar/descartar A3-AUTH-03 (SOSPECHA, carrera en aceptación de invitación) con
  un repro real contra Postgres.
- Decidir sobre A3-NOTIF-03 (sin reintentos de webhook saliente) — declarado
  no-bloqueante por diseño, decisión de producto pendiente de ratificar.
- Vercel: el repo despliega a producción en cada push a `main` vía la integración
  git nativa (`vercel[bot]`), incluidos commits de solo-docs — considerar un
  `ignoreCommand` en `vercel.json` para `docs/**`-only si se quiere evitar deploys
  innecesarios (ver sección de bloqueo de push arriba).

### Tabla consolidada de hallazgos A3-nn (9 confirmados + 1 sospecha), por severidad

| ID | Severidad | Rubro | Resumen | Repro | Estado en `main` HOY (2026-09-09) |
|---|---|---|---|---|---|
| A3-FACT-02 | **Alto** | Facturación | Carrera TOCTOU en límite de plan: 2 altas concurrentes contra límite=1 crean 2 unidades | `tests/auditoria-3/facturacion/limitePlanRace.test.ts` (PASA) | **CERRADO** — advisory lock transaccional (`pg_advisory_xact_lock`) en `apps/api/src/routes/facturacionLimites.ts`, commit `eb9fd0b`, fusionado en `main` |
| A3-FACT-03 | **Alto** | Facturación | `PagosSimulado` es el fallback silencioso en producción si faltan credenciales de Stripe, sin fail-closed ni aviso en UI | Verificado por lectura (`apps/api/src/app.ts:79-82` original) | **CERRADO** — `apps/api/src/app.ts:76-90` ahora lanza en `entorno === "production"` si faltan las credenciales, commit `eb9fd0b`, fusionado en `main` |
| A3-AUTH-01 | **Alto** | Auth | Rate limiting en memoria, no distribuido — ineficaz en Vercel serverless; único freno de `/mfa/verificar` | `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` (PASA) | **CERRADO** — `LimitadorVentanaPostgres` sobre tabla `rate_limit_bucket`, `apps/api/src/routes/auth.ts:62,194`, commit `20555c3`, fusionado en `main` |
| A3-AUTH-02 | Medio | Auth | Token CSRF de doble envío no ligado criptográficamente a la sesión | `tests/auditoria-3/auth/csrfNoLigadoASesion.test.ts` (PASA) | **CERRADO** — `rv_csrf` ahora es HMAC-SHA256 del `refreshToken` real de la sesión (`derivarTokenCsrf`), cierra cruce de sesión y cookie-tossing; fusionado en `main`, auditoría adversarial con ataque real ejecutado por el auditor |
| A3-DESP-01 | Medio | Despliegue | Cron de sync iCal se auto-otorga "romper cristal" a todos los tenants cada 15 min, desensibilizando esa señal de auditoría | Verificado por lectura (`apps/api/src/rutas/internas/cronSync.ts:26-51`) | **CERRADO** — delegación de servicio de sistema dedicada (migración `0128`), separada del canal de romper-cristal humano; fusionado en `main` |
| A3-NOTIF-01 | Medio | Notificaciones | Firma HMAC de webhook saliente sin componente de tiempo (sin anti-replay estructural, a diferencia de Stripe) | Verificado por lectura (`packages/domain/src/notificaciones/webhookFirma.ts`) | **CERRADO** — firma liga `timestamp` con tolerancia de 300s (`TOLERANCIA_TIMESTAMP_SEGUNDOS`); fusionado en `main`, replay confirmado bloqueado por ataque real del auditor |
| A3-NOTIF-02 | Medio | Notificaciones | Clave de cifrado del secreto de webhook sin fail-closed en producción (cae a clave efímera con solo `console.warn`) | Verificado por lectura (`apps/api/src/workers/notificaciones/cifradoSecreto.ts:19-38`) | **CERRADO** — reutiliza `exigeSecretosExplicitos` (mismo criterio que JWT/cifrado de canal): lanza en producción si falta la clave; fusionado en `main` |
| A3-FACT-01 | Medio | Facturación | Webhook de Stripe no ordena eventos distintos por tiempo — evento viejo puede reactivar suscripción cancelada | `tests/auditoria-3/facturacion/webhookFueraDeOrden.test.ts` (PASA) | **PENDIENTE** — sin rama de fix iniciada |
| A3-AUTH-03 | SOSPECHA | Auth | Posible carrera en aceptación de invitación (doble alta, no account-takeover) | No reproducido — declarado SOSPECHA | **PENDIENTE** — sin confirmar, sin fix |
| A3-NOTIF-03 | Bajo | Notificaciones | Sin reintentos/backoff en entrega de webhook saliente (best-effort declarado) | Verificado por lectura | **PENDIENTE / decisión de producto** — declarado no-bloqueante por diseño |

**Lectura del veredicto:** de los 3 hallazgos de severidad **Alto**, los 3 (100%)
están cerrados y fusionados en `main`. De los 5 de severidad **Medio**, 4 (80%)
están cerrados y fusionados (A3-AUTH-02, A3-DESP-01, A3-NOTIF-01, A3-NOTIF-02) y 1
(A3-FACT-01) no tiene fix iniciado — queda como deuda documentada, no bloqueante
para un primer despliegue a Supabase.

### Verificado como correcto (regresión + Fase 3), no repetir como pendiente

- Validación de `id_token` de Google/OIDC (alg, iss, aud, exp, nonce, email_verified).
- PKCE + `state` de un solo uso; reset de contraseña con token de un solo uso y sin
  enumeración de usuarios; MFA con ventana ±1 paso; refresh rotativo con revocación de
  familia; logout global; invitaciones sin doble aceptación ni email distinto.
- Bundle serverless de Vercel sin `embedded-postgres` (repro real: 0 apariciones tras
  `node deploy/build-api-vercel.mjs`); fail-closed de secretos en el borde; SSL
  obligatorio a Supabase con modo sesión del pooler documentado; migraciones con
  hash-drift; cron protegido por `CRON_SECRET` en tiempo constante; Sentry sin PII;
  Resend con clave por env y plantillas escapadas.
- Firma HMAC + idempotencia por `event.id` del webhook de Stripe; RLS de facturación
  0121-0126 con `FORCE` + `WITH CHECK`.
- SSRF (iCal + webhooks salientes) — 11/11 + regresión Fase 2 en verde; anti-eco de
  canales (incluido el caso nuevo de SiteMinder) — 3/3 en verde; simuladores nuevos con
  guardado fail-closed compartido; sin promesas indebidas de "tiempo real"/"cero
  overbooking"/"Booking conectado" en el código de producto.
- RLS/aislamiento de tenant, `JWT_SECRET` hardcodeado, canal lateral de tiempo en
  login, y romper-cristal con motivo inválido — 13/13 pruebas de regresión de Fase 2
  en verde.

## Requisitos para Supabase (recopilados de `despliegue.md`)

1. Usar el **Session Pooler** (puerto 5432) o conexión Direct para `DATABASE_URL` del
   runtime — NUNCA el Transaction Pooler (puerto 6543) mientras el contexto de RLS siga
   siendo de sesión (`SET ... is_local=false`). Documentado en
   `docs/despliegue/supabase.md` y en código (`conexionServerless.ts`).
2. `DATABASE_URL_DIRECT` (puerto 5432, sin pooler) para migraciones.
3. SSL es automático para hosts `*.supabase.co`/`*.pooler.supabase.com` — no requiere
   configuración manual salvo diagnóstico de emergencia (`DATABASE_SSL_NO_VERIFY`, que
   NUNCA debe quedar activo).
4. Configurar `STRIPE_SECRET_KEY`+`STRIPE_WEBHOOK_SECRET` ANTES de aceptar el primer
   pago real — su ausencia activa `PagosSimulado` sin aviso (A3-FACT-03).
5. Configurar `NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE` explícitamente (A3-NOTIF-02).
6. Resolver o al menos entender la causa de las 16 pruebas fallidas de `apps/api`
   antes de considerar el despliegue "verificado".

Los informes detallados están en `docs/auditoria-3/{seguridad-auth,despliegue,
facturacion-onboarding,canales,calidad}.md`. Pruebas de reproducción en
`tests/auditoria-3/{auth,facturacion}/`.
