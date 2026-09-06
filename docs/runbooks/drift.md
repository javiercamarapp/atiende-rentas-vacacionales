# Runbook — Alerta `drift`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarDrift`).
**Origen del dato:** comparación de UIDs entre el feed actual del canal y
lo registrado en `evento_canal_importado` (`packages/adapters/src/sync/reconciliacion.ts`,
Lote 2, H-032) — `uidsSoloEnFeed`/`uidsSoloEnBd`.
**Referencias:** H-032, H-037, H-087, REQ-038, §Operación-2/§Operación-3.

## Qué significa

El estado interno de la base de datos y el estado real del feed del canal
divergieron: hay eventos que el canal reporta y nosotros no tenemos, o
que nosotros tenemos y el canal ya no reporta (canceló/expiró sin que el
ciclo incremental lo capturara). Es la MISMA condición que
`packages/db/backup/recuperacion.ts` exige reconciliar tras una
restauración de backup antes de permitir reanudar el push automático
(§Operación-3) — esta alerta es la versión de "vida diaria" de esa misma
verificación.

## Efecto automático de esta alerta

**Ninguno automático sobre datos.** Nunca sobrescribe ni concilia por sí
misma — la reconciliación real (`reconciliarCompleto`, Lote 2, o el flujo
de `packages/db/backup/recuperacion.ts` tras un restore) es un proceso
aparte que se dispara explícitamente, nunca como reacción automática a
esta alerta.

## Qué NO hace nunca

- No decide unilateralmente cuál de las dos fuentes (feed vs. BD) tiene
  razón — eso es exactamente lo que la reconciliación completa evalúa con
  cuidado (UID reciclado, hash de contenido, SEQUENCE/DTSTAMP).
- No cancela reservas ni contacta huéspedes.

## Pasos de investigación (humano)

1. Revisar `metadata.uidsSoloEnFeed`/`metadata.uidsSoloEnBd` de la alerta.
2. Disparar una reconciliación completa manual para esa unidad/canal
   (`POST /canales/:id/sync` con el modo completo, Lote 3) — no
   incremental, para forzar la comparación total de UIDs.
3. Si el drift persiste después de una reconciliación completa, revisar
   si hay un patrón de UID reciclado (caso adversarial 13) que esté
   generando alertas de revisión humana en `evento_canal_importado.ultima_accion
   = 'revisar_uid_reciclado'` sin resolverse.

## Reconocimiento (ack)

`POST /alertas/:id/ack`. Resolver solo tras confirmar, con una
reconciliación completa reciente, que `uidsSoloEnFeed`/`uidsSoloEnBd`
volvieron a cero para esa unidad/canal.
