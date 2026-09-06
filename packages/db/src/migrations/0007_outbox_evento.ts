import type { Migracion } from "../runner/tipos.js";

// Esqueleto del outbox transaccional (D-010, equivalente a `sync_outbox` de
// BLUEPRINT §3.4 — nombrado `outbox_evento` por instrucción explícita del
// encargo de este lote). El worker de "message relay"
// (`SELECT ... FOR UPDATE SKIP LOCKED`) y los adaptadores de canal reales
// llegan en Lote 2/3; aquí solo se garantiza que toda escritura de negocio
// pueda encolar un evento en la MISMA transacción (packages/domain).
export const migracion0007OutboxEvento: Migracion = {
  id: "0007_outbox_evento",
  descripcion: "outbox_evento (esqueleto transaccional)",
  up: `
    CREATE TABLE outbox_evento (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      tipo_evento           text NOT NULL,
      payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      procesado_en          timestamptz
    );
    CREATE INDEX outbox_evento_pendientes_idx
      ON outbox_evento (creado_en)
      WHERE procesado_en IS NULL;
  `,
  down: `
    DROP TABLE IF EXISTS outbox_evento;
  `,
};
