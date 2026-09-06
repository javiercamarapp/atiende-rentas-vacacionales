# Runbook — Alerta `feed_en_cuarentena`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarFeedCuarentena`).
**Origen del estado:** `packages/adapters/src/sync/cuarentena.ts` (Lote 2,
H-031) — la cuarentena YA es la acción reversible tomada por el motor de
sync (congela el último estado válido conocido); esta alerta solo
**notifica** que ocurrió.
**Referencias:** H-031, H-037, REQ-005, §Calendario-3, §Operación-1.

## Qué significa

El feed de la unidad/canal indicado quedó en cuarentena tras alcanzar el
umbral de intentos fallidos consecutivos (`OPCIONES_CUARENTENA_POR_DEFECTO`)
por fallo de red o de parseo — el calendario de esa unidad para ese canal
sigue mostrando el ÚLTIMO estado válido conocido, nunca se vació ni se
marcó como "sin disponibilidad" por error (D-005).

## Efecto automático de esta alerta

**Ninguno más allá de la notificación.** La cuarentena en sí (que SÍ es un
efecto automático, pero del motor de sync de Lote 2, no de esta alerta) ya
es reversible por diseño: en cuanto el feed vuelva a responder
correctamente, el propio ciclo de sync limpia el estado de cuarentena.

## Qué NO hace nunca

- No cancela reservas existentes en esa unidad.
- No contacta al huésped ni al propietario.
- No borra ni modifica los datos de calendario ya importados.

## Pasos de investigación (humano)

1. Revisar `motivoCuarentena` en el `metadata` de la alerta —
   distingue fallo de red de fallo de parseo (feed malformado).
2. Si es fallo de red: verificar si es un problema transitorio del canal
   o de nuestra infraestructura (rate limiting, DNS, TLS).
3. Si es fallo de parseo: el feed del canal cambió de formato de forma
   inesperada — requiere revisión del parser ICS (`packages/adapters`,
   Lote 2), no es autocurable con un reintento.
4. Una vez resuelta la causa, el sistema sale de cuarentena solo en el
   siguiente ciclo exitoso — no hace falta ninguna acción manual de
   "desactivar cuarentena".

## Reconocimiento (ack)

`POST /alertas/:id/ack`. Resolver (`POST /alertas/:id/resolver`) solo
cuando el feed haya vuelto a sincronizar exitosamente (verificar
`GET /health/detallado` o el panel de monitor de sync, Lote 4).
