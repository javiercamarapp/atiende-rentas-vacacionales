import type { Migracion } from "../runner/tipos.js";

// Lote 10 (H-035/H-036, worker de replay idempotente del outbox para
// instrumentación/latencia interna). `outbox_evento.procesado_en` es una
// columna COMPARTIDA entre consumidores del mismo outbox multi-consumidor
// (ver el comentario de cabecera de `0035_outbox_consumido_limpieza.ts`,
// que ya anticipó este caso nombrando explícitamente a "Lote 10
// observabilidad"): en vez de tocar esa columna o el esquema de la tabla
// de Lote 1, este lote sigue el MISMO patrón de "registro de progreso por
// consumidor" con su propia tabla de seguimiento.
//
// `outbox_evento_id` como PRIMARY KEY (no solo UNIQUE) es la pieza central
// de la idempotencia ante crash: el worker de
// `apps/api/src/workers/observabilidad/outboxWorker.ts` inserta esta fila
// en la MISMA transacción en la que aplica el efecto del evento (§H-036),
// así que un crash a mitad de lote deja esa transacción sin confirmar —
// nunca una fila "a medias" — y el evento vuelve a aparecer como pendiente
// (ausente de esta tabla) en el siguiente arranque, sin haber aplicado su
// efecto ni una sola vez de más.
export const migracion0080OutboxConsumidoObservabilidad: Migracion = {
  id: "0080_outbox_consumido_observabilidad",
  descripcion: "outbox_evento_consumido_observabilidad: ledger de idempotencia del worker de observabilidad (replay tras crash)",
  up: `
    CREATE TABLE outbox_evento_consumido_observabilidad (
      outbox_evento_id      uuid PRIMARY KEY REFERENCES outbox_evento(id) ON DELETE CASCADE,
      procesado_en          timestamptz NOT NULL DEFAULT now(),
      -- Latencia interna medida (H-039/§RV19/21-8): evento encolado
      -- (outbox_evento.creado_en) → efecto aplicado por este worker, EN
      -- MILISEGUNDOS. Separada por diseño de la latencia externa/declarada
      -- por canal (esa vive como constante en packages/adapters, p. ej.
      -- LATENCIA_AIRBNB_ICAL) — nunca se combinan en una sola métrica.
      latencia_interna_ms   bigint NOT NULL CHECK (latencia_interna_ms >= 0)
    );
    CREATE INDEX outbox_evento_consumido_observabilidad_procesado_en_idx
      ON outbox_evento_consumido_observabilidad (procesado_en);
  `,
  down: `
    DROP TABLE IF EXISTS outbox_evento_consumido_observabilidad;
  `,
};
