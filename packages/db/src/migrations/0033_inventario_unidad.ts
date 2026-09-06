import type { Migracion } from "../runner/tipos.js";

// H-052 (REQ-115): inventario mínimo de ropa blanca/consumibles por unidad,
// con alertas de stock bajo por umbral configurable y descuento automático
// al completar checklists (`movimiento_inventario.cantidad` negativo).
export const migracion0033InventarioUnidad: Migracion = {
  id: "0033_inventario_unidad",
  descripcion: "item_inventario + movimiento_inventario (ropa blanca/consumibles por unidad)",
  up: `
    CREATE TABLE item_inventario (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id        uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      nombre           text NOT NULL,
      categoria        text NOT NULL DEFAULT 'consumible' CHECK (categoria IN ('ropa_blanca', 'consumible', 'otro')),
      cantidad_actual  numeric NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
      umbral_minimo    numeric NOT NULL DEFAULT 0 CHECK (umbral_minimo >= 0),
      unidad_medida    text NOT NULL DEFAULT 'pza',
      creado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX item_inventario_unidad_id_idx ON item_inventario (unidad_id);

    CREATE TABLE movimiento_inventario (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_inventario_id    uuid NOT NULL REFERENCES item_inventario(id) ON DELETE CASCADE,
      tarea_id              uuid REFERENCES tarea_operativa(id) ON DELETE SET NULL,
      cantidad              numeric NOT NULL,
      motivo                text,
      creado_en             timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX movimiento_inventario_item_inventario_id_idx ON movimiento_inventario (item_inventario_id);
    CREATE INDEX movimiento_inventario_tarea_id_idx ON movimiento_inventario (tarea_id);
  `,
  down: `
    DROP TABLE IF EXISTS movimiento_inventario;
    DROP TABLE IF EXISTS item_inventario;
  `,
};
