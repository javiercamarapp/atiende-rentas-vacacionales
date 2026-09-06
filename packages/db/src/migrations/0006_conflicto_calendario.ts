import type { Migracion } from "../runner/tipos.js";

// Tabla auxiliar de alertas (D-002/BLUEPRINT §3.2). `tipo='overbooking_confirmado'`
// se crea cuando el EXCLUDE rechaza un INSERT con 23P01 (dos reservas
// confirmadas solapadas); `tipo='capa_cruzada'` cuando un bloqueo de menor
// precedencia se solapa con una reserva u otro bloqueo sin violar el
// EXCLUDE. Ambos terminan siempre en revisión humana (REQ-000, REQ-009),
// nunca en cancelación automática.
export const migracion0006ConflictoCalendario: Migracion = {
  id: "0006_conflicto_calendario",
  descripcion: "conflicto_calendario",
  up: `
    CREATE TABLE conflicto_calendario (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id       uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_a_id  uuid NOT NULL REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      ocupacion_b_id  uuid REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      tipo            text NOT NULL CHECK (tipo IN ('capa_cruzada', 'overbooking_confirmado')),
      detectado_en    timestamptz NOT NULL DEFAULT now(),
      resuelto_en     timestamptz,
      resuelto_por    uuid REFERENCES usuario(id)
    );
    CREATE INDEX conflicto_calendario_unidad_id_idx ON conflicto_calendario (unidad_id);
    CREATE INDEX conflicto_calendario_sin_resolver_idx
      ON conflicto_calendario (detectado_en)
      WHERE resuelto_en IS NULL;
  `,
  down: `
    DROP TABLE IF EXISTS conflicto_calendario;
  `,
};
