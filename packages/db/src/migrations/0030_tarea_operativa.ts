import type { Migracion } from "../runner/tipos.js";

// Lote 5 (E08, H-049 a H-055): tabla central de operación de
// limpieza/mantenimiento/inspección. Rango 0030-0039 reservado a este lote
// (LOTES.md, nota de cabecera + coordinación de rangos de Lote 2/3: 0010-
// 0019 Lote 3, 0020-0029 Lote 2, 0090-0092 extensión de Lote 3 sobre Lote 2).
//
// `ocupacion_unidad_id`: la reserva (capa='reserva') cuyo checkout originó
// la tarea de limpieza (H-049, REQ-111) — NULL para tareas creadas a mano
// (mantenimiento/inspección ad-hoc, H-055). `buffer_ocupacion_id`: el
// bloqueo `BUFFER_LIMPIEZA` (capa='bloqueo', packages/domain ya define esa
// razón desde Lote 1) creado junto con la tarea, para poder recalcularlo si
// la reserva se reprograma (H-049) sin tener que buscarlo por fecha.
export const migracion0030TareaOperativa: Migracion = {
  id: "0030_tarea_operativa",
  descripcion: "tarea_operativa: limpieza/mantenimiento/inspección con SLA y asignación",
  up: `
    CREATE TABLE tarea_operativa (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      buffer_ocupacion_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      tipo                  text NOT NULL CHECK (tipo IN ('limpieza', 'mantenimiento', 'inspeccion')),
      estado                text NOT NULL DEFAULT 'pendiente' CHECK (
                              estado IN ('pendiente', 'asignada', 'en_progreso', 'completada', 'bloqueada', 'cancelada')
                            ),
      prioridad             text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
      asignado_a            uuid REFERENCES usuario(id) ON DELETE SET NULL,
      es_proveedor_externo  boolean NOT NULL DEFAULT false,
      programada_para       date NOT NULL,
      sla_vence_en          timestamptz,
      completada_en         timestamptz,
      notas                 text,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX tarea_operativa_unidad_id_idx ON tarea_operativa (unidad_id);
    CREATE INDEX tarea_operativa_asignado_a_idx ON tarea_operativa (asignado_a);
    CREATE INDEX tarea_operativa_programada_para_idx ON tarea_operativa (programada_para);
    CREATE INDEX tarea_operativa_ocupacion_unidad_id_idx ON tarea_operativa (ocupacion_unidad_id);

    -- H-054: notificaciones multicanal configurables por evento de tarea
    -- (asignada/actualizada/cancelada/completada). Fase 2 registra el
    -- intento de notificación (canal(es) resueltos desde la configuración de
    -- la propiedad) para trazabilidad — el envío real por canal concreto
    -- (email/SMS/WhatsApp) es un adaptador fuera del alcance de este lote,
    -- nunca simulado como "enviado" sin dejarlo explícito.
    CREATE TABLE notificacion_tarea (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tarea_id    uuid NOT NULL REFERENCES tarea_operativa(id) ON DELETE CASCADE,
      evento      text NOT NULL CHECK (evento IN ('asignada', 'actualizada', 'cancelada', 'completada')),
      canales     text[] NOT NULL DEFAULT '{}'::text[],
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX notificacion_tarea_tarea_id_idx ON notificacion_tarea (tarea_id);
  `,
  down: `
    DROP TABLE IF EXISTS notificacion_tarea;
    DROP TABLE IF EXISTS tarea_operativa;
  `,
};
