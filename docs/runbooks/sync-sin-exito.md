# Runbook — Alerta `sync_sin_exito`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarSyncSinExito`).
**Umbral:** configurable por canal (`umbrales.edadSyncSinExitoSegundosPorCanal[canal]`),
por defecto 6 horas (`UMBRALES_POR_DEFECTO.edadSyncSinExitoSegundosPorDefecto`).
**Referencias:** H-035, H-037, REQ-038, REQ-156, §Operación-1/§Operación-2.

## Qué significa

La cuenta de canal indicada lleva más tiempo del umbral sin completar un
ciclo de sincronización exitoso (`exito_con_eventos` | `exito_vacio` |
`no_modificado`). No implica necesariamente que el feed esté caído — puede
ser un canal con baja frecuencia de cambios y un umbral demasiado
agresivo para él (ajustar el umbral, no silenciar la alerta a ciegas).

## Efecto automático de esta alerta

**Ninguno además de la fila en `alerta` (notificación).** Esta regla NO
pausa el push del canal por sí misma — esa pausa reversible la dispara
la alerta separada `token_canal_revocado` cuando la causa raíz es
autenticación. `sync_sin_exito` es diagnóstico, no correctivo.

## Qué NO hace nunca

- No cancela ninguna reserva.
- No contacta al huésped.
- No modifica el calendario ni el estado de ninguna `ocupacion_unidad`.

## Pasos de investigación (humano)

1. Revisar `GET /health/detallado` → `metricas.edadUltimaSyncSegundos` para
   confirmar el valor exacto y compararlo contra el histórico del canal.
2. Revisar si hay una alerta `feed_en_cuarentena` o `token_canal_revocado`
   simultánea para la misma cuenta — si la hay, atender esa primero (la
   causa raíz probablemente vive ahí).
3. Confirmar manualmente contra el panel del canal (Airbnb/Vrbo/Booking)
   si hay un incidente reportado del lado del proveedor.
4. Si el umbral es simplemente inadecuado para ese canal, ajustar
   `umbrales.edadSyncSinExitoSegundosPorCanal` — no un cambio de código,
   es configuración operativa.
5. Si se confirma un problema real, disparar manualmente
   `POST /canales/:id/sync` (Lote 3) para forzar un reintento.

## Reconocimiento (ack)

`POST /alertas/:id/ack` requiere sesión autenticada — queda registrado
quién reconoció y cuándo (`reconocida_por`/`reconocida_en`).
