# Auditoría-3 (Fase 3) — Resumen

## Estado al traspaso (2026-09-08, ~23:10)

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

### Pendiente para quien continúe

- **Veredicto final** (¿APTO para producción con Supabase, con qué condiciones?) — no
  escrito todavía.
- **Lista priorizada consolidada A3-nn** con severidad/archivo:línea/repro/impacto/
  corrección para los 9 hallazgos ya encontrados (ver tabla abajo) — hoy viven
  repartidos en los 5 archivos de rubro, faltaría numerarlos de forma única y
  ordenarlos por severidad en este resumen.
- **Re-verificar la alerta de `apps/api` en verde/rojo real** (`npm run test`,
  `npm run test:integration` completos) — es el bloqueante más urgente para poder dar
  cualquier veredicto responsable.
- Re-ejecutar `tests/auditoria-2/seguridad/{logs-flags,secretos-inyeccion}
  .adversarial.test.ts` (regresión de Fase 2, no se llegó a este punto).
- Auditar B-007 (commits ajenos) de los 84 commits desde `2026-09-06 08:00` — no
  hecho exhaustivamente.
- Completar la muestra de ≥30 historias `H-096+` contra código real (hoy ~23
  verificadas en profundidad vía los otros rubros).
- Notificaciones/webhooks salientes y regresiones de Fase 2 quedaron dentro de
  `calidad.md` en vez de archivos separados — así se dejó por la instrucción de
  reducir a 5 informes; reorganizar si se prefiere separarlos.

### Hallazgos encontrados hasta ahora (9), por severidad

| ID | Severidad | Rubro | Resumen | Repro |
|---|---|---|---|---|
| A3-FACT-02 | **Alto** | Facturación | Carrera TOCTOU en límite de plan: 2 altas concurrentes contra límite=1 crean 2 unidades | `tests/auditoria-3/facturacion/limitePlanRace.test.ts` (PASA) |
| A3-FACT-03 | **Alto** | Facturación | `PagosSimulado` es el fallback silencioso en producción si faltan credenciales de Stripe, sin fail-closed ni aviso en UI | Verificado por lectura (`apps/api/src/app.ts:79-82`) |
| A3-AUTH-01 | **Alto** | Auth | Rate limiting en memoria, no distribuido — ineficaz en Vercel serverless; único freno de `/mfa/verificar` | `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` (PASA) |
| A3-AUTH-02 | Medio | Auth | Token CSRF de doble envío no ligado criptográficamente a la sesión | `tests/auditoria-3/auth/csrfNoLigadoASesion.test.ts` (PASA) |
| A3-FACT-01 | Medio | Facturación | Webhook de Stripe no ordena eventos distintos por tiempo — evento viejo puede reactivar suscripción cancelada | `tests/auditoria-3/facturacion/webhookFueraDeOrden.test.ts` (PASA) |
| A3-DESP-01 | Medio | Despliegue | Cron de sync iCal se auto-otorga "romper cristal" a todos los tenants cada 15 min, desensibilizando esa señal de auditoría | Verificado por lectura (`apps/api/src/rutas/internas/cronSync.ts:26-51`) |
| A3-NOTIF-01 | Medio | Notificaciones | Firma HMAC de webhook saliente sin componente de tiempo (sin anti-replay estructural, a diferencia de Stripe) | Verificado por lectura (`packages/domain/src/notificaciones/webhookFirma.ts`) |
| A3-NOTIF-02 | Medio | Notificaciones | Clave de cifrado del secreto de webhook sin fail-closed en producción (cae a clave efímera con solo `console.warn`) | Verificado por lectura (`apps/api/src/workers/notificaciones/cifradoSecreto.ts:19-38`) |
| A3-AUTH-03 | SOSPECHA | Auth | Posible carrera en aceptación de invitación (doble alta, no account-takeover) | No reproducido — declarado SOSPECHA |
| A3-NOTIF-03 | Bajo | Notificaciones | Sin reintentos/backoff en entrega de webhook saliente (best-effort declarado) | Verificado por lectura |

**Nota importante:** ninguno de los 9 hallazgos anteriores es, por sí solo, un
bloqueante de "no lanzar nunca" — pero A3-FACT-03 (PagosSimulado en producción) y
A3-AUTH-01 (rate limit no distribuido protegiendo MFA) sí deberían resolverse ANTES de
aceptar pagos/usuarios reales en Supabase+Vercel, y la alerta de la suite de
`apps/api` en rojo debe aclararse antes de cualquier veredicto de "APTO".

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
