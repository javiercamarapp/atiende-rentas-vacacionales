# Auditoría-3 — Rubro 2: Onboarding y Facturación

Auditor adversarial independiente (Sonnet), Fase 3 / Lote 3.3. Alcance:
`apps/api/src/routes/{onboarding,facturacion,facturacionLimites}.ts`,
`packages/domain/src/facturacion/**`, `packages/db/src/migrations/0121`–`0126`.
Verificación por lectura + reproducción ejecutable en `tests/auditoria-3/facturacion/`.

Nota de método: rubro auditado en solitario (sin sub-agentes) por inestabilidad de la
API esta noche. Se priorizaron los tres puntos de mayor impacto de negocio (webhook
fuera de orden, carrera de límites de plan, alcanzabilidad de PagosSimulado en
producción) y se marcan como SOSPECHA los puntos no verificados con repro real.

## Hallazgos

### A3-FACT-01 — MEDIO — `facturacion_registrar_pago()` no ordena eventos de webhook fuera de secuencia — **CORREGIDO**

- **Estado:** corregido. `suscripcion_tenant` gana la columna
  `ultimo_evento_stripe_creado_en` (epoch en segundos, migración
  `0129_facturacion_orden_webhook.ts`) con el `created` del ÚLTIMO evento de Stripe
  que efectivamente aplicó un cambio de estado para ese tenant.
  `facturacion_registrar_pago()` gana un séptimo parámetro, `_evento_creado_en`
  (mismo epoch), y solo aplica el `UPDATE` de estado si no hay ningún evento previo
  aplicado (`NULL`, primera vez) o si el evento entrante es estrictamente más nuevo
  que el último aplicado — un evento cronológicamente más viejo entregado tarde
  SIGUE registrándose en `evento_pago_procesado` (la idempotencia de reintentos del
  MISMO `evento_id` no cambia en absoluto) pero ya no pisa el estado más nuevo. El
  parámetro tiene `DEFAULT extract(epoch FROM clock_timestamp())::bigint` y la
  comparación es NULL-safe en ambos lados, para que un llamador que aún no lo pasa
  (u órdenes de Stripe sin `created`, aunque Stripe siempre lo incluye en eventos
  reales) siga aplicando el efecto exactamente como antes de esta migración, sin
  romper ningún llamador existente. `EventoWebhookPago.creadoEnEpoch`
  (`packages/domain/src/facturacion/pagos/interfaz.ts`) transporta el epoch desde
  `PagosStripe.verificarYParsearWebhook` (campo `created` del evento) hasta la ruta
  HTTP (`apps/api/src/routes/facturacion.ts`), que lo reenvía a la función SQL.
- **Repro actualizado:** `tests/auditoria-3/facturacion/webhookFueraDeOrden.test.ts` —
  PASA (5 tests). El caso original (evento `updated` entregado después de un
  `deleted` pero cronológicamente anterior) ya NO reactiva la suscripción cancelada;
  se agregó (a) una variante con otro par de estados (`pago_pendiente` no vuelve a
  `activa`), (b) el camino feliz de orden normal (evento nuevo después de uno viejo
  SÍ cambia el estado), (c) el reintento exacto del mismo `evento_id` sigue siendo
  idempotente sin importar el `_evento_creado_en` del reintento, y un quinto caso
  que confirma que un llamador que omite el parámetro (código previo a esta
  migración) sigue funcionando. La suite de integración existente
  (`packages/db/test/integration/facturacionOnboardingRls.test.ts`,
  `apps/api/test/integration/onboardingFacturacion.test.ts`, que ejercitan la ruta
  HTTP real con fixtures de Stripe sin `created`) sigue en verde con el nuevo
  parámetro activo.
- **Hallazgo original (contexto, ya no vigente):**
- **Archivo:** `packages/db/src/migrations/0124_facturacion_webhook.ts:29-72`
  (`facturacion_registrar_pago`); consumido desde
  `apps/api/src/routes/facturacion.ts:380-448` (`POST /webhooks/stripe`).
- **Problema:** la deduplicación por `(proveedor, evento_id)` es correcta para
  reintentos del MISMO evento (`ON CONFLICT ... DO NOTHING`), pero la función hace un
  `UPDATE suscripcion_tenant SET estado = _estado ...` incondicional para cualquier
  evento NUEVO, sin comparar contra ninguna marca de tiempo/versión del evento
  anterior. Stripe documenta explícitamente que los webhooks pueden entregarse fuera
  de orden.
