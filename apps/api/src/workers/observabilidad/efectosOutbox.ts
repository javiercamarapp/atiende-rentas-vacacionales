import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import type { AplicarEfectoOutbox, EventoOutboxPendiente } from "./outboxWorker.js";

/**
 * `aplicarEfecto` REAL de producción para `procesarPendientesOutbox`
 * (`outboxWorker.ts`), disparado desde `GET /internal/cron/outbox-worker`
 * (`apps/api/src/rutas/internas/cronOutboxWorker.ts`).
 *
 * `outbox_evento` es multi-consumidor por diseño (ver cabecera de
 * `0035_outbox_consumido_limpieza.ts`/`0080_outbox_consumido_
 * observabilidad.ts`): varios consumidores independientes, cada uno con
 * su PROPIO ledger de idempotencia, pueden leer la misma tabla sin
 * pisarse. Los tipos `cerrar_disponibilidad`/`modificar_disponibilidad`/
 * `liberar_disponibilidad` YA tienen su consumidor dedicado
 * (`procesarEventosCheckoutPendientes`, `packages/domain/src/limpieza/
 * aplicacion/tareas.ts`, ledger `outbox_evento_consumido_limpieza`,
 * disparado por `GET /internal/cron/limpieza-checkout`) — este worker NO
 * debe volver a aplicar ese efecto (crearía tareas de limpieza
 * DUPLICADAS si lo hiciera).
 *
 * El único efecto que quedaba genuinamente huérfano en todo `outbox_
 * evento` es `alerta_capa_cruzada`/`alerta_overbooking`
 * (`packages/domain/src/aplicacion/reservas.ts`): se encolan desde Lote 1
 * cada vez que se detecta un conflicto de calendario, pero ningún
 * consumidor los convertía nunca en una fila de `alerta` visible para
 * operación — el motor de reglas de `alertas.ts` (H-037/H-090) evalúa
 * señales que se le pasan explícitamente, nunca leyó `outbox_evento`
 * por sí solo. Este `aplicarEfecto` cierra exactamente ese hueco,
 * materializando el tipo `conflicto_pendiente` (uno de los 6 ya
 * soportados por el CHECK de la tabla `alerta`, migración `0081_alerta.ts`).
 *
 * Cualquier otro `tipo_evento` (incluidos los tres de checkout de arriba
 * y `sync_manual_solicitado`) se trata como no-op AQUÍ — marcarlo
 * "consumido" en `outbox_evento_consumido_observabilidad` es seguro
 * porque ese ledger es exclusivo de ESTE consumidor: no interfiere con
 * el ledger de limpieza ni con ningún otro.
 */
export const aplicarEfectoOutboxProduccion: AplicarEfectoOutbox = async (evento, tx) => {
  if (evento.tipoEvento !== "alerta_capa_cruzada" && evento.tipoEvento !== "alerta_overbooking") {
    return;
  }

  const unidadId = evento.ocupacionUnidadId ? await unidadIdDeOcupacion(tx, evento.ocupacionUnidadId) : null;
  const severidad = evento.tipoEvento === "alerta_overbooking" ? "alta" : "media";
  const mensaje =
    evento.tipoEvento === "alerta_overbooking"
      ? "Overbooking confirmado: dos reservas solapan sobre la misma unidad."
      : "Conflicto de calendario entre capas (reserva/bloqueo) detectado.";

  // Metadata SIN PII (H-047, mismo criterio que el resto de `alerta.metadata`):
  // solo ids y el tipo de evento de origen — el payload original del
  // outbox ya viene libre de datos de huésped (packages/domain nunca
  // encola nombre/email/teléfono en estos dos tipos de evento).
  await tx.query(
    `INSERT INTO alerta (tipo, severidad, unidad_id, mensaje, metadata)
     VALUES ('conflicto_pendiente', $1, $2, $3, $4::jsonb)`,
    [
      severidad,
      unidadId,
      mensaje,
      JSON.stringify({
        outboxEventoId: evento.id,
        tipoEventoOrigen: evento.tipoEvento,
        payload: evento.payload ?? null,
      }),
    ],
  );
};

interface FilaOcupacionUnidad extends FilaSql {
  unidad_id: string;
}

async function unidadIdDeOcupacion(tx: EjecutorSql, ocupacionUnidadId: string): Promise<string | null> {
  const { rows } = await tx.query<FilaOcupacionUnidad>(`SELECT unidad_id FROM ocupacion_unidad WHERE id = $1`, [
    ocupacionUnidadId,
  ]);
  return rows[0]?.unidad_id ?? null;
}

export type { EventoOutboxPendiente };
