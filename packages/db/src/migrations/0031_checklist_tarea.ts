import type { Migracion } from "../runner/tipos.js";

// H-051 (REQ-113/REQ-114): checklist con ítems y fotos con timestamp por
// ítem. `foto_checklist_item.etiqueta` fija en 'dev-local' (CHECK) — Fase 2
// solo implementa almacenamiento local de desarrollo, nunca disfrazado de
// almacenamiento de producción (regla de oro DEFINICION-DE-HECHO §1).
export const migracion0031ChecklistTarea: Migracion = {
  id: "0031_checklist_tarea",
  descripcion: "checklist_item_tarea + foto_checklist_item",
  up: `
    CREATE TABLE checklist_item_tarea (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tarea_id        uuid NOT NULL REFERENCES tarea_operativa(id) ON DELETE CASCADE,
      descripcion     text NOT NULL,
      orden           integer NOT NULL DEFAULT 0,
      completado      boolean NOT NULL DEFAULT false,
      completado_en   timestamptz,
      completado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX checklist_item_tarea_tarea_id_idx ON checklist_item_tarea (tarea_id);

    CREATE TABLE foto_checklist_item (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      checklist_item_id     uuid NOT NULL REFERENCES checklist_item_tarea(id) ON DELETE CASCADE,
      ruta_almacenamiento   text NOT NULL,
      etiqueta              text NOT NULL DEFAULT 'dev-local' CHECK (etiqueta = 'dev-local'),
      tomada_en             timestamptz NOT NULL DEFAULT now(),
      subida_por            uuid REFERENCES usuario(id) ON DELETE SET NULL
    );
    CREATE INDEX foto_checklist_item_checklist_item_id_idx ON foto_checklist_item (checklist_item_id);
  `,
  down: `
    DROP TABLE IF EXISTS foto_checklist_item;
    DROP TABLE IF EXISTS checklist_item_tarea;
  `,
};
