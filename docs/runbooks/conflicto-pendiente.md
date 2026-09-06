# Runbook — Alerta `conflicto_pendiente`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarConflictoPendiente`).
**Origen del dato:** tabla `conflicto_calendario` (Lote 1, migración 0006),
poblada por `packages/domain/src/aplicacion/reservas.ts` cuando dos capas
(reserva/bloqueo) se solapan sin que el EXCLUDE lo rechace (p. ej. un
bloqueo de mantenimiento sobre una reserva confirmada).
**Referencias:** H-022, H-008, H-037, §Operación-1.

## Qué significa

Hay una fila de calendario cuyo estado requiere revisión humana explícita
— por diseño, **este sistema nunca resuelve un conflicto de capas
automáticamente** cancelando o reordenando reservas. El conflicto
`capa_cruzada` es el caso típico: un bloqueo de mantenimiento/buffer de
limpieza se superpone a una reserva ya confirmada.

## Efecto automático de esta alerta

**Ninguno.** Es, por diseño, la alerta MÁS conservadora del catálogo: solo
notifica. La resolución (mover el bloqueo, contactar al huésped si aplica,
reasignar la tarea de limpieza) es 100% decisión humana.

## Qué NO hace nunca

- No cancela la reserva.
- No mueve ni borra el bloqueo.
- No contacta al huésped ni al propietario.
- No prioriza automáticamente una capa sobre otra más allá de lo que ya
  hace `razonDominante` (`packages/domain`) para efectos de VISUALIZACIÓN
  (qué razón se muestra en el calendario) — eso no es "resolver" el
  conflicto, solo decidir qué se pinta.

## Pasos de investigación (humano)

1. Abrir el calendario maestro (Lote 4) en la fecha/unidad del conflicto
   y confirmar visualmente las dos capas superpuestas.
2. Decidir la resolución operativa: mover el bloqueo (si es de
   mantenimiento/limpieza) o escalar al equipo de operaciones si el
   conflicto es entre dos reservas de canales distintos (caso mucho más
   raro, normalmente ya prevenido por el EXCLUDE — si ocurre, es evidencia
   de un bug y debe reportarse como tal, no resolverse "a mano" sin
   entender la causa).
3. Marcar el `conflicto_calendario` como atendido desde la UI de
   operaciones (Lote 5/8) tras resolver.

## Reconocimiento (ack)

`POST /alertas/:id/ack`. No resolver (`POST /alertas/:id/resolver`) hasta
que la fila de `conflicto_calendario` correspondiente también quede
marcada como atendida — evita que la alerta se cierre sin que el
conflicto de datos subyacente se haya tocado.
