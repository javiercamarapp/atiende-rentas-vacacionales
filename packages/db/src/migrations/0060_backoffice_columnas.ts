import type { Migracion } from "../runner/tipos.js";

// Lote 8 (back office/superadmin, BACKLOG E13 + E02 H-011/H-012 parte de
// formulario CRUD). Rango 0060-0069 reservado a este lote (ver comentario
// de cabecera en index.ts).
//
// Nota de coordinación: propiedad.moneda YA existe (Lote 7,
// 0050_finanzas_esquema.ts, "ADD COLUMN moneda text NOT NULL DEFAULT
// 'MXN'") — esta migración NO la vuelve a crear (colisionaría). El
// formulario de alta de propiedad del back office (H-011) reutiliza esa
// misma columna para "moneda" y solo añade lo que todavía no existe:
// estado/suspensión de tenant (H-074) y dirección mínima de propiedad
// (H-011). Columnas nuevas NULABLES a nivel de esquema aunque el
// formulario de alta las exija: los lotes 3/5/7 (ya "hechos") insertan
// filas de propiedad/tenant sin estos campos desde antes de que este lote
// exista — una columna NOT NULL sin DEFAULT rompería esos INSERT en
// cuanto esta migración corriera en el mismo catálogo compartido. La
// obligatoriedad real ("dirección mínima obligatoria") se exige en la
// capa de aplicación (zod, apps/api/src/routes/backoffice/propiedades.ts).
export const migracion0060BackofficeColumnas: Migracion = {
  id: "0060_backoffice_columnas",
  descripcion: "tenant: estado/suspensión; propiedad: dirección mínima (columnas nuevas, nulables)",
  up: `
    ALTER TABLE tenant
      ADD COLUMN estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido')),
      ADD COLUMN suspendido_motivo text,
      ADD COLUMN suspendido_en timestamptz,
      ADD COLUMN suspendido_por uuid REFERENCES usuario(id) ON DELETE SET NULL;

    ALTER TABLE propiedad
      ADD COLUMN direccion_linea1 text,
      ADD COLUMN direccion_ciudad text,
      ADD COLUMN direccion_pais text;
  `,
  down: `
    ALTER TABLE propiedad
      DROP COLUMN IF EXISTS direccion_pais,
      DROP COLUMN IF EXISTS direccion_ciudad,
      DROP COLUMN IF EXISTS direccion_linea1;

    ALTER TABLE tenant
      DROP COLUMN IF EXISTS suspendido_por,
      DROP COLUMN IF EXISTS suspendido_en,
      DROP COLUMN IF EXISTS suspendido_motivo,
      DROP COLUMN IF EXISTS estado;
  `,
};
