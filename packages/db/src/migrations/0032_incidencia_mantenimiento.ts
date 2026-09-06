import type { Migracion } from "../runner/tipos.js";

// H-055 (REQ-118/REQ-119): incidencias de mantenimiento, documentables con
// fotos, con seguimiento independiente del flujo de limpieza. El vínculo
// "incidencia grave → bloqueo de calendario" es una decisión de diseño
// propia de Atiende (RV11 §e, sin precedente de mercado) y NUNCA es
// automática: el CHECK de `estado` no tiene una transición directa
// abierta→bloqueo_confirmado sin pasar por `bloqueo_propuesto`, y
// `bloqueo_confirmado` exige `confirmado_por`/`confirmado_en` (la capa de
// aplicación, `packages/domain/limpieza/aplicacion/tareas.ts`, es quien
// exige ese "humano" explícito antes de escribir esta fila).
export const migracion0032IncidenciaMantenimiento: Migracion = {
  id: "0032_incidencia_mantenimiento",
  descripcion: "incidencia_mantenimiento + foto_incidencia",
  up: `
    CREATE TABLE incidencia_mantenimiento (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                 uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      tarea_origen_id           uuid REFERENCES tarea_operativa(id) ON DELETE SET NULL,
      severidad                 text NOT NULL CHECK (severidad IN ('leve', 'moderada', 'grave')),
      titulo                    text NOT NULL,
      descripcion               text,
      reportado_por             uuid REFERENCES usuario(id) ON DELETE SET NULL,
      estado                    text NOT NULL DEFAULT 'abierta' CHECK (
                                  estado IN (
                                    'abierta', 'en_revision', 'bloqueo_propuesto',
                                    'bloqueo_confirmado', 'resuelta', 'descartada'
                                  )
                                ),
      propuesta_bloqueo_rango   daterange,
      bloqueo_ocupacion_id      uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      confirmado_por            uuid REFERENCES usuario(id) ON DELETE SET NULL,
      confirmado_en             timestamptz,
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      actualizado_en            timestamptz NOT NULL DEFAULT now(),
      -- El bloqueo confirmado exige rastro explícito de quién/cuándo lo
      -- confirmó (H-055: "requiere confirmación humana", nunca automática).
      CONSTRAINT incidencia_confirmacion_requiere_actor CHECK (
        estado <> 'bloqueo_confirmado' OR (confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)
      )
    );
    CREATE INDEX incidencia_mantenimiento_unidad_id_idx ON incidencia_mantenimiento (unidad_id);
    CREATE INDEX incidencia_mantenimiento_estado_idx ON incidencia_mantenimiento (estado);

    CREATE TABLE foto_incidencia (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      incidencia_id         uuid NOT NULL REFERENCES incidencia_mantenimiento(id) ON DELETE CASCADE,
      ruta_almacenamiento   text NOT NULL,
      etiqueta              text NOT NULL DEFAULT 'dev-local' CHECK (etiqueta = 'dev-local'),
      tomada_en             timestamptz NOT NULL DEFAULT now(),
      subida_por            uuid REFERENCES usuario(id) ON DELETE SET NULL
    );
    CREATE INDEX foto_incidencia_incidencia_id_idx ON foto_incidencia (incidencia_id);
  `,
  down: `
    DROP TABLE IF EXISTS foto_incidencia;
    DROP TABLE IF EXISTS incidencia_mantenimiento;
  `,
};