- **Repro:** `tests/auditoria-3/facturacion/webhookFueraDeOrden.test.ts` — PASA.
  Se procesa primero un evento de cancelación real (`estado='cancelada'`) y después
  un evento *distinto* (`evento_id` diferente, no un reintento) que en el mundo real
  ocurrió antes pero se entregó después con `estado='activa'` — la suscripción queda
  reactivada. Salida real: `1 passed`.
- **Impacto:** un tenant cuya suscripción fue cancelada de verdad (tarjeta rechazada,
  cancelación del cliente) puede volver a aparecer como `activa` si un evento más
  viejo llega después, recuperando acceso "pagado" indebidamente hasta que otro
  evento lo corrija (si llega).
- **Corrección sugerida:** guardar el `created` (timestamp del evento de Stripe) junto
  al estado, y en `facturacion_registrar_pago` solo aplicar el `UPDATE` si el evento
  entrante es más reciente que el último aplicado para ese tenant (o usar
  `customer.subscription.updated`/`.deleted` con el campo `data.object.status` de
  Stripe como fuente de verdad en vez de un mapeo fijo por tipo de evento).

### A3-FACT-02 — ALTO — Carrera (TOCTOU) en el límite de plan por unidad/cuenta de canal

- **Archivo:** `apps/api/src/routes/facturacionLimites.ts:26-73` (`exigirLimitePlan`).
- **Problema:** el límite se aplica como "leer uso actual (`medicion_uso_actual`, un
  `count(*)`) → comparar contra el límite → si permite, la ruta hace el INSERT real" —
  sin ningún lock (advisory lock, `SELECT ... FOR UPDATE`, transacción `SERIALIZABLE`)
  que abarque ambos pasos. Documentado en el propio comentario de cabecera como una
  aplicación "en servidor", pero no como una aplicación atómica.
- **Repro:** `tests/auditoria-3/facturacion/limitePlanRace.test.ts` — PASA. Con el
  plan `esencial` limitado a 1 unidad activa y 0 unidades existentes, dos llamadas
  concurrentes a `exigirLimitePlan` + `INSERT INTO unidad` (vía `Promise.allSettled`)
  **ambas** pasan el chequeo y **ambas** insertan — el tenant termina con 2 unidades
  activas contra un límite de 1. Salida real: `1 passed`
  (`creadas === 2`, `unidadesReales === 2`).
- **Impacto:** un tenant en el plan más barato puede exceder su límite contratado
  (unidades, cuentas de canal, o indirectamente mensajes de IA si esa ruta comparte el
  mismo patrón) disparando varias peticiones de alta en paralelo — pérdida de ingreso
  por unidades no facturadas, no una escalada de privilegio.
- **Corrección sugerida:** envolver el chequeo + el INSERT en una única transacción con
  `SELECT ... FOR UPDATE` sobre una fila de "contador" por tenant (o un advisory lock
  por `tenant_id`), o usar una restricción a nivel de base de datos (p. ej. un trigger
  `BEFORE INSERT` en `unidad` que revalide el límite dentro de la misma transacción del
  INSERT, en vez de en una consulta previa separada).

### A3-FACT-03 — ALTO — `PagosSimulado` es el *fallback* silencioso en cualquier entorno, incluida producción

