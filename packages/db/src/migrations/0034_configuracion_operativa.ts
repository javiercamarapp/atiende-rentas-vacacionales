import type { Migracion } from "../runner/tipos.js";

// H-050 (buffer configurable por propiedad) + H-055 (SLA internos por tipo
// de tarea). Una fila por propiedad; ausencia de fila = usar los valores
// por defecto de `packages/domain/limpieza/tipos.ts`
// (`CONFIGURACION_OPERATIVA_DEFECTO`) — nunca un `NULL` que la capa de
// aplicación tenga que adivinar cómo interpretar.
export const migracion0034ConfiguracionOperativa: Migracion = {
  id: "0034_configuracion_operativa",
  descripcion: "configuracion_operativa_propiedad: buffer de limpieza + SLA por tipo",
  up: `
    CREATE TABLE configuracion_operativa_propiedad (
      propiedad_id             uuid PRIMARY KEY REFERENCES propiedad(id) ON DELETE CASCADE,
      buffer_limpieza_noches   integer NOT NULL DEFAULT 1 CHECK (buffer_limpieza_noches >= 0),
      sla_limpieza_horas       integer NOT NULL DEFAULT 4 CHECK (sla_limpieza_horas > 0),
      sla_mantenimiento_horas  integer NOT NULL DEFAULT 24 CHECK (sla_mantenimiento_horas > 0),
      notificaciones_canales   text[] NOT NULL DEFAULT '{}'::text[],
      actualizado_en           timestamptz NOT NULL DEFAULT now()
    );
  `,
  down: `
    DROP TABLE IF EXISTS configuracion_operativa_propiedad;
  `,
};
