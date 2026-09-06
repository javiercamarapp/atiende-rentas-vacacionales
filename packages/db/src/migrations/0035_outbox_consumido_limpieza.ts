import type { Migracion } from "../runner/tipos.js";

// H-049 (REQ-111/REQ-098): la generación automática de la tarea de limpieza
// al confirmarse el checkout CONSUME `outbox_evento` (el mismo outbox
// transaccional de Lote 1, `packages/domain/src/aplicacion/reservas.ts`,
// que encola 'cerrar_disponibilidad'/'modificar_disponibilidad'/
// 'liberar_disponibilidad' en la MISMA transacción que la reserva) en vez de
// engancharse directamente al código de Lote 1/3 — así este lote no edita
// ningún archivo fuera de sus carpetas exclusivas (docs/fase2/LOTES.md).
//
// `outbox_evento.procesado_en` es una columna COMPARTIDA por tabla (Lote 1):
// otros lotes (p. ej. Lote 2 push a canal, Lote 10 observabilidad) también
// pueden necesitar leer/marcar esa misma cola para SUS propios fines. Marcar
// esa columna aquí pisaría la marca de otro consumidor. Esta tabla de
// seguimiento propia (`outbox_evento_consumido_limpieza`) registra qué filas
// YA procesó el consumidor de este lote, sin tocar la columna compartida —
// patrón de "un registro de progreso por consumidor" sobre un outbox
// multi-consumidor, sin migrar el esquema de Lote 1.
export const migracion0035OutboxConsumidoLimpieza: Migracion = {
  id: "0035_outbox_consumido_limpieza",
  descripcion: "outbox_evento_consumido_limpieza: seguimiento propio del consumidor de checkout→limpieza",
  up: `
    CREATE TABLE outbox_evento_consumido_limpieza (
      outbox_evento_id   uuid PRIMARY KEY REFERENCES outbox_evento(id) ON DELETE CASCADE,
      procesado_en       timestamptz NOT NULL DEFAULT now()
    );
  `,
  down: `
    DROP TABLE IF EXISTS outbox_evento_consumido_limpieza;
  `,
};