- **Archivo:** `apps/api/src/app.ts:79-82`
  (`construirPagosStripeDesdeEntorno({...}) ?? new PagosSimulado()`);
  `packages/domain/src/facturacion/pagos/stripe.ts:201-214`
  (`tieneCredencialesStripe`/`construirPagosStripeDesdeEntorno`);
  `apps/api/src/config/env.ts` (sin ningún chequeo fail-closed de
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` en producción, a diferencia de
  `JWT_SECRET`/`CANAL_CIFRADO_CLAVES`, líneas 161-191).
- **Problema:** la decisión de qué proveedor de pagos usar depende ÚNICAMENTE de si
  las dos variables de Stripe están presentes — nunca de `NODE_ENV`/`entorno`. Si un
  despliegue de PRODUCCIÓN en Vercel no tiene configuradas
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (omisión operativa plausible, sobre todo
  en un primer despliegue), la app arranca con normalidad (no falla, no hay fail-closed
  para esto) y usa `PagosSimulado`, cuyo `crearSesionCheckout`
  (`packages/domain/src/facturacion/pagos/simulado.ts:33-53`) **activa la suscripción
  de inmediato, sin cobro real, sin redirigir a ningún proveedor externo**.
- **Mitigación parcial existente:** la respuesta de `POST` (checkout) sí incluye
  `proveedor: pagos.proveedor` (`apps/api/src/routes/facturacion.ts:243`) y el tipo
  `proveedorPago: "simulado" | "stripe" | null` existe en
  `apps/web/src/pages/facturacion/api.ts:22` — pero **no se encontró ningún uso de ese
  campo en `apps/web/src/pages/facturacion/FacturacionPage.tsx`** (`grep` sin
  resultados): la UI no muestra ninguna advertencia visible si la cuenta está
  "activa" sobre el proveedor simulado.
- **Impacto:** en un despliegue de producción con las variables de Stripe mal
  configuradas u olvidadas, cualquier tenant que complete el flujo de checkout obtiene
  una suscripción `activa` real en la base de datos, con acceso completo a los límites
  del plan pagado, sin que Atiende cobre nada — y sin ninguna alerta visible para el
  equipo ni para el propio tenant.
- **Corrección sugerida:** (a) que `cargarConfiguracion()` trate la ausencia de
  credenciales de Stripe en un entorno productivo como una condición a reportar
  explícitamente (al menos un log de arranque en nivel `warn`/`error` visible en
  Sentry, o un campo en `GET /health` tipo `proveedorPagos: "simulado"`), y (b) que
  `FacturacionPage.tsx` muestre un aviso visible cuando `proveedorPago === "simulado"`.

## Verificado y BIEN implementado

- **Firma HMAC del webhook de Stripe**: `packages/domain/src/facturacion/pagos/
  stripe.ts:143-190` — algoritmo oficial de Stripe (`HMAC-SHA256` de
  `"<timestamp>.<cuerpo crudo>"`), `timingSafeEqual` para la comparación, tolerancia de
  reloj de 5 minutos contra replay de un payload capturado.
- **Idempotencia por `event.id`**: tabla `evento_pago_procesado` con
  `PRIMARY KEY (proveedor, evento_id)` e `INSERT ... ON CONFLICT DO NOTHING` **antes**
  de aplicar cualquier efecto de negocio (no después) — un reintento genuino de Stripe
  del mismo evento no duplica ningún efecto (ver A3-FACT-01 para la limitación
  distinta: orden entre eventos DIFERENTES, no reintento del mismo).
- **Fail-safe Stripe a medias**: `tieneCredencialesStripe` exige AMBAS variables
  (`STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`); con solo una presente, cae a
  `PagosSimulado` en vez de construir un `PagosStripe` con `secretoWebhook` vacío
  (que aceptaría cualquier firma) — correcto en sí mismo, aunque agrava A3-FACT-03.
- **RLS de facturación (0123)**: `plan_facturacion`/`suscripcion_tenant`/
  `medicion_uso_mensaje_ia` con `ENABLE` + `FORCE ROW LEVEL SECURITY`; política de
  `UPDATE` en `suscripcion_tenant` con `WITH CHECK` (no solo `USING`); el catálogo de
  planes solo se muta vía `facturacion_actualizar_plan()` (`SECURITY DEFINER`) que
  revalida `rol_actual() IS DISTINCT FROM 'superadmin'` — nótese el uso deliberado de
  `IS DISTINCT FROM` en vez de `<>` (el propio comentario documenta que corrigieron un
  bug real de fail-open: `NULL <> 'superadmin'` es `NULL`, y `IF NULL THEN` nunca
  lanza en PL/pgSQL, así que una sesión sin identidad resuelta habría podido editar el
  catálogo global de planes con el operador ingenuo).
- **`GET /facturacion/mrr` y superadmin**: el fix reciente (commit `5487040`) quitó el
  acceso "honorario" de superadmin vía `is_tenant_member` — confirmado que la función
  ahora exige una vía explícita (no se re-verificó con repro propio por tiempo, se
  aceptó el commit + su test de integración como evidencia).
- **Invitación/registro de colaborador vs. onboarding self-serve**: no se encontró
  ninguna forma de que `POST /onboarding/registro` (público, sin sesión) reciba un
  `tenantId` para vincularse a un tenant AJENO — la función
  `onboarding_registrar_empresa` crea un tenant NUEVO cada vez, no une el registro a
  uno existente.

## No verificado por límite de tiempo (declarar honestamente, no asumir OK)

- No se probó la ruta completa de `mensajes_ia`/`cuentas_canal` para confirmar que
  comparte el mismo patrón (y por tanto la misma carrera) que `unidades_activas` en
  A3-FACT-02 — se asume que sí por compartir `exigirLimitePlan`, pero no se ejecutó un
  repro específico para esos dos recursos.
- No se intentó un cambio de plan (downgrade/upgrade) retroactivo para verificar si
  resetea contadores de uso de forma indebida.
- No se verificó "romper cristal" en el contexto específico de facturación más allá de
  lo ya cubierto por A3-DESP-01 (`despliegue.md`).
